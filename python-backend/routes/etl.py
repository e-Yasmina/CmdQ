from fastapi import APIRouter
from sqlalchemy import text

from database import get_db_connection
from helpers import validate_identifier
from models import DataMigrationRequest
from secret_utils import mask_password

router = APIRouter()


@router.post("/etl/migrate")
async def etl_migrate(req: DataMigrationRequest):
    src_session = None
    tgt_session = None
    try:
        src_schema_name = validate_identifier(req.source_schema or "public", "source schema name") if req.source_schema else ""
        src_table_name = validate_identifier(req.source_table, "source table name")
        tgt_schema_name = validate_identifier(req.target_schema or "public", "target schema name") if req.target_schema else ""
        tgt_table_name = validate_identifier(req.target_table, "target table name")

        src_session = get_db_connection(
            db_type=req.source_config.db_type, host=req.source_config.host, port=req.source_config.port,
            user=req.source_config.user, password=req.source_config.password, dbname=req.source_config.database
        )

        src_schema = src_schema_name if src_schema_name else ("public" if req.source_config.db_type == "postgres" else req.source_schema or "")
        src_tbl = f'"{src_schema}"."{src_table_name}"' if req.source_config.db_type == 'postgres' else f"`{src_schema}`.`{src_table_name}`"

        src_query = f"SELECT * FROM {src_tbl}"
        src_res = src_session.execute(text(src_query))
        src_data = []
        if src_res.returns_rows:
            keys = src_res.keys()
            for row in src_res.fetchall():
                src_data.append(dict(zip(keys, row)))
        src_session.close()
        src_session = None

        transformed_data = []
        for src_row in src_data:
            tgt_row = {}
            for m in req.mappings:
                src_val = src_row.get(m.source_fields[0]) if len(m.source_fields) > 0 else None

                if m.transformation == "concat":
                    val = " ".join([str(src_row.get(f)) for f in m.source_fields if src_row.get(f) is not None])
                    if len(m.target_fields) > 0:
                        tgt_row[m.target_fields[0]] = val
                elif m.transformation == "split":
                    if src_val is not None:
                        parts = str(src_val).split(" ")
                        for i, tgt_f in enumerate(m.target_fields):
                            if i < len(parts):
                                tgt_row[tgt_f] = parts[i]
                            else:
                                tgt_row[tgt_f] = ""
                else:
                    val = src_val
                    if m.transformation == "split_first":
                        if src_val is not None:
                            val = str(src_val).split(" ")[0]
                    elif m.transformation == "split_last":
                        if src_val is not None:
                            parts = str(src_val).split(" ")
                            val = parts[-1] if len(parts) > 1 else ""
                    elif m.transformation == "cast_int":
                        if val is not None:
                            try:
                                val = int(val)
                            except ValueError:
                                val = 0
                    elif m.transformation == "cast_str":
                        if val is not None:
                            val = str(val)

                    if len(m.target_fields) > 0:
                        tgt_row[m.target_fields[0]] = val
            transformed_data.append(tgt_row)

        if not transformed_data:
            return {"status": "success", "message": "No data found to migrate."}

        tgt_session = get_db_connection(
            db_type=req.target_config.db_type, host=req.target_config.host, port=req.target_config.port,
            user=req.target_config.user, password=req.target_config.password, dbname=req.target_config.database
        )

        tgt_schema = req.target_schema or "public" if req.target_config.db_type == "postgres" else req.target_schema
        tgt_tbl = f'"{tgt_schema}"."{tgt_table_name}"' if req.target_config.db_type == 'postgres' else f"`{tgt_schema}`.`{tgt_table_name}`"

        inserted = 0
        tgt_cols = [validate_identifier(k, "target column name") for k in transformed_data[0].keys()]
        col_str = ", ".join([f'"{k}"' if req.target_config.db_type == 'postgres' else f"`{k}`" for k in tgt_cols])
        val_plh = ", ".join([f":{k}" for k in tgt_cols])
        ins_q = f"INSERT INTO {tgt_tbl} ({col_str}) VALUES ({val_plh})"

        for tgt_row in transformed_data:
            tgt_session.execute(text(ins_q), tgt_row)
            inserted += 1

        tgt_session.commit()
        tgt_session.close()
        tgt_session = None

        return {"status": "success", "message": f"Successfully migrated {inserted} rows."}
    except Exception as e:
        if tgt_session:
            tgt_session.rollback()
            tgt_session.close()
        if src_session:
            src_session.close()
        return {"status": "error", "message": f"Data Migration Failed: {mask_password(str(e))}"}
