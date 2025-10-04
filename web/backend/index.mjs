import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import * as path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(3000, () => {
    console.log(`Server running at http://localhost:3000`);
});