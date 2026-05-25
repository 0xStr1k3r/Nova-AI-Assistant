import { exec } from "child_process";
import * as util from "util";
import { getBrowserAndPage } from "./engine";

const execAsync = util.promisify(exec);

export async function playYoutubeQuery(query: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  console.log(`[BROWSER-YOUTUBE] Searching query: "${query}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

  const videoThumbSelector = "ytd-video-renderer a#thumbnail";
  console.log("[BROWSER-YOUTUBE] Waiting for search results to load...");
  await page.waitForSelector(videoThumbSelector, { timeout: 8000 });

  console.log("[BROWSER-YOUTUBE] Clicking first video result link to start playback...");
  await page.click(videoThumbSelector);

  return `YouTube query search succeeded. Auto-playing first video result for: "${query}"`;
}

export async function controlMedia(
  action: "play" | "pause" | "mute" | "unmute" | "skipAd" | "volumeUp" | "volumeDown" | "setVolume",
  volumePercent?: number
): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER-MEDIA] Performing media control: ${action}, volumePercent=${volumePercent ?? "none"}`);

  const result = await page.evaluate((act, volPercent) => {
    const video = document.querySelector("video");

    if (act === "skipAd") {
      const skipBtn = document.querySelector(".ytp-skip-ad-button, .ytp-ad-skip-button") as HTMLElement;
      if (skipBtn) {
        skipBtn.click();
        return "Ad skip button clicked successfully.";
      }
      return "No active ad skip button found on screen.";
    }

    if (!video) return "No active video or audio media element found on page.";

    switch (act) {
      case "play":
        video.play();
        return "Resumed playback.";
      case "pause":
        video.pause();
        return "Paused playback.";
      case "mute":
        video.muted = true;
        return "Muted media audio.";
      case "unmute":
        video.muted = false;
        return "Unmuted media audio.";
      case "volumeUp":
        video.volume = Math.min(1.0, video.volume + 0.1);
        return `Increased browser media volume to ${Math.round(video.volume * 100)}%.`;
      case "volumeDown":
        video.volume = Math.max(0.0, video.volume - 0.1);
        return `Decreased browser media volume to ${Math.round(video.volume * 100)}%.`;
      case "setVolume": {
        const val = volPercent !== undefined ? volPercent / 100 : 0.5;
        video.volume = Math.max(0.0, Math.min(1.0, val));
        return `Set browser media volume to ${Math.round(video.volume * 100)}%.`;
      }
      default:
        return "Unknown media control action.";
    }
  }, action, volumePercent);

  return result;
}

export async function adjustSystemVolume(
  action: "up" | "down" | "mute" | "unmute" | "set",
  percent?: number
): Promise<string> {
  console.log(`[BROWSER-SYSTEM-SOUND] Adjusting system sound: Action=${action}, Percent=${percent ?? "none"}`);

  try {
    switch (action) {
      case "up":
        await execAsync("wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.1+");
        break;
      case "down":
        await execAsync("wpctl set-volume @DEFAULT_AUDIO_SINK@ 0.1-");
        break;
      case "mute":
        await execAsync("wpctl set-mute @DEFAULT_AUDIO_SINK@ 1");
        return "System audio muted successfully.";
      case "unmute":
        await execAsync("wpctl set-mute @DEFAULT_AUDIO_SINK@ 0");
        return "System audio unmuted successfully.";
      case "set": {
        if (percent === undefined) throw new Error("Volume percent is required for set action.");
        const val = Math.max(0, Math.min(100, percent)) / 100;
        await execAsync(`wpctl set-volume @DEFAULT_AUDIO_SINK@ ${val}`);
        break;
      }
    }

    const { stdout } = await execAsync("wpctl get-volume @DEFAULT_AUDIO_SINK@");
    const match = stdout.match(/Volume:\s+([0-9.]+)/i);
    if (match) {
      const volNum = Math.round(parseFloat(match[1]) * 100);
      const isMuted = stdout.toLowerCase().includes("[muted]");
      return `System volume is now ${volNum}%${isMuted ? " (MUTED)" : ""}.`;
    }
    return `Successfully executed system volume adjustment action: ${action}.`;
  } catch (e: any) {
    console.error("[SYSTEM SOUND ERROR]", e);
    throw new Error(`Failed to adjust system volume: ${e.message}`);
  }
}
