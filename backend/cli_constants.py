ALLOWED_CLI_COMMANDS = {"gemini", "ollama", "chatgpt", "qwen", "gh"}

# How npm-distributed CLIs accept a prompt. Consulted only for Windows .cmd/.bat
# shims; a command absent from this map always uses the stdin path instead of
# guessing. Add an entry only after confirming the flag on a real install.
CLI_PROMPT_FLAGS = {
    "gemini": ["-p"],
    "qwen": ["-p"],
    "chatgpt": ["-p"],
}

CLI_ERR_NOT_ALLOWED = "Command '{cmd}' is not allowed. Allowed commands: {allowed}"
CLI_ERR_NOT_FOUND = "Command '{cmd}' was not found on your system PATH. Make sure it is installed and available."
CLI_ERR_PATH_NOT_FOUND = "Command path not found: {path}"
CLI_ERR_TIMEOUT = "The CLI process timed out after {timeout} seconds. Try a simpler prompt or increase the timeout."
CLI_ERR_EMPTY_OUTPUT = "The CLI returned no output. Check that the command is working correctly."
CLI_ERR_GENERIC = "CLI execution failed: {error}"
