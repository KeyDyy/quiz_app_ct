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
  description = "Whether to create new resource group and environment or use existing ones"
  type        = bool
  default     = false
}

# Resource Group - create new or use existing
resource "azurerm_resource_group" "quiz_app" {
  count    = var.create_new_environment ? 1 : 0
  name     = "quizapp"
  location = "North Europe"
}

data "azurerm_resource_group" "quiz_app" {
  count = var.create_new_environment ? 0 : 1
  name  = "quizapp"
}

locals {
  resource_group_name = var.create_new_environment ? azurerm_resource_group.quiz_app[0].name : data.azurerm_resource_group.quiz_app[0].name
  resource_group_location = var.create_new_environment ? azurerm_resource_group.quiz_app[0].location : data.azurerm_resource_group.quiz_app[0].location
}

# Container App Environment - create new or use existing
resource "azurerm_container_app_environment" "quiz_app_env" {
  count                       = var.create_new_environment ? 1 : 0
  name                       = "quizapp"
  location                   = local.resource_group_location
  resource_group_name        = local.resource_group_name
}

data "azurerm_container_app_environment" "quiz_app_env" {
  count               = var.create_new_environment ? 0 : 1
  name                = "quizapp"
  resource_group_name = local.resource_group_name
}

locals {
  environment_id = var.create_new_environment ? azurerm_container_app_environment.quiz_app_env[0].id : data.azurerm_container_app_environment.quiz_app_env[0].id
}

resource "azurerm_container_app" "quiz_app" {
  for_each                      = var.container_apps
  name                          = each.value.name
  container_app_environment_id  = local.environment_id
  resource_group_name           = local.resource_group_name
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

  template {
    container {
      name   = "nextjs"
      image  = "ghcr.io/${var.github_repository}:latest"
      cpu    = each.value.cpu
      memory = each.value.memory

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "NEXT_PUBLIC_SUPABASE_URL"
        value = each.value.supabase_url
        secret = false
      }

      env {
        name  = "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        value = each.value.supabase_anon_key
        secret = true
      }

      env {
        name  = "TENANT_ID"
        value = each.key
      }

      # możesz dodać więcej env np. DB_URL, SENTRY_DSN itp.
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
}

output "container_app_urls" {
  description = "The FQDNs of deployed container apps"
  value       = {
    for k, app in azurerm_container_app.quiz_app :
    k => app.ingress[0].fqdn
  }
}
