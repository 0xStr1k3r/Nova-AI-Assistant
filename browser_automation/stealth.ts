import { getBrowserAndPage } from "./engine";

export async function configureStealthAndAgent(userAgent?: string, acceptLanguage?: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const ua = userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const lang = acceptLanguage || "en-US,en;q=0.9";
  
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders({
    "Accept-Language": lang,
  });
  
  // Basic navigator web driver evasion
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });
  
  return `Configured User-Agent to "${ua}" and Accept-Language header to "${lang}". Webdriver flag hidden.`;
}
