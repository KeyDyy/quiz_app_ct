import logging
import os
import json
import subprocess
from pathlib import Path
import azure.functions as func
import base64

app = func.FunctionApp()

REPO_URL = "https://github.com/keydyy/quiz_app_ct.git"
LOCAL_PATH = "/tmp/tenant-repo"
BRANCH = "deploy"
IMAGE_NAME = "quiz_app_ct"


def run_command(cmd, cwd=None):
    result = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Command failed: {cmd}\n{result.stderr}")
    return result.stdout.strip()


@app.function_name(name="CreateTenant")
@app.route(route="create-tenant", auth_level=func.AuthLevel.FUNCTION)
def main(req: func.HttpRequest) -> func.HttpResponse:
    try:
        data = req.get_json()
        tenant_id = data["tenant_id"]
        supabase_url = data["supabase_url"]
        supabase_key = data["supabase_anon_key"]
        gh_pat = data["gh_pat"]  # GitHub Personal Access Token
        azure_credentials = data[
            "azure_credentials"
        ]  # Base64 encoded Azure credentials

        # Decode Azure credentials
        azure_creds = json.loads(base64.b64decode(azure_credentials).decode())

        os.environ["GIT_AUTHOR_NAME"] = "AzureFunction"
        os.environ["GIT_AUTHOR_EMAIL"] = "azure@function.local"

        # 1. Clone repository
        if os.path.exists(LOCAL_PATH):
            run_command(f"rm -rf {LOCAL_PATH}")
        run_command(f"git clone --branch main {REPO_URL} {LOCAL_PATH}")

        # 2. Create new branch
        run_command(f"git checkout -b {BRANCH}/{tenant_id}", cwd=LOCAL_PATH)

        # 3. Create env file
        env_file = Path(f"{LOCAL_PATH}/envs/.env.{tenant_id}")
        env_file.parent.mkdir(parents=True, exist_ok=True)
        env_file.write_text(
            f"""TENANT_ID={tenant_id}
SUPABASE_URL={supabase_url}
SUPABASE_KEY={supabase_key}
"""
        )

        # 4. Create terraform.tfvars
        tfvars = {
            "github_repository": "keydyy/quiz_app_ct",
            "ghcr_username": "keydyy",
            "ghcr_pat": gh_pat,
            "container_apps": {
                tenant_id: {
                    "name": f"quiz-app-{tenant_id}",
                    "supabase_url": supabase_url,
                    "supabase_anon_key": supabase_key,
                    "cpu": 0.5,
                    "memory": "1Gi",
                }
            },
        }

        tfvars_file = Path(f"{LOCAL_PATH}/terraform/terraform.tfvars.json")
        tfvars_file.parent.mkdir(parents=True, exist_ok=True)
        tfvars_file.write_text(json.dumps(tfvars, indent=2))

        # 5. Create Azure credentials file
        azure_creds_file = Path(f"{LOCAL_PATH}/terraform/azure_credentials.json")
        azure_creds_file.write_text(json.dumps(azure_creds, indent=2))

        # 6. Commit and push changes
        run_command("git add .", cwd=LOCAL_PATH)
        run_command(
            f'git commit -m "Add config for tenant {tenant_id}"', cwd=LOCAL_PATH
        )
        run_command(f"git push origin {BRANCH}/{tenant_id}", cwd=LOCAL_PATH)

        return func.HttpResponse(
            json.dumps(
                {
                    "message": f"Tenant {tenant_id} configuration pushed",
                    "branch": f"{BRANCH}/{tenant_id}",
                    "container_app_name": f"quiz-app-{tenant_id}",
                }
            ),
            status_code=200,
            mimetype="application/json",
        )

    except Exception as e:
        logging.exception("Error in CreateTenant function")
        return func.HttpResponse(
            json.dumps({"error": str(e)}), status_code=500, mimetype="application/json"
        )
