/**
 * GUI Automation: Main orchestrator for universal GUI control
 * Provides high-level API for desktop interaction and vision analysis
 */

import { captureDesktopScreenshot, captureDesktopScreenshotAsBase64, cleanupOldScreenshots } from "./screenshot-engine";
import {
  listWindows,
  focusWindow,
  closeWindow,
  minimizeWindow,
  maximizeWindow,
  moveMouse,
  sendKeyboardInput,
  pressKey,
  getActiveWindow,
} from "../../browser_automation/desktop-control";
import { getDisplayInfo, isX11, isWayland } from "./display-manager";

export interface GuiActionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
}

/**
 * Get system display and desktop environment info
 */
export async function getSystemInfo(): Promise<GuiActionResult> {
  try {
    const info = await getDisplayInfo();
    return {
      success: true,
      message: "Display info retrieved",
      data: info,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to get system info",
      error: error.message,
    };
  }
}

/**
 * Capture full desktop screenshot
 */
export async function captureScreenshot(): Promise<GuiActionResult> {
  try {
    console.log("[GUI] Capturing desktop screenshot...");
    const result = await captureDesktopScreenshot(true);

    if (!result.success) {
      return {
        success: false,
        message: "Screenshot capture failed",
        error: result.error,
      };
    }

    return {
      success: true,
      message: `Screenshot captured: ${result.filePath}`,
      data: {
        filePath: result.filePath,
        method: result.method,
        dimensions: result.dimensions,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to capture screenshot",
      error: error.message,
    };
  }
}

/**
 * Capture screenshot as base64 (for vision API)
 */
export async function getScreenshotBase64(): Promise<GuiActionResult> {
  try {
    console.log("[GUI] Capturing screenshot for vision analysis...");
    const result = await captureDesktopScreenshotAsBase64();

    if (!result.success) {
      return {
        success: false,
        message: "Screenshot capture failed",
        error: result.error,
      };
    }

    return {
      success: true,
      message: "Screenshot captured (base64)",
      data: {
        base64: result.base64,
        dimensions: result.dimensions,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to capture screenshot",
      error: error.message,
    };
  }
}

/**
 * List all open windows
 */
export async function getWindowList(): Promise<GuiActionResult> {
  try {
    const windows = await listWindows();
    return {
      success: true,
      message: `Found ${windows.length} open windows`,
      data: { windows },
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to list windows",
      error: error.message,
    };
  }
}

/**
 * Get active window
 */
export async function getActiveWindowInfo(): Promise<GuiActionResult> {
  try {
    const window = await getActiveWindow();
    if (!window) {
      return {
        success: false,
        message: "No active window found",
      };
    }

    return {
      success: true,
      message: "Active window info retrieved",
      data: { window },
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to get active window",
      error: error.message,
    };
  }
}

/**
 * Focus a window
 */
export async function focusWindowAction(windowIdOrTitle: string): Promise<GuiActionResult> {
  try {
    const message = await focusWindow(windowIdOrTitle);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to focus window",
      error: error.message,
    };
  }
}

/**
 * Close a window
 */
export async function closeWindowAction(windowIdOrTitle: string): Promise<GuiActionResult> {
  try {
    const message = await closeWindow(windowIdOrTitle);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to close window",
      error: error.message,
    };
  }
}

/**
 * Minimize a window
 */
export async function minimizeWindowAction(windowIdOrTitle: string): Promise<GuiActionResult> {
  try {
    const message = await minimizeWindow(windowIdOrTitle);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to minimize window",
      error: error.message,
    };
  }
}

/**
 * Maximize a window
 */
export async function maximizeWindowAction(windowIdOrTitle: string): Promise<GuiActionResult> {
  try {
    const message = await maximizeWindow(windowIdOrTitle);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to maximize window",
      error: error.message,
    };
  }
}

/**
 * Move mouse and optionally click
 */
export async function moveMouseAction(x: number, y: number, click = false): Promise<GuiActionResult> {
  try {
    const message = await moveMouse(x, y, click);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to move mouse",
      error: error.message,
    };
  }
}

/**
 * Send keyboard text input
 */
export async function typeTextAction(text: string): Promise<GuiActionResult> {
  try {
    const message = await sendKeyboardInput(text);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to type text",
      error: error.message,
    };
  }
}

/**
 * Press a keyboard key
 */
export async function pressKeyAction(key: string): Promise<GuiActionResult> {
  try {
    const message = await pressKey(key);
    return {
      success: true,
      message,
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to press key",
      error: error.message,
    };
  }
}

/**
 * Clean up old screenshots
 */
export async function cleanupScreenshots(): Promise<GuiActionResult> {
  try {
    await cleanupOldScreenshots();
    return {
      success: true,
      message: "Old screenshots cleaned up",
    };
  } catch (error: any) {
    return {
      success: false,
      message: "Failed to cleanup screenshots",
      error: error.message,
    };
  }
}
