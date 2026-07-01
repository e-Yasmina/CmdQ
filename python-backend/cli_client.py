import os
import subprocess
import shutil
import json
import tempfile
import platform


MODELS_FILE = "registered_models.json"

from cli_constants import ALLOWED_CLI_COMMANDS, CLI_ERR_NOT_ALLOWED, CLI_ERR_NOT_FOUND, CLI_ERR_PATH_NOT_FOUND


def get_registered_models():
    if os.path.exists(MODELS_FILE):
        try:
            with open(MODELS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return []


def save_registered_models(models):
    with open(MODELS_FILE, "w", encoding="utf-8") as f:
        json.dump(models, f, indent=4)


def resolve_and_validate_command(cmd):
    cmd_name = os.path.basename(cmd).lower()
    for ext in [".exe", ".cmd", ".bat", ".ps1"]:
        cmd_name = cmd_name.removesuffix(ext)
    if cmd_name not in ALLOWED_CLI_COMMANDS:
        raise ValueError(CLI_ERR_NOT_ALLOWED.format(cmd=cmd_name, allowed=", ".join(sorted(ALLOWED_CLI_COMMANDS))))
    if os.path.isabs(cmd) or cmd.startswith("."):
        resolved = os.path.normpath(cmd)
        if not os.path.exists(resolved):
            raise ValueError(CLI_ERR_PATH_NOT_FOUND.format(path=resolved))
        return resolved
    resolved = shutil.which(cmd)
    if resolved:
        return os.path.normpath(resolved)
    raise ValueError(CLI_ERR_NOT_FOUND.format(cmd=cmd))


def _run_subprocess_with_files(cmd, input_str, timeout=300, env=None):
    """Run a subprocess with temp file redirection instead of pipes.
    
    Many Windows CLIs use WriteConsole / AttachConsole APIs that bypass
    anonymous pipes (used by capture_output=True). Using real OS file handles
    via temp files ensures all output is captured regardless of the CLI's
    output mechanism.
    """
    f_stdin = tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', suffix='_cmdq_in', delete=False)
    try:
        f_stdin.write(input_str)
    finally:
        f_stdin.close()

    f_stdout = tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', suffix='_cmdq_out', delete=False)
    f_stdout.close()

    f_stderr = tempfile.NamedTemporaryFile(mode='w+', encoding='utf-8', suffix='_cmdq_err', delete=False)
    f_stderr.close()

    stdin_path = f_stdin.name
    stdout_path = f_stdout.name
    stderr_path = f_stderr.name

    try:
        creation_flags = 0
        if platform.system() == "Windows":
            creation_flags = subprocess.DETACHED_PROCESS

        with open(stdin_path, 'r', encoding='utf-8') as fin:
            with open(stdout_path, 'w', encoding='utf-8') as fout:
                with open(stderr_path, 'w', encoding='utf-8') as ferr:
                    subprocess.run(
                        cmd,
                        stdin=fin,
                        stdout=fout,
                        stderr=ferr,
                        timeout=timeout,
                        env=env,
                        creationflags=creation_flags
                    )

        stdout = ""
        stderr = ""
        try:
            with open(stdout_path, 'r', encoding='utf-8') as f:
                stdout = f.read()
        except Exception:
            pass
        try:
            with open(stderr_path, 'r', encoding='utf-8') as f:
                stderr = f.read()
        except Exception:
            pass

        return stdout, stderr
    finally:
        for p in [stdin_path, stdout_path, stderr_path]:
            try:
                os.unlink(p)
            except Exception:
                pass


def invoke_llm_simple(cmd_or_model_id, prompt_str, timeout=300, env=None):
    """Invoke an LLM via registered API model or secure CLI fallback. Returns output text."""
    models = get_registered_models()
    selected_api_model = next((m for m in models if m["id"] == cmd_or_model_id), None)
    if selected_api_model:
        from llm_client import get_llm
        print(f"[CmdQ][invoke_llm_simple] Using API model: {selected_api_model['provider']}/{selected_api_model['model']}")
        print(f"[CmdQ][invoke_llm_simple] Prompt length: {len(prompt_str)} chars")
        llm = get_llm(
            provider=selected_api_model["provider"],
            api_key=selected_api_model["api_key"],
            model=selected_api_model["model"],
            base_url=selected_api_model.get("base_url") or ""
        )
        response = llm.invoke(prompt_str)
        resp_text = response.content
        print(f"[CmdQ][invoke_llm_simple] API response length: {len(resp_text)} chars, preview: {resp_text[:500]}")
        return resp_text
    cmd = resolve_and_validate_command(cmd_or_model_id)
    print(f"[CmdQ][invoke_llm_simple] Resolved CLI command: {cmd}")
    print(f"[CmdQ][invoke_llm_simple] Prompt length: {len(prompt_str)} chars")
    stdout, stderr = _run_subprocess_with_files([cmd], prompt_str, timeout=timeout, env=env)
    print(f"[CmdQ][invoke_llm_simple] CLI stdout length: {len(stdout)} chars")
    print(f"[CmdQ][invoke_llm_simple] CLI stdout preview: {stdout[:500]}")
    if stderr:
        print(f"[CmdQ][invoke_llm_simple] CLI stderr: {stderr[:300]}")
    return stdout.strip()


def invoke_llm_structured(cmd_or_model_id, prompt_str, analysis_type, timeout=300):
    """Invoke an LLM with structured parsing via API or CLI. Returns (output, parsed_model_or_None)."""
    models = get_registered_models()
    selected_api_model = next((m for m in models if m["id"] == cmd_or_model_id), None)
    if selected_api_model:
        from llm_client import get_llm
        from db_context_builder import run_structured_analysis
        llm = get_llm(
            provider=selected_api_model["provider"],
            api_key=selected_api_model["api_key"],
            model=selected_api_model["model"],
            base_url=selected_api_model.get("base_url") or ""
        )
        return run_structured_analysis(llm, analysis_type, prompt_str)
    cmd = resolve_and_validate_command(cmd_or_model_id)
    stdout, _ = _run_subprocess_with_files([cmd], prompt_str, timeout=timeout)
    return stdout.strip(), None
