import { getBrowserAndPage } from "../engine";

type Point = { x: number; y: number };

const DEFAULT_TYPE_DELAY = { min: 40, max: 140 };
const DEFAULT_MOVE_JITTER = 2;
const DEFAULT_SCROLL_DELAY = { min: 120, max: 280 };

let lastMousePosition: Point = { x: 0, y: 0 };

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function jitter(value: number, amount: number) {
  return value + rand(-amount, amount);
}

function distance(a: Point, b: Point) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function moveMouseSmooth(to: Point, jitterAmount = DEFAULT_MOVE_JITTER) {
  const { page } = await getBrowserAndPage();
  const from = lastMousePosition;
  const dist = distance(from, to);
  const steps = Math.max(12, Math.min(48, Math.round(dist / 12)));

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t * (2 - t);
    const x = jitter(from.x + (to.x - from.x) * ease, jitterAmount);
    const y = jitter(from.y + (to.y - from.y) * ease, jitterAmount);
    await page.mouse.move(x, y);
    await sleep(rand(6, 18));
  }

  lastMousePosition = { x: to.x, y: to.y };
}

async function getElementCenter(selector: string): Promise<Point> {
  const { page } = await getBrowserAndPage();
  await page.waitForSelector(selector, { timeout: 6000 });
  const handle = await page.$(selector);
  const box = handle ? await handle.boundingBox() : null;
  if (!box) {
    throw new Error(`Unable to compute bounding box for selector "${selector}".`);
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

export async function moveMouseTo(x: number, y: number): Promise<void> {
  await moveMouseSmooth({ x, y });
}

export async function clickAt(x: number, y: number): Promise<void> {
  const { page } = await getBrowserAndPage();
  await moveMouseSmooth({ x, y });
  await page.mouse.down();
  await sleep(rand(40, 120));
  await page.mouse.up();
}

export async function moveMouse(selector: string): Promise<string> {
  const center = await getElementCenter(selector);
  await moveMouseSmooth(center);
  return `Moved mouse to element: "${selector}"`;
}

export async function clickElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const center = await getElementCenter(selector);
  await moveMouseSmooth(center);
  await page.mouse.down();
  await sleep(rand(40, 120));
  await page.mouse.up();
  return `Clicked element matching selector: "${selector}"`;
}

export async function rightClickElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const center = await getElementCenter(selector);
  await moveMouseSmooth(center);
  await page.mouse.click(center.x, center.y, { button: "right" });
  return `Right-clicked element matching selector: "${selector}"`;
}

export async function doubleClickElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const center = await getElementCenter(selector);
  await moveMouseSmooth(center);
  await page.mouse.click(center.x, center.y);
  await sleep(rand(60, 140));
  await page.mouse.click(center.x, center.y);
  return `Double-clicked element matching selector: "${selector}"`;
}

export async function hoverElement(selector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  await page.waitForSelector(selector, { timeout: 6000 });
  await page.hover(selector);
  return `Successfully hovered cursor over element matching: "${selector}"`;
}

export async function typeText(selector: string, text: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Typing text into selector ${selector}`);
  await page.waitForSelector(selector, { timeout: 6000 });
  await page.click(selector);
  await page.click(selector);
  await page.click(selector);
  await page.keyboard.press("Backspace");

  for (const char of text) {
    await page.keyboard.type(char, { delay: rand(DEFAULT_TYPE_DELAY.min, DEFAULT_TYPE_DELAY.max) });
  }

  return `Successfully typed text inside input matching selector: "${selector}"`;
}

export async function pressKeyboardKey(key: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Pressing keyboard key: ${key}`);
  await page.keyboard.press(key as any);
  return `Pressed key "${key}" inside page viewport.`;
}

export async function pressShortcut(keys: string[]): Promise<string> {
  const { page } = await getBrowserAndPage();
  for (const key of keys) {
    await page.keyboard.down(key as any);
  }
  for (const key of keys.slice().reverse()) {
    await page.keyboard.up(key as any);
  }
  return `Pressed shortcut: ${keys.join("+")}`;
}

export async function scrollPage(direction: "up" | "down", amount?: number): Promise<string> {
  const { page } = await getBrowserAndPage();
  const scrollAmount = amount || 500;
  const delta = direction === "down" ? scrollAmount : -scrollAmount;
  console.log(`[BROWSER] Smooth scrolling ${direction} by ${scrollAmount}px`);
  await page.evaluate((scrollDelta) => {
    window.scrollBy({ top: scrollDelta, behavior: "smooth" });
  }, delta);
  await sleep(rand(DEFAULT_SCROLL_DELAY.min, DEFAULT_SCROLL_DELAY.max));
  return `Scrolled page ${direction} by ${scrollAmount} pixels.`;
}

export async function dragAndDrop(sourceSelector: string, targetSelector: string): Promise<string> {
  const { page } = await getBrowserAndPage();
  const source = await getElementCenter(sourceSelector);
  const target = await getElementCenter(targetSelector);

  await moveMouseSmooth(source);
  await page.mouse.down();
  await sleep(rand(80, 160));
  await moveMouseSmooth(target, 1);
  await sleep(rand(60, 140));
  await page.mouse.up();

  return `Dragged element "${sourceSelector}" to "${targetSelector}".`;
}
