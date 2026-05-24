export interface VoiceProfile {
  spectrum: number[];      // Normalized average FFT magnitude spectrum
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
 * Extracts the vocal tract frequency spectrum (timbre) from FFT data.
 * Focuses on speech frequencies (80Hz to 4000Hz) and normalizes the vector.
 */
export function getVoiceSpectrum(
  fftData: Float32Array,
  sampleRate: number
): number[] {
  const fftSize = fftData.length * 2;
  const binResolution = sampleRate / fftSize;
  
  // Speech range: 80Hz to 4000Hz
  const minBin = Math.max(0, Math.floor(80 / binResolution));
  const maxBin = Math.min(fftData.length - 1, Math.floor(4000 / binResolution));
  
  const spectrum: number[] = [];
  let sumPower = 0;
  
  for (let i = minBin; i <= maxBin; i++) {
    // Convert dB value to linear amplitude
    // fftData contains values in dB (typically -100 to 0)
    const db = fftData[i];
    // Avoid infinity on silent bins
    const amp = db < -100 ? 0 : Math.pow(10, db / 20);
    spectrum.push(amp);
    sumPower += amp * amp;
  }
  
  // Normalize vector to unit length
  const magnitude = Math.sqrt(sumPower);
  if (magnitude > 0) {
    for (let i = 0; i < spectrum.length; i++) {
      spectrum[i] /= magnitude;
    }
  } else {
    // Return flat spectrum if silent
    const val = 1 / Math.sqrt(spectrum.length);
    for (let i = 0; i < spectrum.length; i++) {
      spectrum[i] = val;
    }
  }
  
  return spectrum;
}

/**
 * Calculates the cosine similarity between two spectral vectors.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Verifies if the current FFT frequency spectrum matches the registered user profile.
 */
export function verifySpeaker(
  fftData: Float32Array,
  sampleRate: number,
  profile: VoiceProfile,
  threshold = 0.82 // Cosine similarity threshold (0.80 - 0.85 is standard for speech spectral shape matching)
): boolean {
  if (!profile || !profile.spectrum) return false;
  
  const currentSpectrum = getVoiceSpectrum(fftData, sampleRate);
  
  // If the sizes differ (different FFT size or sampleRate), we cannot compare directly
  if (currentSpectrum.length !== profile.spectrum.length) return false;
  
  const similarity = calculateCosineSimilarity(currentSpectrum, profile.spectrum);
  return similarity >= threshold;
}
