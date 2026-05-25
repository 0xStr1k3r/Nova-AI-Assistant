import { getBrowserAndPage } from "./engine";

let dialogListenerAttached = false;

export async function autoAcceptDialogs(enable: boolean): Promise<string> {
  const { page } = await getBrowserAndPage();
  if (enable) {
    if (!dialogListenerAttached) {
      page.on("dialog", async (dialog) => {
        console.log(`[BROWSER-DIALOG] Auto-accepting dialog: ${dialog.message()}`);
        await dialog.accept();
      });
      dialogListenerAttached = true;
    }
    return "Enabled auto-accepting of all page dialogs.";
  } else {
    page.removeAllListeners("dialog");
    dialogListenerAttached = false;
    return "Disabled auto-accepting of page dialogs.";
  }
}
