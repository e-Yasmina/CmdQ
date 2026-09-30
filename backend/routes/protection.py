from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from persistence_manager import storage

router = APIRouter()


class ProtectionRuleRequest(BaseModel):
    id: str
    level: str = "full"
    write_permissions: List[str] = []
    connection_id: str = ""
    protected_at: str = ""


class ProtectionBulkRequest(BaseModel):
    rules: List[ProtectionRuleRequest]
    connection_id: str = ""


@router.get("/protection")
async def get_protection_rules(connection_id: Optional[str] = None):
    """Load protection rules, optionally filtered by connection_id."""
    rules = storage.get_items("protected_items")
    if connection_id:
        rules = [r for r in rules if r.get("connection_id", "") == connection_id]
    return {"status": "success", "rules": rules}


@router.post("/protection")
async def save_protection_rule(req: ProtectionRuleRequest):
    """Save or update a single protection rule."""
    item = {
        "id": req.id,
        "level": req.level,
        "write_permissions": req.write_permissions,
        "connection_id": req.connection_id,
        "protected_at": req.protected_at,
    }
    if storage.save_item("protected_items", item):
        return {"status": "success", "message": "Protection rule saved"}
    raise HTTPException(status_code=500, detail="Failed to save protection rule")


@router.post("/protection/bulk")
async def save_protection_bulk(req: ProtectionBulkRequest):
    """Save multiple protection rules at once (for sync from frontend)."""
    success_count = 0
    for rule in req.rules:
        item = {
            "id": rule.id,
            "level": rule.level,
            "write_permissions": rule.write_permissions,
            "connection_id": rule.connection_id or req.connection_id,
            "protected_at": rule.protected_at,
        }
        if storage.save_item("protected_items", item):
            success_count += 1
    return {"status": "success", "message": f"Saved {success_count}/{len(req.rules)} rules"}


@router.delete("/protection/{rule_id}")
async def delete_protection_rule(rule_id: str):
    """Delete a protection rule by its composite ID."""
    if storage.delete_item("protected_items", rule_id):
        return {"status": "success", "message": f"Rule {rule_id} deleted"}
    raise HTTPException(status_code=500, detail="Failed to delete protection rule")
