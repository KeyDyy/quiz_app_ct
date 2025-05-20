terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.29.0"
    }
  }
}

variable "github_repository" {
  description = "GitHub repository name in format owner/repo"
  type        = string
}

provider "azurerm" {
  features {}
  subscription_id = "235ed9ed-d344-429b-b677-f295a9d36fc2"
}

resource "azurerm_resource_group" "quiz_app" {
  name     = "quiz-app-resources"
  location = "North Europe"
}

resource "azurerm_log_analytics_workspace" "quiz_app" {
  name                = "quizapp-logs"
  location            = azurerm_resource_group.quiz_app.location
  resource_group_name = azurerm_resource_group.quiz_app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "quiz_app" {
  name                       = "quiz-app-env"
  location                   = azurerm_resource_group.quiz_app.location
  resource_group_name        = azurerm_resource_group.quiz_app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.quiz_app.id
}

resource "azurerm_container_app" "nextjs_quiz_app" {
  name                         = "nextjs-quiz-app"
  container_app_environment_id = azurerm_container_app_environment.quiz_app.id
  resource_group_name          = azurerm_resource_group.quiz_app.name
  revision_mode                = "Single"

  template {
    container {
      name   = "nextjs"
      image  = "ghcr.io/KeyDyy/nextjs-quiz-app:latest"
      cpu    = 0.5
      memory = "1.0Gi"
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "DATABASE_URL"
        value = "postgresql://<username>:<password>@<host>:5432/<db_name>"
      }
      # Add other environment variables as needed, e.g. for Supabase
      # env {
      #   name  = "SUPABASE_URL"
      #   value = "<your-supabase-url>"
      # }
      # env {
      #   name  = "SUPABASE_ANON_KEY"
      #   value = "<your-supabase-anon-key>"
      # }
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