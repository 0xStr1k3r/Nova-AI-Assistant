import { getBrowserAndPage } from "./engine";

export async function clickNextButton(): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log("[BROWSER] Intelligently searching for Next Page link/button...");

  const result = await page.evaluate(() => {
    const nextSelectors = [
      'a[rel="next"]',
      "a.next",
      "button.next",
      ".next a",
      ".next button",
      'a[aria-label*="next" i]',
      'a[aria-label*="Next" i]',
      'button[aria-label*="next" i]',
      'button[aria-label*="Next" i]',
      ".pagination-next",
      ".pagination__next",
      ".page-next",
      '[title*="Next" i]',
    ];

    for (const sel of nextSelectors) {
      const el = document.querySelector(sel) as HTMLElement;
      if (el && typeof el.click === "function") {
        el.click();
        return `Successfully clicked next page element matching selector: "${sel}"`;
      }
    }

    const interactiveElements = Array.from(document.querySelectorAll("a, button, [role='button']")) as HTMLElement[];
    const nextTextRegex = /^(next|next page|>|→|»|forward)$/i;

    for (const el of interactiveElements) {
      const text = (el.innerText || el.textContent || "").trim();
      if (nextTextRegex.test(text) && typeof el.click === "function") {
        el.click();
        return `Successfully clicked next page element containing text: "${text}"`;
      }
    }

    for (const el of interactiveElements) {
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      if (text.includes("next") && text.length < 15 && typeof el.click === "function") {
        el.click();
        return `Successfully clicked next page element containing phrase: "${el.innerText.trim()}"`;
      }
    }

    return "ERROR: Could not find any high-confidence 'Next' buttons or pagination links on this page.";
  });

  return result;
}
