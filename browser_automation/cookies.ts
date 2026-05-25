import { getBrowserAndPage } from "./engine";

export async function manageCookiesAction(
  action: "get" | "clear" | "set",
  name?: string,
  value?: string
): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER-COOKIES] Cookies action: ${action}`);

  if (action === "get") {
    const cookies = await page.cookies();
    const formatted = cookies.map((c) => `${c.name}=${c.value} (Domain: ${c.domain})`).join("\n");
    return cookies.length > 0 ? `Active cookies:\n${formatted}` : "No active cookies found.";
  }
  if (action === "clear") {
    const cookies = await page.cookies();
    await page.deleteCookie(...cookies);
    return "All page session cookies cleared successfully.";
  }
  if (action === "set") {
    if (!name || !value) throw new Error("Name and Value parameters are required to set a cookie.");
    const url = page.url();
    const domain = new URL(url).hostname;
    await page.setCookie({ name, value, domain });
    return `Set cookie "${name}=${value}" successfully for domain "${domain}".`;
  }
  return "Unknown cookies action.";
}
