/**
 * Voice API - lightweight speaker identification against enrolled profiles
 */

import type { Request, Response } from 'express';
import { getDb } from './db';

function cosineSimilarity(a: number[], b: number[]): number {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const identifySpeaker = async (req: Request, res: Response) => {
  try {
    const embedding = req.body?.embedding as number[] | undefined;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return res.status(400).json({ error: 'embedding array required' });
    }

    const threshold = typeof req.body?.threshold === 'number' ? req.body.threshold : 0.72;
    const db = getDb();
    const profiles = db.userVoiceProfiles || [];

    let best: { name: string; score: number } | null = null;
    for (const profile of profiles) {
      const score = cosineSimilarity(embedding, profile.embedding);
      if (!best || score > best.score) {
        best = { name: profile.name, score };
      }
    }

    const matched = !!best && best.score >= threshold;
    return res.json({
      matched,
      threshold,
      profile: matched ? best?.name : null,
      confidence: best ? Number(best.score.toFixed(4)) : 0,
      profileCount: profiles.length,
    });
  } catch (err) {
    console.error('[VOICE-API] identifySpeaker failed:', err);
    res.status(500).json({ error: 'Failed to identify speaker' });
  }
};

export function setupVoiceAPI(app: any): void {
  app.post('/api/voice/identify', identifySpeaker);
  console.log('[VOICE-API] Routes registered');
}

