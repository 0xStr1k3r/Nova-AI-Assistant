export function pcmToBase64(pcmData: Float32Array): string {
  // Convert Float32Array to Int16Array
  const int16Array = new Int16Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    const s = Math.max(-1, Math.min(1, pcmData[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  // Convert Int16Array to Base64
  const uint8Array = new Uint8Array(int16Array.buffer);
  
  // Use a chunked approach to avoid Maximum call stack size exceeded
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null, 
      Array.from(uint8Array.subarray(i, i + chunkSize))
    );
  }
  return btoa(binary);
}

export function base64ToPcm(base64: string): Float32Array {
  const binary = atob(base64);
  const uint8Array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    uint8Array[i] = binary.charCodeAt(i);
  }
  const int16Array = new Int16Array(uint8Array.buffer);
  const pcmData = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    pcmData[i] = int16Array[i] / 0x8000;
  }
  return pcmData;
}
