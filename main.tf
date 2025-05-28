terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.29.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "235ed9ed-d344-429b-b677-f295a9d36fc2"
}

variable "github_repository" {
  description = "GitHub repository name in format owner/repo"
  type        = string
}

variable "ghcr_username" {
  description = "GitHub username for GHCR"
  type        = string
}

variable "ghcr_pat" {
  description = "GitHub PAT for GHCR"
  type        = string
  sensitive   = true
}

variable "container_apps" {
  description = "Map of container apps (tenants) with their configuration. Set to null to delete a tenant."
  type = map(object({
    name               = optional(string)
    supabase_url       = optional(string)
    supabase_anon_key  = optional(string)
    cpu                = optional(number)
    memory             = optional(string)
    custom_domain      = optional(string)
  }))
  default = {}
}

variable "create_new_environment" {
  description = "Whether to create a new resource group and container app environment"
  type        = bool
  default     = false
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "quizapp"
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "North Europe"
}

variable "image_name" {
  description = "The name of the image to be used for container apps"
  type        = string
}

variable "storage_account_name" {
  description = "Name of the storage account for blobs (must be globally unique)"
  type        = string
  default     = "quizappblobs"
}

### === Resource Group ===

data "azurerm_resource_group" "quiz_app" {
  count = var.create_new_environment ? 0 : 1
  name  = var.resource_group_name
}

resource "azurerm_resource_group" "quiz_app" {
  count    = var.create_new_environment ? 1 : 0
  name     = var.resource_group_name
  location = var.location

  lifecycle {
    create_before_destroy = true
  }
}

### === Container App Environment ===

data "azurerm_container_app_environment" "quiz_env" {
  count               = var.create_new_environment ? 0 : 1
  name                = var.resource_group_name
  resource_group_name = var.resource_group_name
}

resource "azurerm_container_app_environment" "quiz_env" {
  count               = var.create_new_environment ? 1 : 0
  name                = var.resource_group_name
  location            = var.location
  resource_group_name = var.resource_group_name

  lifecycle {
    create_before_destroy = true
  }
}

### === Storage Account ===

data "azurerm_storage_account" "app_storage" {
  name                = var.storage_account_name
  resource_group_name = var.resource_group_name
}

# Create one container per tenant for both data and state
resource "azurerm_storage_container" "tenant_containers" {
  for_each              = { for k, v in var.container_apps : k => v if v != null }
  name                  = "tenant-${each.key}"
  storage_account_id    = data.azurerm_storage_account.app_storage.id
  container_access_type = "private"
}

### === Local selectors ===

locals {
  rg_name     = var.create_new_environment ? azurerm_resource_group.quiz_app[0].name : data.azurerm_resource_group.quiz_app[0].name
  rg_location = var.create_new_environment ? azurerm_resource_group.quiz_app[0].location : data.azurerm_resource_group.quiz_app[0].location
  env_id      = var.create_new_environment ? azurerm_container_app_environment.quiz_env[0].id : data.azurerm_container_app_environment.quiz_env[0].id
}

### === Container App Deployment ===

resource "azurerm_container_app" "quiz_app" {
  for_each                      = { for k, v in var.container_apps : k => v if v != null }
  name                          = each.value.name
  container_app_environment_id  = local.env_id
  resource_group_name           = local.rg_name
  revision_mode                 = "Single"

  registry {
    server                = "ghcr.io"
    username              = var.ghcr_username
    password_secret_name  = "ghcr-pat"
  }

  secret {
    name  = "ghcr-pat"
    value = var.ghcr_pat
  }

  secret {
    name  = "supabase-anon-key-${each.key}"
    value = each.value.supabase_anon_key
  }

  secret {
    name  = "azure-storage-connection-string"
    value = data.azurerm_storage_account.app_storage.primary_connection_string
  }

  secret {
    name  = "azure-storage-account-name"
    value = data.azurerm_storage_account.app_storage.name
  }

  secret {
    name  = "azure-storage-account-key"
    value = data.azurerm_storage_account.app_storage.primary_access_key
  }

  template {
    min_replicas    = 1
    max_replicas    = 3
    revision_suffix = "v1"
    
    container {
      name   = "nextjs"
      image  = "ghcr.io/${var.ghcr_username}/${var.image_name}-${each.key}:latest"
      cpu    = each.value.cpu
      memory = each.value.memory

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "NEXT_PUBLIC_SUPABASE_URL"
        value = each.value.supabase_url
      }

      env {
        name         = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        secret_name  = "supabase-anon-key-${each.key}"
      }

      env {
        name  = "NEXT_PUBLIC_TENANT_ID"
        value = each.key
      }

      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "azure-storage-connection-string"
      }

      env {
        name        = "AZURE_STORAGE_ACCOUNT_NAME"
        secret_name = "azure-storage-account-name"
      }

      env {
        name        = "AZURE_STORAGE_ACCOUNT_KEY"
        secret_name = "azure-storage-account-key"
      }

      env {
        name  = "AZURE_STORAGE_CONTAINER_NAME"
        value = "tenant-${each.key}"
      }
    }
  }

  ingress {
    external_enabled = true
    target_port      = 3000
    transport        = "auto"

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      template[0].revision_suffix
    ]
  }

  depends_on = [
    data.azurerm_storage_account.app_storage,
    azurerm_storage_container.tenant_containers
  ]
}

# Store tenant state in the tenant's container
resource "azurerm_storage_blob" "tenant_state" {
  for_each               = { for k, v in var.container_apps : k => v if v != null }
  name                   = "state.json"
  storage_account_name   = data.azurerm_storage_account.app_storage.name
  storage_container_name = "tenant-${each.key}"
  type                  = "Block"
  source_content        = jsonencode({
    tenant_id           = each.key
    name                = each.value.name
    supabase_url        = each.value.supabase_url
    supabase_anon_key   = each.value.supabase_anon_key
    cpu                 = each.value.cpu
    memory              = each.value.memory
    custom_domain       = each.value.custom_domain
    created_at          = timestamp()
    last_updated        = timestamp()
    container_app_id    = azurerm_container_app.quiz_app[each.key].id
    container_app_fqdn  = azurerm_container_app.quiz_app[each.key].ingress[0].fqdn
    container_app_url   = "https://${azurerm_container_app.quiz_app[each.key].ingress[0].fqdn}"
    status              = "active"
    resource_group      = local.rg_name
    environment_id      = local.env_id
    storage_container   = "tenant-${each.key}"
    terraform_managed   = true
  })

  depends_on = [
    azurerm_container_app.quiz_app,
    azurerm_storage_container.tenant_containers
  ]
}

### === Outputs ===

output "container_app_urls" {
  description = "The URLs of deployed container apps"
  value = {
    for k, app in azurerm_container_app.quiz_app :
    k => "https://${app.ingress[0].fqdn}"
  }
}

output "container_app_fqdns" {
  description = "The FQDNs of deployed container apps"
  value = {
    for k, app in azurerm_container_app.quiz_app :
    k => app.ingress[0].fqdn
  }
}

output "container_app_ids" {
  description = "The IDs of deployed container apps"
  value = {
    for k, app in azurerm_container_app.quiz_app :
    k => app.id
  }
}

output "storage_account_name" {
  description = "Name of the Azure Storage Account"
  value       = data.azurerm_storage_account.app_storage.name
}

output "storage_account_primary_endpoint" {
  description = "Primary blob endpoint of the storage account"
  value       = data.azurerm_storage_account.app_storage.primary_blob_endpoint
}

output "tenant_containers" {
  description = "Blob containers created for each tenant"
  value = {
    for k, container in azurerm_storage_container.tenant_containers :
    k => container.name
  }
}

output "storage_connection_string" {
  description = "Storage account connection string (sensitive)"
  value       = data.azurerm_storage_account.app_storage.primary_connection_string
  sensitive   = true
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = local.rg_name
}

output "container_app_environment_id" {
  description = "ID of the container app environment"
  value       = local.env_id
}

output "tenant_states" {
  description = "Tenant state information stored in blob storage"
  value = {
    for k, v in var.container_apps : k => {
      tenant_id     = k
      name          = v.name
      fqdn          = azurerm_container_app.quiz_app[k].ingress[0].fqdn
      url           = "https://${azurerm_container_app.quiz_app[k].ingress[0].fqdn}"
      state_blob    = "state.json"
      storage_path  = "${data.azurerm_storage_account.app_storage.name}/tenant-${k}/state.json"
    } if v != null
  }
}