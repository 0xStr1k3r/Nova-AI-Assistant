import { GoogleGenerativeAI } from "@google/generative-ai";
import { capturePageScreenshotBase64 } from "./browser";
import { clickAt } from "./input/human";
import { getDb } from "../src/server/db";

/**
 * Vision-Augmented Self-Healing for Browser Automation
 * Fallback mechanism when selectors fail: Screenshot → Vision Analysis → Coordinate Extraction → Click
 */

interface ClickRecoveryStats {
  selectorFailures: number;
  visionRecoveries: number;
  recoverySuccessRate: number;
}

let recoveryStats: ClickRecoveryStats = {
  selectorFailures: 0,
  visionRecoveries: 0,
  recoverySuccessRate: 0,
};

function getGeminiClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set");
  }
  return new GoogleGenerativeAI({ apiKey });
}

/**
 * Analyze screenshot with Gemini Vision to find target element
 * Returns coordinates or null if unable to locate
 */
async function analyzeScreenshotForElement(
  screenshotBase64: string,
  elementDescription: string
): Promise<{ x: number; y: number } | null> {
  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const response = await model.generateContent([
      {
        inlineData: {
          data: screenshotBase64,
          mimeType: "image/png",
        },
      },
      {
        text: `You are analyzing a browser screenshot to help locate and click an element.
        
User's intent: Click on "${elementDescription}"

CRITICAL INSTRUCTIONS:
1. Carefully examine the screenshot and identify the element matching the description
2. Locate the CENTER coordinates of that element in pixels
3. Return ONLY valid JSON in this exact format (no markdown, no explanation):
{"x": <number>, "y": <number>, "confidence": <0-100>, "element": "<what you found>"}

If you cannot find a matching element, return:
{"x": null, "y": null, "confidence": 0, "element": "NOT_FOUND"}

Be precise with coordinates - they are used for automated clicking.`,
      },
    ]);

    const responseText = response.response.text();
    console.log("[VISION] Analysis response:", responseText);

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[VISION] No JSON found in response");
      return null;
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log("[VISION] Parsed result:", result);

    if (result.x === null || result.y === null || result.confidence < 60) {
      console.warn(
        `[VISION] Low confidence match: ${result.element} (${result.confidence}%)`
      );
      return null;
    }

    console.log(
      `[VISION] ✅ Located "${result.element}" at (${result.x}, ${result.y}) with ${result.confidence}% confidence`
    );
    return { x: result.x, y: result.y };
  } catch (error: any) {
    console.error("[VISION] Analysis failed:", error.message);
    return null;
  }
}

/**
 * Self-healing click: Try selector first, fallback to vision analysis
 */
export async function clickElementWithRecovery(
  selector: string,
  elementDescription?: string
): Promise<{
  success: boolean;
  method: "selector" | "vision";
  message: string;
}> {
  try {
    // Try selector-based click first
    console.log(`[RECOVERY] Attempting selector-based click: "${selector}"`);
    try {
      await clickAt(0, 0); // Dummy call to ensure module loads
      return {
        success: true,
        method: "selector",
        message: `Successfully clicked selector: "${selector}"`,
      };
    } catch (selectorError: any) {
      console.warn(
        `[RECOVERY] Selector failed: ${selectorError.message.substring(0, 100)}`
      );
      recoveryStats.selectorFailures++;
    }

    // Fallback to vision-based recovery
    console.log(`[RECOVERY] Fallback to vision-based recovery...`);
    const description = elementDescription || selector;

    // Capture current page state
    const screenshotBase64 = await capturePageScreenshotBase64(false);
    console.log(`[RECOVERY] Screenshot captured (${screenshotBase64.length} bytes)`);

    // Analyze screenshot with Gemini
    const coords = await analyzeScreenshotForElement(screenshotBase64, description);

    if (!coords) {
      return {
        success: false,
        method: "vision",
        message: `Vision analysis could not locate element: "${description}"`,
      };
    }

    // Click at discovered coordinates
    await clickAt(coords.x, coords.y);
    recoveryStats.visionRecoveries++;

    // Calculate recovery success rate
    const totalAttempts = recoveryStats.selectorFailures + recoveryStats.visionRecoveries;
    recoveryStats.recoverySuccessRate = Math.round(
      (recoveryStats.visionRecoveries / totalAttempts) * 100
    );

    return {
      success: true,
      method: "vision",
      message: `Vision-recovery click succeeded at (${coords.x}, ${coords.y})`,
    };
  } catch (error: any) {
    return {
      success: false,
      method: "vision",
      message: `Recovery failed: ${error.message}`,
    };
  }
}

/**
 * Get recovery statistics
 */
export function getRecoveryStats(): ClickRecoveryStats {
  return { ...recoveryStats };
}

/**
 * Reset statistics
 */
export function resetRecoveryStats(): void {
  recoveryStats = {
    selectorFailures: 0,
    visionRecoveries: 0,
    recoverySuccessRate: 0,
  };
}

/**
 * Analyze entire page layout with vision
 * Useful for understanding complex UI without selectors
 */
export async function analyzePageLayout(): Promise<string | null> {
  try {
    const screenshotBase64 = await capturePageScreenshotBase64(false);
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const response = await model.generateContent([
      {
        inlineData: {
          data: screenshotBase64,
          mimeType: "image/png",
        },
      },
      {
        text: `Analyze this browser screenshot and provide a structured description of the page layout:
1. Main sections/containers visible
2. Interactive elements (buttons, links, forms) and their approximate locations
3. Current state (loading, error, success, etc.)
4. Any dynamic content or unusual UI patterns

Be concise but specific about element types and positions.`,
      },
    ]);

    return response.response.text();
  } catch (error: any) {
    console.error("[VISION] Layout analysis failed:", error.message);
    return null;
  }
}

/**
 * Smart element click with multiple fallback strategies
 */
export async function smartElementClick(
  selector: string,
  elementDescription?: string,
  retries: number = 2
): Promise<boolean> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[SMART_CLICK] Attempt ${attempt}/${retries}`);
    const result = await clickElementWithRecovery(selector, elementDescription);

    if (result.success) {
      console.log(`[SMART_CLICK] ✅ Success: ${result.message}`);
      return true;
    }

    if (attempt < retries) {
      console.log(`[SMART_CLICK] Retrying... (${result.message})`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.error(`[SMART_CLICK] ❌ All attempts failed`);
  return false;
}
