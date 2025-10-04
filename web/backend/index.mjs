import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";
import { WebSocketServer } from "ws";
import fs from "fs";
import { spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "..", "frontend")));

const server = app.listen(3000, () => console.log(`Server running at http://localhost:3000`));
const wss = new WebSocketServer({ server });

const whisperServer = "ws://GPUIP:8765"

wss.on("connection", (ws) => {
    console.log("Client connected");
    const tempFile = `temp_${Date.now()}.webm`;
    const finalFile = `recording_${Date.now()}.webm`;
    const fileStream = fs.createWriteStream(tempFile);

    const whisperWs = new WebSocket(WHISPER_SERVER);
    whisperWs.on("message", (data) => ws.send(data));

    ws.on("message", (data) => {
        fileStream.write(data);

        if (whisperWs.readyState === WebSocket.OPEN) whisperWs.send(data);
    });

    ws.on("close", () => {
        fileStream.end();
        whisperWs.close();

        const ffmpeg = spawn("ffmpeg", ["-i", tempFile, "-c", "copy", finalFile]);

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                fs.unlinkSync(tempFile);
                console.log("audio saved");
            } else {
                console.log("ffmpeg failed");
            }
        });
    });
});
