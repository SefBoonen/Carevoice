import path from "path";
import express from "express";
import WebSocket, { WebSocketServer } from 'ws';

const wss = new WebSocketServer({port: 8080});


const app = express();

app.use(express.json());

app.use(express.static(path.join("..", "frontend")));

app.listen(3000, "127.0.0.1", () => {
    console.log(`Server running at http://127.0.0.1:3000`);
});
