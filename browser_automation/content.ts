import * as path from "path";
import { getBrowserAndPage, getPaths } from "./engine";

export async function captureScreenshotFile(fullPage = false): Promise<string> {
  const { page } = await getBrowserAndPage();
  const { SCREENSHOTS_DIR } = getPaths();
  const filePath = path.join(SCREENSHOTS_DIR, `screenshot_${Date.now()}.png`);
  console.log(`[BROWSER] Capturing screenshot to ${filePath}`);
  await page.screenshot({ path: filePath, fullPage });
  return filePath;
}

export async function captureScreenshot(): Promise<string> {
  const filePath = await captureScreenshotFile(false);
  return `Captured viewport screenshot and saved to: ${filePath}`;
}

export async function captureScreenshotBase64(fullPage = false): Promise<string> {
  const { page } = await getBrowserAndPage();
  const base64 = await page.screenshot({ encoding: "base64", fullPage });
  return base64;
}

export async function extractPageText(selector?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  if (selector) {
    console.log(`[BROWSER] Extracting text from selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: 5000 });
    const text = await page.$eval(selector, (el) => el.textContent || "");
    return `Text content of "${selector}":\n${text.trim()}`;
  }
  console.log(`[BROWSER] Extracting all visible page body text`);
  const text = await page.$eval("body", (el) => el.innerText || "");
  return `Visible Page Text Content:\n${text.substring(0, 5000).trim()}${text.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
}

export async function extractPageLinks(): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Extracting all active hyperlinks on the page`);
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("a"))
      .map((a) => ({
        text: a.innerText?.trim() || "",
        href: a.href || "",
      }))
      .filter((l) => l.text.length > 0 && l.href.startsWith("http"));
  });

  const formatted = links
    .slice(0, 30)
    .map((l, i) => `[${i + 1}] ${l.text} -> ${l.href}`)
    .join("\n");
  return `Top ${Math.min(30, links.length)} clickable page links:\n${formatted}`;
}

export async function extractPageHtml(selector?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  if (selector) {
    console.log(`[BROWSER] Extracting HTML content from selector: ${selector}`);
    await page.waitForSelector(selector, { timeout: 5000 });
    const html = await page.$eval(selector, (el) => el.innerHTML || "");
    return `HTML of "${selector}":\n${html.substring(0, 5000)}${html.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
  }
  console.log(`[BROWSER] Extracting full body HTML content`);
  const html = await page.content();
  return `Page HTML Content:\n${html.substring(0, 5000)}${html.length > 5000 ? "\n...[TRUNCATED]" : ""}`;
}

export async function savePageAsPdf(): Promise<string> {
  const { page } = await getBrowserAndPage();
  const { DOWNLOADS_DIR, SCREENSHOTS_DIR } = getPaths();
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
