import logging
import os
import json
import subprocess
import tempfile
import shutil
from pathlib import Path
import azure.functions as func
import base64
import requests

app = func.FunctionApp()

REPO_URL = "https://github.com/keydyy/quiz_app_ct.git"
BRANCH_PREFIX = "deploy"
IMAGE_NAME = "quiz_app_ct"
GITHUB_API_URL = "https://api.github.com"

# Konfiguracja loggingu
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_command(cmd, cwd=None):
    """Execute shell command and return output with better error handling"""
    try:
        logger.info(f"Executing command: {cmd}")
        if cwd:
            logger.info(f"Working directory: {cwd}")

        result = subprocess.run(
            cmd,
            shell=True,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=300,  # 5 minutes timeout
        )

        if result.stdout:
            logger.info(f"Command output: {result.stdout}")
        if result.stderr:
            logger.warning(f"Command stderr: {result.stderr}")

        if result.returncode != 0:
            raise Exception(
                f"Command failed with return code {result.returncode}: {cmd}\nSTDOUT: {result.stdout}\nSTDERR: {result.stderr}"
            )

        return result.stdout.strip()

    except subprocess.TimeoutExpired:
        raise Exception(f"Command timed out: {cmd}")
    except Exception as e:
        logger.error(f"Command execution failed: {str(e)}")
        raise


def check_prerequisites():
    """Check if required tools are available"""
    try:
        run_command("git --version")
        logger.info("Git is available")
    except:
        raise Exception("Git is not installed or not available in PATH")


def trigger_github_workflow(gh_pat, tenant_id, branch_name, workflow_inputs):
    """Trigger GitHub Actions workflow for tenant deployment"""
    try:
        headers = {
            "Authorization": f"token {gh_pat}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Get the workflow ID for "Build & Deploy Tenant"
        workflow_url = f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/workflows"
        logger.info(f"Fetching workflows from: {workflow_url}")

        response = requests.get(workflow_url, headers=headers, timeout=30)
        if response.status_code != 200:
            raise Exception(
                f"Failed to get workflows: {response.status_code} - {response.text}"
            )

        workflows = response.json()["workflows"]
        build_workflow = next(
            (w for w in workflows if w["name"] == "Build & Deploy Tenant"), None
        )
        if not build_workflow:
            available_workflows = [w["name"] for w in workflows]
            raise Exception(
                f"Build & Deploy Tenant workflow not found. Available workflows: {available_workflows}"
            )

        # Trigger the workflow with inputs
        trigger_url = f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/workflows/{build_workflow['id']}/dispatches"
        payload = {"ref": branch_name, "inputs": workflow_inputs}

        logger.info(f"Triggering workflow at: {trigger_url}")
        response = requests.post(trigger_url, headers=headers, json=payload, timeout=30)
        if response.status_code != 204:
            raise Exception(
                f"Failed to trigger workflow: {response.status_code} - {response.text}"
            )

        return build_workflow["id"]

    except requests.RequestException as e:
        raise Exception(f"GitHub API request failed: {str(e)}")


@app.function_name(name="CreateTenant")
@app.route(route="create-tenant", auth_level=func.AuthLevel.FUNCTION)
def main(req: func.HttpRequest) -> func.HttpResponse:
    local_path = None

    try:
        logger.info("Starting CreateTenant function")

        # Check prerequisites first
        check_prerequisites()

        # Parse request
        try:
            data = req.get_json()
            if not data:
                return func.HttpResponse(
                    json.dumps({"error": "No JSON data provided"}),
                    status_code=400,
                    mimetype="application/json",
                )
        except Exception as e:
            return func.HttpResponse(
                json.dumps({"error": f"Invalid JSON: {str(e)}"}),
                status_code=400,
                mimetype="application/json",
            )

        # Extract and validate parameters
        tenant_id = data.get("tenant_id")
        supabase_url = data.get("supabase_url")
        supabase_key = data.get("supabase_anon_key")
        gh_pat = data.get("gh_pat")

        # Optional parameters for container configuration
        cpu_limit = data.get("cpu_limit", "0.5")
        memory_limit = data.get("memory_limit", "1Gi")
        min_replicas = data.get("min_replicas", 1)
        max_replicas = data.get("max_replicas", 3)

        logger.info(f"Processing tenant: {tenant_id}")

        # Validate required fields
        if not all([tenant_id, supabase_url, supabase_key, gh_pat]):
            missing_fields = []
            if not tenant_id:
                missing_fields.append("tenant_id")
            if not supabase_url:
                missing_fields.append("supabase_url")
            if not supabase_key:
                missing_fields.append("supabase_anon_key")
            if not gh_pat:
                missing_fields.append("gh_pat")

            return func.HttpResponse(
                json.dumps(
                    {"error": f"Missing required fields: {', '.join(missing_fields)}"}
                ),
                status_code=400,
                mimetype="application/json",
            )

        # Create temporary directory (cross-platform)
        local_path = tempfile.mkdtemp(prefix=f"tenant-{tenant_id}-")
        logger.info(f"Using temporary directory: {local_path}")

        # Set git configuration
        os.environ["GIT_AUTHOR_NAME"] = "AzureFunction"
        os.environ["GIT_AUTHOR_EMAIL"] = "azure@function.local"
        os.environ["GIT_COMMITTER_NAME"] = "AzureFunction"
        os.environ["GIT_COMMITTER_EMAIL"] = "azure@function.local"

        # 1. Clone repository
        logger.info("Cloning repository...")
        authenticated_url = REPO_URL.replace("https://", f"https://{gh_pat}@")
        run_command(f"git clone --branch main {authenticated_url} {local_path}")

        # 2. Create new branch for tenant
        branch_name = f"{BRANCH_PREFIX}/{tenant_id}"
        logger.info(f"Creating branch: {branch_name}")
        run_command(f"git checkout -b {branch_name}", cwd=local_path)

        # 3. Create environment file for tenant
        env_dir = Path(local_path) / "envs"
        env_dir.mkdir(parents=True, exist_ok=True)

        env_file = env_dir / f".env.{tenant_id}"
        env_content = f"""TENANT_ID={tenant_id}
SUPABASE_URL={supabase_url}
SUPABASE_KEY={supabase_key}
NEXT_PUBLIC_SUPABASE_URL={supabase_url}
NEXT_PUBLIC_SUPABASE_ANON_KEY={supabase_key}
"""
        env_file.write_text(env_content, encoding="utf-8")
        logger.info(f"Created environment file: {env_file}")

        # 4. Create Terraform variables file
        terraform_dir = Path(local_path) / "terraform"
        terraform_dir.mkdir(parents=True, exist_ok=True)

        tfvars = {
            "tenant_id": tenant_id,
            "image_name": f"ghcr.io/keydyy/{IMAGE_NAME}-{tenant_id}:latest",
            "container_name": f"quiz-app-{tenant_id}",
            "supabase_url": supabase_url,
            "supabase_anon_key": supabase_key,
            "cpu_limit": float(cpu_limit),
            "memory_limit": memory_limit,
            "min_replicas": int(min_replicas),
            "max_replicas": int(max_replicas),
        }

        tfvars_file = terraform_dir / "terraform.tfvars.json"
        tfvars_file.write_text(json.dumps(tfvars, indent=2), encoding="utf-8")
        logger.info(f"Created Terraform variables file: {tfvars_file}")

        # 5. Commit and push changes
        logger.info("Committing changes...")
        run_command("git add .", cwd=local_path)
        run_command(
            f'git commit -m "Add tenant configuration for {tenant_id}"', cwd=local_path
        )

        logger.info("Pushing changes...")
        run_command(f"git push origin {branch_name}", cwd=local_path)

        # 6. Prepare workflow inputs for GitHub Actions
        workflow_inputs = {
            "tenant_id": tenant_id,
            "supabase_url": supabase_url,
            "supabase_anon_key": supabase_key,
            "cpu_limit": str(cpu_limit),
            "memory_limit": memory_limit,
            "min_replicas": str(min_replicas),
            "max_replicas": str(max_replicas),
        }

        # 7. Trigger GitHub Actions workflow
        logger.info("Triggering GitHub Actions workflow...")
        workflow_id = trigger_github_workflow(
            gh_pat, tenant_id, branch_name, workflow_inputs
        )

        logger.info(f"Successfully initiated deployment for tenant {tenant_id}")

        return func.HttpResponse(
            json.dumps(
                {
                    "message": f"Tenant {tenant_id} deployment initiated successfully",
                    "tenant_id": tenant_id,
                    "branch": branch_name,
                    "container_name": f"quiz-app-{tenant_id}",
                    "image_name": f"ghcr.io/keydyy/{IMAGE_NAME}-{tenant_id}:latest",
                    "workflow_id": workflow_id,
                    "status": "deployment_in_progress",
                    "github_actions_url": f"https://github.com/keydyy/quiz_app_ct/actions/workflows/{workflow_id}",
                }
            ),
            status_code=200,
            mimetype="application/json",
        )

    except Exception as e:
        logger.exception("Error in CreateTenant function")

        error_response = {
            "error": f"Failed to create tenant: {str(e)}",
            "tenant_id": (
                data.get("tenant_id", "unknown") if "data" in locals() else "unknown"
            ),
            "error_type": type(e).__name__,
        }

        return func.HttpResponse(
            json.dumps(error_response), status_code=500, mimetype="application/json"
        )

    finally:
        # Clean up temporary directory
        if local_path and os.path.exists(local_path):
            try:
                shutil.rmtree(local_path)
                logger.info(f"Cleaned up temporary directory: {local_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup {local_path}: {cleanup_error}")


# Health check endpoint for testing
@app.function_name(name="HealthCheck")
@app.route(route="health", auth_level=func.AuthLevel.ANONYMOUS)
def health_check(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(
            {
                "status": "healthy",
                "message": "Function app is running",
                "git_available": check_git_availability(),
            }
        ),
        status_code=200,
        mimetype="application/json",
    )


def check_git_availability():
    """Check if git is available"""
    try:
        result = subprocess.run(["git", "--version"], capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False
