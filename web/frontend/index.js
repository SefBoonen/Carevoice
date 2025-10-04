class AudioStreamer {
    constructor() {
        this.ws = null;
        this.mediaRecorder = null;
        this.audioContext = null;
        this.processor = null;
        this.stream = null;
        this.isRecording = false;

        this.startBtn = document.getElementById("startBtn");
        this.stopBtn = document.getElementById("stopBtn");
        this.status = document.getElementById("status");
        this.logContent = document.getElementById("logContent");

        this.setupEventListeners();
        this.connectWebSocket();
    }

    setupEventListeners() {
        this.startBtn.addEventListener("click", () => this.startRecording());
        this.stopBtn.addEventListener("click", () => this.stopRecording());
    }

    connectWebSocket() {
        this.ws = new WebSocket("ws://127.0.0.1:9001");

        this.ws.onopen = () => {
            this.log("Connected to server");
            this.updateStatus("Connected to server", "connected");
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === "audio-received") {
                this.log(`Server received audio chunk: ${message.size} bytes`);
            } else if (message.type === "transcript") {
                const kind = message.partial ? "Partial" : "Final";
                const lang = message.language ? ` [${message.language}]` : "";
                this.log(`${kind} transcript${lang}: ${message.text}`);
            }
        };

        this.ws.onclose = () => {
            this.log("Disconnected from server");
            this.updateStatus("Disconnected from server");
        };

        this.ws.onerror = (error) => {
            this.log("WebSocket error: " + error);
        };
    }

    async startRecording() {
        try {
            // Request microphone access (don't force sampleRate here)
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });

            this.log("Microphone access granted");

            // Create audio context with the default hardware sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            const source = this.audioContext.createMediaStreamSource(this.stream);

            // Create processor for real-time audio processing
            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

            // Create a gain node with zero gain so we don't play back the mic audio
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = 0;

            this.processor.onaudioprocess = (event) => {
                if (this.isRecording && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    const inputBuffer = event.inputBuffer;
                    const inputData = inputBuffer.getChannelData(0);

                    // Resample from the AudioContext's sample rate to 16000 Hz
                    const srcRate = this.audioContext.sampleRate;
                    const targetRate = 16000;
                    const resampled = this.resampleBuffer(inputData, srcRate, targetRate);

                    // Convert Float32Array to Int16Array for smaller size
                    const int16Array = new Int16Array(resampled.length);
                    for (let i = 0; i < resampled.length; i++) {
                        int16Array[i] = Math.max(-32768, Math.min(32767, Math.round(resampled[i] * 32768)));
                    }

                    // Convert to base64 for transmission (safe chunked conversion)
                    const u8 = new Uint8Array(int16Array.buffer);
                    const base64Audio = this.uint8ToBase64(u8);

                    // Send to server
                    this.ws.send(
                        JSON.stringify({
                            type: "audio-stream",
                            data: base64Audio,
                            timestamp: Date.now(),
                        })
                    );
                }
            };

            source.connect(this.processor);
            this.processor.connect(this.gainNode);
            this.gainNode.connect(this.audioContext.destination);

            this.isRecording = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;

            this.updateStatus("Recording and streaming audio...", "recording");
            this.log("Started audio recording and streaming");
        } catch (error) {
            this.log("Error starting recording: " + error.message);
            this.updateStatus("Error: " + error.message);
        }
    }

    stopRecording() {
        this.isRecording = false;

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
            this.stream = null;
        }
        // Notify server that audio stream ended so it can save buffered data
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: "audio-end", timestamp: Date.now() }));
            }
        } catch (err) {
            // ignore send errors during shutdown
        }

        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;

        this.updateStatus("Stopped recording", "connected");
        this.log("Stopped audio recording");
    }

    // Resample Float32Array from srcRate to targetRate using linear interpolation
    resampleBuffer(buffer, srcRate, targetRate) {
        if (srcRate === targetRate) {
            return buffer;
        }

        const sampleRateRatio = srcRate / targetRate;
        const newLength = Math.round(buffer.length / sampleRateRatio);
        const result = new Float32Array(newLength);
        let offsetResult = 0;
        let offsetBuffer = 0;

        while (offsetResult < result.length) {
            const nextOffsetBuffer = offsetResult * sampleRateRatio;
            const intOffset = Math.floor(nextOffsetBuffer);
            const delta = nextOffsetBuffer - intOffset;

            const s0 = buffer[intOffset] || 0;
            const s1 = buffer[intOffset + 1] || 0;
            result[offsetResult] = s0 + (s1 - s0) * delta;
            offsetResult++;
        }

        return result;
    }

    // Convert Uint8Array to base64 safely in chunks to avoid stack issues
    uint8ToBase64(u8) {
        const CHUNK_SIZE = 0x8000; // arbitrary chunk size
        let index = 0;
        const length = u8.length;
        let result = "";
        let slice;
        while (index < length) {
            slice = u8.subarray(index, Math.min(index + CHUNK_SIZE, length));
            result += String.fromCharCode.apply(null, slice);
            index += CHUNK_SIZE;
        }
        return btoa(result);
    }

    updateStatus(message, className = "") {
        this.status.textContent = message;
        this.status.className = "status " + className;
    }

    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = document.createElement("div");
        logEntry.textContent = `[${timestamp}] ${message}`;
        this.logContent.appendChild(logEntry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }
}

// Initialize audio streamer when page loads
document.addEventListener("DOMContentLoaded", () => {
    new AudioStreamer();
});
