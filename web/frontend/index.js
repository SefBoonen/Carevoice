const startRecButton = document.getElementById("startrec");
const stopRecButton = document.getElementById("stoprec");

let socket = null;
let mediaRecorder = null;

startRecButton.addEventListener("click", () => {
    socket = new WebSocket("ws://localhost:3000");
    
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
    mediaRecorder.stop()
    socket.close()
})
