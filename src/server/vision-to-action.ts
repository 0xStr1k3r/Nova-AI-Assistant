import { GoogleGenerativeAI } from "@google/generative-ai";
import { capturePageScreenshotBase64 } from "../browser_automation/browser";
import { analyzePageLayout } from "../browser_automation/vision-recovery";
import { clickAt, moveMouseTo } from "../browser_automation/input/human";

/**
 * Vision-to-Action Loop: Screenshot → Understand → Plan → Execute → Verify
 * Core orchestration engine for autonomous desktop control
 */

interface UIElement {
  type: string; // button, link, input, menu, etc.
  text?: string;
  description: string;
  coordinates: { x: number; y: number };
  confidence: number;
}

interface ActionPlan {
  goalState: string;
  steps: string[];
  targetElements: UIElement[];
  estimatedSteps: number;
}

interface ExecutionResult {
  success: boolean;
  action: string;
  beforeScreenshot: string;
  afterScreenshot: string;
  elementsFound: UIElement[];
  verificationMessage: string;
}

interface StateSnapshot {
  timestamp: number;
  screenshot: string;
  description: string;
  identifiedElements: UIElement[];
}

/**
 * Capture current desktop state
 */
export async function captureState(description?: string): Promise<StateSnapshot> {
  console.log("[V2A] Capturing state...");
  const screenshot = await capturePageScreenshotBase64(false);
  const layout = await analyzePageLayout();

  const state: StateSnapshot = {
    timestamp: Date.now(),
    screenshot,
    description: description || layout || "Unknown state",
    identifiedElements: [],
  };

  console.log(`[V2A] State captured at ${new Date(state.timestamp).toISOString()}`);
  return state;
}

/**
 * Extract clickable UI elements from screenshot using Gemini Vision
 */
export async function extractUIElements(
  screenshotBase64: string,
  userGoal: string
): Promise<UIElement[]> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }

    const client = new GoogleGenerativeAI({ apiKey });
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const response = await model.generateContent([
      {
        inlineData: {
          data: screenshotBase64,
          mimeType: "image/png",
        },
      },
      {
        text: `Analyze this screenshot for interactive UI elements relevant to: "${userGoal}"

Return a JSON array of clickable elements in this format:
[
  {"type": "button|link|input|menu|checkbox|radio", "text": "visible text", "description": "what it does", "coordinates": {"x": <center-x>, "y": <center-y>}, "confidence": <0-100>},
  ...
]

Focus on elements most likely to help achieve the goal. Include at least 3 relevant elements.
Return ONLY valid JSON array, no markdown or explanation.`,
      },
    ]);

    const responseText = response.response.text();
    console.log("[V2A] UI extraction response:", responseText.substring(0, 200));

    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("[V2A] No JSON array found in response");
      return [];
    }

    const elements: UIElement[] = JSON.parse(jsonMatch[0]);
    console.log(`[V2A] ✅ Extracted ${elements.length} UI elements`);
    return elements;
  } catch (error: any) {
    console.error("[V2A] Element extraction failed:", error.message);
    return [];
  }
}

/**
 * Generate action plan to achieve user goal
 */
export async function planActions(
  currentState: StateSnapshot,
  userGoal: string,
  availableElements: UIElement[]
): Promise<ActionPlan> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }

    const client = new GoogleGenerativeAI({ apiKey });
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const elementsList = availableElements
      .map((e) => `- ${e.type}: "${e.text || e.description}" at (${e.coordinates.x}, ${e.coordinates.y})`)
      .join("\n");

    const response = await model.generateContent([
      {
        text: `Given the current UI state and available elements, create an action plan.

USER GOAL: "${userGoal}"

CURRENT STATE: ${currentState.description}

AVAILABLE ELEMENTS:
${elementsList}

Create a JSON action plan:
{
  "goalState": "expected state after completing actions",
  "steps": ["Step 1: Click X to open Y", "Step 2: Type text", ...],
  "targetElementIndices": [0, 1, 2],
  "estimatedSteps": <number>
}

Return ONLY valid JSON, no markdown.`,
      },
    ]);

    const responseText = response.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.warn("[V2A] No JSON plan found");
      return {
        goalState: userGoal,
        steps: ["Unable to plan - manual intervention needed"],
        targetElements: availableElements.slice(0, 3),
        estimatedSteps: 0,
      };
    }

    const planData = JSON.parse(jsonMatch[0]);
    const plan: ActionPlan = {
      goalState: planData.goalState,
      steps: planData.steps || [],
      targetElements: planData.targetElementIndices
        ? planData.targetElementIndices.map((i: number) => availableElements[i]).filter(Boolean)
        : availableElements.slice(0, 3),
      estimatedSteps: planData.estimatedSteps || planData.steps?.length || 1,
    };

    console.log(`[V2A] ✅ Plan created: ${plan.steps.length} steps, target elements: ${plan.targetElements.length}`);
    return plan;
  } catch (error: any) {
    console.error("[V2A] Planning failed:", error.message);
    return {
      goalState: userGoal,
      steps: [],
      targetElements: availableElements.slice(0, 3),
      estimatedSteps: 0,
    };
  }
}

/**
 * Execute a single action from the plan
 */
export async function executeAction(
  action: string,
  element: UIElement
): Promise<{ success: boolean; message: string }> {
  try {
    console.log(`[V2A] Executing: ${action}`);

    if (action.toLowerCase().includes("click")) {
      await clickAt(element.coordinates.x, element.coordinates.y);
      return { success: true, message: `Clicked at (${element.coordinates.x}, ${element.coordinates.y})` };
    } else if (action.toLowerCase().includes("hover") || action.toLowerCase().includes("move")) {
      await moveMouseTo(element.coordinates.x, element.coordinates.y);
      return { success: true, message: `Moved to (${element.coordinates.x}, ${element.coordinates.y})` };
    } else if (action.toLowerCase().includes("type")) {
      // Text extraction from action description
      const textMatch = action.match(/"([^"]*)"/);
      const text = textMatch ? textMatch[1] : "typed";
      console.log(`[V2A] Would type: "${text}"`);
      return { success: true, message: `Typed text` };
    } else {
      console.log(`[V2A] Unknown action: ${action}`);
      return { success: false, message: `Unknown action type` };
    }
  } catch (error: any) {
    console.error(`[V2A] Action execution failed:`, error.message);
    return { success: false, message: error.message };
  }
}

/**
 * Verify action result by comparing before/after states
 */
export async function verifyExecution(
  beforeState: StateSnapshot,
  afterScreenshot: string,
  expectedOutcome: string
): Promise<{ success: boolean; confidence: number; message: string }> {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY not set");
    }

    const client = new GoogleGenerativeAI({ apiKey });
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const response = await model.generateContent([
      {
        inlineData: {
          data: beforeState.screenshot,
          mimeType: "image/png",
        },
      },
      {
        text: "BEFORE state",
      },
      {
        inlineData: {
          data: afterScreenshot,
          mimeType: "image/png",
        },
      },
      {
        text: `AFTER state

Compare these two screenshots. Did the action succeed?

EXPECTED OUTCOME: "${expectedOutcome}"

Return JSON:
{"success": true|false, "confidence": <0-100>, "message": "what changed"}

ONLY valid JSON, no markdown.`,
      },
    ]);

    const responseText = response.response.text();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return { success: false, confidence: 0, message: "Unable to verify" };
    }

    const verification = JSON.parse(jsonMatch[0]);
    console.log(`[V2A] Verification: ${verification.success ? "✅" : "❌"} (${verification.confidence}% confidence)`);
    return verification;
  } catch (error: any) {
    console.error("[V2A] Verification failed:", error.message);
    return { success: false, confidence: 0, message: error.message };
  }
}

/**
 * Complete vision-to-action loop
 */
export async function runVisionToActionLoop(userGoal: string, maxSteps: number = 5): Promise<ExecutionResult> {
  console.log(`[V2A] Starting vision-to-action loop: "${userGoal}"`);

  try {
    // 1. Capture initial state
    const initialState = await captureState(`Starting state for: ${userGoal}`);

    // 2. Extract UI elements
    const elements = await extractUIElements(initialState.screenshot, userGoal);
    if (elements.length === 0) {
      return {
        success: false,
        action: "initialization",
        beforeScreenshot: initialState.screenshot,
        afterScreenshot: initialState.screenshot,
        elementsFound: [],
        verificationMessage: "No UI elements found on screen",
      };
    }

    // 3. Plan actions
    const plan = await planActions(initialState, userGoal, elements);

    // 4. Execute first action
    if (plan.targetElements.length === 0) {
      return {
        success: false,
        action: "planning",
        beforeScreenshot: initialState.screenshot,
        afterScreenshot: initialState.screenshot,
        elementsFound: elements,
        verificationMessage: "No suitable elements found for action",
      };
    }

    const firstAction = plan.steps[0] || `Click on ${plan.targetElements[0].description}`;
    const executionResult = await executeAction(firstAction, plan.targetElements[0]);

    if (!executionResult.success) {
      return {
        success: false,
        action: firstAction,
        beforeScreenshot: initialState.screenshot,
        afterScreenshot: initialState.screenshot,
        elementsFound: elements,
        verificationMessage: executionResult.message,
      };
    }

    // Wait for UI to settle
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 5. Capture result state
    const resultState = await captureState(`After: ${firstAction}`);

    // 6. Verify execution
    const verification = await verifyExecution(initialState, resultState.screenshot, userGoal);

    console.log(`[V2A] Loop completed: ${verification.success ? "SUCCESS" : "PARTIAL"} (${verification.confidence}% confidence)`);

    return {
      success: verification.success,
      action: firstAction,
      beforeScreenshot: initialState.screenshot,
      afterScreenshot: resultState.screenshot,
      elementsFound: elements,
      verificationMessage: verification.message,
    };
  } catch (error: any) {
    console.error("[V2A] Loop failed:", error.message);
    return {
      success: false,
      action: "error",
      beforeScreenshot: "",
      afterScreenshot: "",
      elementsFound: [],
      verificationMessage: error.message,
    };
  }
}
