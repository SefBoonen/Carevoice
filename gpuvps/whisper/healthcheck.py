import os
import socket
import sys

host = os.getenv("WHISPER_HOST", "127.0.0.1")
try:
    port = int(os.getenv("WHISPER_PORT", "9002"))
except ValueError:
    port = 9002

s = socket.socket()
s.settimeout(2)
try:
    s.connect((host if host != "0.0.0.0" else "127.0.0.1", port))
    sys.exit(0)
except Exception:
    sys.exit(1)
finally:
    s.close()
