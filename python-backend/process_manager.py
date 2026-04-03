import subprocess
import threading
import queue
import time
import os
import signal
import sys
from typing import Optional, Dict

class PersistentProcess:
    def __init__(self, command: str, env: Optional[Dict[str, str]] = None):
        self.command = command
        self.env = env or os.environ.copy()
        self.process: Optional[subprocess.Popen] = None
        self.output_queue = queue.Queue()
        self.stop_event = threading.Event()
        self.reader_thread: Optional[threading.Thread] = None
        self.last_activity = time.time()
        self.is_first_launch = True
        self._start()

    def _start(self):
        """Starts the subprocess with stdin/stdout piped."""
        try:
            print("\n" + "="*50)
            print(">>> NEW PERSISTENCE LOGIC ACTIVE")
            print(f"Subprocess start attempt: {self.command}")
            # print(f"Environment: {self.env}")
            print("="*50 + "\n")
            
            print(f"DEBUG: Calling Popen for '{self.command}'...")
            self.process = subprocess.Popen(
                self.command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                env=self.env,
                shell=True,
                bufsize=0 # Completely unbuffered binary mode
            )
            print(f"DEBUG: Popen success, PID: {self.process.pid}")
            
            # Start a background thread to read output
            self.reader_thread = threading.Thread(target=self._reader, daemon=True)
            self.reader_thread.start()
            print(f"Subprocess started with PID: {self.process.pid}")
        except Exception as e:
            self.process = None # Ensure it's None if it failed
            print(f"CRITICAL: Failed to start process '{self.command}': {e}")
            import traceback
            traceback.print_exc()

    def _reader(self):
        """Thread function to read stdout into the queue."""
        while True:
            try:
                # Read one byte at a time for absolute real-time response
                byte = self.process.stdout.read(1)
                if not byte:
                    break
                
                # Decode to string (CP437 or UTF-8 depending on Windows locale, 
                # but utf-8 is usually safe for modern tools)
                try:
                    char = byte.decode('utf-8', errors='replace')
                except:
                    char = byte.decode('cp1252', errors='replace')
                    
                # Live mirror to backend console for visual debugging
                sys.stdout.write(char)
                sys.stdout.flush()
                self.output_queue.put(char)
            except Exception as e:
                print(f"Reader Error: {e}")
                break
        # Empty signals EOF
        self.output_queue.put(None)

    def send_prompt(self, prompt: str, timeout: float = 60.0, delimiter: str = "__CMDQ_DONE__") -> str:
        """Sends a prompt to the process and reads until timeout or delimiter."""
        # Use a huge timeout for the very first launch of this process
        is_first = self.is_first_launch
        effective_timeout = 1200.0 if is_first else timeout
        print(f"DEBUG: PersistentProcess send_prompt (PID: {self.process.pid if self.process else 'None'})")
        print(f"DEBUG: is_first_launch={is_first}, effective_timeout={effective_timeout}s")
        
        start_time = time.time()
        
        if not self.process or self.process.poll() is not None:
            self._start()
            
        if not self.process:
            return f"Error: Subprocess '{self.command}' failed to start. Check backend console for details."
            
        if not self.process.stdin:
            return f"Error: Subprocess '{self.command}' stdin is not available (Process state: {self.process.poll()})."

        self.last_activity = time.time()
        
        # Clear any leftover output in the queue
        while not self.output_queue.empty():
            try:
                self.output_queue.get_nowait()
            except queue.Empty:
                break
        
        # Write prompt in a separate thread to avoid deadlock on full pipe buffers
        def writer():
            try:
                payload = (prompt + "\n").encode('utf-8')
                self.process.stdin.write(payload)
                self.process.stdin.flush()
            except Exception as e:
                print(f"Writer Thread Error: {e}")
                
        threading.Thread(target=writer, daemon=True).start()

        response = []
        last_receive_time = time.time()
        
        while True:
            elapsed = time.time() - last_receive_time
            if elapsed > effective_timeout:
                response.append(f"\n[Timeout reached after {effective_timeout}s]")
                break
                
            try:
                # Short blocking read to keep the loop responsive
                chunk = self.output_queue.get(timeout=0.1)
                if chunk is None: # EOF
                    break
                    
                response.append(chunk)
                last_receive_time = time.time()
                
                # Check for delimiter
                # Since we read char-by-char now, full_text.join(response) is still valid
                full_text = "".join(response)
                if delimiter and delimiter in full_text:
                    # Success! Clean up and return
                    self.is_first_launch = False
                    return full_text.replace(delimiter, "").strip()
                    
            except queue.Empty:
                # If we've received something and it's been silent for a bit, 
                # we consider it done as a fallback for models that don't use the delimiter.
                # For first launch, we give it more slack (5s) to avoid premature success.
                silence_threshold = 5.0 if is_first else 1.5
                if response and time.time() - last_receive_time > silence_threshold:
                    self.is_first_launch = False
                    duration = time.time() - start_time
                    print(f"\n[DEBUG] Process ready after {duration:.2f}s\n")
                    break
                continue
                
        return "".join(response).strip()

    def stop(self):
        """Terminates the process."""
        self.stop_event.set()
        if self.process:
            try:
                self.process.stdin.close()
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass

class ProcessManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(ProcessManager, cls).__new__(cls)
                cls._instance.processes: Dict[str, PersistentProcess] = {}
        return cls._instance

    def get_process(self, command: str, env: Optional[Dict[str, str]] = None) -> PersistentProcess:
        """Returns an existing persistent process or creates a new one, ensuring only one model runs at a time."""
        # 1. Check if we need to switch models or if the environment changed
        is_new_command = command not in self.processes
        env_changed = False
        
        if not is_new_command:
            existing = self.processes[command]
            # Check if critical env vars changed (e.g. DATABASE_URL)
            if env and existing.env.get("DATABASE_URL") != env.get("DATABASE_URL"):
                env_changed = True
        
        # 2. If it's a new command or env changed or the process is dead, kill OLD ones
        # to ensure only the active model is consuming resources.
        should_restart = is_new_command or env_changed
        if not should_restart:
            existing_proc = self.processes.get(command)
            if not existing_proc or existing_proc.process is None or existing_proc.process.poll() is not None:
                should_restart = True
        
        if should_restart:
            for cmd in list(self.processes.keys()):
                self.processes[cmd].stop()
                del self.processes[cmd]
            
            # 3. Start the new one
            print(f"Launching persistent process: {command}")
            self.processes[command] = PersistentProcess(command, env)
            
        return self.processes[command]

    def cleanup_idle(self, max_idle: float = 3600):
        """Kills processes that haven't been used for a while."""
        now = time.time()
        to_remove = []
        for cmd, proc in self.processes.items():
            if now - proc.last_activity > max_idle:
                proc.stop()
                to_remove.append(cmd)
        for cmd in to_remove:
            del self.processes[cmd]

# Global manager instance
manager = ProcessManager()
