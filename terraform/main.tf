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
  description = "Map of container apps (tenants) with their configuration"
  type = map(object({
    name               = string
    supabase_url       = string
    supabase_anon_key  = string
    cpu                = number
    memory             = string
    custom_domain      = optional(string)
  }))
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

### === Resource Group ===

data "azurerm_resource_group" "quiz_app" {
  name = var.resource_group_name
}

resource "azurerm_resource_group" "quiz_app" {
  name     = var.resource_group_name
  location = var.location

  lifecycle {
    create_before_destroy = true
  }
}

### === Container App Environment ===

data "azurerm_container_app_environment" "quiz_env" {
  name                = var.resource_group_name
  resource_group_name = var.resource_group_name
}

resource "azurerm_container_app_environment" "quiz_env" {
  name                = var.resource_group_name
  location            = var.location
  resource_group_name = var.resource_group_name

  lifecycle {
    create_before_destroy = true
  }
}

### === Local selectors ===

locals {
  rg_name     = var.create_new_environment ? azurerm_resource_group.quiz_app.name : data.azurerm_resource_group.quiz_app.name
  rg_location = var.create_new_environment ? azurerm_resource_group.quiz_app.location : data.azurerm_resource_group.quiz_app.location
  env_id      = var.create_new_environment ? azurerm_container_app_environment.quiz_env.id : data.azurerm_container_app_environment.quiz_env.id
}

### === Container App Deployment ===
#
resource "azurerm_container_app" "quiz_app" {
  for_each                      = var.container_apps
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

  template {
    revision_suffix = "v1"  # Force new revision when env vars change
    
    container {
      name   = "nextjs"
      image  = "ghcr.io/${var.github_repository}:latest"
      cpu    = each.value.cpu
      memory = each.value.memory

      # Build arguments for Next.js build
      build_args = {
        NEXT_PUBLIC_SUPABASE_URL      = each.value.supabase_url
        NEXT_PUBLIC_SUPABASE_ANON_KEY = each.value.supabase_anon_key
        NEXT_PUBLIC_TENANT_ID         = each.key
      }

      # Runtime environment variables
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
      template[0].container[0].image
    ]
  }
}

output "container_app_urls" {
  description = "The FQDNs of deployed container apps"
  value       = {
    for k, app in azurerm_container_app.quiz_app :
    k => app.ingress[0].fqdn
  }
}

# -var="create_new_environment=true"