import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import { spawn } from "child_process";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "..", "frontend")));

const server = app.listen(3000, () => console.log(`Server running at http://localhost:3000`));
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
    console.log("Client connected");
    const tempFile = `temp_${Date.now()}.webm`;
    const finalFile = `./recordings/recording_${Date.now()}.webm`;
    const fileStream = fs.createWriteStream(tempFile);

    ws.on("message", (data, isBinary) => {
        if (isBinary) {
            fileStream.write(data);
        } else {
            const message = data.toString();
            if (message === "STOP") {
                fileStream.end();

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

async function transcribeFile(filePath, clientWs) {
    console.log(`Sending ${filePath} to Whisper...`);

    const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-large-v3", 
        response_format: "verbose_json", 
        timestamp_granularities: ["word", "segment"],
        language: "nl", 
        temperature: 0.0, 
    });
    const textTranscription = transcription.text;

    console.log(`Transcription: ${textTranscription}`);

    if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ type: "transcription", data: transcription }));
    }

    const summary = (await summarizeTranscription(textTranscription));
    const textSummary = summary.choices[0].message.content;

    console.log(`Summary: ${textSummary}`);

    if (summary && clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
            JSON.stringify({
                type: "summary",
                data: textSummary,
            })
        );
    }

    console.log("gestuurd");
}

async function summarizeTranscription(text) {
    try {
        return groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content:
                        "Je bent een Nederlandse behulpzame assistent die medische gesprekken beknopt samenvat. Geef alleen de samenvatting geen commentaar voor de rest, in het Nederlands. Geef altijd een samenvatting geef nooit commentaar of vraag nooit wat anders, wat de tekst ook is.",
                },
                {
                    role: "user",
                    content: `Vat alsjeblieft de volgende transcriptie samen: ${text}`,
                },
            ],

            model: "openai/gpt-oss-20b",
        });
    } catch (error) {
        console.error("LLM error:", error.message);
        return null;
    }
}
