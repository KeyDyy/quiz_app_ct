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
from supabase import create_client, Client
import psycopg2
from urllib.parse import urlparse

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


def parse_database_url(database_url: str) -> dict:
    """Parse PostgreSQL database URL into connection parameters"""
    try:
        parsed = urlparse(database_url)
        return {
            "host": parsed.hostname,
            "port": parsed.port or 5432,
            "database": (
                parsed.path[1:] if parsed.path else "postgres"
            ),  # Remove leading '/'
            "user": parsed.username,
            "password": parsed.password,
        }
    except Exception as e:
        raise Exception(f"Failed to parse database URL: {str(e)}")


def connect_to_database(database_url: str):
    """Create a direct PostgreSQL connection"""
    try:
        db_params = parse_database_url(database_url)
        logger.info(
            f"Connecting to database at {db_params['host']}:{db_params['port']}"
        )

        connection = psycopg2.connect(
            host=db_params["host"],
            port=db_params["port"],
            database=db_params["database"],
            user=db_params["user"],
            password=db_params["password"],
            sslmode="require",  # Supabase requires SSL
        )

        logger.info("Successfully connected to PostgreSQL database")
        return connection

    except Exception as e:
        logger.error(f"Failed to connect to database: {str(e)}")
        raise Exception(f"Database connection failed: {str(e)}")


def clean_sql_content(sql_content: str) -> str:
    """Clean SQL content by removing comments and empty lines"""
    lines = sql_content.split("\n")
    cleaned_lines = []

    for line in lines:
        line = line.strip()
        # Skip empty lines and comment lines
        if line and not line.startswith("--") and not line.startswith("/*"):
            cleaned_lines.append(line)

    return "\n".join(cleaned_lines)


def split_sql_statements(sql_content: str) -> list:
    """Split SQL content into individual statements more reliably"""
    # Clean the SQL content first
    cleaned_sql = clean_sql_content(sql_content)

    # Simple but effective approach: split by semicolon at end of line
    statements = []
    current_statement = ""

    for line in cleaned_sql.split("\n"):
        line = line.strip()
        if not line:
            continue

        current_statement += " " + line if current_statement else line

        # If line ends with semicolon, it's likely end of statement
        if line.endswith(";"):
            # Remove the semicolon and add statement
            stmt = current_statement[:-1].strip()
            if stmt:
                statements.append(stmt)
            current_statement = ""

    # Add any remaining statement
    if current_statement.strip():
        statements.append(current_statement.strip())

    return statements


def execute_migration_sql(connection, migration_sql: str):
    """Execute migration SQL statements with improved parsing"""
    try:
        cursor = connection.cursor()

        # Log the original SQL for debugging
        logger.info(f"Original migration SQL length: {len(migration_sql)} characters")
        logger.info(f"Migration SQL preview: {migration_sql[:500]}...")

        # Split into statements
        statements = split_sql_statements(migration_sql)
        logger.info(f"Found {len(statements)} SQL statements to execute")

        # Log each statement for debugging
        for i, statement in enumerate(statements):
            logger.info(
                f"Statement {i+1}: {statement[:200]}{'...' if len(statement) > 200 else ''}"
            )

        # Execute each statement
        successful_statements = 0
        for i, statement in enumerate(statements):
            if statement.strip():
                try:
                    logger.info(f"Executing statement {i+1}/{len(statements)}")
                    cursor.execute(statement)
                    connection.commit()
                    successful_statements += 1
                    logger.info(f"Statement {i+1} executed successfully")

                    # Check what was created (for CREATE TABLE statements)
                    if statement.upper().startswith("CREATE TABLE"):
                        table_name = statement.split()[2].replace('"', "").split("(")[0]
                        cursor.execute(
                            f"SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '{table_name}'"
                        )
                        result = cursor.fetchone()
                        logger.info(f"Table {table_name} exists: {result[0] > 0}")

                except Exception as e:
                    logger.error(f"Error executing statement {i+1}: {str(e)}")
                    logger.error(f"Failed statement: {statement}")
                    connection.rollback()

                    # Try to continue with next statement instead of failing completely
                    logger.warning(
                        f"Continuing with next statement after error in statement {i+1}"
                    )
                    continue

        cursor.close()
        logger.info(
            f"Migration completed. {successful_statements}/{len(statements)} statements executed successfully"
        )

        # Verify database structure was created
        verify_database_structure(connection)

    except Exception as e:
        logger.error(f"Error executing migration: {str(e)}")
        raise


def verify_database_structure(connection):
    """Verify that database structure was created correctly"""
    try:
        cursor = connection.cursor()

        # Check for tables
        cursor.execute(
            """
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        """
        )
        tables = cursor.fetchall()

        if tables:
            table_names = [table[0] for table in tables]
            logger.info(f"Created tables: {', '.join(table_names)}")
        else:
            logger.warning("No tables found in database after migration")

        # Check for specific expected tables (adjust based on your schema)
        expected_tables = [
            "users",
            "quizzes",
            "questions",
            "answers",
            "user_answers",
        ]  # Add your expected table names

        for table_name in expected_tables:
            cursor.execute(
                f"""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = '{table_name}'
            """
            )
            exists = cursor.fetchone()[0] > 0
            logger.info(f"Table '{table_name}' exists: {exists}")

        cursor.close()

    except Exception as e:
        logger.error(f"Error verifying database structure: {str(e)}")
        # Don't raise here, as verification is just for logging


def init_database_with_migrations(database_url: str, local_path: str):
    """Initialize database using migration files with direct PostgreSQL connection"""
    try:
        # Connect to database
        connection = connect_to_database(database_url)

        # Try multiple possible migration file locations
        migration_paths = [
            Path(local_path)
            / "prisma"
            / "migrations"
            / "20241106152850_plose"
            / "migration.sql",
            Path(local_path)
            / "prisma"
            / "migrations"
            / "20241106152850_plose"
            / "migration.sql",
            Path(local_path) / "database" / "migration.sql",
            Path(local_path) / "sql" / "migration.sql",
            Path(local_path) / "migrations" / "migration.sql",
        ]

        migration_path = None

        # First, try the specific path
        for path in migration_paths:
            if path.exists():
                migration_path = path
                logger.info(f"Found migration file at: {migration_path}")
                break

        # If not found, search recursively
        if not migration_path:
            logger.info("Searching for migration files recursively...")
            for root, dirs, files in os.walk(local_path):
                for file in files:
                    if file == "migration.sql":
                        migration_path = Path(root) / file
                        logger.info(f"Found migration file at: {migration_path}")
                        break
                if migration_path:
                    break

        if not migration_path:
            # Try to find any .sql files
            logger.info("Looking for any SQL files...")
            sql_files = []
            for root, dirs, files in os.walk(local_path):
                for file in files:
                    if file.endswith(".sql"):
                        sql_files.append(Path(root) / file)

            if sql_files:
                logger.info(f"Found SQL files: {[str(f) for f in sql_files]}")
                migration_path = sql_files[0]  # Use the first one
            else:
                raise Exception(f"No migration files found in {local_path}")

        # Read migration file
        with open(migration_path, "r", encoding="utf-8") as f:
            migration_sql = f.read()

        logger.info(f"Read migration file: {migration_path}")
        logger.info(f"Migration content length: {len(migration_sql)} characters")

        # Show first few lines for debugging
        first_lines = migration_sql.split("\n")[:10]
        logger.info(f"First 10 lines of migration:\n" + "\n".join(first_lines))

        # Execute migration
        execute_migration_sql(connection, migration_sql)

        # Close connection
        connection.close()
        logger.info("Database migration completed successfully")

    except Exception as e:
        logger.error(f"Error initializing database: {str(e)}")
        raise


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

        # Trigger the workflow with inputs using main branch
        trigger_url = f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/workflows/{build_workflow['id']}/dispatches"
        payload = {"ref": "main", "inputs": workflow_inputs}  # Always use main branch

        logger.info(f"Triggering workflow at: {trigger_url}")
        response = requests.post(trigger_url, headers=headers, json=payload, timeout=30)
        if response.status_code != 204:
            raise Exception(
                f"Failed to trigger workflow: {response.status_code} - {response.text}"
            )

        return build_workflow["id"]

    except requests.RequestException as e:
        raise Exception(f"GitHub API request failed: {str(e)}")


def get_container_url(gh_pat: str, workflow_run_id: str) -> str:
    """Get the container app URL from the GitHub Actions workflow run"""
    try:
        headers = {
            "Authorization": f"token {gh_pat}",
            "Accept": "application/vnd.github.v3+json",
        }

        # Get the workflow run summary
        run_url = (
            f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/runs/{workflow_run_id}"
        )
        response = requests.get(run_url, headers=headers, timeout=30)
        if response.status_code != 200:
            raise Exception(
                f"Failed to get workflow run: {response.status_code} - {response.text}"
            )

        # Get the jobs for this run
        jobs_url = f"{run_url}/jobs"
        response = requests.get(jobs_url, headers=headers, timeout=30)
        if response.status_code != 200:
            raise Exception(
                f"Failed to get workflow jobs: {response.status_code} - {response.text}"
            )

        jobs = response.json()["jobs"]
        if not jobs:
            return "URL not available yet"

        # Get the build_and_deploy job
        build_job = next(
            (job for job in jobs if job["name"] == "build_and_deploy"), None
        )
        if not build_job:
            return "URL not available yet"

        # Get the job steps
        steps_url = f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/jobs/{build_job['id']}/steps"
        response = requests.get(steps_url, headers=headers, timeout=30)
        if response.status_code != 200:
            raise Exception(
                f"Failed to get job steps: {response.status_code} - {response.text}"
            )

        # Find the "Get Container App URL" step
        steps = response.json()["steps"]
        url_step = next(
            (step for step in steps if step["name"] == "Get Container App URL"), None
        )
        if not url_step:
            return "URL not available yet"

        # Get the step logs
        logs_url = f"{GITHUB_API_URL}/repos/keydyy/quiz_app_ct/actions/jobs/{build_job['id']}/steps/{url_step['number']}/logs"
        response = requests.get(logs_url, headers=headers, timeout=30)
        if response.status_code != 200:
            raise Exception(
                f"Failed to get step logs: {response.status_code} - {response.text}"
            )

        # Parse the logs to find the container URL
        logs = response.text
        for line in logs.split("\n"):
            if "container_url=" in line:
                url = line.split("=")[1].strip()
                if url != "Not available yet":
                    return url

        return "URL not available yet"

    except Exception as e:
        logger.error(f"Error getting container URL: {str(e)}")
        return "Error retrieving URL"


@app.function_name(name="CreateTenant")
@app.route(route="create-tenant", auth_level=func.AuthLevel.FUNCTION)
def main(req: func.HttpRequest) -> func.HttpResponse:
    local_path = None
    try:
        logger.info("Starting CreateTenant function")

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
        database_url = data.get("database_url")
        gh_pat = data.get("gh_pat")

        # Optional parameters for container configuration
        cpu_limit = data.get("cpu_limit", "0.5")
        memory_limit = data.get("memory_limit", "1Gi")
        min_replicas = data.get("min_replicas", 1)
        max_replicas = data.get("max_replicas", 3)

        logger.info(f"Processing tenant: {tenant_id}")

        # Validate required fields
        if not all([tenant_id, supabase_url, supabase_key, database_url, gh_pat]):
            missing_fields = []
            if not tenant_id:
                missing_fields.append("tenant_id")
            if not supabase_url:
                missing_fields.append("supabase_url")
            if not supabase_key:
                missing_fields.append("supabase_anon_key")
            if not database_url:
                missing_fields.append("database_url")
            if not gh_pat:
                missing_fields.append("gh_pat")

            return func.HttpResponse(
                json.dumps(
                    {"error": f"Missing required fields: {', '.join(missing_fields)}"}
                ),
                status_code=400,
                mimetype="application/json",
            )

        # Store tenant configuration in environment variables
        os.environ[f"SUPABASE_URL_{tenant_id}"] = supabase_url
        os.environ[f"SUPABASE_KEY_{tenant_id}"] = supabase_key
        os.environ[f"DATABASE_URL_{tenant_id}"] = database_url
        os.environ[f"CPU_LIMIT_{tenant_id}"] = str(cpu_limit)
        os.environ[f"MEMORY_LIMIT_{tenant_id}"] = str(memory_limit)
        os.environ[f"MIN_REPLICAS_{tenant_id}"] = str(min_replicas)
        os.environ[f"MAX_REPLICAS_{tenant_id}"] = str(max_replicas)

        # Create temporary directory for database initialization
        local_path = tempfile.mkdtemp(prefix=f"db-init-{tenant_id}-")
        logger.info(f"Using temporary directory: {local_path}")

        # Clone repository to get migration files
        logger.info("Cloning repository to get migration files...")
        authenticated_url = REPO_URL.replace("https://", f"https://{gh_pat}@")
        run_command(f"git clone --branch main {authenticated_url} {local_path}")

        # Initialize database with migrations
        try:
            logger.info("Initializing database with migrations...")
            init_database_with_migrations(database_url, local_path)

            # Verify database structure
            connection = connect_to_database(database_url)
            cursor = connection.cursor()

            # Get all tables
            cursor.execute(
                """
                SELECT table_name, table_type 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """
            )
            tables = cursor.fetchall()

            # Get table information
            table_info = {}
            for table_name, table_type in tables:
                cursor.execute(
                    f"""
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = '{table_name}'
                    ORDER BY ordinal_position
                """
                )
                columns = cursor.fetchall()
                table_info[table_name] = {
                    "type": table_type,
                    "columns": [
                        {
                            "name": col[0],
                            "type": col[1],
                            "nullable": col[2],
                            "default": col[3],
                        }
                        for col in columns
                    ],
                }

            cursor.close()
            connection.close()

            logger.info(f"Database initialized successfully for tenant {tenant_id}")
            logger.info(f"Created tables: {', '.join([table[0] for table in tables])}")

        except Exception as e:
            error_msg = f"Failed to initialize database: {str(e)}"
            logger.error(error_msg)
            return func.HttpResponse(
                json.dumps(
                    {"error": error_msg, "tenant_id": tenant_id, "status": "error"}
                ),
                status_code=500,
                mimetype="application/json",
            )

        # Prepare workflow inputs for GitHub Actions
        workflow_inputs = {
            "tenant_id": tenant_id,
            "supabase_url": supabase_url,
            "supabase_anon_key": supabase_key,
            "database_url": database_url,
            "cpu_limit": str(cpu_limit),
            "memory_limit": memory_limit,
            "min_replicas": str(min_replicas),
            "max_replicas": str(max_replicas),
        }

        # Trigger GitHub Actions workflow
        logger.info("Triggering GitHub Actions workflow...")
        workflow_id = trigger_github_workflow(
            gh_pat, tenant_id, "main", workflow_inputs  # Use main branch
        )

        # Get the container URL
        container_url = get_container_url(gh_pat, workflow_id)

        logger.info(f"Successfully initiated deployment for tenant {tenant_id}")

        return func.HttpResponse(
            json.dumps(
                {
                    "message": f"Tenant {tenant_id} deployment initiated successfully",
                    "tenant_id": tenant_id,
                    "container_name": f"quiz-app-{tenant_id}",
                    "image_name": f"ghcr.io/keydyy/{IMAGE_NAME}-{tenant_id}:latest",
                    "workflow_id": workflow_id,
                    "status": "deployment_in_progress",
                    "github_actions_url": f"https://github.com/keydyy/quiz_app_ct/actions/workflows/{workflow_id}",
                    "container_url": container_url,
                    "database_initialized": True,
                }
            ),
            status_code=200,
            mimetype="application/json",
        )

    except Exception as e:
        logger.exception("Error in CreateTenant function")
        return func.HttpResponse(
            json.dumps(
                {
                    "error": f"Failed to create tenant: {str(e)}",
                    "tenant_id": tenant_id if "tenant_id" in locals() else "unknown",
                }
            ),
            status_code=500,
            mimetype="application/json",
        )


# Database initialization test endpoint
@app.function_name(name="InitDatabase")
@app.route(route="init-database", auth_level=func.AuthLevel.FUNCTION)
def init_database(req: func.HttpRequest) -> func.HttpResponse:
    """Test endpoint for database initialization"""
    local_path = None
    try:
        logger.info("Starting InitDatabase function")
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
        database_url = data.get("database_url")
        tenant_id = data.get(
            "tenant_id", "test-tenant"
        )  # Optional, for logging purposes
        gh_pat = data.get("gh_pat")  # Add GitHub token for private repo

        if not database_url:
            return func.HttpResponse(
                json.dumps({"error": "Missing required field: database_url"}),
                status_code=400,
                mimetype="application/json",
            )

        # Create temporary directory
        local_path = tempfile.mkdtemp(prefix=f"db-init-{tenant_id}-")
        logger.info(f"Using temporary directory: {local_path}")

        # Clone repository to get migration files
        logger.info("Cloning repository...")
        if gh_pat:
            authenticated_url = REPO_URL.replace("https://", f"https://{gh_pat}@")
            run_command(f"git clone --branch main {authenticated_url} {local_path}")
        else:
            run_command(f"git clone --branch main {REPO_URL} {local_path}")

        # List directory contents for debugging
        logger.info("Repository contents:")
        for root, dirs, files in os.walk(local_path):
            level = root.replace(local_path, "").count(os.sep)
            indent = " " * 2 * level
            logger.info(f"{indent}{os.path.basename(root)}/")
            sub_indent = " " * 2 * (level + 1)
            for file in files:
                logger.info(f"{sub_indent}{file}")

        # Initialize database with migrations
        try:
            init_database_with_migrations(database_url, local_path)

            # Additional verification - connect and check tables
            connection = connect_to_database(database_url)
            cursor = connection.cursor()

            # Get all tables
            cursor.execute(
                """
                SELECT table_name, table_type 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """
            )
            tables = cursor.fetchall()

            # Get all columns for each table
            table_info = {}
            for table_name, table_type in tables:
                cursor.execute(
                    f"""
                    SELECT column_name, data_type, is_nullable, column_default
                    FROM information_schema.columns 
                    WHERE table_schema = 'public' AND table_name = '{table_name}'
                    ORDER BY ordinal_position
                """
                )
                columns = cursor.fetchall()
                table_info[table_name] = {
                    "type": table_type,
                    "columns": [
                        {
                            "name": col[0],
                            "type": col[1],
                            "nullable": col[2],
                            "default": col[3],
                        }
                        for col in columns
                    ],
                }

            cursor.close()
            connection.close()

            logger.info(f"Database initialized with migrations for tenant {tenant_id}")

            return func.HttpResponse(
                json.dumps(
                    {
                        "message": f"Database initialized successfully for tenant {tenant_id}",
                        "tenant_id": tenant_id,
                        "status": "success",
                        "tables_created": len(tables),
                        "table_info": table_info,
                    }
                ),
                status_code=200,
                mimetype="application/json",
            )

        except Exception as e:
            error_msg = f"Failed to initialize database: {str(e)}"
            logger.error(error_msg)
            return func.HttpResponse(
                json.dumps(
                    {
                        "error": error_msg,
                        "tenant_id": tenant_id,
                        "status": "error",
                    }
                ),
                status_code=500,
                mimetype="application/json",
            )

    except Exception as e:
        logger.exception("Error in InitDatabase function")
        return func.HttpResponse(
            json.dumps(
                {
                    "error": f"Unexpected error: {str(e)}",
                    "tenant_id": tenant_id if "tenant_id" in locals() else "unknown",
                    "status": "error",
                }
            ),
            status_code=500,
            mimetype="application/json",
        )

    finally:
        # Clean up temporary directory
        if local_path and os.path.exists(local_path):
            try:
                shutil.rmtree(local_path)
                logger.info(f"Cleaned up temporary directory: {local_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to cleanup {local_path}: {cleanup_error}")


def check_git_availability():
    """Check if git is available"""
    try:
        result = subprocess.run(["git", "--version"], capture_output=True, text=True)
        return result.returncode == 0
    except:
        return False


@app.function_name(name="GetTenantConfig")
@app.route(route="get-tenant-config", auth_level=func.AuthLevel.FUNCTION)
def get_tenant_config(req: func.HttpRequest) -> func.HttpResponse:
    """Get tenant configuration from Azure Function"""
    try:
        # Get tenant_id from query parameters
        tenant_id = req.params.get("tenant_id")
        if not tenant_id:
            return func.HttpResponse(
                json.dumps({"error": "Missing tenant_id parameter"}),
                status_code=400,
                mimetype="application/json",
            )

        # Get configuration from environment variables or database
        # For now, we'll use environment variables, but you might want to store this in a database
        config = {
            "tenant_id": tenant_id,
            "supabase_url": os.environ.get(f"SUPABASE_URL_{tenant_id}"),
            "supabase_anon_key": os.environ.get(f"SUPABASE_KEY_{tenant_id}"),
            "database_url": os.environ.get(f"DATABASE_URL_{tenant_id}"),
            "cpu_limit": os.environ.get(f"CPU_LIMIT_{tenant_id}", "0.5"),
            "memory_limit": os.environ.get(f"MEMORY_LIMIT_{tenant_id}", "1Gi"),
            "min_replicas": os.environ.get(f"MIN_REPLICAS_{tenant_id}", "1"),
            "max_replicas": os.environ.get(f"MAX_REPLICAS_{tenant_id}", "3"),
        }

        # Validate required fields
        if not all(
            [
                config["supabase_url"],
                config["supabase_anon_key"],
                config["database_url"],
            ]
        ):
            return func.HttpResponse(
                json.dumps({"error": "Missing required configuration for tenant"}),
                status_code=404,
                mimetype="application/json",
            )

        return func.HttpResponse(
            json.dumps(config), status_code=200, mimetype="application/json"
        )

    except Exception as e:
        logger.exception("Error in GetTenantConfig function")
        return func.HttpResponse(
            json.dumps({"error": f"Failed to get tenant configuration: {str(e)}"}),
            status_code=500,
            mimetype="application/json",
        )
