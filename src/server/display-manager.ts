/**
 * Display Manager: Detects desktop environment and display protocol (X11/Wayland)
 * Provides abstraction for environment-specific operations
 */

import { exec } from "child_process";
import util from "util";

const execAsync = util.promisify(exec);

export type DisplayProtocol = "x11" | "wayland" | "unknown";
export type DesktopEnvironment = "gnome" | "kde" | "xfce" | "lxde" | "cinnamon" | "hyprland" | "i3" | "unknown";

interface DisplayInfo {
  protocol: DisplayProtocol;
  desktop: DesktopEnvironment;
  displayVar: string;
  hasDisplay: boolean;
  isHeadless: boolean;
}

let cachedDisplayInfo: DisplayInfo | null = null;

/**
 * Detect the display protocol (X11 or Wayland)
 */
async function detectDisplayProtocol(): Promise<DisplayProtocol> {
  try {
    // Check WAYLAND_DISPLAY environment variable
    if (process.env.WAYLAND_DISPLAY) {
      console.log("[DISPLAY] Detected Wayland via WAYLAND_DISPLAY");
      return "wayland";
    }

    // Check DISPLAY environment variable (X11)
    if (process.env.DISPLAY) {
      console.log("[DISPLAY] Detected X11 via DISPLAY");
      return "x11";
    }

    // Try to detect using sessiontype
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      console.log("[DISPLAY] Detected Wayland via XDG_SESSION_TYPE");
      return "wayland";
    }

    if (process.env.XDG_SESSION_TYPE === "x11") {
      console.log("[DISPLAY] Detected X11 via XDG_SESSION_TYPE");
      return "x11";
    }

    // Fallback: Check if X server is running
    try {
      await execAsync("xset q", { timeout: 2000 });
      console.log("[DISPLAY] Detected X11 via xset probe");
      return "x11";
    } catch (e) {
      // X server not responding
    }

    // Check for Wayland socket
    try {
      await execAsync("ls /run/user/*/wayland-* 2>/dev/null | head -1", { timeout: 2000 });
      console.log("[DISPLAY] Detected Wayland via socket probe");
      return "wayland";
    } catch (e) {
      // No Wayland socket found
    }

    console.log("[DISPLAY] Could not definitively detect display protocol, defaulting to X11");
    return "x11";
  } catch (error) {
    console.warn("[DISPLAY] Error detecting protocol:", error);
    return "unknown";
  }
}

/**
 * Detect the desktop environment (GNOME, KDE, XFCE, etc.)
 */
async function detectDesktopEnvironment(): Promise<DesktopEnvironment> {
  try {
    // Check XDG_CURRENT_DESKTOP environment variable
    const xdgDesktop = process.env.XDG_CURRENT_DESKTOP?.toLowerCase() || "";
    
    if (xdgDesktop.includes("gnome")) return "gnome";
    if (xdgDesktop.includes("kde") || xdgDesktop.includes("plasma")) return "kde";
    if (xdgDesktop.includes("xfce")) return "xfce";
    if (xdgDesktop.includes("lxde")) return "lxde";
    if (xdgDesktop.includes("cinnamon")) return "cinnamon";
    if (xdgDesktop.includes("hyprland")) return "hyprland";
    if (xdgDesktop.includes("i3")) return "i3";

    // Check DESKTOP_SESSION environment variable
    const desktopSession = process.env.DESKTOP_SESSION?.toLowerCase() || "";
    
    if (desktopSession.includes("gnome")) return "gnome";
    if (desktopSession.includes("kde") || desktopSession.includes("plasma")) return "kde";
    if (desktopSession.includes("xfce")) return "xfce";
    if (desktopSession.includes("lxde")) return "lxde";
    if (desktopSession.includes("cinnamon")) return "cinnamon";
    if (desktopSession.includes("hyprland")) return "hyprland";
    if (desktopSession.includes("i3")) return "i3";

    console.log("[DISPLAY] Could not detect desktop environment");
    return "unknown";
  } catch (error) {
    console.warn("[DISPLAY] Error detecting desktop environment:", error);
    return "unknown";
  }
}

/**
 * Get comprehensive display information
 */
export async function getDisplayInfo(): Promise<DisplayInfo> {
  // Return cached info if already detected
  if (cachedDisplayInfo) {
    return cachedDisplayInfo;
  }

  const protocol = await detectDisplayProtocol();
  const desktop = await detectDesktopEnvironment();
  const displayVar = process.env.DISPLAY || process.env.WAYLAND_DISPLAY || ":0";
  const hasDisplay = displayVar !== "" && displayVar !== "unknown";
  const isHeadless = !hasDisplay;

  cachedDisplayInfo = {
    protocol,
    desktop,
    displayVar,
    hasDisplay,
    isHeadless,
  };

  console.log("[DISPLAY] Session info:", cachedDisplayInfo);
  return cachedDisplayInfo;
}

/**
 * Check if running on X11
 */
export async function isX11(): Promise<boolean> {
  const info = await getDisplayInfo();
  return info.protocol === "x11";
}

/**
 * Check if running on Wayland
 */
export async function isWayland(): Promise<boolean> {
  const info = await getDisplayInfo();
  return info.protocol === "wayland";
}

/**
 * Get display variable (DISPLAY for X11, WAYLAND_DISPLAY for Wayland)
 */
export async function getDisplayVariable(): Promise<string> {
  const info = await getDisplayInfo();
  return info.displayVar;
}

/**
 * Clear cached display info (useful for testing or environment changes)
 */
export function clearCache(): void {
  cachedDisplayInfo = null;
  console.log("[DISPLAY] Cache cleared");
}
