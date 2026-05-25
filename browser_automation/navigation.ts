import { getBrowserAndPage } from "./engine";

function normalizeUrl(url: string): string {
  if (!/^https?:\/\//i.test(url)) {
    return `https://${url}`;
  }
  return url;
}

export async function navigate(url: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const targetUrl = normalizeUrl(url);
  console.log(`[BROWSER] Navigating to ${targetUrl}`);
  await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
  return `Navigated to ${targetUrl}`;
}

export async function searchGoogle(query: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  console.log(`[BROWSER] Google search: "${query}"`);
  await page.goto(searchUrl, { waitUntil: "domcontentloaded" });
  return `Searched Google for "${query}".`;
}

export async function getPageDetails(): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log("[BROWSER] Fetching current page details...");
  const title = await page.title();
  const url = page.url();
  const info = {
    title,
    url,
    secure: url.startsWith("https"),
    viewport: page.viewport(),
  };
  return `Page Details:\n${JSON.stringify(info, null, 2)}`;
}

export async function navigateHistory(action: "back" | "forward" | "reload"): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Navigating history: ${action}`);
  if (action === "back") {
    await page.goBack();
    return "Navigated back in history.";
  }
  if (action === "forward") {
    await page.goForward();
    return "Navigated forward in history.";
  }
  await page.reload();
  return "Refreshed/reloaded page.";
}

export async function waitForLoadState(state: "domcontentloaded" | "load" | "networkidle" = "domcontentloaded"): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Waiting for load state: ${state}`);
  if (state === "networkidle") {
    await page.waitForNetworkIdle({ idleTime: 800, timeout: 15000 });
    return "Page network idle detected.";
  }
  await page.waitForNavigation({ waitUntil: state, timeout: 15000 }).catch(() => null);
  return `Page load state reached: ${state}.`;
}

export async function getLoadingState(): Promise<string> {
  const { page } = await getBrowserAndPage();
  const readyState = await page.evaluate(() => document.readyState);
  return `Page loading state: ${readyState}`;
}
