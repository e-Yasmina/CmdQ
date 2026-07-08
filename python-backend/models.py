from pydantic import BaseModel
from typing import Dict, Any, List


class ConnectionDetails(BaseModel):
    db_type: str
    host: str
    port: int
    user: str
    password: str
    database: str = ""


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


class AIPrompt(BaseModel):
    prompt: str
    command: str
    db_config: ConnectionDetails
    schema_data: Dict[str, Any] = None
    chat_history: List[ChatMessage] = []
    protected_items: List[str] = []
    session_context: List[str] = []
    attached_file: Dict[str, Any] = None
    selected_table: str = ""
    action: str = ""


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
