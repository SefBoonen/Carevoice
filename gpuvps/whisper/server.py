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
import os

try:
    import whisper
except Exception:
    whisper = None

logging.basicConfig(level=logging.INFO)

# Configurable via environment variables for containerized deployments
MODEL_NAME = os.getenv("WHISPER_MODEL", "tiny")  # tiny/base/small/medium/large
try:
    PARTIAL_INTERVAL = float(os.getenv("WHISPER_PARTIAL_INTERVAL", "3.0"))
except ValueError:
    PARTIAL_INTERVAL = 3.0  # seconds between partial transcriptions


class ConnectionState:
    def __init__(self):
        self.chunks = []  # raw bytes (Int16 LE)
        self.last_partial = 0.0
        self.detected_language = None  # ISO code like 'en', 'nl', etc.


async def transcribe_buffer(model, state: ConnectionState, partial=False):
    if not state.chunks:
        return None
    try:
        all_bytes = b"".join(state.chunks)
        # Interpret as int16 PCM and convert to float32 in [-1,1]
        audio = np.frombuffer(all_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        # whisper expects a numpy array (16kHz mono float32) or a file path
        logging.info("Running Whisper transcription (%s bytes) partial=%s", len(all_bytes), partial)
        # Set language=None to enable automatic detection
        result = model.transcribe(audio, language=None, fp16=False)
        text = result.get("text", "").strip()
        lang = result.get("language")
        return text, lang
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
                out = await transcribe_buffer(model, state, partial=True)
                if out:
                    text, lang = out
                    if lang and not state.detected_language:
                        state.detected_language = lang
                    msg = json.dumps({
                        "type": "transcript",
                        "text": text,
                        "partial": True,
                        "language": state.detected_language or lang,
                    })
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
                out = await transcribe_buffer(model, state, partial=False)
                if not out:
                    out = ("", None)
                text, lang = out
                if lang and not state.detected_language:
                    state.detected_language = lang
                msg_out = json.dumps({
                    "type": "transcript",
                    "text": text,
                    "partial": False,
                    "language": state.detected_language or lang,
                })
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
    host = os.getenv("WHISPER_HOST", "0.0.0.0")
    try:
        port = int(os.getenv("WHISPER_PORT", "9002"))
    except ValueError:
        port = 9002

    async with serve(handler, host, port):
        logging.info("Whisper WS server listening on ws://%s:%d", host, port)
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
