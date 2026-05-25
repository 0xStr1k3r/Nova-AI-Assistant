import { getBrowserAndPage } from "./engine";

export async function autoScrollPage(maxScrolls?: number, delayMs?: number): Promise<string> {
  const { page } = await getBrowserAndPage();
  const limit = maxScrolls || 10;
  const delay = delayMs || 800;
  console.log(`[BROWSER-SCROLL] Initiating auto-scroll to bottom (limit=${limit}, delay=${delay}ms)`);

  const scrolledCycles = await page.evaluate(async (maxCycles, sleepTime) => {
    let cycles = 0;
    let lastHeight = document.body.scrollHeight;
    
    while (cycles < maxCycles) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(resolve => setTimeout(resolve, sleepTime));
      
      let newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        window.scrollBy(0, -100);
        await new Promise(resolve => setTimeout(resolve, 200));
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, sleepTime));
        newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight) {
          break;
        }
      }
      lastHeight = newHeight;
      cycles++;
    }
    return cycles;
  }, limit, delay);

  return `Auto-scroll completed. Scrolled down ${scrolledCycles} times.`;
}
