import asyncio
import websockets
import json
import tempfile
import os
import whisper

print("Loading model")
model = whisper.load_model("tiny")
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
    try:
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_webm:
            tmp_webm.write(audio_data)
            webm_path = tmp_webm.name
        
        wav_path = webm_path.replace("webm", ".wav")
        os.system(f"ffmpeg -i {webm_path} -ar 16000 -ac 1 -f wav {wav_path} -y -loglevel quiet")
        
        segments, info = model.transcribe(wav_path, beam_size=5, language="en")
        
        for segment in segments:
            result = {
                "text": segment.text.strip(),
                "start": segment.start,
                "end": segment.end
            }
            await websocket.send(json.dumps(result))
            print(f"Transcribed: {result['text']}")
            
        os.remove(webm_path)
        os.remove(wav_path)
            
    except Exception as e:
        print(f"Transcription error: {e}")
        await websocket.send(json.dumps({"error": str(e)}))
        
async def main():
    print("Starting Whisper WebSocket server...")
    async with websockets.serve(transcribe_audio, "0.0.0.0", 8765):
        print("Server running on ws://0.0.0.0:8765")
        await asyncio.Future()
        
if __name__ == "__main__":
    asyncio.run(main())