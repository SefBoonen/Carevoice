Whisper WebSocket Server - Docker

This folder contains a simple WebSocket server around OpenAI Whisper for live transcription.

Build the image (from this folder):

1) CPU-only
   docker build -t whisper-ws .

2) Optional: GPU (requires NVIDIA driver + nvidia-container-runtime)
   The image itself is CPU-based. To use GPU, run the container with `--gpus all` and ensure PyTorch with CUDA is available inside the image, or mount a compatible wheel. This simple image uses CPU by default.

Run it:

- CPU
  docker run --rm -p 9002:9002 whisper-ws

- GPU (host must have NVIDIA runtime configured)
  docker run --rm --gpus all -p 9002:9002 whisper-ws

Environment variables:
- WHISPER_HOST: default 0.0.0.0
- WHISPER_PORT: default 9002
- WHISPER_MODEL: tiny | base | small | medium | large (default tiny)
- WHISPER_PARTIAL_INTERVAL: seconds between partial transcriptions (default 3.0)

WebSocket endpoint: ws://localhost:9002
