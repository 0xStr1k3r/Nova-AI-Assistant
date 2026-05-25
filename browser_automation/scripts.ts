import { getBrowserAndPage } from "./engine";

export async function evaluateJs(code: string): Promise<any> {
  const { page } = await getBrowserAndPage();
  console.log(`[BROWSER] Evaluating custom JS code in page context`);
  const result = await page.evaluate((jsCode) => {
    try {
      // eslint-disable-next-line no-eval
      return eval(jsCode);
    } catch (e: any) {
      return `ERROR: ${e.message}`;
    }
  }, code);
  return typeof result === "object" ? JSON.stringify(result) : String(result);
}
