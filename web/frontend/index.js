const recordBtn = document.getElementById("recordbtn");
const btnIcon = document.querySelector(".btn-icon");
const btnText = document.querySelector(".btn-text");
const transcriptionDiv = document.getElementById("transcription");

const summaryDiv = document.getElementById("summary");

let socket = null;
let mediaRecorder = null;
let isRecording = false;

recordBtn.addEventListener("click", () => {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
});

async function startRecording() {
    console.log("Starting recording...");
    isRecording = true;

    // Update button appearance
    recordBtn.classList.remove("btn-primary");
    recordBtn.classList.add("btn-danger");
    btnIcon.textContent = "⏹️";
    btnText.textContent = "Stop Opname";

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;

    socket = new WebSocket(wsUrl);

    socket.onmessage = (e) => {
        console.log("message received");
        try {
            const data = JSON.parse(e.data);
            console.log(`data:`, data);

            if (data.type === "transcription") {
                if (data.data.text) {
                    transcriptionDiv.textContent += data.data.text + " ";
                }
            } else if (data.type === "summary") {
                console.log(`samenvatting: ${data.data}`);
                if (data.data) {
                    summaryDiv.textContent += data.data + " ";
                }
                socket.close();
                resetButton();
            }
        } catch (err) {
            console.log(`Error: ${err}`);
        }
    };

    socket.addEventListener("open", async () => {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000, channelCount: 1 },
        });
        mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

        mediaRecorder.addEventListener("dataavailable", (event) => {
            if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
                socket.send(event.data);
            }
        });

        mediaRecorder.start(250);
    });
}

function stopRecording() {
    console.log("Stopping recording...");

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();

        // Stop all audio tracks
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send("STOP");
    }

    resetButton();
}

function resetButton() {
    isRecording = false;
    recordBtn.classList.remove("btn-danger");
    recordBtn.classList.add("btn-primary");
    btnIcon.textContent = "▶️";
    btnText.textContent = "Start Opname";
}
