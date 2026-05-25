export { getBrowserAndPage, getBrowser, closeBrowser } from "./engine";
export { navigate, searchGoogle, getPageDetails, navigateHistory, waitForLoadState, getLoadingState } from "./navigation";
export { captureScreenshot, captureScreenshotBase64, extractPageText, extractPageLinks, extractPageHtml, savePageAsPdf } from "./content";
export { clickElement, rightClickElement, doubleClickElement, hoverElement, typeText, pressKeyboardKey, pressShortcut, scrollPage, dragAndDrop, moveMouse } from "./input/human";
export { manageTabAction, listTabs, openNewTab, switchTabByIndex, switchTabByTitle, closeTab } from "./tabs";
export { manageCookiesAction } from "./cookies";
export { playYoutubeQuery, controlMedia, adjustSystemVolume } from "./media";
export { evaluateJs } from "./scripts";
export { clickNextButton } from "./pagination";
export { addBookmark, listBookmarks, removeBookmark, setPreference, getPreference } from "./memory";
export { capturePageScreenshotBase64 } from "./vision";
export { clickByText, getVisualMap, smartClick } from "./understanding";
export { extractOcrText, clickByOcrText } from "./vision/ocr";
export { blockResources } from "./blocking";
export { configureStealthAndAgent } from "./stealth";
export { autoAcceptDialogs } from "./dialogs";
export { autoScrollPage } from "./scrolling";
export { extractTableData } from "./tables";

