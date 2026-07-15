import json
import os
import re
import shutil
import subprocess
import tempfile
import traceback
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sqlalchemy import text, create_engine

from cli_client import (
    get_registered_models, update_registered_models,
    invoke_llm_simple, invoke_llm_structured, resolve_llm_target, _run_subprocess_with_files,
)
from cli_constants import (
    ALLOWED_CLI_COMMANDS, CLI_ERR_NOT_ALLOWED, CLI_ERR_NOT_FOUND,
    CLI_ERR_PATH_NOT_FOUND, CLI_ERR_TIMEOUT, CLI_ERR_EMPTY_OUTPUT, CLI_ERR_GENERIC,
)
from db_context_builder import (
    extract_schema, extract_relationships, build_base_prompt,
    parse_table_mentions, build_mentioned_tables_context,
)
from helpers import _upsert_model, _delete_model, get_desktop_path, safe_filepath, SaveFileRequest
from models import CLILaunchDetails, RegisterAPIModel, AIPrompt, TranslateRequest
from secret_utils import mask_password

router = APIRouter()


@router.get("/ai/detect_cli")
async def detect_cli():
    known_clis = {
        "gemini": "Gemini CLI",
        "gh": "GitHub Copilot CLI (gh)",
        "ollama": "Ollama Local AI",
        "chatgpt": "ChatGPT CLI",
        "qwen": "Qwen CLI",
    }
    extra_paths = [
        os.path.join(os.path.expanduser("~"), "AppData", "Roaming", "npm")
    ]
    available_clis = []
    for cmd, name in known_clis.items():
        found_path = shutil.which(cmd)
        if not found_path:
            for p in extra_paths:
                full_p = os.path.join(p, f"{cmd}.cmd")
                if os.path.exists(full_p):
                    found_path = full_p
                    break
        if found_path:
            available_clis.append({"command": found_path, "name": name, "installed": True})
    for model in get_registered_models():
        available_clis.append({
            "command": model["id"],
            "name": f"{model['name']} (API)",
            "installed": True,
            "is_registered": True
        })
    available_clis.append({"command": "custom", "name": "Custom CLI Launch Command", "installed": True})
    return {"status": "success", "clis": available_clis}


@router.get("/ai/registered_models")
async def list_registered_models():
    models = get_registered_models()
    return {"status": "success", "models": models}


@router.post("/ai/register_api_model")
async def register_api_model(m: RegisterAPIModel):
    updated = update_registered_models(
        lambda models: _upsert_model(models, m.model_dump())
    )
    if updated:
        return {"status": "success", "message": "Registered/updated API Model."}
    return {"status": "error", "message": "Failed to register API model (lock timeout)."}


@router.delete("/ai/register_api_model/{model_id}")
async def delete_registered_model(model_id: str):
    deleted = update_registered_models(
        lambda models: _delete_model(models, model_id)
    )
    if deleted is None:
        return {"status": "error", "message": f"Model with id '{model_id}' not found."}
    if not deleted:
        return {"status": "error", "message": "Failed to delete model (lock timeout)."}
    return {"status": "success", "message": f"Deleted registered API Model '{model_id}'."}


@router.post("/ai/launch_cli")
async def launch_cli(details: CLILaunchDetails):
    try:
        print(f"DEBUG: launch_cli/debug called for command: '{details.command}'")
        cfg = details.db_config
        db_url = cfg.build_url()
        env = os.environ.copy()
        env["DATABASE_URL"] = db_url
        env["DB_HOST"] = cfg.host
        env["DB_PORT"] = str(cfg.port)
        env["DB_USER"] = cfg.user
        env["DB_NAME"] = cfg.database
        cmd_to_run = details.command
        bat_content = f'@echo off\ntitle CmdQ Debug Console\n"{cmd_to_run}"\npause\n'
        bat_file = os.path.join(tempfile.gettempdir(), "cmdq_debug_launch.bat")
        with open(bat_file, "w") as f:
            f.write(bat_content)
        subprocess.Popen(
            [bat_file],
            env=env,
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
        return {"status": "success", "message": f"Successfully spawned debug console for '{cmd_to_run}'"}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Failed to launch debug terminal: {mask_password(str(e))}")


@router.post("/ai/launch_debug")
async def launch_debug(details: CLILaunchDetails):
    return await launch_cli(details)


@router.post("/ai/translate_table")
def translate_table(req: TranslateRequest):
    try:
        raw_json_data = json.dumps(req.table_data)
        prompt_str = f"You are a database localization tool. Translate the following JSON array of database rows into English (or the closest human-readable language if you can infer intent). Keep the exact same JSON structure (an array of objects). Translate the data values if they are text. If the keys (column headers) are in a foreign language, translate the keys to English too. Output ONLY valid JSON array of objects without any markdown blocks or backticks. JSON:\n{raw_json_data}\n\nVERY IMPORTANT: Output ONLY raw JSON, nothing else."
        output = invoke_llm_simple(req.command, prompt_str, timeout=300)
        sql_match = re.search(r'```(?:json)?\s*(.*?)\s*```', output, re.IGNORECASE | re.DOTALL)
        if sql_match:
            output = sql_match.group(1).strip()
        else:
            start_idx = output.find('[')
            end_idx = output.rfind(']')
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                output = output[start_idx:end_idx+1].strip()
        translated_data = json.loads(output)
        return {"status": "success", "data": translated_data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Translation failed: {mask_password(str(e))}")


@router.post("/ai/prompt")
async def ai_prompt(payload: AIPrompt):
    try:
        cfg = payload.db_config
        print(f"[CmdQ] /ai/prompt called | db: {cfg.database} | table: {payload.selected_table} | action: {payload.action} | prompt: {payload.prompt[:150]}")
        db_url = cfg.build_url()
        env = os.environ.copy()
        env["DATABASE_URL"] = db_url
        user_prompt = payload.prompt
        mentions = parse_table_mentions(payload.prompt)
        for schema_name, table_name in mentions:
            user_prompt = user_prompt.replace(f"@{schema_name}.{table_name}", f"{schema_name}.{table_name}")
        try:
            schema_dict = extract_schema(
                db_type=cfg.db_type, host=cfg.host, port=cfg.port,
                user=cfg.user, password=cfg.password, database=cfg.database
            )
        except Exception as schema_err:
            err_lower = str(schema_err).lower()
            if "could not connect" in err_lower or "connection refused" in err_lower or "connection timed out" in err_lower:
                raise HTTPException(status_code=400, detail=f"Database connection failed: Server at {cfg.host}:{cfg.port} is unreachable. Check if the database server is running and accessible.")
            if "password" in err_lower and ("failed" in err_lower or "denied" in err_lower):
                raise HTTPException(status_code=400, detail=f"Database authentication failed: Incorrect username or password for user '{cfg.user}'.")
            if "database" in err_lower and ("does not exist" in err_lower or "unknown" in err_lower):
                raise HTTPException(status_code=400, detail=f"Database '{cfg.database}' does not exist on the server.")
            raise

        target_table = None
        if payload.selected_table:
            parts = payload.selected_table.split(".", 1)
            target_table = tuple(parts) if len(parts) == 2 else ("public", parts[0])
        elif mentions:
            target_table = mentions[0]

        all_relationships = None
        mentions_context = ""
        if mentions:
            all_relationships = extract_relationships(
                db_type=cfg.db_type, host=cfg.host, port=cfg.port,
                user=cfg.user, password=cfg.password, database=cfg.database
            )
            mentions_context = build_mentioned_tables_context(
                db_type=cfg.db_type, host=cfg.host, port=cfg.port,
                user=cfg.user, password=cfg.password, database=cfg.database,
                mentions=mentions, schema_dict=schema_dict,
                all_relationships=all_relationships,
                target_table=target_table
            )

        if target_table:
            t_schema, t_table = target_table
            if all_relationships is None:
                all_relationships = extract_relationships(
                    db_type=cfg.db_type, host=cfg.host, port=cfg.port,
                    user=cfg.user, password=cfg.password, database=cfg.database
                )
            related = {(t_schema, t_table)}
            for rel in all_relationships:
                if rel["source_schema"] == t_schema and rel["source_table"] == t_table:
                    related.add((rel["referenced_schema"], rel["referenced_table"]))
                if rel["referenced_schema"] == t_schema and rel["referenced_table"] == t_table:
                    related.add((rel["source_schema"], rel["source_table"]))
            focused = {}
            for s_name, tables in schema_dict.items():
                for t_name, t_info in tables.items():
                    if (s_name, t_name) in related:
                        if s_name not in focused:
                            focused[s_name] = {}
                        focused[s_name][t_name] = t_info
            schema_dict = focused

        prompt_parts = [user_prompt]
        if mentions_context:
            prompt_parts.append(mentions_context)
        if payload.selected_table:
            prefix = f"[Table: {payload.selected_table}"
            if payload.action:
                prefix += f", Action: {payload.action}"
            prefix += "]\n"
            prompt_parts.insert(0, prefix)
        elif payload.action and mentions:
            prefix = f"[Action: {payload.action} on target table from @mentions]\n"
            prompt_parts.insert(0, prefix)
        user_prompt = "\n".join(prompt_parts)

        base_prompt = build_base_prompt(
            db_config=cfg,
            schema_dict=schema_dict,
            protected_items=payload.protected_items,
            session_context=payload.session_context,
            attached_file=payload.attached_file,
            chat_history=payload.chat_history,
            user_prompt=user_prompt
        )

        cmd_to_run = payload.command
        target_type, target = resolve_llm_target(cmd_to_run)
        selected_api_model = target if target_type == "api" else None

        if selected_api_model:
            print(f"[CmdQ] Resolved model: provider={selected_api_model['provider']}, model={selected_api_model['model']}, id={selected_api_model['id']}")
        else:
            print(f"[CmdQ] Resolved CLI: command={cmd_to_run}")
        print(f"[CmdQ] Base prompt length: {len(base_prompt)} chars, preview: {base_prompt[:300]}...")
        print(f"[CmdQ] User prompt: {payload.prompt[:200]}")

        output = ""
        extracted_sql = None
        execution_results = []

        if selected_api_model:
            from llm_client import get_llm
            from agent_tools import create_sql_agent
            llm = get_llm(
                provider=selected_api_model["provider"],
                api_key=selected_api_model["api_key"],
                model=selected_api_model["model"],
                base_url=selected_api_model.get("base_url") or ""
            )
            agent = create_sql_agent(
                llm=llm,
                system_prompt=base_prompt,
                db_config=cfg,
                protected_items=payload.protected_items,
                session_context=payload.session_context
            )
            print(f"[CmdQ] Invoking agent with prompt: {payload.prompt[:200]}")
            result = agent.invoke({"messages": [{"role": "user", "content": payload.prompt}]})
            messages = result.get("messages", [])
            print(f"[CmdQ] Agent returned {len(messages)} messages")

            output_parts = []
            for i, msg in enumerate(messages):
                role = getattr(msg, "type", "unknown")
                content = getattr(msg, "content", "") or ""
                tool_calls = getattr(msg, "tool_calls", None) or []
                tc_info = ""
                if tool_calls:
                    tc_names = [tc.get("name", "?") for tc in tool_calls]
                    tc_info = f" [tool_calls: {', '.join(tc_names)}]"
                if content.strip():
                    display_content = content.strip()
                    if role == "tool" and len(display_content) > 500:
                        display_content = display_content[:500] + f"\n... [TRUNCATED, full length: {len(content)} chars]"
                    output_parts.append(f"[Step {i}] ({role}){tc_info}:\n{display_content}")
                    print(f"[CmdQ] Message {i} ({role}): {content[:150]}...{tc_info}")
                elif tool_calls:
                    print(f"[CmdQ] Message {i} ({role}): (content empty){tc_info}")
                else:
                    print(f"[CmdQ] Message {i} ({role}): (empty)")

            output = "\n\n---\n\n".join(output_parts) if output_parts else "(Agent completed but produced no text output)"

            for i, msg in enumerate(messages):
                tool_calls = getattr(msg, "tool_calls", None) or []
                for tc in tool_calls:
                    if tc.get("name") == "execute_sql":
                        extracted_sql = tc.get("args", {}).get("query", "")
                        if i + 1 < len(messages):
                            obs_msg = messages[i + 1]
                            obs = obs_msg.content if hasattr(obs_msg, "content") else ""
                            try:
                                parsed = json.loads(obs)
                                execution_results = parsed if isinstance(parsed, list) else [parsed]
                            except (json.JSONDecodeError, TypeError):
                                execution_results = [{"result": obs}]
            print(f"[CmdQ] Extracted SQL: {extracted_sql[:200] if extracted_sql else 'None'}")
            print(f"[CmdQ] Execution results: {len(execution_results)} rows")
            print(f"[CmdQ] Output length: {len(output)} chars")
        else:
            try:
                cmd_lower = cmd_to_run.lower()
                if "gemini" in cmd_lower:
                    node_script = None
                    if cmd_to_run.lower().endswith((".cmd", ".bat")):
                        try:
                            with open(cmd_to_run, "r") as f:
                                cmd_content = f.read()
                            import re as re_mod
                            match = re_mod.search(r'["\']?([^"\']+[\\\/]node_modules[\\\/][^"\']+\.js)["\']?', cmd_content)
                            if match:
                                raw = match.group(1)
                                cmd_dir = os.path.dirname(cmd_to_run)
                                node_script = raw.replace("%dp0%", cmd_dir).replace("%~dp0", cmd_dir).replace("%dp0", cmd_dir)
                                node_script = os.path.normpath(node_script)
                        except:
                            pass

                    if node_script and os.path.exists(node_script):
                        run_cmd = ["node", node_script, "-p", base_prompt]
                    else:
                        run_cmd = [cmd_to_run, "-p", base_prompt[:7000]]

                    gemini_stdout, _ = _run_subprocess_with_files(run_cmd, "", timeout=300, env=env)
                    output = gemini_stdout.strip()
                else:
                    output = invoke_llm_simple(cmd_to_run, base_prompt, timeout=300, env=env)

                if not output:
                    output = f"[CmdQ] Command '{cmd_to_run}' produced no output. If you expected AI-generated results, try selecting an API model from the dropdown instead of a CLI command."

                print(f"[CmdQ] Raw output from CLI/model ({cmd_to_run}): length={len(output)} chars, preview={output[:600]}")

                sql_match = re.search(r'```sql(.*?)(?:```|$)', output, re.IGNORECASE | re.DOTALL)
                if sql_match:
                    extracted_sql = sql_match.group(1).strip()
                    upper_sql = extracted_sql.upper()
                    is_unsafe = any(kw in upper_sql for kw in ["DROP ", "ALTER ", "TRUNCATE "])
                    if is_unsafe or ("DELETE " in upper_sql and "WHERE " not in upper_sql):
                        execution_results = [{"error": "BLOCKED BY SAFETY SYSTEM: Destructive commands are not allowed."}]
                    else:
                        url = cfg.build_url(driver="psycopg2" if cfg.db_type == "postgres" else "mysqlconnector")
                        engine = create_engine(url)
                        try:
                            with engine.begin() as conn:
                                rp = conn.execute(text(extracted_sql))
                                if rp.returns_rows:
                                    execution_results = [dict(zip(rp.keys(), row)) for row in rp.fetchall()]
                        except Exception as sql_err:
                            execution_results = [{"error": mask_password(str(sql_err))}]
            except subprocess.TimeoutExpired:
                output = "CLI process timed out after 300 seconds."
            except Exception as cli_err:
                output = f"CLI Error: {mask_password(str(cli_err))}"

        return {
            "status": "success",
            "message": output,
            "extracted_sql": extracted_sql,
            "data": execution_results
        }

    except HTTPException:
        raise
    except Exception as e:
        error_msg = mask_password(str(e))
        err_lower = error_msg.lower()
        if any(kw in err_lower for kw in ["401", "unauthenticated", "unauthorized", "invalid key", "api_key"]):
            if "quota" in err_lower or "billing" in err_lower:
                error_msg = "API quota exceeded or billing issue. Check your plan or try a different model."
            else:
                error_msg = "API key is invalid or expired. Update your model's API key in Settings > API Models."
        elif any(kw in err_lower for kw in ["402", "payment", "billing"]):
            error_msg = "API payment required. Check your billing status with the AI provider."
        elif any(kw in err_lower for kw in ["429", "rate limit", "too many requests"]):
            error_msg = "API rate limit exceeded. Wait a moment and try again."
        elif any(kw in err_lower for kw in ["timeout", "timed out", "deadline"]):
            error_msg = "Request timed out. The AI model took too long to respond. Try a simpler prompt or a different model."
        elif any(kw in err_lower for kw in ["model not found", "not found", "404"]):
            error_msg = "AI model not found. Check the model name in your API settings."
        elif any(kw in err_lower for kw in ["unsupported provider", "provider"]):
            error_msg = "Unsupported AI provider. Choose OpenAI, Gemini, or Anthropic in your model settings."
        elif any(kw in err_lower for kw in ["connection refused", "connection reset", "connection error", "cannot connect"]):
            error_msg = "Network error: Could not reach the AI provider's servers. Check your internet connection."
        elif any(kw in err_lower for kw in ["module", "import", "not installed", "no module"]):
            missing = error_msg.split("'")[1] if "'" in error_msg else "a required package"
            error_msg = f"Missing Python package: '{missing}' is not installed. Run: pip install {missing}"
        elif any(kw in err_lower for kw in ["context window", "maximum context", "too long", "token limit"]):
            error_msg = "Prompt too long for the model's context window. Try a shorter prompt or reduce the database schema size."
        elif "not allowed" in err_lower:
            error_msg = f"CLI command not allowed: {error_msg}"
        elif "not found in path" in err_lower:
            error_msg = f"CLI command not found: {error_msg}"
        elif "path not found" in err_lower:
            error_msg = f"CLI command path not found: {error_msg}"
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"AI Error: {error_msg}")


@router.post("/ai/save_file")
async def ai_save_file(req: SaveFileRequest):
    try:
        dest_dir = Path(req.directory) if req.directory else get_desktop_path()
        dest_dir = dest_dir.resolve()
        if not dest_dir.exists():
            dest_dir.mkdir(parents=True, exist_ok=True)
        final_path = safe_filepath(dest_dir, req.filename)
        with open(final_path, "w", encoding="utf-8") as f:
            f.write(req.content)
        print(f"[CmdQ] Saved file: {final_path}")
        return {"status": "success", "path": final_path}
    except Exception as e:
        print(f"[CmdQ][save_file] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save file: {mask_password(str(e))}")
