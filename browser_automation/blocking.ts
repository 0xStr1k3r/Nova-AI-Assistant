import { getBrowserAndPage } from "./engine";

let interceptionActive = false;
let blockedResourceTypes = new Set<string>();

export async function blockResources(types: string[]): Promise<string> {
  const { page } = await getBrowserAndPage();

  if (types.length === 0 || (types.length === 1 && types[0] === "none")) {
    if (interceptionActive) {
      await page.setRequestInterception(false);
      page.removeAllListeners("request");
      interceptionActive = false;
    }
    blockedResourceTypes.clear();
    return "Cleared all resource blocking rules.";
  }

  blockedResourceTypes = new Set(types.map((t) => t.toLowerCase()));

  if (!interceptionActive) {
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      const url = req.url().toLowerCase();

      const shouldBlock =
        blockedResourceTypes.has(type) ||
        (blockedResourceTypes.has("image") && type === "image") ||
        (blockedResourceTypes.has("media") && type === "media") ||
        (blockedResourceTypes.has("font") && type === "font") ||
        (blockedResourceTypes.has("stylesheet") && type === "stylesheet") ||
        (blockedResourceTypes.has("ads") &&
          (url.includes("doubleclick") ||
            url.includes("google-analytics") ||
            url.includes("adservice") ||
            url.includes("adsystem") ||
            url.includes("adnxs") ||
            url.includes("adskeeper") ||
            url.includes("popads") ||
            url.includes("adsterra")));

      if (shouldBlock) {
        req.abort();
      } else {
        req.continue();
      }
    });
    interceptionActive = true;
  }
  return `Resource blocking updated. Active blocks: ${Array.from(blockedResourceTypes).join(", ")}`;
}
