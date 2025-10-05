import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "..", "frontend")));

const server = app.listen(3000, () => console.log(`Server running at http://localhost:3000`));
const wss = new WebSocketServer({ server });

const WHISPER_SERVER = "ws://127.0.0.1:9000";

wss.on("connection", (ws) => {
    console.log("Client connected");
    const tempFile = `temp_${Date.now()}.webm`;
    const finalFile = `recording_${Date.now()}.webm`;
    const fileStream = fs.createWriteStream(tempFile);

    const whisperWs = new WebSocket(WHISPER_SERVER);

    whisperWs.on("open", (ws) => {
        console.log("connected to whisper server");
    });

    whisperWs.on("message", (data) => ws.send(data));

    ws.on("message", (data) => {
        fileStream.write(data);
    });

    ws.on("close", () => {
        fileStream.end();
        whisperWs.close();

        const ffmpeg = spawn("ffmpeg", ["-i", tempFile, "-c", "copy", finalFile]);

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                fs.unlinkSync(tempFile);
                console.log("audio saved");

                transcribeFile(finalFile, ws);
            } else {
                console.log("ffmpeg failed");
            }
        });
    });
});

function transcribeFile(filePath, clientWs) {
    console.log(`Sending ${filePath} to Whisper...`);

    const whisperWs = new WebSocket(WHISPER_SERVER);

    whisperWs.on("open", () => {
        const fileData = fs.readFileSync(filePath);
        whisperWs.send(fileData);
        whisperWs.close();
        console.log(`Sent ${fileData.length} bytes to Whisper`);
    });

    whisperWs.on("message", (data) => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data);
        }
        console.log(`Transcription: ${data}`);
    });

    whisperWs.on("error", (err) => {
        console.log("Whisper error:", err.message);
    });
}
