import { getBrowserAndPage } from "./engine";

export async function capturePageScreenshotBase64(fullPage = false): Promise<string> {
  const { page } = await getBrowserAndPage();
  const base64 = await page.screenshot({ encoding: "base64", fullPage });
  return base64;
}
