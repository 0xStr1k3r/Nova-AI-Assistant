import puppeteer, { Browser, Page } from "puppeteer-core";
import * as fs from "fs";
import * as path from "path";

const SCREENSHOTS_DIR = "/home/chiru/.config/nova-voice-assistant/screenshots";
const DOWNLOADS_DIR = "/home/chiru/.config/nova-voice-assistant/downloads";

let activeBrowser: Browser | null = null;
let activePage: Page | null = null;

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

ensureDir(SCREENSHOTS_DIR);
ensureDir(DOWNLOADS_DIR);

export function getActivePage(): Page | null {
  return activePage;
}

export function setActivePage(page: Page | null) {
  activePage = page;
}

export function getPaths() {
  return { SCREENSHOTS_DIR, DOWNLOADS_DIR };
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
      "--autoplay-policy=no-user-gesture-required",
    ],
  });

  const pages = await activeBrowser.pages();
  activePage = pages.length > 0 ? pages[0] : await activeBrowser.newPage();

  return { browser: activeBrowser, page: activePage };
}

export async function getBrowser(): Promise<Browser> {
  const { browser } = await getBrowserAndPage();
  return browser;
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
