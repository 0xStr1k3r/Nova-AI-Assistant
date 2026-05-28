import { AppConnector, AppCommand } from "../app-connector-base";

/**
 * Browser App Connector
 * Enables autonomous browser operations via vision-to-action loop
 */

export class BrowserConnector extends AppConnector {
  constructor() {
    super({
      appName: "Browser",
      appProcessNames: ["firefox", "Firefox", "chrome", "Chrome", "chromium", "brave"],
      timeout: 30000,
      supportedCommands: [
        {
          name: "navigate",
          description: "Navigate to URL or search",
          action: 'Click address bar, clear, type "{0}", press Enter, wait for page load',
          requiredApp: "firefox",
          timeout: 15000,
        },
        {
          name: "search",
          description: "Search for query",
          action: 'Navigate to Google, click search box, type "{0}", press Enter',
          requiredApp: "firefox",
          timeout: 12000,
        },
        {
          name: "click-link",
          description: "Click link with text",
          action: 'Find and click link with text "{0}"',
          requiredApp: "firefox",
          timeout: 10000,
        },
        {
          name: "fill-form",
          description: "Fill form field",
          action: 'Find input field for "{0}", click it, type "{1}"',
          requiredApp: "firefox",
          timeout: 8000,
        },
        {
          name: "submit-form",
          description: "Find and click submit button",
          action: 'Find form button "{0}", click it, wait for result',
          requiredApp: "firefox",
          timeout: 12000,
        },
        {
          name: "scroll-page",
          description: "Scroll page in direction",
          action: 'Scroll page {0} by {1} pixels',
          requiredApp: "firefox",
          timeout: 5000,
        },
        {
          name: "take-screenshot",
          description: "Take screenshot of page",
          action: "Take screenshot of current page, save with name {0}",
          requiredApp: "firefox",
          timeout: 5000,
        },
        {
          name: "extract-text",
          description: "Extract visible text from page",
          action: "Analyze current page, extract all visible text and headers",
          requiredApp: "firefox",
          timeout: 8000,
        },
        {
          name: "click-button",
          description: "Click button with text",
          action: 'Find and click button with text "{0}"',
          requiredApp: "firefox",
          timeout: 8000,
        },
        {
          name: "go-back",
          description: "Go back to previous page",
          action: "Press Alt+Left arrow or click back button",
          requiredApp: "firefox",
          timeout: 10000,
        },
        {
          name: "go-forward",
          description: "Go forward to next page",
          action: "Press Alt+Right arrow or click forward button",
          requiredApp: "firefox",
          timeout: 10000,
        },
        {
          name: "refresh-page",
          description: "Refresh current page",
          action: "Press Ctrl+R to refresh page",
          requiredApp: "firefox",
          timeout: 12000,
        },
      ],
    });
  }

  /**
   * High-level API: Navigate
   */
  async navigate(url: string): Promise<boolean> {
    const result = await this.executeCommand("navigate", url);
    return result.success;
  }

  /**
   * High-level API: Search
   */
  async search(query: string): Promise<boolean> {
    const result = await this.executeCommand("search", query);
    return result.success;
  }

  /**
   * High-level API: Click link
   */
  async clickLink(linkText: string): Promise<boolean> {
    const result = await this.executeCommand("click-link", linkText);
    return result.success;
  }

  /**
   * High-level API: Fill form field
   */
  async fillField(fieldName: string, value: string): Promise<boolean> {
    const result = await this.executeCommand("fill-form", fieldName, value);
    return result.success;
  }

  /**
   * High-level API: Submit form
   */
  async submitForm(buttonText: string): Promise<boolean> {
    const result = await this.executeCommand("submit-form", buttonText);
    return result.success;
  }

  /**
   * High-level API: Scroll
   */
  async scroll(direction: "up" | "down", pixels: number): Promise<boolean> {
    const result = await this.executeCommand("scroll-page", direction, pixels.toString());
    return result.success;
  }

  /**
   * High-level API: Take screenshot
   */
  async takeScreenshot(filename: string): Promise<boolean> {
    const result = await this.executeCommand("take-screenshot", filename);
    return result.success;
  }

  /**
   * High-level API: Extract text
   */
  async extractText(): Promise<boolean> {
    const result = await this.executeCommand("extract-text");
    return result.success;
  }

  /**
   * High-level API: Click button
   */
  async clickButton(buttonText: string): Promise<boolean> {
    const result = await this.executeCommand("click-button", buttonText);
    return result.success;
  }

  /**
   * High-level API: Go back
   */
  async goBack(): Promise<boolean> {
    const result = await this.executeCommand("go-back");
    return result.success;
  }

  /**
   * High-level API: Go forward
   */
  async goForward(): Promise<boolean> {
    const result = await this.executeCommand("go-forward");
    return result.success;
  }

  /**
   * High-level API: Refresh page
   */
  async refreshPage(): Promise<boolean> {
    const result = await this.executeCommand("refresh-page");
    return result.success;
  }
}

// Export singleton instance
export const browserConnector = new BrowserConnector();
