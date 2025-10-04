FROM python:3.10.14-slim

# Set a consistent working directory
WORKDIR /app

# System deps: ffmpeg (required by whisper), and runtime basics
RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		 ffmpeg \
		 libsndfile1 \
	   build-essential \
	&& rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt ./requirements.txt

# Install Python deps. Pin pip/setuptools to recent to avoid build issues.
RUN pip install --no-cache-dir --upgrade pip setuptools wheel \
	&& pip install --no-cache-dir -r requirements.txt

# Copy server code
COPY server.py ./server.py
COPY healthcheck.py ./healthcheck.py

# Runtime environment
ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1 \
	WHISPER_HOST=0.0.0.0 \
	WHISPER_PORT=9002 \
	WHISPER_MODEL=tiny \
	WHISPER_PARTIAL_INTERVAL=3.0

# Expose websocket port
EXPOSE 9002

# Optional: non-root user for security
RUN useradd -ms /bin/bash appuser \
	&& chown -R appuser:appuser /app
USER appuser

# Healthcheck: ensure the port is reachable
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["python", "healthcheck.py"]

# Start websocket server
CMD ["python", "server.py"]
