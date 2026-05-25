import * as ort from 'onnxruntime-web';
import { SpeakerVerification } from '@jaehyun-ko/speaker-verification';

export interface VoiceProfile {
  name: string;           // Name given to this voice profile
  embedding: number[];    // ONNX speaker embedding (128-dimensional float array)
  rmsThreshold?: number;  // Kept for backward compatibility but mostly unused now
  sampleRate?: number;    // Kept for backward compatibility
}

// Ensure WebAssembly uses the correct paths when bundled
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.3/dist/';

// Singleton instance
export const verifier = new SpeakerVerification();

let initialized = false;

/**
 * Initializes the advanced ONNX speaker verification model.
 * We use 'mobile-128' because it's only 5MB and very fast for browser environments.
 */
export async function initVoiceModel() {
  if (initialized) return;
  console.log("[VOICE] Initializing advanced speaker verification model (mobile-128)...");
  try {
    await verifier.initialize('mobile-128');
    initialized = true;
    console.log("[VOICE] Speaker verification model loaded successfully.");
  } catch (err) {
    console.error("[VOICE] Failed to initialize speaker verification model:", err);
  }
}

/** Calculate Root Mean Square (RMS) of audio buffer */
export function calculateRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}
