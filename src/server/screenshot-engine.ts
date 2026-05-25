/**
 * Screenshot Engine: Captures full desktop screenshots across X11/Wayland
 * Provides multiple fallback methods for maximum compatibility
 */

import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";
import os from "os";
import sharp from "sharp";
import { isX11, isWayland, getDisplayVariable } from "./display-manager";

const execAsync = util.promisify(exec);

const SCREENSHOTS_DIR = path.join(os.homedir(), ".config", "nova-voice-assistant", "desktop-screenshots");

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

interface ScreenshotResult {
  success: boolean;
  filePath: string;
  base64?: string;
  error?: string;
  method?: string;
  dimensions?: { width: number; height: number };
}

/**
 * Capture screenshot on X11 using scrot
 */
async function screenshotX11Scrot(): Promise<ScreenshotResult> {
  try {
    const filePath = path.join(SCREENSHOTS_DIR, `screenshot_x11_scrot_${Date.now()}.png`);
    const displayVar = await getDisplayVariable();
    
    await execAsync(`DISPLAY=${displayVar} scrot "${filePath}"`, { timeout: 5000 });
    
    console.log("[SCREENSHOT] X11 scrot success:", filePath);
    return { success: true, filePath, method: "x11-scrot" };
  } catch (error: any) {
    console.warn("[SCREENSHOT] X11 scrot failed:", error.message);
    return { success: false, filePath: "", error: error.message };
  }
}

/**
 * Capture screenshot on X11 using gnome-screenshot
 */
async function screenshotX11Gnome(): Promise<ScreenshotResult> {
  try {
    const filePath = path.join(SCREENSHOTS_DIR, `screenshot_x11_gnome_${Date.now()}.png`);
    const displayVar = await getDisplayVariable();
    
    await execAsync(`DISPLAY=${displayVar} gnome-screenshot -f "${filePath}"`, { timeout: 5000 });
    
    console.log("[SCREENSHOT] X11 gnome-screenshot success:", filePath);
    return { success: true, filePath, method: "x11-gnome" };
  } catch (error: any) {
    console.warn("[SCREENSHOT] X11 gnome-screenshot failed:", error.message);
    return { success: false, filePath: "", error: error.message };
  }
}

/**
 * Capture screenshot on Wayland using grim
 */
async function screenshotWaylandGrim(): Promise<ScreenshotResult> {
  try {
    const filePath = path.join(SCREENSHOTS_DIR, `screenshot_wayland_grim_${Date.now()}.png`);
    const displayVar = await getDisplayVariable();
    
    await execAsync(`WAYLAND_DISPLAY=${displayVar} grim "${filePath}"`, { timeout: 5000 });
    
    console.log("[SCREENSHOT] Wayland grim success:", filePath);
    return { success: true, filePath, method: "wayland-grim" };
  } catch (error: any) {
    console.warn("[SCREENSHOT] Wayland grim failed:", error.message);
    return { success: false, filePath: "", error: error.message };
  }
}

/**
 * Capture screenshot on Wayland using gnome-screenshot
 */
async function screenshotWaylandGnome(): Promise<ScreenshotResult> {
  try {
    const filePath = path.join(SCREENSHOTS_DIR, `screenshot_wayland_gnome_${Date.now()}.png`);
    
    await execAsync(`gnome-screenshot -f "${filePath}"`, { timeout: 5000 });
    
    console.log("[SCREENSHOT] Wayland gnome-screenshot success:", filePath);
    return { success: true, filePath, method: "wayland-gnome" };
  } catch (error: any) {
    console.warn("[SCREENSHOT] Wayland gnome-screenshot failed:", error.message);
    return { success: false, filePath: "", error: error.message };
  }
}

/**
 * Capture screenshot on Wayland using KDE Spectacle
 */
async function screenshotWaylandSpectacle(): Promise<ScreenshotResult> {
  try {
    const filePath = path.join(SCREENSHOTS_DIR, `screenshot_wayland_spectacle_${Date.now()}.png`);
    
    await execAsync(`spectacle -b -o "${filePath}"`, { timeout: 5000 });
    
    console.log("[SCREENSHOT] Wayland spectacle success:", filePath);
    return { success: true, filePath, method: "wayland-spectacle" };
  } catch (error: any) {
    console.warn("[SCREENSHOT] Wayland spectacle failed:", error.message);
    return { success: false, filePath: "", error: error.message };
  }
}

/**
 * Get image dimensions
 */
async function getImageDimensions(filePath: string): Promise<{ width: number; height: number } | null> {
  try {
    const metadata = await sharp(filePath).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
    return null;
  } catch (error) {
    console.warn("[SCREENSHOT] Could not read image metadata:", error);
    return null;
  }
}

/**
 * Optimize screenshot size for vision API (max 20MB)
 * Resize if needed to keep under limits
 */
async function optimizeScreenshot(filePath: string): Promise<string> {
  try {
    const stats = fs.statSync(filePath);
    
    // If file is already small enough, return as-is
    if (stats.size < 5 * 1024 * 1024) {
      return filePath;
    }

    console.log("[SCREENSHOT] Optimizing large screenshot...");
    
    const optimizedPath = filePath.replace(".png", "_optimized.png");
    const metadata = await sharp(filePath).metadata();
    
    // Scale down if width > 1920
    if (metadata.width && metadata.width > 1920) {
      await sharp(filePath)
        .resize(1920, Math.round((metadata.height || 1080) * (1920 / metadata.width)), {
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFile(optimizedPath);

      console.log("[SCREENSHOT] Optimized to:", optimizedPath);
      return optimizedPath;
    }

    return filePath;
  } catch (error) {
    console.warn("[SCREENSHOT] Optimization failed, using original:", error);
    return filePath;
  }
}

/**
 * Convert screenshot to base64 for vision API
 */
async function screenshotToBase64(filePath: string): Promise<string> {
  try {
    const buffer = fs.readFileSync(filePath);
    return buffer.toString("base64");
  } catch (error) {
    console.error("[SCREENSHOT] Failed to convert to base64:", error);
    throw error;
  }
}

/**
 * Main function: Capture desktop screenshot with automatic fallbacks
 * Tries X11 methods first if X11 detected, then Wayland methods, then generic fallbacks
 */
export async function captureDesktopScreenshot(optimize = true): Promise<ScreenshotResult> {
  try {
    const isOnX11 = await isX11();
    const isOnWayland = await isWayland();

    console.log(`[SCREENSHOT] Capturing screenshot (X11=${isOnX11}, Wayland=${isOnWayland})...`);

    let result: ScreenshotResult = { success: false, filePath: "" };

    if (isOnX11) {
      // Try X11 methods in order
      result = await screenshotX11Scrot();
      if (!result.success) result = await screenshotX11Gnome();
    } else if (isOnWayland) {
      // Try Wayland methods in order
      result = await screenshotWaylandGrim();
      if (!result.success) result = await screenshotWaylandGnome();
      if (!result.success) result = await screenshotWaylandSpectacle();
    }

    // Generic fallback for unknown environments
    if (!result.success) {
      console.log("[SCREENSHOT] Trying generic screenshot methods...");
      result = await screenshotX11Scrot();
      if (!result.success) result = await screenshotWaylandGrim();
      if (!result.success) result = await screenshotX11Gnome();
      if (!result.success) result = await screenshotWaylandGnome();
    }

    if (!result.success) {
      return {
        success: false,
        filePath: "",
        error: "All screenshot methods failed. Ensure scrot, grim, or gnome-screenshot is installed.",
      };
    }

    // Optimize if needed
    if (optimize) {
      result.filePath = await optimizeScreenshot(result.filePath);
    }

    // Get dimensions
    result.dimensions = (await getImageDimensions(result.filePath)) || undefined;

    console.log("[SCREENSHOT] Success:", result.filePath);
    return result;
  } catch (error: any) {
    console.error("[SCREENSHOT] Fatal error:", error);
    return {
      success: false,
      filePath: "",
      error: error.message || "Unknown error",
    };
  }
}

/**
 * Capture screenshot and return as base64 (for vision API)
 */
export async function captureDesktopScreenshotAsBase64(): Promise<{
  success: boolean;
  base64?: string;
  error?: string;
  dimensions?: { width: number; height: number };
}> {
  try {
    const result = await captureDesktopScreenshot(true);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    const base64 = await screenshotToBase64(result.filePath);
    return {
      success: true,
      base64,
      dimensions: result.dimensions,
    };
  } catch (error: any) {
    console.error("[SCREENSHOT] Base64 conversion failed:", error);
    return {
      success: false,
      error: error.message || "Failed to convert screenshot to base64",
    };
  }
}

/**
 * Clean up old screenshots (keep last 10)
 */
export async function cleanupOldScreenshots(): Promise<void> {
  try {
    const files = fs.readdirSync(SCREENSHOTS_DIR).sort().reverse();

    // Keep last 10, delete the rest
    if (files.length > 10) {
      for (const file of files.slice(10)) {
        const filePath = path.join(SCREENSHOTS_DIR, file);
        fs.unlinkSync(filePath);
        console.log("[SCREENSHOT] Deleted old screenshot:", file);
      }
    }
  } catch (error) {
    console.warn("[SCREENSHOT] Cleanup failed:", error);
  }
}

/**
 * Get list of recent screenshots
 */
export function getRecentScreenshots(limit = 5): string[] {
  try {
    const files = fs.readdirSync(SCREENSHOTS_DIR).sort().reverse().slice(0, limit);
    return files.map((f) => path.join(SCREENSHOTS_DIR, f));
  } catch (error) {
    console.warn("[SCREENSHOT] Could not list screenshots:", error);
    return [];
  }
}
