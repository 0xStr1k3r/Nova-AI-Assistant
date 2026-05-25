import { exec } from "child_process";
import * as util from "util";
import { captureScreenshotFile } from "../content";
import { clickAt } from "../input/human";

const execAsync = util.promisify(exec);

type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};

async function ensureTesseract(): Promise<void> {
  try {
    await execAsync("which tesseract");
  } catch (error: any) {
    throw new Error("Tesseract is not installed. Install with: sudo pacman -S tesseract");
  }
}

function parseTsv(tsv: string): OcrWord[] {
  const lines = tsv.trim().split("\n");
  if (lines.length <= 1) return [];
  const words: OcrWord[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split("\t");
    if (parts.length < 12) continue;
    const text = parts[11]?.trim();
    if (!text) continue;
    const left = Number(parts[6]);
    const top = Number(parts[7]);
    const width = Number(parts[8]);
    const height = Number(parts[9]);
    const confidence = Number(parts[10]);
    words.push({ text, left, top, width, height, confidence });
  }
  return words;
}

export async function ocrScreenshot(): Promise<OcrWord[]> {
  await ensureTesseract();
  const filePath = await captureScreenshotFile(false);
  const { stdout } = await execAsync(`tesseract "${filePath}" stdout -l eng tsv`);
  return parseTsv(stdout);
}

export async function extractOcrText(): Promise<string> {
  const words = await ocrScreenshot();
  if (words.length === 0) {
    return "No OCR text detected in the current viewport.";
  }
  const text = words.map((w) => w.text).join(" ");
  return `OCR Text (viewport):\n${text}`;
}

export async function clickByOcrText(label: string): Promise<string> {
  const words = await ocrScreenshot();
  const needle = label.trim().toLowerCase();
  if (!needle) throw new Error("Label is required for OCR click.");

  let best: OcrWord | null = null;
  for (const word of words) {
    const token = word.text.toLowerCase();
    if (token === needle) {
      best = word;
      break;
    }
    if (!best && token.includes(needle)) {
      best = word;
    }
  }

  if (!best) {
    return `ERROR: No OCR text match found for "${label}".`;
  }

  const x = best.left + best.width / 2;
  const y = best.top + best.height / 2;
  await clickAt(x, y);
  return `Clicked OCR match "${best.text}" at (${Math.round(x)}, ${Math.round(y)}).`;
}
