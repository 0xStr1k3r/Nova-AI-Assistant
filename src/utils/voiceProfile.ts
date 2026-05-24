export interface VoiceProfile {
  name: string;           // Name given to this voice profile
  spectrum: number[];     // Normalized average Bark-band spectrum (24 bands)
  rmsThreshold: number;   // Minimum RMS threshold to detect voice
  sampleRate: number;     // Recording sample rate
}

/** Calculate Root Mean Square (RMS) of audio buffer */
export function calculateRMS(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  return Math.sqrt(sum / buffer.length);
}

/**
 * Bark-scale critical band edges (Hz).
 * 24 bands covering 0–8000 Hz, mimicking the human auditory system.
 * This makes matching far more robust to pitch shifts, loudness, and microphone variation.
 */
const BARK_EDGES_HZ = [
  0, 100, 200, 300, 400, 510, 630, 770, 920, 1080,
  1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400,
  5300, 6400, 7700, 9500, 12000
];

/**
 * Extracts a Bark-scale spectral envelope from FFT data.
 * Groups FFT bins into 24 perceptual bands and averages the power in each.
 * This is far more stable than raw-bin cosine similarity.
 */
export function getVoiceSpectrum(
  fftData: Float32Array,
  sampleRate: number
): number[] {
  const fftSize = fftData.length * 2;
  const binHz = sampleRate / fftSize;
  const numBands = BARK_EDGES_HZ.length - 1; // 23 bands

  const bandPowers: number[] = new Array(numBands).fill(0);

  for (let b = 0; b < numBands; b++) {
    const startBin = Math.ceil(BARK_EDGES_HZ[b] / binHz);
    const endBin   = Math.min(fftData.length - 1, Math.floor(BARK_EDGES_HZ[b + 1] / binHz));
    if (startBin > endBin) continue;

    let power = 0;
    let count = 0;
    for (let i = startBin; i <= endBin; i++) {
      const db = fftData[i];
      // Convert dB → linear power; clamp very low dB values
      const amp = db < -96 ? 0 : Math.pow(10, db / 20);
      power += amp * amp;
      count++;
    }
    bandPowers[b] = count > 0 ? power / count : 0;
  }

  // Apply log compression (like mel-log filterbank) for perceptual scaling
  const logPowers = bandPowers.map(p => Math.log1p(p * 1000));

  // Normalize to unit length
  let sumSq = 0;
  for (const v of logPowers) sumSq += v * v;
  const mag = Math.sqrt(sumSq);

  if (mag > 1e-10) {
    return logPowers.map(v => v / mag);
  }
  // Return uniform vector if silent
  const val = 1 / Math.sqrt(numBands);
  return new Array(numBands).fill(val);
}

/**
 * Calculates the cosine similarity between two spectral vectors.
 * Both vectors must already be normalized (unit length) for fast dot-product.
 * Returns 0–1; higher = more similar.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  const len = Math.min(vecA.length, vecB.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    dot   += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA < 1e-12 || normB < 1e-12) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Sliding-window voter: accumulates recent per-frame similarities and returns
 * the smoothed score. This makes detection robust against single-frame noise spikes.
 */
export class SpeakerVerifier {
  private window: number[] = [];
  private windowSize: number;

  constructor(windowSize = 8) {
    this.windowSize = windowSize;
  }

  /**
   * Push a new FFT frame and return true if the smoothed score clears threshold.
   */
  addFrame(
    fftData: Float32Array,
    sampleRate: number,
    profiles: VoiceProfile[],
    threshold = 0.72 // Lower than before; score is averaged over a window
  ): boolean {
    if (!profiles || profiles.length === 0) return false;

    const currentSpectrum = getVoiceSpectrum(fftData, sampleRate);
    let bestSim = 0;

    for (const profile of profiles) {
      if (!profile.spectrum || profile.spectrum.length === 0) continue;
      const sim = calculateCosineSimilarity(currentSpectrum, profile.spectrum);
      if (sim > bestSim) bestSim = sim;
    }

    this.window.push(bestSim);
    if (this.window.length > this.windowSize) this.window.shift();

    // Require ≥60% of recent frames to be above threshold for a robust match
    const passing = this.window.filter(s => s >= threshold).length;
    return passing >= Math.ceil(this.window.length * 0.60);
  }

  reset() {
    this.window = [];
  }
}

/**
 * Stateless one-shot check (used during enrollment verification).
 * Returns the best cosine similarity score against any profile.
 */
export function verifySpeaker(
  fftData: Float32Array,
  sampleRate: number,
  profiles: VoiceProfile[],
  threshold = 0.72
): boolean {
  if (!profiles || profiles.length === 0) return false;
  const currentSpectrum = getVoiceSpectrum(fftData, sampleRate);
  for (const profile of profiles) {
    if (!profile.spectrum || profile.spectrum.length === 0) continue;
    const sim = calculateCosineSimilarity(currentSpectrum, profile.spectrum);
    if (sim >= threshold) return true;
  }
  return false;
}
