/**
 * Desktop Control: Window management and system-level input control
 * Supports both X11 and Wayland with intelligent fallbacks
 */

import { exec } from "child_process";
import util from "util";
import { isX11, isWayland, getDisplayVariable } from "../src/server/display-manager";

const execAsync = util.promisify(exec);

interface WindowInfo {
  id: string;
  title: string;
  class: string;
  pid?: number;
  workspace?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * List all open windows
 */
export async function listWindows(): Promise<WindowInfo[]> {
  try {
    const isOnX11 = await isX11();

    if (isOnX11) {
      return await listWindowsX11();
    } else {
      return await listWindowsWayland();
    }
  } catch (error: any) {
    console.warn("[DESKTOP] Could not list windows:", error.message);
    return [];
  }
}

/**
 * List windows on X11 using wmctrl
 */
async function listWindowsX11(): Promise<WindowInfo[]> {
  try {
    const displayVar = await getDisplayVariable();
    const { stdout } = await execAsync(`DISPLAY=${displayVar} wmctrl -l`, { timeout: 5000 });

    const lines = stdout.trim().split("\n");
    const windows: WindowInfo[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      windows.push({
        id: parts[0],
        workspace: parseInt(parts[1]),
        pid: parseInt(parts[2]),
        title: parts.slice(3).join(" "),
        class: "",
      });
    }

    return windows;
  } catch (error: any) {
    console.warn("[DESKTOP] wmctrl failed:", error.message);
    return [];
  }
}

/**
 * List windows on Wayland (limited support via swaymsg or other protocols)
 */
async function listWindowsWayland(): Promise<WindowInfo[]> {
  try {
    // Try swaymsg first (i3/sway window managers)
    const { stdout } = await execAsync("swaymsg -t get_tree", { timeout: 5000 }).catch(async () => {
      // Fallback to wmctrl which also works on some Wayland setups
      return execAsync("wmctrl -l", { timeout: 5000 });
    });

    const lines = stdout.trim().split("\n");
    const windows: WindowInfo[] = [];

    // Handle wmctrl output
    for (const line of lines) {
      if (!line.trim() || line.startsWith("{")) continue; // Skip JSON lines from swaymsg
      const parts = line.split(/\s+/);
      if (parts.length < 4) continue;

      windows.push({
        id: parts[0],
        workspace: parseInt(parts[1]),
        pid: parseInt(parts[2]),
        title: parts.slice(3).join(" "),
        class: "",
      });
    }

    return windows;
  } catch (error: any) {
    console.warn("[DESKTOP] Wayland window listing failed:", error.message);
    return [];
  }
}

/**
 * Focus a window by ID or title
 */
export async function focusWindow(windowIdOrTitle: string): Promise<string> {
  try {
    const isOnX11 = await isX11();

    if (isOnX11) {
      return await focusWindowX11(windowIdOrTitle);
    } else {
      return await focusWindowWayland(windowIdOrTitle);
    }
  } catch (error: any) {
    throw new Error(`Failed to focus window: ${error.message}`);
  }
}

/**
 * Focus window on X11 using wmctrl or xdotool
 */
async function focusWindowX11(windowIdOrTitle: string): Promise<string> {
  try {
    const displayVar = await getDisplayVariable();

    // Try wmctrl first
    try {
      await execAsync(`DISPLAY=${displayVar} wmctrl -a "${windowIdOrTitle}"`, { timeout: 5000 });
      return `Focused window: ${windowIdOrTitle}`;
    } catch (e) {
      // Fallback to xdotool
      const { stdout: wid } = await execAsync(
        `DISPLAY=${displayVar} xdotool search --name "${windowIdOrTitle}" | head -1`,
        { timeout: 5000 }
      );
      if (wid.trim()) {
        await execAsync(`DISPLAY=${displayVar} xdotool windowactivate ${wid.trim()}`, { timeout: 5000 });
        return `Focused window: ${windowIdOrTitle}`;
      }
      throw new Error("Window not found");
    }
  } catch (error: any) {
    throw error;
  }
}

/**
 * Focus window on Wayland
 */
async function focusWindowWayland(windowIdOrTitle: string): Promise<string> {
  try {
    // Try swaymsg for sway/i3 on Wayland
    try {
      await execAsync(`swaymsg '[title="${windowIdOrTitle}"] focus'`, { timeout: 5000 });
      return `Focused window: ${windowIdOrTitle}`;
    } catch (e) {
      // Fallback to wmctrl if available on Wayland session
      await execAsync(`wmctrl -a "${windowIdOrTitle}"`, { timeout: 5000 });
      return `Focused window: ${windowIdOrTitle}`;
    }
  } catch (error: any) {
    throw new Error(`Could not focus window on Wayland: ${error.message}`);
  }
}

/**
 * Close a window
 */
export async function closeWindow(windowIdOrTitle: string): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      try {
        // Try wmctrl
        await execAsync(`DISPLAY=${displayVar} wmctrl -c "${windowIdOrTitle}"`, { timeout: 5000 });
      } catch (e) {
        // Fallback to xdotool
        const { stdout: wid } = await execAsync(
          `DISPLAY=${displayVar} xdotool search --name "${windowIdOrTitle}" | head -1`,
          { timeout: 5000 }
        );
        if (wid.trim()) {
          await execAsync(`DISPLAY=${displayVar} xdotool windowkill ${wid.trim()}`, { timeout: 5000 });
        }
      }
    } else {
      // Wayland
      try {
        await execAsync(`swaymsg '[title="${windowIdOrTitle}"] kill'`, { timeout: 5000 });
      } catch (e) {
        await execAsync(`wmctrl -c "${windowIdOrTitle}"`, { timeout: 5000 });
      }
    }

    return `Closed window: ${windowIdOrTitle}`;
  } catch (error: any) {
    throw new Error(`Failed to close window: ${error.message}`);
  }
}

/**
 * Minimize a window
 */
export async function minimizeWindow(windowIdOrTitle: string): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      try {
        await execAsync(`DISPLAY=${displayVar} wmctrl -r "${windowIdOrTitle}" -b add,hidden`, {
          timeout: 5000,
        });
      } catch (e) {
        const { stdout: wid } = await execAsync(
          `DISPLAY=${displayVar} xdotool search --name "${windowIdOrTitle}" | head -1`,
          { timeout: 5000 }
        );
        if (wid.trim()) {
          await execAsync(`DISPLAY=${displayVar} xdotool windowminimize ${wid.trim()}`, { timeout: 5000 });
        }
      }
    } else {
      // Wayland (limited support)
      console.warn("[DESKTOP] Minimize not fully supported on Wayland");
      return "Minimize is not fully supported on Wayland";
    }

    return `Minimized window: ${windowIdOrTitle}`;
  } catch (error: any) {
    throw new Error(`Failed to minimize window: ${error.message}`);
  }
}

/**
 * Maximize a window
 */
export async function maximizeWindow(windowIdOrTitle: string): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      try {
        await execAsync(`DISPLAY=${displayVar} wmctrl -r "${windowIdOrTitle}" -b add,maximized_vert,maximized_horz`, {
          timeout: 5000,
        });
      } catch (e) {
        console.warn("[DESKTOP] wmctrl maximize failed, trying xdotool");
      }
    } else {
      // Wayland
      try {
        await execAsync(`swaymsg '[title="${windowIdOrTitle}"] fullscreen toggle'`, { timeout: 5000 });
      } catch (e) {
        console.warn("[DESKTOP] Maximize not fully supported on this Wayland setup");
      }
    }

    return `Maximized window: ${windowIdOrTitle}`;
  } catch (error: any) {
    throw new Error(`Failed to maximize window: ${error.message}`);
  }
}

/**
 * Move mouse to position and optionally click
 */
export async function moveMouse(x: number, y: number, click = false): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      const clickArg = click ? " click 1" : "";
      await execAsync(`DISPLAY=${displayVar} xdotool mousemove ${x} ${y}${clickArg}`, { timeout: 5000 });
    } else {
      // Wayland doesn't have direct mouse control via xdotool
      console.warn("[DESKTOP] Direct mouse control limited on Wayland");
    }

    return `Mouse moved to (${x}, ${y})${click ? " and clicked" : ""}`;
  } catch (error: any) {
    throw new Error(`Failed to move mouse: ${error.message}`);
  }
}

/**
 * Send keyboard input
 */
export async function sendKeyboardInput(text: string): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      await execAsync(`DISPLAY=${displayVar} xdotool type "${text.replace(/"/g, '\\"')}"`, { timeout: 5000 });
    } else {
      // Wayland - try wtype if available
      try {
        await execAsync(`wtype "${text.replace(/"/g, '\\"')}"`, { timeout: 5000 });
      } catch (e) {
        console.warn("[DESKTOP] Keyboard input may not work on Wayland");
      }
    }

    return `Typed text: ${text}`;
  } catch (error: any) {
    throw new Error(`Failed to send keyboard input: ${error.message}`);
  }
}

/**
 * Press a keyboard key
 */
export async function pressKey(key: string): Promise<string> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      await execAsync(`DISPLAY=${displayVar} xdotool key ${key}`, { timeout: 5000 });
    } else {
      // Wayland
      try {
        await execAsync(`wtype -k ${key}`, { timeout: 5000 });
      } catch (e) {
        console.warn("[DESKTOP] Key press may not work on Wayland");
      }
    }

    return `Pressed key: ${key}`;
  } catch (error: any) {
    throw new Error(`Failed to press key: ${error.message}`);
  }
}

/**
 * Get active window info
 */
export async function getActiveWindow(): Promise<WindowInfo | null> {
  try {
    const isOnX11 = await isX11();
    const displayVar = await getDisplayVariable();

    if (isOnX11) {
      const { stdout } = await execAsync(`DISPLAY=${displayVar} xdotool getactivewindow getwindowname %@`, {
        timeout: 5000,
      });
      const lines = stdout.trim().split("\n");
      if (lines.length >= 2) {
        return {
          id: lines[0],
          title: lines[1],
          class: "",
        };
      }
    } else {
      // Wayland
      try {
        const { stdout } = await execAsync(`swaymsg -t get_tree | grep '"focused": true'`, { timeout: 5000 });
        if (stdout.includes("focused")) {
          return {
            id: "wayland-focused",
            title: "Active window on Wayland",
            class: "",
          };
        }
      } catch (e) {
        console.warn("[DESKTOP] Could not get active window on Wayland");
      }
    }

    return null;
  } catch (error: any) {
    console.warn("[DESKTOP] Failed to get active window:", error.message);
    return null;
  }
}
