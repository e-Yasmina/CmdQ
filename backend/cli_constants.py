ALLOWED_CLI_COMMANDS = {"gemini", "agy", "ollama", "chatgpt", "qwen", "gh", "agy", "some-cli"}

CLI_ERR_NOT_ALLOWED = "Command '{cmd}' is not allowed. Allowed commands: {allowed}"
CLI_ERR_NOT_FOUND = "Command '{cmd}' was not found on your system PATH. Make sure it is installed and available."
CLI_ERR_PATH_NOT_FOUND = "Command path not found: {path}"
CLI_ERR_TIMEOUT = "The CLI process timed out after {timeout} seconds. Try a simpler prompt or increase the timeout."
CLI_ERR_EMPTY_OUTPUT = "The CLI returned no output. Check that the command is working correctly."
CLI_ERR_GENERIC = "CLI execution failed: {error}"
