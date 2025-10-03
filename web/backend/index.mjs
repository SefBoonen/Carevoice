import path from "path";
import express from "express";
import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({port: 8080});
const app = express();

app.use(express.json());
app.use(express.static(path.join("..", "frontend")));

// Handle WebSocket connections for audio streaming
wss.on('connection', (ws) => {
    console.log('Client connected for audio streaming');
    
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'audio-stream') {
                // Handle incoming audio data
                const audioData = Buffer.from(message.data, 'base64');
                console.log(`Received audio chunk: ${audioData.length} bytes`);
                
                // Here you can process the audio data
                // For example: save to file, send to speech recognition API, etc.
                
                // Send acknowledgment back to client
                ws.send(JSON.stringify({
                    type: 'audio-received',
                    timestamp: Date.now(),
                    size: audioData.length
                }));
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Client disconnected from audio streaming');
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

app.listen(3000, "127.0.0.1", () => {
    console.log(`Server running at http://127.0.0.1:3000`);
    console.log(`WebSocket server running on ws://127.0.0.1:8080`);
});
