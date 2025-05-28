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
    action             = optional(string, "create") # "create", "delete", or "update"
  }))
  default = {}

  validation {
    condition = alltrue([
      for k, v in var.container_apps : 
      v == null || contains(["create", "delete", "update"], coalesce(v.action, "create"))
    ])
    error_message = "The action field must be one of: create, delete, update."
  }
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

variable "force_delete" {
  description = "Force delete tenants even if they have data (use with caution)"
  type        = bool
  default     = false
}

### === Data Sources for Existing Tenant Detection ===

# Check existing tenant containers to prevent duplicates
data "azurerm_storage_containers" "existing_containers" {
  storage_account_id = data.azurerm_storage_account.app_storage.id
}

# Check existing container apps to prevent duplicates
data "azurerm_container_apps" "existing_apps" {
  resource_group_name = var.resource_group_name
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

### === Local Values and Validation ===

locals {
  rg_name     = var.create_new_environment ? azurerm_resource_group.quiz_app[0].name : data.azurerm_resource_group.quiz_app[0].name
  rg_location = var.create_new_environment ? azurerm_resource_group.quiz_app[0].location : data.azurerm_resource_group.quiz_app[0].location
  env_id      = var.create_new_environment ? azurerm_container_app_environment.quiz_env[0].id : data.azurerm_container_app_environment.quiz_env[0].id

  # Filter tenants based on action
  tenants_to_create = {
    for k, v in var.container_apps : k => v 
    if v != null && coalesce(v.action, "create") == "create"
  }
  
  tenants_to_delete = {
    for k, v in var.container_apps : k => v 
    if v != null && v.action == "delete"
  }
  
  tenants_to_update = {
    for k, v in var.container_apps : k => v 
    if v != null && v.action == "update"
  }

  # Get existing tenant IDs from storage containers
  existing_tenant_ids = [
    for container_name in try(data.azurerm_storage_containers.existing_containers.containers[*].name, []) :
    replace(container_name, "tenant-", "")
    if startswith(container_name, "tenant-")
  ]
}

### === Validation Checks ===

# Check for duplicate tenant IDs
resource "null_resource" "validate_no_duplicates" {
  for_each = local.tenants_to_create

  # This will fail if tenant already exists and we're trying to create it
  lifecycle {
    precondition {
      condition = !contains(local.existing_tenant_ids, each.key) || var.force_delete
      error_message = "Tenant '${each.key}' already exists. Use action='update' to modify existing tenant or set force_delete=true to override."
    }
  }
}

### === Storage Containers Management ===

# Create containers for new tenants
resource "azurerm_storage_container" "tenant_containers" {
  for_each              = local.tenants_to_create
  name                  = "tenant-${each.key}"
  storage_account_id    = data.azurerm_storage_account.app_storage.id
  container_access_type = "private"
  
  depends_on = [null_resource.validate_no_duplicates]
}

# Data source for containers to be deleted
data "azurerm_storage_container" "containers_to_delete" {
  for_each           = local.tenants_to_delete
  name               = "tenant-${each.key}"
  storage_account_id = data.azurerm_storage_account.app_storage.id
}

# Delete storage containers for tenants marked for deletion
resource "null_resource" "delete_tenant_containers" {
  for_each = local.tenants_to_delete

  # Use Azure CLI to delete the container and all its contents
  provisioner "local-exec" {
    command = <<-EOT
      az storage container delete \
        --name "tenant-${each.key}" \
        --account-name "${data.azurerm_storage_account.app_storage.name}" \
        --account-key "${data.azurerm_storage_account.app_storage.primary_access_key}" \
        --delete-snapshots include || true
    EOT
  }

  # Ensure this runs before creating new resources
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [data.azurerm_storage_container.containers_to_delete]
}

### === Container App Deployment ===

# Create or update container apps
resource "azurerm_container_app" "quiz_app" {
  for_each                      = merge(local.tenants_to_create, local.tenants_to_update)
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
    revision_suffix = "v${formatdate("YYYYMMDDhhmmss", timestamp())}"
    
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
    
    # Prevent accidental deletion
    precondition {
      condition = !contains(keys(local.tenants_to_delete), each.key)
      error_message = "Cannot create/update tenant '${each.key}' as it's marked for deletion."
    }
  }

  depends_on = [
    data.azurerm_storage_account.app_storage,
    azurerm_storage_container.tenant_containers,
    null_resource.validate_no_duplicates
  ]
}

# Data source for container apps to be deleted
data "azurerm_container_app" "apps_to_delete" {
  for_each            = local.tenants_to_delete
  name                = each.value.name
  resource_group_name = local.rg_name
}

# Delete container apps for tenants marked for deletion
resource "null_resource" "delete_tenant_apps" {
  for_each = local.tenants_to_delete

  # Use Azure CLI to delete the container app
  provisioner "local-exec" {
    command = <<-EOT
      az containerapp delete \
        --name "${each.value.name}" \
        --resource-group "${local.rg_name}" \
        --yes || true
    EOT
  }

  # Run deletion before any new resources
  lifecycle {
    create_before_destroy = true
  }

  depends_on = [data.azurerm_container_app.apps_to_delete]
}

### === Tenant State Management ===

# Store tenant state in the tenant's container
resource "azurerm_storage_blob" "tenant_state" {
  for_each               = merge(local.tenants_to_create, local.tenants_to_update)
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
    action              = each.value.action
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
    version             = "2.0"
  })

  depends_on = [
    azurerm_container_app.quiz_app,
    azurerm_storage_container.tenant_containers
  ]
}

# Clean up state blobs for deleted tenants
resource "null_resource" "cleanup_tenant_states" {
  for_each = local.tenants_to_delete

  # Delete the state blob
  provisioner "local-exec" {
    command = <<-EOT
      az storage blob delete \
        --name "state.json" \
        --container-name "tenant-${each.key}" \
        --account-name "${data.azurerm_storage_account.app_storage.name}" \
        --account-key "${data.azurerm_storage_account.app_storage.primary_access_key}" || true
    EOT
  }

  depends_on = [null_resource.delete_tenant_apps]
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
    for k, v in merge(local.tenants_to_create, local.tenants_to_update) : k => {
      tenant_id     = k
      name          = v.name
      fqdn          = azurerm_container_app.quiz_app[k].ingress[0].fqdn
      url           = "https://${azurerm_container_app.quiz_app[k].ingress[0].fqdn}"
      state_blob    = "state.json"
      storage_path  = "${data.azurerm_storage_account.app_storage.name}/tenant-${k}/state.json"
      action        = v.action
    }
  }
}

output "deleted_tenants" {
  description = "List of tenants that were deleted"
  value = keys(local.tenants_to_delete)
}

output "existing_tenant_ids" {
  description = "List of existing tenant IDs found in storage"
  value = local.existing_tenant_ids
}

output "management_summary" {
  description = "Summary of tenant management operations"
  value = {
    created = keys(local.tenants_to_create)
    updated = keys(local.tenants_to_update)
    deleted = keys(local.tenants_to_delete)
    existing = local.existing_tenant_ids
  }
}