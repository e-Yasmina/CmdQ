from typing import Dict, Any

from fastapi import APIRouter, HTTPException

from persistence_manager import storage

router = APIRouter()


@router.get("/storage/{key}")
async def get_storage_items(key: str):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    return {"status": "success", "data": storage.get_items(key)}


@router.post("/storage/{key}")
async def save_storage_item(key: str, item: Dict[str, Any]):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    if storage.save_item(key, item):
        return {"status": "success", "message": f"Item saved to {key}"}
    raise HTTPException(status_code=500, detail="Failed to save item")


@router.delete("/storage/{key}/{item_id}")
async def delete_storage_item(key: str, item_id: str):
    if key not in storage.files:
        raise HTTPException(status_code=400, detail="Invalid storage key")
    if storage.delete_item(key, item_id):
        return {"status": "success", "message": f"Item {item_id} deleted from {key}"}
    raise HTTPException(status_code=500, detail="Failed to delete item")
