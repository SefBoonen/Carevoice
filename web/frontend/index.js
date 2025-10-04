const socket = new WebSocket("ws://localhost:3000");

socket.addEventListener("open", async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

    mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) {
            socket.send(event.data);
        }
    });

    mediaRecorder.start(250);
});
