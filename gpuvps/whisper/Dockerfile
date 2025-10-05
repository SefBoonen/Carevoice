FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies only
RUN pip install --no-cache-dir \
    websockets \
    faster-whisper

# Copy the server code
COPY server.py .

EXPOSE 9000

CMD ["python", "server.py"]