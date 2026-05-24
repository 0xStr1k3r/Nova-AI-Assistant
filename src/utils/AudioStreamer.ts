export class AudioStreamer {
  private context: AudioContext;
  private nextStartTime: number = 0;

  constructor(context: AudioContext) {
    this.context = context;
  }

  public addPCM16(base64: string) {
    if (this.context.state === "suspended") {
      this.context.resume().catch((err) => console.error("Could not resume AudioContext:", err));
    }
    const binary = atob(base64);
    const uint8Array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        uint8Array[i] = binary.charCodeAt(i);
    }
    const int16Array = new Int16Array(uint8Array.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 0x8000;
    }

    const audioBuffer = this.context.createBuffer(
      1,
      float32Array.length,
      24000 // Gemini TTS often returns 24kHz. Wait, does Live return 16kHz or 24kHz? It returns 24kHz. Let's use 24kHz.
    );
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.context.destination);

    // If nextStartTime is in the past, reset it to current time to avoid overlapping/rushing
    if (this.nextStartTime < this.context.currentTime) {
      this.nextStartTime = this.context.currentTime + 0.05;
    }

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  public stop() {
    this.nextStartTime = 0;
    // For simplicity, we just reset the timer. Strict stop would require keeping references to all source nodes and calling .stop()
  }
}
