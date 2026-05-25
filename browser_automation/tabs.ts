import { getBrowserAndPage, getActivePage, setActivePage } from "./engine";

export async function listTabs(): Promise<string> {
  const { browser } = await getBrowserAndPage();
  const pages = await browser.pages();
  const titles = await Promise.all(
    pages.map(async (p, i) => `[Tab ${i + 1}] ${await p.title()} (${p.url()})`)
  );
  return `Open tabs list:\n${titles.join("\n")}`;
}

export async function openNewTab(url?: string): Promise<string> {
  const { browser } = await getBrowserAndPage();
  const page = await browser.newPage();
  setActivePage(page);
  if (url) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return `Opened new tab and navigated to ${url}`;
  }
  return "Opened new browser tab.";
}

export async function switchTabByIndex(index: number): Promise<string> {
  const { browser } = await getBrowserAndPage();
  const pages = await browser.pages();
  const idx = index - 1;
  if (idx < 0 || idx >= pages.length) {
    return "ERROR: Invalid tab index specified.";
  }
  const page = pages[idx];
  setActivePage(page);
  await page.bringToFront();
  return `Switched focus successfully to Tab ${idx + 1}: "${await page.title()}"`;
}

export async function switchTabByTitle(title: string): Promise<string> {
  const { browser } = await getBrowserAndPage();
  const pages = await browser.pages();
  const lower = title.toLowerCase();
  for (const page of pages) {
    const tabTitle = (await page.title()).toLowerCase();
    if (tabTitle.includes(lower)) {
      setActivePage(page);
      await page.bringToFront();
      return `Switched to tab titled "${await page.title()}".`;
    }
  }
  return `ERROR: No tab found matching title "${title}".`;
}

export async function closeTab(index?: number): Promise<string> {
  const { browser } = await getBrowserAndPage();
  const pages = await browser.pages();
  if (pages.length <= 1) {
    return "Close blocked: Cannot close the last remaining browser tab.";
  }
  const active = getActivePage();
  const idx = index !== undefined ? index - 1 : pages.indexOf(active!);
  if (idx < 0 || idx >= pages.length) {
    return "ERROR: Invalid tab index specified.";
  }
  await pages[idx].close();
  const remaining = await browser.pages();
  setActivePage(remaining[0]);
  return "Closed tab successfully. Switching focus to first remaining tab.";
}

export async function manageTabAction(action: "new" | "close" | "switch" | "list", index?: number): Promise<string> {
  console.log(`[BROWSER-TABS] Performing tab action: ${action}`);
  switch (action) {
    case "list":
      return listTabs();
    case "new":
      return openNewTab();
    case "close":
      return closeTab(index);
    case "switch":
      if (!index) return "ERROR: tabIndex is required for switching tabs.";
      return switchTabByIndex(index);
    default:
      return "ERROR: Unknown tab action.";
  }
}
