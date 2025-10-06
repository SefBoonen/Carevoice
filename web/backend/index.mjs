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

const WHISPER_SERVER = process.env.WHISPER_SERVER_URL || "ws://127.0.0.1:9000";
console.log(`Whisper server URL: ${WHISPER_SERVER}`);

const LLM_SERVER = process.env.LLM_SERVER || "ws://127.0.0.1:8000";
console.log(`Whisper server URL: ${LLM_SERVER}`);

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

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            fileStream.write(data);
        } else {
            const message = data.toString();
            if (message === "STOP") {
                fileStream.end();
                // whisperWs.close();

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
            }
        }
    });

    ws.on("close", () => {
        console.log("connection closed");
    });
});

function transcribeFile(filePath, clientWs) {
    console.log(`Sending ${filePath} to Whisper...`);

    const whisperWs = new WebSocket(WHISPER_SERVER);

    whisperWs.on("open", () => {
        const fileData = fs.readFileSync(filePath);
        whisperWs.send(fileData);
        whisperWs.send("END");
        console.log(`Sent ${fileData.length} bytes to Whisper`);
    });

    whisperWs.on("message", (data) => {
        const response = JSON.parse(data.toString());

        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify(response));
        }

        // add api request to llm

        console.log(`Transcription: ${JSON.stringify(response)}`);
    });

    whisperWs.on("error", (err) => {
        console.log("Whisper error:", err.message);
    });
}
