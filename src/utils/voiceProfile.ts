export interface VoiceProfile {
  meanPitch: number;
  minPitch: number;
  maxPitch: number;
  rmsThreshold: number;
}

export function calculateRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Autocorrelation pitch detector for fundamental frequency (F0) estimation.
 * Returns pitch in Hz, or -1 if no clear pitch is detected or outside human speech range.
 */
export function detectPitch(buffer: Float32Array, sampleRate: number): number {
  const SIZE = buffer.length;
  const r = new Float32Array(SIZE);
  
  // Compute autocorrelation
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0;
    for (let i = 0; i < SIZE - lag; i++) {
      sum += buffer[i] * buffer[i + lag];
    }
    r[lag] = sum;
  }

  // Peak threshold (must be at least 15% of r[0] to count)
  const threshold = 0.15 * r[0];

  // Find first zero crossing to avoid the center peak
  let firstZero = -1;
  for (let i = 0; i < SIZE - 1; i++) {
    if (r[i] > 0 && r[i + 1] <= 0) {
      firstZero = i;
      break;
    }
  }

  if (firstZero === -1) return -1;

  // Find the highest local peak after the zero crossing
  let peakIndex = -1;
  let peakValue = -1;
  for (let i = firstZero; i < SIZE; i++) {
    if (r[i] > threshold && r[i] > peakValue) {
      if (i > 0 && r[i] > r[i - 1] && i < SIZE - 1 && r[i] > r[i + 1]) {
        peakValue = r[i];
        peakIndex = i;
      }
    }
  }

  if (peakIndex !== -1) {
    const pitch = sampleRate / peakIndex;
    // Standard speaking voice pitch is between 75Hz and 350Hz
    if (pitch >= 75 && pitch <= 350) {
      return pitch;
    }
  }
  return -1;
}

/**
 * Checks if the voiced audio frame matches the user's pitch profile.
 * If not voiced (rms below threshold or pitch undetectable), returns false.
 */
export function matchesVoiceProfile(
  buffer: Float32Array,
  sampleRate: number,
  profile: VoiceProfile
): boolean {
  const rms = calculateRMS(buffer);
  if (rms < profile.rmsThreshold) return false;

  const pitch = detectPitch(buffer, sampleRate);
  if (pitch === -1) return false;

  // Allow a wide tolerance around the recorded pitch range (+-30Hz margin)
  const minLimit = profile.minPitch - 30;
  const maxLimit = profile.maxPitch + 30;
  
  return pitch >= minLimit && pitch <= maxLimit;
}
