FROM nvidia/cuda:12.3.2-cudnn9-runtime-ubuntu22.04

WORKDIR /app

# Install Python only (no ffmpeg needed)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip3 install --no-cache-dir \
    websockets \
    faster-whisper

# Copy the server code
COPY server.py .

# Expose the WebSocket port
EXPOSE 9000

# Suppress ONNX Runtime warnings
ENV ORT_LOGGING_LEVEL=3

# Run the server
CMD ["python3", "-u", "server.py"]