"""Comprehensive API tests - validates all endpoints match frontend expectations."""

import os
import json
import shutil
import uuid
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock, ANY
from fastapi.testclient import TestClient
import main
import cli_client
import persistence_manager
from main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def db_config():
    return {
        "db_type": "postgres",
        "host": "localhost",
        "port": 5432,
        "user": "test_user",
        "password": "test_pass",
        "database": "test_db"
    }

@pytest.fixture(autouse=True)
def isolate_file_storage(monkeypatch):
    """Keep tests from reading or writing local app configuration."""
    test_dir = Path(__file__).resolve().parents[1] / ".test_tmp" / uuid.uuid4().hex
    test_dir.mkdir(parents=True, exist_ok=True)

    models_file = test_dir / "registered_models.json"
    models_file.write_text("[]", encoding="utf-8")
    monkeypatch.setattr(cli_client, "MODELS_FILE", str(models_file))

    storage_files = {}
    for key in persistence_manager.storage.files:
        file_path = test_dir / f"{key}.json"
        file_path.write_text("[]", encoding="utf-8")
        storage_files[key] = str(file_path)
    monkeypatch.setattr(persistence_manager.storage, "files", storage_files)

    yield

    shutil.rmtree(test_dir, ignore_errors=True)

@pytest.fixture(autouse=True)
def mock_db_connection():
    """Mocks get_db_connection and SqlExecutor engine creation in all route modules."""
    patchers = [
        patch("routes.connection.get_db_connection"),
        patch("routes.analysis.get_db_connection"),
        patch("routes.export.get_db_connection"),
        patch("routes.import_routes.get_db_connection"),
        patch("routes.etl.get_db_connection"),
        patch("sql_executor.build_engine"),
    ]
    mocks = [p.start() for p in patchers]
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.keys.return_value = ["id", "name"]
    mock_result.fetchall.return_value = [(1, "Alice"), (2, "Bob")]
    mock_result.rowcount = 2
    mock_session.execute.return_value = mock_result

    mock_conn = MagicMock()
    mock_conn.execute.return_value = mock_result
    mock_conn.begin.return_value.__enter__.return_value = mock_conn
    mock_engine = MagicMock()
    mock_engine.begin.return_value.__enter__.return_value = mock_conn

    for m in mocks[:5]:
        m.return_value = mock_session
    mocks[5].return_value = mock_engine
    yield mocks[0]
    for p in patchers:
        p.stop()


@pytest.fixture(autouse=True)
def mock_extract_schema():
    """Mocks extract_schema in route modules that import it."""
    patchers = [
        patch("routes.connection.extract_schema"),
        patch("routes.ai.extract_schema"),
    ]
    mocks = [p.start() for p in patchers]
    mock_schema = {
        "public": {
            "users": {
                "columns": [{"name": "id", "type": "integer"}, {"name": "name", "type": "text"}],
                "primary_key": ["id"]
            }
        }
    }
    for m in mocks:
        m.return_value = mock_schema
    yield mocks[0]
    for p in patchers:
        p.stop()


@pytest.fixture
def mock_engine():
    """Patches create_engine at legacy route modules and source level."""
    mock_conn = MagicMock()
    mock_result = MagicMock()
    mock_result.returns_rows = True
    mock_result.keys.return_value = ["id", "name"]
    mock_result.fetchall.return_value = [(1, "Alice"), (2, "Bob")]
    mock_result.rowcount = 2
    mock_conn.execute.return_value = mock_result
    mock_conn.begin.return_value.__enter__.return_value = mock_conn
    mock_engine_instance = MagicMock()
    mock_engine_instance.begin.return_value.__enter__.return_value = mock_conn
    mock_engine_instance.connect.return_value.__enter__.return_value = mock_conn

    patchers = [
        patch("routes.connection.create_engine", return_value=mock_engine_instance),
        patch("routes.import_routes.create_engine", return_value=mock_engine_instance),
        patch("helpers.create_engine", return_value=mock_engine_instance),
        patch("sqlalchemy.create_engine", return_value=mock_engine_instance),
        patch("sql_executor.build_engine", return_value=mock_engine_instance),
    ]
    mocks = [p.start() for p in patchers]
    yield
    for p in patchers:
        p.stop()


@pytest.fixture
def mock_subprocess_gemini():
    """Mocks _run_subprocess_with_files in the ai route module."""
    with patch("routes.ai._run_subprocess_with_files") as mock_run:
        mock_run.return_value = ("Here is the SQL:\n```sql\nSELECT * FROM users;\n```\nDone.", "")
        yield mock_run


@pytest.fixture
def mock_which():
    """Mocks shutil.which in cli_client so command resolution passes."""
    with patch("cli_client.shutil.which") as m:
        m.return_value = "C:\\dummy\\cmd.exe"
        yield m


@pytest.fixture
def mock_agent():
    """Mocks agent_tools.create_sql_agent to return a fake agent graph."""
    with patch("agent_tools.create_sql_agent") as mock_create:
        mock_graph = MagicMock()
        mock_graph.invoke.return_value = {
            "messages": [
                MagicMock(
                    tool_calls=[{"name": "execute_sql", "args": {"query": "SELECT * FROM users"}}],
                    content="",
                    spec=["tool_calls", "content"]
                ),
                MagicMock(
                    tool_calls=[],
                    content='[{"id": 1, "name": "Alice"}]',
                    spec=["tool_calls", "content"]
                ),
                MagicMock(
                    tool_calls=[],
                    content="Query executed successfully.",
                    spec=["tool_calls", "content"]
                )
            ]
        }
        mock_create.return_value = mock_graph
        yield mock_create


@pytest.fixture
def mock_no_models():
    """Ensures get_registered_models returns empty list (forces CLI path)."""
    with patch("cli_client.get_registered_models", return_value=[]):
        yield


@pytest.fixture
def mock_models():
    """Returns a registered model for API path testing."""
    model = {
        "id": "gpt-4",
        "name": "GPT-4",
        "provider": "openai",
        "model": "gpt-4",
        "api_key": "sk-test",
        "base_url": ""
    }
    with patch("cli_client.get_registered_models", return_value=[model]):
        yield


@pytest.fixture(autouse=True)
def mock_llm_client():
    """Mocks llm_client.get_llm to avoid real API calls."""
    with patch("llm_client.get_llm") as mock:
        mock.return_value = MagicMock()
        yield mock


@pytest.fixture(autouse=True)
def mock_shutil_which():
    """Mocks shutil.which to control CLI detection."""
    with patch("routes.ai.shutil.which") as mock:
        mock.return_value = None
        yield mock


# ===========================================================================
# 1.  POST /check_port
# ===========================================================================

class TestCheckPort:
    def test_valid_request(self):
        resp = client.post("/check_port", json={"host": "localhost", "port": 5432})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body

    def test_missing_fields(self):
        resp = client.post("/check_port", json={"host": "localhost"})
        assert resp.status_code == 422

    def test_wrong_types(self):
        resp = client.post("/check_port", json={"host": 123, "port": "abc"})
        assert resp.status_code == 422


# ===========================================================================
# 2-6.  Connection-dependent endpoints
# ===========================================================================

class TestConnect:
    def test_valid_request(self, db_config):
        resp = client.post("/connect", json=db_config)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "token" in body

    def test_missing_fields(self):
        resp = client.post("/connect", json={"host": "localhost"})
        assert resp.status_code == 422

    def test_db_error(self, db_config, mock_db_connection):
        from sqlalchemy.exc import OperationalError
        mock_db_connection.side_effect = OperationalError("mock", "mock", "mock")
        resp = client.post("/connect", json=db_config)
        assert resp.status_code == 400


class TestDatabases:
    def test_valid_request(self, db_config):
        resp = client.post("/databases", json=db_config)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "databases" in body
        assert isinstance(body["databases"], list)

    def test_missing_db_type(self):
        resp = client.post("/databases", json={"host": "localhost", "port": 5432, "user": "u", "password": "p"})
        assert resp.status_code == 422


class TestCreateDatabase:
    def test_valid_request(self, db_config, mock_engine):
        resp = client.post("/create_database", json={"db_config": db_config, "new_db_name": "test_new_db"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body

    def test_missing_new_db_name(self, db_config):
        resp = client.post("/create_database", json={"db_config": db_config})
        assert resp.status_code == 422


class TestDropDatabase:
    def test_valid_request(self, db_config, mock_engine):
        resp = client.post("/drop_database", json={"db_config": db_config, "db_name": "old_db"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"

    def test_missing_db_name(self, db_config):
        resp = client.post("/drop_database", json={"db_config": db_config})
        assert resp.status_code == 422


class TestSchema:
    def test_valid_request(self, db_config):
        resp = client.post("/schema", json=db_config)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "schema" in body


# ===========================================================================
# 7.  POST /analyze/protection
# ===========================================================================

class TestProtection:
    def test_valid_request(self, db_config):
        resp = client.post("/analyze/protection", json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users"
        })
        body = resp.json()
        assert body["status"] in ("success", "error")
        if body["status"] == "success":
            assert "report" in body
        else:
            assert "message" in body

    def test_missing_table_name(self, db_config):
        resp = client.post("/analyze/protection", json={
            "db_config": db_config,
            "schema_name": "public"
        })
        assert resp.status_code == 422


# ===========================================================================
# 8.  POST /query
# ===========================================================================

class TestQuery:
    def test_valid_request(self, db_config, mock_engine):
        resp = client.post("/query", json={
            "query": "SELECT * FROM users",
            "db_config": db_config
        })
        body = resp.json()
        assert body["status"] == "success"
        assert "data" in body
        assert isinstance(body["data"], list)
        assert "message" in body

    def test_missing_query(self, db_config):
        resp = client.post("/query", json={"db_config": db_config})
        assert resp.status_code == 422

    def test_with_session_context(self, db_config, mock_engine):
        resp = client.post("/query", json={
            "query": "SELECT * FROM users",
            "db_config": db_config,
            "session_context": ["SET search_path TO public"]
        })
        assert resp.status_code == 200


# ===========================================================================
# 9.  POST /table_data
# ===========================================================================

class TestTableData:
    def test_valid_request(self, db_config):
        resp = client.post("/table_data", json={
            "table_name": "users",
            "schema_name": "public",
            "db_config": db_config
        })
        body = resp.json()
        assert body["status"] == "success"
        assert "data" in body
        assert isinstance(body["data"], list)

    def test_with_pagination(self, db_config):
        resp = client.post("/table_data", json={
            "table_name": "users",
            "schema_name": "public",
            "limit": 10,
            "offset": 0,
            "db_config": db_config
        })
        assert resp.status_code == 200

    def test_missing_table(self, db_config):
        resp = client.post("/table_data", json={"schema_name": "public", "db_config": db_config})
        assert resp.status_code == 422


# ===========================================================================
# 10.  GET /ai/detect_cli
# ===========================================================================

class TestDetectCli:
    def test_returns_list(self):
        resp = client.get("/ai/detect_cli")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "clis" in body
        assert isinstance(body["clis"], list)
        for cli in body["clis"]:
            assert "command" in cli
            assert "name" in cli

    def test_models_have_installed_flag(self):
        resp = client.get("/ai/detect_cli")
        body = resp.json()
        for cli in body["clis"]:
            assert "installed" in cli


# ===========================================================================
# 11.  POST /ai/register_api_model
# ===========================================================================

class TestRegisterApiModel:
    def test_valid_registration(self):
        resp = client.post("/ai/register_api_model", json={
            "id": "test-model",
            "name": "Test Model",
            "provider": "openai",
            "model": "gpt-4",
            "api_key": "sk-test123"
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body

    def test_missing_api_key(self):
        resp = client.post("/ai/register_api_model", json={
            "id": "test-model",
            "name": "Test Model",
            "provider": "openai",
            "model": "gpt-4"
        })
        assert resp.status_code == 422

    def test_missing_provider(self):
        resp = client.post("/ai/register_api_model", json={
            "id": "test-model",
            "name": "Test Model",
            "model": "gpt-4",
            "api_key": "sk-test123"
        })
        assert resp.status_code == 422


class TestRegisteredModelsEndpoints:
    """Tests for GET and DELETE registered model endpoints."""

    def test_list_registered_models_empty(self, isolate_file_storage):
        resp = client.get("/ai/registered_models")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert body["models"] == []

    def test_list_registered_models_with_data(self, isolate_file_storage):
        client.post("/ai/register_api_model", json={
            "id": "m1", "name": "M1", "provider": "openai",
            "model": "gpt-4", "api_key": "sk-1"
        })
        resp = client.get("/ai/registered_models")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["models"]) == 1
        assert body["models"][0]["id"] == "m1"

    def test_delete_registered_model(self, isolate_file_storage):
        client.post("/ai/register_api_model", json={
            "id": "m1", "name": "M1", "provider": "openai",
            "model": "gpt-4", "api_key": "sk-1"
        })
        resp = client.delete("/ai/register_api_model/m1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"

        resp = client.get("/ai/registered_models")
        assert len(resp.json()["models"]) == 0

    def test_delete_nonexistent_model(self, isolate_file_storage):
        resp = client.delete("/ai/register_api_model/nonexistent")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "error"


# ===========================================================================
# 12-13.  POST /ai/launch_cli, /ai/launch_debug
# ===========================================================================

class TestLaunchCli:
    def test_returns_success(self, db_config):
        """launch_cli always returns success as it spawns the command."""
        with patch("routes.ai.subprocess.Popen"):
            resp = client.post("/ai/launch_cli", json={
                "command": "gemini",
                "db_config": db_config
            })
            assert resp.status_code == 200
            body = resp.json()
            assert body["status"] == "success"

    def test_missing_command(self, db_config):
        resp = client.post("/ai/launch_cli", json={"db_config": db_config})
        assert resp.status_code == 422


class TestLaunchDebug:
    def test_returns_success(self, db_config):
        with patch("routes.ai.subprocess.Popen"):
            resp = client.post("/ai/launch_debug", json={
                "command": "gemini",
                "db_config": db_config
            })
            assert resp.status_code == 200


# ===========================================================================
# 14-17.  POST /analyze/{security,performance,data,summary}
# ===========================================================================

class TestAnalyzeEndpoints:
    @pytest.mark.parametrize("endpoint", [
        "/analyze/security",
        "/analyze/performance",
        "/analyze/data",
        "/analyze/summary",
    ])
    def test_response_shape(self, endpoint, db_config):
        resp = client.post(endpoint, json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users"
        })
        body = resp.json()
        if body["status"] == "success":
            assert "metrics" in body
            assert isinstance(body["metrics"], dict)
            assert "ai_summary" in body
            assert "structured_analysis" in body
        else:
            assert "message" in body

    @pytest.mark.parametrize("endpoint", [
        "/analyze/security",
        "/analyze/performance",
        "/analyze/data",
        "/analyze/summary",
    ])
    def test_valid_without_table(self, endpoint, db_config):
        resp = client.post(endpoint, json={
            "db_config": db_config,
            "schema_name": "",
            "table_name": ""
        })
        assert resp.status_code == 200

    @pytest.mark.parametrize("endpoint", [
        "/analyze/security",
        "/analyze/performance",
        "/analyze/data",
        "/analyze/summary",
    ])
    def test_missing_db_config(self, endpoint):
        resp = client.post(endpoint, json={"schema_name": "public", "table_name": "users"})
        assert resp.status_code == 422


# ===========================================================================
# 18.  POST /ai/translate_table
# ===========================================================================

class TestTranslateTable:
    def test_valid_request(self, db_config, mock_which):
        """Translate expects subprocess to return valid JSON."""
        with patch("cli_client._run_subprocess_with_files") as mock_run:
            mock_run.return_value = ('[{"id": 1, "name": "Alice"}]', "")
            resp = client.post("/ai/translate_table", json={
                "command": "gemini",
                "table_data": [{"id": 1, "name": "Alice"}]
            })
            body = resp.json()
            assert body["status"] == "success"
            assert "data" in body
            assert isinstance(body["data"], list)

    def test_missing_command(self):
        resp = client.post("/ai/translate_table", json={"table_data": []})
        assert resp.status_code == 422


# ===========================================================================
# 19.  POST /ai/prompt   -- THE MAIN CHANGED ENDPOINT
# ===========================================================================

class TestAiPrompt:
    def test_api_path_response_shape(self, db_config, mock_models, mock_agent):
        """API path: returns status+message+extracted_sql+data."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show all users",
            "db_config": db_config
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body
        assert "extracted_sql" in body
        assert "data" in body
        assert isinstance(body["data"], list)

    def test_api_path_extracted_sql(self, db_config, mock_models, mock_agent):
        """API path: extracted_sql is populated from tool calls."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show all users",
            "db_config": db_config
        })
        body = resp.json()
        assert body["extracted_sql"] == "SELECT * FROM users"
        assert body["data"] == [{"id": 1, "name": "Alice"}]

    def test_api_path_with_protected_items(self, db_config, mock_models, mock_agent):
        """Protected items are passed through to the agent."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show salaries",
            "db_config": db_config,
            "protected_items": ["public.salaries"]
        })
        assert resp.status_code == 200
        _, kwargs = mock_agent.call_args
        assert "protected_items" in kwargs
        assert "public.salaries" in kwargs["protected_items"]

    def test_api_path_with_session_context(self, db_config, mock_models, mock_agent):
        """Session context is forwarded to the agent."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show users",
            "db_config": db_config,
            "session_context": ["SET search_path TO public"]
        })
        assert resp.status_code == 200
        _, kwargs = mock_agent.call_args
        assert kwargs["session_context"] == ["SET search_path TO public"]

    def test_api_path_system_prompt_includes_schema(self, db_config, mock_models, mock_agent):
        """The system prompt should include schema data."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show users",
            "db_config": db_config
        })
        assert resp.status_code == 200
        _, kwargs = mock_agent.call_args
        assert "system_prompt" in kwargs
        assert isinstance(kwargs["system_prompt"], str)
        assert len(kwargs["system_prompt"]) > 0

    def test_cli_path_response_shape(self, db_config, mock_no_models, mock_subprocess_gemini, mock_which, mock_engine):
        """CLI path: returns the same response shape as API path."""
        resp = client.post("/ai/prompt", json={
            "command": "gemini",
            "prompt": "Show all users",
            "db_config": db_config
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body
        assert "extracted_sql" in body
        assert "data" in body
        assert body["extracted_sql"] == "SELECT * FROM users;"
        assert isinstance(body["data"], list)

    def test_cli_path_sql_execution(self, db_config, mock_no_models, mock_subprocess_gemini, mock_which, mock_engine):
        """CLI path: extracted SQL is executed against the database."""
        resp = client.post("/ai/prompt", json={
            "command": "gemini",
            "prompt": "Show all users",
            "db_config": db_config
        })
        body = resp.json()
        assert body["data"][0]["id"] == 1

    def test_cli_path_no_sql_in_response(self, db_config, mock_no_models, mock_which, mock_engine):
        """CLI path: when no SQL block is in output, data stays empty."""
        with patch("cli_client._run_subprocess_with_files") as mock_run:
            mock_run.return_value = ("Just a plain text response with no SQL.", "")
            resp = client.post("/ai/prompt", json={
                "command": "some-cli", "prompt": "Hello", "db_config": db_config
            })
            body = resp.json()
            assert body["status"] == "success"
            assert body["extracted_sql"] is None
            assert body["data"] == []

    def test_cli_path_safety_drop(self, db_config, mock_no_models, mock_which, mock_engine):
        """CLI path: DROP statements are blocked."""
        with patch("cli_client._run_subprocess_with_files") as mock_run:
            mock_run.return_value = ("```sql\nDROP TABLE users;\n```", "")
            resp = client.post("/ai/prompt", json={
                "command": "some-cli", "prompt": "Drop users table", "db_config": db_config
            })
            body = resp.json()
            assert body["status"] == "success"
            assert "BLOCKED BY SAFETY SYSTEM" in body["data"][0]["error"]

    def test_cli_path_safety_delete_without_where(self, db_config, mock_no_models, mock_which, mock_engine):
        """CLI path: DELETE without WHERE is blocked."""
        with patch("cli_client._run_subprocess_with_files") as mock_run:
            mock_run.return_value = ("```sql\nDELETE FROM users;\n```", "")
            resp = client.post("/ai/prompt", json={
                "command": "some-cli", "prompt": "Delete all", "db_config": db_config
            })
            body = resp.json()
            assert "BLOCKED BY SAFETY SYSTEM" in body["data"][0]["error"]

    def test_cli_path_timeout(self, db_config, mock_no_models, mock_which):
        """CLI path: timeout returns a user-friendly message."""
        with patch("cli_client.subprocess.run") as mock_run:
            import subprocess
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="test", timeout=300)
            resp = client.post("/ai/prompt", json={
                "command": "some-cli", "prompt": "Do something slow", "db_config": db_config
            })
            body = resp.json()
            assert body["status"] == "success"
            assert "timed out" in body["message"].lower()

    def test_with_chat_history(self, db_config, mock_models, mock_agent):
        """Chat history is accepted."""
        resp = client.post("/ai/prompt", json={
            "command": "gpt-4",
            "prompt": "Show users",
            "db_config": db_config,
            "chat_history": [
                {"role": "user", "content": "Previous question"},
                {"role": "assistant", "content": "Previous answer"}
            ]
        })
        assert resp.status_code == 200

    def test_with_attached_file(self, db_config, mock_no_models, mock_subprocess_gemini, mock_which, mock_engine):
        """Attached file metadata is accepted."""
        resp = client.post("/ai/prompt", json={
            "command": "gemini",
            "prompt": "Analyze this file",
            "db_config": db_config,
            "attached_file": {"name": "data.csv", "content": "a,b\n1,2"}
        })
        assert resp.status_code == 200

    def test_missing_prompt(self, db_config):
        resp = client.post("/ai/prompt", json={"command": "gemini", "db_config": db_config})
        assert resp.status_code == 422

    def test_missing_command(self, db_config):
        resp = client.post("/ai/prompt", json={"prompt": "Hello", "db_config": db_config})
        assert resp.status_code == 422

    def test_missing_db_config(self):
        resp = client.post("/ai/prompt", json={"command": "gemini", "prompt": "Hello"})
        assert resp.status_code == 422


# ===========================================================================
# 20-21.  POST /export/table, /export/database
# ===========================================================================

class TestExport:
    def test_export_table_csv(self, db_config, mock_engine):
        resp = client.post("/export/table", json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users",
            "format": "csv"
        })
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/csv; charset=utf-8"
        assert "content-disposition" in resp.headers

    def test_export_table_json(self, db_config, mock_engine):
        resp = client.post("/export/table", json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users",
            "format": "json"
        })
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

    def test_export_table_sql(self, db_config, mock_engine):
        resp = client.post("/export/table", json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users",
            "format": "sql"
        })
        assert resp.status_code == 200

    def test_export_table_invalid_format(self, db_config):
        resp = client.post("/export/table", json={
            "db_config": db_config,
            "schema_name": "public",
            "table_name": "users",
            "format": "pdf"
        })
        assert resp.status_code == 400

    def test_export_database(self, db_config, mock_engine):
        resp = client.post("/export/database", json={
            "db_config": db_config,
            "format": "sql"
        })
        assert resp.status_code == 200
        assert "application/sql" in resp.headers["content-type"]


# ===========================================================================
# 22-24.  POST /import/{scan,table,database}  (multipart)
# ===========================================================================

class TestImport:
    def test_scan_csv(self):
        content = b"id,name\n1,Alice\n2,Bob\n"
        resp = client.post(
            "/import/scan",
            files={"file": ("test.csv", content, "text/csv")},
            data={"format": "csv"}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "report" in body
        assert "row_count" in body["report"]

    def test_scan_unsupported_format(self):
        content = b"some data"
        resp = client.post(
            "/import/scan",
            files={"file": ("test.xyz", content, "application/octet-stream")},
            data={"format": "xyz"}
        )
        body = resp.json()
        assert "status" in body

    def test_import_table_missing_file(self, db_config):
        resp = client.post(
            "/import/table",
            data={
                "db_config": json.dumps(db_config),
                "schema_name": "public",
                "table_name": "users",
                "format": "csv"
            }
        )
        assert resp.status_code == 422

    def test_import_database_missing_file(self, db_config):
        resp = client.post(
            "/import/database",
            data={
                "db_config": json.dumps(db_config),
                "target_database": "test_db"
            }
        )
        assert resp.status_code == 422


# ===========================================================================
# 25.  POST /etl/migrate
# ===========================================================================

class TestEtlMigrate:
    def test_valid_request(self, db_config, mock_engine):
        resp = client.post("/etl/migrate", json={
            "source_config": db_config,
            "source_schema": "public",
            "source_table": "users",
            "target_config": db_config,
            "target_schema": "public",
            "target_table": "users_backup",
            "mappings": [
                {"source_fields": ["id", "name"], "target_fields": ["id", "name"], "transformation": "none"}
            ]
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "message" in body

    def test_missing_mappings(self, db_config):
        resp = client.post("/etl/migrate", json={
            "source_config": db_config,
            "source_table": "users",
            "target_config": db_config,
            "target_table": "users_backup"
        })
        assert resp.status_code == 422


# ===========================================================================
# 26-28.  /storage/{key}  (GET, POST, DELETE)
# ===========================================================================

class TestStorage:
    def test_get_storage_invalid_key(self):
        resp = client.get("/storage/invalid_key")
        assert resp.status_code == 400

    def test_get_storage_valid_key(self):
        resp = client.get("/storage/connections")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"
        assert "data" in body

    def test_post_storage_valid_key(self):
        resp = client.post("/storage/queries", json={"id": "q1", "name": "Test Query"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "success"

    def test_post_storage_invalid_key(self):
        resp = client.post("/storage/bad_key", json={"id": "x"})
        assert resp.status_code == 400

    def test_delete_storage_valid(self):
        resp = client.delete("/storage/connections/nonexistent-id")
        assert resp.status_code in (200, 500)

    def test_delete_storage_invalid_key(self):
        resp = client.delete("/storage/bad_key/some-id")
        assert resp.status_code == 400


# ===========================================================================
# CORS
# ===========================================================================

class TestCors:
    def test_cors_headers(self):
        resp = client.options("/databases", headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST"
        })
        assert "access-control-allow-origin" in resp.headers
        assert resp.headers["access-control-allow-origin"] in ("*", "http://localhost:3000")


# ===========================================================================
# 404 handling
# ===========================================================================

class TestNotFound:
    def test_unknown_route(self):
        resp = client.get("/nonexistent")
        assert resp.status_code == 404
