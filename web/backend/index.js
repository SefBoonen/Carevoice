const path = require("path");
const express = require("express");

const app = express();

app.use(express.json());

app.use(express.static(path.join(__dirname, "..", "frontend")));

app.listen(3000, "127.0.0.1", () => {
    console.log(`Server running at http://127.0.0.1:3000`);
});
