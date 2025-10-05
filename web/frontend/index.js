const startRecButton = document.getElementById("startrec");
const stopRecButton = document.getElementById("stoprec");

const transcriptionDiv = document.getElementById("transcription");

let socket = null;
let mediaRecorder = null;

startRecButton.addEventListener("click", () => {
    console.log("click")
    socket = new WebSocket("ws://localhost:3000");

    socket.onmessage = (e) => {
        console.log("message received");
        try {
            console.log(`e: ${e}, json ${JSON.stringify(e)}`);
            const data = JSON.parse(e.data);
            console.log(`data: ${data}`);
            if (data.text) {
                transcriptionDiv.textContent += data.text + " ";
                socket.close();
            }
        } catch (err) {
            console.log(`Error: ${err}`);
        }
    };

    socket.addEventListener("open", async () => {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

        mediaRecorder.addEventListener("dataavailable", (event) => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                socket.send(event.data);
            }
        });

        mediaRecorder.start(250);
    });
});

stopRecButton.addEventListener("click", () => {
    mediaRecorder.stop();
    socket.send("STOP");
    // socket.close();
});
