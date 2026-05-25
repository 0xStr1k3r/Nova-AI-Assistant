import puppeteer, { Browser, Page } from "puppeteer-core";
import * as path from "path";
import * as fs from "fs";

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;
const SCREENSHOTS_DIR = "/home/chiru/.config/nova-voice-assistant/screenshots";
const DOWNLOADS_DIR = "/home/chiru/.config/nova-voice-assistant/downloads";

// Ensure directories exist
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

export async function getBrowserAndPage(): Promise<{ browser: Browser; page: Page }> {
  if (activeBrowser && activePage) {
    try {
      await activeBrowser.version();
      return { browser: activeBrowser, page: activePage };
    } catch (e) {
      console.log("[BROWSER] Active browser crashed or closed, restarting...");
      activeBrowser = null;
      activePage = null;
    }
  }

  console.log("[BROWSER] Launching system Chromium at /usr/bin/chromium...");
  
  process.env.DISPLAY = process.env.DISPLAY || ":0";
  
  activeBrowser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: false,
    defaultViewport: null,
    args: [
      "--start-maximized", 
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });

  const pages = await activeBrowser.pages();
  activePage = pages.length > 0 ? pages[0] : await activeBrowser.newPage();

  return { browser: activeBrowser, page: activePage };
}

export async function closeBrowser() {
  if (activeBrowser) {
    try {
      await activeBrowser.close();
      console.log("[BROWSER] Closed browser successfully.");
    } catch (e) {
      console.error("[BROWSER] Error closing browser:", e);
    }
    activeBrowser = null;
    activePage = null;
  }
}

export async function navigate(url: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  let targetUrl = url;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = "https://" + targetUrl;
  }
  
  console.log(`[BROWSER] Navigating to ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  return `Navigated to ${targetUrl}`;
}

export async function clickElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Waiting and clicking selector: ${selector}`);
  await page.waitForSelector(selector, { timeout: 6000 });
  await page.click(selector);
  return `Clicked button/element matching selector: "${selector}"`;
}

export async function typeText(selector: string, text: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Typing text into selector ${selector}`);
  await page.waitForSelector(selector, { timeout: 6000 });
  
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  
  await page.type(selector, text);
  return `Successfully typed text inside input matching selector: "${selector}"`;
}

export async function captureScreenshot(): Promise<string> {
  const { page } = await getBrowserAndPage();
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot_${Date.now()}.png`);
  console.log(`[BROWSER] Capturing screenshot to ${filePath}`);
  await page.screenshot({ path: filePath });
  return `Captured viewport screenshot and saved to: ${filePath}`;
}

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

export async function scrollPage(direction: "up" | "down", amount?: number): Promise<string> {
  const { page } = await getBrowserAndPage();
  const scrollAmount = amount || 500;
  console.log(`[BROWSER] Scrolling ${direction} by ${scrollAmount}px`);
  await page.evaluate((dir, amt) => {
    window.scrollBy(0, dir === "down" ? amt : -amt);
  }, direction, scrollAmount);
  return `Scrolled page ${direction} by ${scrollAmount} pixels.`;
}

export async function extractPageText(selector?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  if (selector) {
    console.log(`[BROWSER] Extracting text from selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: 5000 });
    const text = await page.$eval(selector, el => el.textContent || "");
    return `Text content of "${selector}":\n${text.trim()}`;
  } else {
    console.log(`[BROWSER] Extracting all visible page body text`);
    const text = await page.$eval("body", el => el.innerText || "");
    return `Visible Page Text Content:\n${text.substring(0, 5000).trim()}${text.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
  }
}

export async function extractPageLinks(): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Extracting all active hyperlinks on the page`);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map(a => ({
        text: a.innerText?.trim() || "",
        href: a.href || ""
      }))
      .filter(l => l.text.length > 0 && l.href.startsWith("http"));
  });

  const formatted = links.slice(0, 30).map((l, i) => `[${i + 1}] ${l.text} -> ${l.href}`).join("\n");
  return `Top ${Math.min(30, links.length)} clickable page links:\n${formatted}`;
}

export async function evaluateJs(code: string): Promise<any> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Evaluating custom JS code in page context`);
  const result = await page.evaluate((jsCode) => {
    try {
      return eval(jsCode);
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  }, code);
  return typeof result === "object" ? JSON.stringify(result) : String(result);
}

export async function controlMedia(action: "play" | "pause" | "mute" | "unmute" | "skipAd"): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER-MEDIA] Performing media control: ${action}`);

  const result = await page.evaluate((act) => {
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
      default:
        return "Unknown media control action.";
    }
  }, action);

  return result;
}

// ─── NEW DEEP BROWSER AUTOMATION FEATURES ────────────────────────────────────

export async function getPageDetails(): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log("[BROWSER] Fetching current page details...");
  const title = await page.title();
  const url = page.url();
  const info = {
    title,
    url,
    secure: url.startsWith("https"),
    viewport: page.viewport()
  };
  return `Page Details:\n${JSON.stringify(info, null, 2)}`;
}

export async function navigateHistory(action: "back" | "forward" | "reload"): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Navigating history: ${action}`);
  if (action === "back") {
    await page.goBack();
    return "Navigated back in history.";
  } else if (action === "forward") {
    await page.goForward();
    return "Navigated forward in history.";
  } else {
    await page.reload();
    return "Refreshed/reloaded page.";
  }
}

export async function hoverElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Hovering over element matching selector: ${selector}`);
  await page.waitForSelector(selector, { timeout: 6000 });
  await page.hover(selector);
  return `Successfully hovered cursor over element matching: "${selector}"`;
}

export async function pressKeyboardKey(key: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Pressing keyboard key: ${key}`);
  await page.keyboard.press(key as any);
  return `Pressed key "${key}" inside page viewport.`;
}

export async function savePageAsPdf(): Promise<string> {
  const { page } = await getBrowserAndPage();
  const filePath = path.join(DOWNLOADS_DIR, `page_${Date.now()}.pdf`);
  console.log(`[BROWSER] Printing page layout to PDF: ${filePath}`);
  
  try {
    await page.pdf({ path: filePath, format: "A4" });
    return `Successfully printed page as PDF to: ${filePath}`;
  } catch (e: any) {
    const fallbackPath = path.join(SCREENSHOTS_DIR, `full_page_${Date.now()}.png`);
    await page.screenshot({ path: fallbackPath, fullPage: true });
    return `PDF print is only supported headlessly. Gracefully fell back to capturing full-page screenshot at: ${fallbackPath}`;
  }
}

export async function manageTabAction(action: "new" | "close" | "switch" | "list", index?: number): Promise<string> {
  const { browser } = await getBrowserAndPage();
  console.log(`[BROWSER-TABS] Performing tab action: ${action}`);

  const pages = await browser.pages();

  switch (action) {
    case "list": {
      const titles = await Promise.all(pages.map(async (p, i) => `[Tab ${i + 1}] ${await p.title()} (${p.url()})`));
      return `Open tabs list:\n${titles.join("\n")}`;
    }
    case "new": {
      activePage = await browser.newPage();
      return `Opened new browser tab. Total tabs: ${pages.length + 1}`;
    }
    case "close": {
      const idx = index !== undefined ? index - 1 : pages.indexOf(activePage!);
      if (idx >= 0 && idx < pages.length) {
        if (pages.length <= 1) {
          return "Close blocked: Cannot close the last remaining browser tab.";
        }
        await pages[idx].close();
        const remaining = await browser.pages();
        activePage = remaining[0];
        return `Closed tab successfully. Switching focus to first remaining tab.`;
      }
      return `ERROR: Invalid tab index specified.`;
    }
    case "switch": {
      const idx = index !== undefined ? index - 1 : 0;
      if (idx >= 0 && idx < pages.length) {
        activePage = pages[idx];
        await activePage.bringToFront();
        return `Switched focus successfully to Tab ${idx + 1}: "${await activePage.title()}"`;
      }
      return `ERROR: Invalid tab index specified.`;
    }
  }
}

export async function manageCookiesAction(action: "get" | "clear" | "set", name?: string, value?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER-COOKIES] Cookies action: ${action}`);

  if (action === "get") {
    const cookies = await page.cookies();
    const formatted = cookies.map(c => `${c.name}=${c.value} (Domain: ${c.domain})`).join("\n");
    return cookies.length > 0 ? `Active cookies:\n${formatted}` : "No active cookies found.";
  } else if (action === "clear") {
    const cookies = await page.cookies();
    await page.deleteCookie(...cookies);
    return "All page session cookies cleared successfully.";
  } else if (action === "set") {
    if (!name || !value) throw new Error("Name and Value parameters are required to set a cookie.");
    const url = page.url();
    const domain = new URL(url).hostname;
    await page.setCookie({ name, value, domain });
    return `Set cookie "${name}=${value}" successfully for domain "${domain}".`;
  }
  return "Unknown cookies action.";
}

export async function extractPageHtml(selector?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  if (selector) {
    console.log(`[BROWSER] Extracting HTML content from selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: 5000 });
    const html = await page.$eval(selector, el => el.innerHTML || "");
    return `HTML of "${selector}":\n${html.substring(0, 5000)}${html.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
  } else {
    console.log(`[BROWSER] Extracting full body HTML content`);
    const html = await page.content();
    return `Page HTML Content:\n${html.substring(0, 5000)}${html.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
  }
}
