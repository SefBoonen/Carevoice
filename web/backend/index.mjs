import fs from 'fs';
import path from "path";
import { fileURLToPath } from 'url';
import express from "express";
import WebSocket, { WebSocketServer } from 'ws';

// Derive __dirname in ES module context and set received_audio folder
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECEIVED_DIR = path.join(__dirname, 'received_audio');

// Ensure received_audio directory exists
try {
    if (!fs.existsSync(RECEIVED_DIR)) {
        fs.mkdirSync(RECEIVED_DIR, { recursive: true });
    }
} catch (err) {
    console.error('Failed to create received_audio directory:', err);
}

const wss = new WebSocketServer({port: 9001});
const app = express();

// Create a WebSocket client to the local Python Whisper server
const pyWs = new WebSocket('ws://127.0.0.1:9002');

pyWs.on('open', () => {
    console.log('Connected to Python Whisper server at ws://127.0.0.1:9002');
});

pyWs.on('message', (data) => {
    // Broadcast transcripts from Python server to all connected frontend clients
    try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'transcript') {
            // send to every connected client
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'transcript', text: msg.text, partial: !!msg.partial }));
                }
            });
        }
    } catch (err) {
        console.error('Error processing message from Python server:', err);
    }
});

pyWs.on('close', () => {
    console.log('Disconnected from Python Whisper server');
});

pyWs.on('error', (err) => {
    console.error('Python Whisper WS error:', err);
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Utility: write a 16-bit PCM WAV file (PCM s16le) with 16kHz sample rate, mono
function writeWavFile(filePath, pcmBuffer, sampleRate = 16000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * bitsPerSample / 8;
    const blockAlign = numChannels * bitsPerSample / 8;

    const wavHeader = Buffer.alloc(44);
    // ChunkID 'RIFF'
    wavHeader.write('RIFF', 0);
    // ChunkSize 36 + SubChunk2Size
    wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
    // Format 'WAVE'
    wavHeader.write('WAVE', 8);
    // Subchunk1ID 'fmt '
    wavHeader.write('fmt ', 12);
    // Subchunk1Size 16 for PCM
    wavHeader.writeUInt32LE(16, 16);
    // AudioFormat 1 for PCM
    wavHeader.writeUInt16LE(1, 20);
    // NumChannels
    wavHeader.writeUInt16LE(numChannels, 22);
    // SampleRate
    wavHeader.writeUInt32LE(sampleRate, 24);
    // ByteRate
    wavHeader.writeUInt32LE(byteRate, 28);
    // BlockAlign
    wavHeader.writeUInt16LE(blockAlign, 32);
    // BitsPerSample
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    // Subchunk2ID 'data'
    wavHeader.write('data', 36);
    // Subchunk2Size
    wavHeader.writeUInt32LE(pcmBuffer.length, 40);

    const out = Buffer.concat([wavHeader, pcmBuffer]);
    fs.writeFileSync(filePath, out);
}

// Handle WebSocket connections for audio streaming
wss.on('connection', (ws) => {
    console.log('Client connected for audio streaming');

    // Buffer incoming audio chunks per connection
    const chunks = [];

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === 'audio-stream') {
                // Handle incoming audio data (base64 Int16 bytes)
                const audioData = Buffer.from(message.data, 'base64');
                console.log(`Received audio chunk: ${audioData.length} bytes`);
                chunks.push(audioData);

                // Forward to Python server for near-real-time transcription if connected
                try {
                    if (pyWs && pyWs.readyState === WebSocket.OPEN) {
                        pyWs.send(JSON.stringify({ type: 'audio-stream', data: message.data, timestamp: message.timestamp }));
                    }
                } catch (err) {
                    console.error('Failed to forward audio chunk to Python server:', err);
                }

                // Acknowledge to the client
                ws.send(JSON.stringify({
                    type: 'audio-received',
                    timestamp: Date.now(),
                    size: audioData.length
                }));
            } else if (message.type === 'audio-end') {
                // Client signaled end of stream — write file
                const all = Buffer.concat(chunks);
                // Build a safe filename based on remote address
                let addr = (ws._socket && ws._socket.remoteAddress) || 'client';
                // Remove IPv6-mapped IPv4 prefix if present
                if (typeof addr === 'string' && addr.startsWith('::ffff:')) {
                    addr = addr.replace('::ffff:', '');
                }
                const filename = `${addr}-${Date.now()}.wav`;
                const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
                const outPath = path.join(RECEIVED_DIR, safeName);

                try {
                    writeWavFile(outPath, all, 16000);
                    console.log('Saved received audio to', outPath);
                    ws.send(JSON.stringify({ type: 'audio-saved', path: outPath }));

                    // Notify Python server that the stream ended so it can finalize transcription
                    try {
                        if (pyWs && pyWs.readyState === WebSocket.OPEN) {
                            // Only signal end; Python will transcribe buffered chunks
                            pyWs.send(JSON.stringify({ type: 'audio-end' }));
                        }
                    } catch (err) {
                        console.error('Failed to notify Python server about audio-end:', err);
                    }
                } catch (err) {
                    console.error('Failed to write WAV file:', err);
                    ws.send(JSON.stringify({ type: 'audio-save-error', error: String(err) }));
                }

                // Clear buffer for this connection
                chunks.length = 0;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected from audio streaming');
        // If there are buffered chunks when client disconnects, dump them to file as well
        if (chunks.length > 0) {
            const all = Buffer.concat(chunks);
            const filename = `disconnect-${Date.now()}.wav`;
            const outPath = path.join(RECEIVED_DIR, filename);
            try {
                writeWavFile(outPath, all, 16000);
                console.log('Saved received audio on disconnect to', outPath);
            } catch (err) {
                console.error('Failed to write WAV file on disconnect:', err);
            }
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.listen(3000, () => {
    console.log(`Server running at http://127.0.0.1:3000`);
    console.log(`WebSocket server running on ws://127.0.0.1:9001`);
});
