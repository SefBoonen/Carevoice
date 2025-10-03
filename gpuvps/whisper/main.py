import whisper

model = whisper.load_model("tiny")
result = model.transcribe("audio.ogg")
print(result["text"])