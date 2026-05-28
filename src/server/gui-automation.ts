import * as fs from "fs";
import * as path from "path";
import * as os from "os";
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
} from "../../../browser_automation/desktop-control";
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

/**
 * Adjust system backlight brightness level
 */
export async function adjustBrightness(action: "up" | "down" | "set", value?: number): Promise<GuiActionResult> {
  const { exec } = require("child_process");
  const util = require("util");
  const execAsync = util.promisify(exec);
  try {
    let cmd = "";
    if (action === "up") {
      cmd = `brightnessctl set +${value || 10}%`;
    } else if (action === "down") {
      cmd = `brightnessctl set ${value || 10}%-`;
    } else {
      cmd = `brightnessctl set ${value ?? 50}%`;
    }
    await execAsync(cmd);
    const { stdout } = await execAsync("brightnessctl -m");
    const parts = stdout.trim().split(",");
    const percent = parts[3] || "unknown";
    return {
      success: true,
      message: `Brightness adjusted ${action} successfully. Current: ${percent}`,
      data: { brightness: percent }
    };
  } catch (err: any) {
    try {
      let cmd = "";
      if (action === "up") {
        cmd = `xbacklight -inc ${value || 10}`;
      } else if (action === "down") {
        cmd = `xbacklight -dec ${value || 10}`;
      } else {
        cmd = `xbacklight -set ${value ?? 50}`;
      }
      await execAsync(cmd);
      const { stdout } = await execAsync("xbacklight -get");
      const percent = `${Math.round(parseFloat(stdout.trim()))}%`;
      return {
        success: true,
        message: `Brightness adjusted via xbacklight. Current: ${percent}`,
        data: { brightness: percent }
      };
    } catch (err2: any) {
      return {
        success: false,
        message: "Failed to adjust brightness level (both brightnessctl and xbacklight failed)",
        error: `brightnessctl error: ${err.message}. xbacklight error: ${err2.message}`
      };
    }
  }
}

/**
 * Control desktop notifications
 */
export async function controlNotifications(action: "send" | "clear" | "history", title?: string, message?: string): Promise<GuiActionResult> {
  const { exec } = require("child_process");
  const util = require("util");
  const execAsync = util.promisify(exec);
  try {
    if (action === "send") {
      const safeTitle = JSON.stringify(title || "Nova Assistant");
      const safeMsg = JSON.stringify(message || "");
      await execAsync(`notify-send ${safeTitle} ${safeMsg}`);
      return { success: true, message: `Notification sent: "${title}"` };
    } else if (action === "clear") {
      await execAsync("dunstctl close-all").catch(() => {});
      return { success: true, message: "Cleared Dunst notifications history (close-all)" };
    } else if (action === "history") {
      try {
        const { stdout } = await execAsync("dunstctl history");
        const history = JSON.parse(stdout);
        return {
          success: true,
          message: "Retrieved notification history",
          data: history
        };
      } catch (e: any) {
        return {
          success: false,
          message: "Could not retrieve dunst history",
          error: e.message
        };
      }
    }
    return { success: false, message: `Unknown notification action "${action}"` };
  } catch (err: any) {
    return { success: false, message: "Failed to manage notifications", error: err.message };
  }
}

/**
 * Launch standard application by executable name
 */
export async function launchApplication(appName: string): Promise<GuiActionResult> {
  const { exec } = require("child_process");
  try {
    const cmd = `${appName} > /dev/null 2>&1 &`;
    exec(cmd);
    return {
      success: true,
      message: `Launched system application "${appName}" in background.`
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to launch system application "${appName}"`,
      error: err.message
    };
  }
}

/**
 * List desktop applications found in system paths
 */
export async function listInstalledApplications(query?: string): Promise<GuiActionResult> {
  try {
    const dirs = ["/usr/share/applications", path.join(os.homedir(), ".local/share/applications")];
    const apps: { name: string; exec: string; description?: string }[] = [];
    const q = (query || "").toLowerCase();
    for (const dir of dirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.endsWith(".desktop")) {
            try {
              const filePath = path.join(dir, file);
              const content = fs.readFileSync(filePath, "utf-8");
              const lines = content.split("\n");
              let name = "";
              let execCommand = "";
              let comment = "";
              for (const line of lines) {
                if (line.startsWith("Name=")) {
                  name = line.substring(5).trim();
                } else if (line.startsWith("Exec=")) {
                  execCommand = line.substring(5).split(" ")[0].replace(/%[fFuUiIdDnN]/g, "").trim();
                } else if (line.startsWith("Comment=")) {
                  comment = line.substring(8).trim();
                }
              }
              if (name && execCommand) {
                if (!q || name.toLowerCase().includes(q) || execCommand.toLowerCase().includes(q)) {
                  if (!apps.some(a => a.exec === execCommand)) {
                    apps.push({ name, exec: execCommand, description: comment });
                  }
                }
              }
            } catch (_) {}
          }
        }
      }
    }
    return {
      success: true,
      message: `Found ${apps.length} applications matching query`,
      data: apps.slice(0, 30)
    };
  } catch (err: any) {
    return {
      success: false,
      message: "Failed to list desktop applications",
      error: err.message
    };
  }
}
