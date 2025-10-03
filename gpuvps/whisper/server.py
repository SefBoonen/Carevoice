#!/usr/bin/env python3
"""Simple WebSocket server that accepts base64 int16 audio chunks from the Node backend
and performs live transcription with OpenAI's whisper (installed as the whisper package).

Protocol (JSON messages):
- {"type":"audio-stream","data":"<base64>","timestamp":...}
- {"type":"audio-end","data":"<base64_optional_full>"}

Server responses:
- {"type":"transcript","text":"...","partial":true}
- {"type":"transcript","text":"...","partial":false}

This server does basic buffering per-connection and periodically runs a short transcription
for partial/near-real-time feedback. For production use, consider more efficient streaming
or using the OpenAI realtime endpoints.
"""
import asyncio
import base64
import json
import logging
from websockets import serve
import numpy as np
import io

try:
    import whisper
except Exception:
    whisper = None

logging.basicConfig(level=logging.INFO)

MODEL_NAME = "tiny"  # change to tiny/medium as needed
PARTIAL_INTERVAL = 3.0  # seconds between partial transcriptions


class ConnectionState:
    def __init__(self):
        self.chunks = []  # raw bytes (Int16 LE)
        self.last_partial = 0.0


async def transcribe_buffer(model, state: ConnectionState, partial=False):
    if not state.chunks:
        return None
    try:
        all_bytes = b"".join(state.chunks)
        # Interpret as int16 PCM and convert to float32 in [-1,1]
        audio = np.frombuffer(all_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        # whisper expects a numpy array (16kHz mono float32) or a file path
        logging.info("Running Whisper transcription (%s bytes) partial=%s", len(all_bytes), partial)
        result = model.transcribe(audio, language="Dutch", fp16=False)
        text = result.get("text", "").strip()
        return text
    except Exception as e:
        logging.exception("Transcription failed: %s", e)
        return None


async def handler(ws):
    logging.info("Client connected")
    state = ConnectionState()

    # lazy-load model per process
    global whisper
    if whisper is None:
        try:
            import whisper as _whisper
            whisper = _whisper
        except Exception:
            logging.error("Whisper package not available. Install 'whisper' and dependencies.")
            await ws.close()
            return

    model = whisper.load_model(MODEL_NAME)

    async def periodic_partial():
        while True:
            await asyncio.sleep(PARTIAL_INTERVAL)
            try:
                text = await transcribe_buffer(model, state, partial=True)
                if text:
                    msg = json.dumps({"type": "transcript", "text": text, "partial": True})
                    await ws.send(msg)
            except asyncio.CancelledError:
                break
            except Exception:
                logging.exception("Error during periodic partial transcription")

    task = asyncio.create_task(periodic_partial())

    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                logging.warning("Received non-JSON message")
                continue

            mtype = msg.get("type")
            if mtype == "audio-stream":
                b64 = msg.get("data")
                if not b64:
                    continue
                chunk = base64.b64decode(b64)
                # Store raw bytes (already Int16 LE according to client)
                state.chunks.append(chunk)
            elif mtype == "audio-end":
                # optional full base64 included; if present, replace buffer to avoid duplication
                b64 = msg.get("data")
                if b64:
                    state.chunks = [base64.b64decode(b64)]

                # Do final transcription on all data
                text = await transcribe_buffer(model, state, partial=False)
                if text is None:
                    text = ""
                msg_out = json.dumps({"type": "transcript", "text": text, "partial": False})
                await ws.send(msg_out)

                # clear buffer after final
                state.chunks.clear()
            else:
                logging.debug("Unknown message type: %s", mtype)
    except Exception:
        logging.exception("WebSocket handler error")
    finally:
        task.cancel()
        try:
            await task
        except Exception:
            pass
        logging.info("Client disconnected")


async def main():
    async with serve(handler, "127.0.0.1", 8765):
        logging.info("Whisper WS server listening on ws://127.0.0.1:8765")
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
