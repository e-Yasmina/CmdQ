import urllib.parse

from pydantic import BaseModel
from typing import Dict, Any, List


class ConnectionDetails(BaseModel):
    db_type: str
    host: str
    port: int
    user: str
    password: str
    database: str = ""

    def build_url(self, database=None, driver=None):
        """Build a database connection URL.

        Args:
            database: Override database name (defaults to self.database).
            driver:  SQLAlchemy driver, e.g. \"psycopg2\", \"mysqlconnector\".
                     None produces a driverless URL (for DATABASE_URL env var).

        Returns:
            str: The database URL.
        """
        safe_user = urllib.parse.quote_plus(self.user)
        safe_password = urllib.parse.quote_plus(self.password)
        db_name = self.database if database is None else database

        if self.db_type == "postgres":
            drv = f"+{driver}" if driver else ""
            if not db_name:
                db_name = "postgres"
            return f"postgresql{drv}://{safe_user}:{safe_password}@{self.host}:{self.port}/{db_name}"
        else:
            drv = f"+{driver}" if driver else ""
            db_part = f"/{db_name}" if db_name else ""
            return f"mysql{drv}://{safe_user}:{safe_password}@{self.host}:{self.port}{db_part}"


class QueryRequest(BaseModel):
    query: str
    db_config: ConnectionDetails
    session_context: List[str] = []


class TableDataRequest(BaseModel):
    table_name: str
    schema_name: str
    limit: int = 100
    offset: int = 0
    db_config: ConnectionDetails
    session_context: List[str] = []


class ChatMessage(BaseModel):
    role: str
    content: str


class ProtectionItem(BaseModel):
    """A single protection rule for a database/schema/table.

    Levels:
        full     - Hidden from AI, all operations blocked
        readonly - Visible in schema, all writes blocked
        custom   - Visible, specific writes allowed via write_permissions
        none     - No protection

    write_permissions:
        List of allowed write ops when level=custom. Subset of:
        ["insert", "update", "delete"].
        E.g. ["insert", "update"] means INSERT and UPDATE allowed, DELETE blocked.
    """
    id: str
    level: str = "full"
    write_permissions: List[str] = []
    connection_id: str = ""
    protected_at: str = ""


class AIPrompt(BaseModel):
    prompt: str
    command: str
    db_config: ConnectionDetails
    schema_data: Dict[str, Any] = None
    chat_history: List[ChatMessage] = []
    protected_items: List[Any] = []
    session_context: List[str] = []
    attached_file: Dict[str, Any] = None
    selected_table: str = ""
    action: str = ""

    def get_typed_protection_items(self) -> List[ProtectionItem]:
        """Return protection items in standardized format.

        Handles backward compatibility: if an item is a plain string,
        converts it to ProtectionItem(id=item, level='full').
        """
        result = []
        for item in self.protected_items:
            if isinstance(item, str):
                result.append(ProtectionItem(id=item, level="full"))
            elif isinstance(item, dict):
                result.append(ProtectionItem(**item))
            elif isinstance(item, ProtectionItem):
                result.append(item)
        return result


class AnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str = ""
    table_name: str = ""
    command: str = ""


# Backward-compat aliases
SecurityAnalysisRequest = AnalysisRequest
PerformanceAnalysisRequest = AnalysisRequest
DataAnalysisRequest = AnalysisRequest
SummaryAnalysisRequest = AnalysisRequest


class ProtectionAnalysisRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str
    table_name: str


class FieldMapping(BaseModel):
    source_fields: List[str]
    target_fields: List[str] = []
    target_field: str = ""
    transformation: str = "none"


class DataMigrationRequest(BaseModel):
    source_config: ConnectionDetails
    source_schema: str = ""
    source_table: str
    target_config: ConnectionDetails
    target_schema: str = ""
    target_table: str
    mappings: List[FieldMapping]


class DatabaseCopyRequest(BaseModel):
    source_config: ConnectionDetails
    source_database: str
    target_config: ConnectionDetails
    target_database: str
    copy_rows: bool = True


class PortCheckDetails(BaseModel):
    host: str
    port: int


class CreateDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    new_db_name: str


class DropDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    db_name: str


class RegisterAPIModel(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    api_key: str
    base_url: str = ""


class CLILaunchDetails(BaseModel):
    command: str
    db_config: ConnectionDetails


class TranslateRequest(BaseModel):
    command: str
    table_data: list


class ExportTableRequest(BaseModel):
    db_config: ConnectionDetails
    schema_name: str
    table_name: str
    format: str = "csv"


class ExportDatabaseRequest(BaseModel):
    db_config: ConnectionDetails
    format: str = "sql"
