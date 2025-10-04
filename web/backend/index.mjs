import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";
import { WebSocketServer } from "ws";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(3000, () => {
    console.log(`Server running at http://localhost:3000`);
});

const wss = new WebSocketServer({ server, path: "/audio" });

wss.on("connection", (ws) => {
    console.log("Client connected");
    const fileStream = fs.createWriteStream(`recording_${Date.now()}.webm`)

    ws.on("message", (data) => {
        fileStream.write(data);
    })

    ws.on("close", () => {
        fileStream.end();
        console.log("audio saved")
    })
});
