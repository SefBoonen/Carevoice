import asyncio
import websockets
import json
import tempfile
import os
from faster_whisper import WhisperModel

DEVICE_MODE = os.environ.get('DEVICE_MODE', "cpu")
MODEL_NAME = os.environ.get('MODEL_NAME', "tiny")
COMPUTE_FLOAT = os.environ.get('COMPUTE_FLOAT', "int8")

print(f"Loading model with mode: {DEVICE_MODE}, model: {MODEL_NAME}, computefloat: {COMPUTE_FLOAT}")
model = WhisperModel(MODEL_NAME, device=DEVICE_MODE, compute_type=COMPUTE_FLOAT)
print("Model loaded")


async def transcribe_audio(websocket):
    print(f"Client connected from {websocket.remote_address}")
    complete_audio = bytearray()

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                complete_audio.extend(message)
            elif isinstance(message, str) and message == "END":
                if len(complete_audio) > 0:
                    await process_file(complete_audio, websocket)
                break
    except Exception as e:
        print(f"Error: {e}")


async def process_file(audio_data, websocket):
    webm_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp:
            tmp.write(audio_data)
            webm_path = tmp.name

        print(f"Webm: {webm_path}, len: {len(audio_data)} bytes")

        segments, info = model.transcribe(
            webm_path,
            language="nl",
            beam_size=5,
            vad_filter=True,
            word_timestamps=True,
            condition_on_previous_text=True,
        )
        
        full_text = ""
        for segment in segments:
            if segment.text.strip():
                full_text += segment.text.strip() + " "
                print(f" {segment.text.strip()}")
                
        if full_text:
            response = {"text": full_text.strip()} 
            await websocket.send(json.dumps(response))
            print(f"Transcribed: {response['text']}")

        os.remove(webm_path)

    except Exception as e:
        print(f"Transcription error: {e}")


async def main():
    print("Starting Whisper WebSocket server...")
    async with websockets.serve(transcribe_audio, "0.0.0.0", 9000):
        print("Server running on ws://0.0.0.0:9000")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
