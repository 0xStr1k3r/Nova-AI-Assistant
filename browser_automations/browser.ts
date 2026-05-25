import puppeteer, { Browser, Page } from "puppeteer-core";
import * as path from "path";
import * as fs from "fs";

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;
const SCREENSHOTS_DIR = "/home/chiru/.config/nova-voice-assistant/screenshots";

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

export async function getBrowserAndPage(): Promise<{ browser: Browser; page: Page }> {
  if (activeBrowser && activePage) {
    // Check if browser connection is still active
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
  
  // Set default environmental variables to run inside graphical desktop
  process.env.DISPLAY = process.env.DISPLAY || ":0";
  
  activeBrowser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    headless: false, // Runs visibly on the user's desktop!
    defaultViewport: null, // Full viewport size
    args: [
      "--start-maximized", 
      "--no-sandbox", 
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required" // Allows videos/songs to autoplay instantly!
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
  
  // Clear existing input before typing
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
  
  // YouTube video thumb link selector
  const videoThumbSelector = "ytd-video-renderer a#thumbnail";
  console.log("[BROWSER-YOUTUBE] Waiting for search results to load...");
  await page.waitForSelector(videoThumbSelector, { timeout: 8000 });
  
  console.log("[BROWSER-YOUTUBE] Clicking first video result link to start playback...");
  await page.click(videoThumbSelector);
  
  return `YouTube query search succeeded. Auto-playing first video result for: "${query}"`;
}
