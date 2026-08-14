import logging
import uvicorn

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.connection import router as connection_router
from routes.query import router as query_router
from routes.analysis import router as analysis_router
from routes.ai import router as ai_router
from routes.export import router as export_router
from routes.import_routes import router as import_router
from routes.etl import router as etl_router
from routes.storage import router as storage_router


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("cmdq-backend")

app = FastAPI(title="Antigravity Engine Sidecar")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_origin_regex=r"^(https?://.*|file://.*|vscode-webview://.*|null)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(connection_router)
app.include_router(query_router)
app.include_router(analysis_router)
app.include_router(ai_router)
app.include_router(export_router)
app.include_router(import_router)
app.include_router(etl_router)
app.include_router(storage_router)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
