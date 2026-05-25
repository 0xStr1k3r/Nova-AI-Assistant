import { getBrowserAndPage } from "./engine";
import { clickByOcrText } from "./vision/ocr";

type VisualElement = {
  label: string;
  tag: string;
  role: string;
  type: string;
  rect: { x: number; y: number; width: number; height: number };
};

export async function clickByText(label: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const target = label.trim().toLowerCase();
  console.log(`[BROWSER] Attempting semantic click for label: "${label}"`);

  const result = await page.evaluate((needle) => {
    const candidates = Array.from(
      document.querySelectorAll("button, a, [role='button'], input[type='button'], input[type='submit']")
    ) as HTMLElement[];

    let best: { score: number; element: HTMLElement | null; text: string } = {
      score: 0,
      element: null,
      text: "",
    };

    for (const el of candidates) {
      const text = (el.innerText || el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").trim().toLowerCase();
      const value = (el as HTMLInputElement).value?.trim().toLowerCase() || "";
      const combined = [text, aria, value].filter(Boolean);
      if (combined.length === 0) continue;

      for (const token of combined) {
        if (token === needle) {
          best = { score: 100, element: el, text: token };
          break;
        }
        if (token.includes(needle)) {
          const score = 60 + Math.min(30, needle.length);
          if (score > best.score) {
            best = { score, element: el, text: token };
          }
        }
      }
      if (best.score === 100) break;
    }

    if (!best.element) {
      return { ok: false, message: "No matching clickable element found." };
    }
    (best.element as HTMLElement).click();
    return { ok: true, message: `Clicked element labeled "${best.text}".` };
  }, target);

  return result.ok ? result.message : `ERROR: ${result.message}`;
}

export async function getVisualMap(limit = 80): Promise<string> {
  const { page } = await getBrowserAndPage();
  const result = await page.evaluate((maxItems) => {
    const candidates = Array.from(
      document.querySelectorAll(
        "button, a, [role='button'], input, select, textarea, [role='link'], [role='menuitem']"
      )
    ) as HTMLElement[];

    const elements: VisualElement[] = [];

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) continue;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        continue;
      }

      const text = (el.innerText || el.textContent || "").trim();
      const aria = (el.getAttribute("aria-label") || "").trim();
      const alt = (el.getAttribute("alt") || "").trim();
      const placeholder = (el.getAttribute("placeholder") || "").trim();
      const value = (el as HTMLInputElement).value?.trim() || "";
      const label = [text, aria, alt, placeholder, value].find((t) => t.length > 0) || "";

      elements.push({
        label,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute("role") || "",
        type: (el as HTMLInputElement).type || "",
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      });

      if (elements.length >= maxItems) break;
    }

    return elements;
  }, limit);

  return `Visual Map (${result.length} elements):\n${JSON.stringify(result, null, 2)}`;
}

export async function smartClick(label: string): Promise<string> {
  const domResult = await clickByText(label);
  if (!domResult.startsWith("ERROR:")) {
    return domResult;
  }
  const ocrResult = await clickByOcrText(label);
  if (!ocrResult.startsWith("ERROR:")) {
    return `${domResult} | Fallback OCR success: ${ocrResult}`;
  }
  return `${domResult} | OCR fallback failed: ${ocrResult}`;
}
