import asyncio
import websockets
import json
import tempfile
import os
from faster_whisper import WhisperModel

print("Loading model")
model = WhisperModel("tiny", device="cpu", compute_type="int8")
print("Model loaded")


async def transcribe_audio(websocket):
    print(f"Client connected from {websocket.remote_address}")
    audio_buffer = bytearray()

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                audio_buffer.extend(message)

                if len(audio_buffer) >= 18000:
                    await process_chunk(audio_buffer, websocket)
                    audio_buffer = audio_buffer[-6000:]
    except Exception as e:
        print(f"Error: {e}")
        await websocket.send(json.dumps({"error": str(e)}))


async def process_chunk(audio_data, websocket):
    webm_path = None

    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_webm:
            tmp_webm.write(audio_data)
            webm_path = tmp_webm.name

        print(f"Webm: {webm_path}, len: {len(audio_data)} bytes")

        segments, info = model.transcribe(
            webm_path,
            language="nl",
            beam_size=1,
            best_of=1,
            temperature=0,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500, threshold=0.5),
        )

        for segment in segments:
            print(segment)
            if segment.text.strip():
                response = {
                    "text": segment.text.strip(),
                    "start": segment.start,
                    "end": segment.end
                }
            await websocket.send(json.dumps(response))
            print(f"Transcribed: {response['text']}")

        os.remove(webm_path)

    except Exception as e:
        print(f"Transcription error: {e}")
        await websocket.send(json.dumps({"error": str(e)}))


async def main():
    print("Starting Whisper WebSocket server...")
    async with websockets.serve(transcribe_audio, "0.0.0.0", 9000):
        print("Server running on ws://0.0.0.0:9000")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
