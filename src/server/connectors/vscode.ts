import { AppConnector, AppCommand } from "../app-connector-base";

/**
 * VS Code App Connector
 * Enables autonomous VS Code operations via vision-to-action loop
 */

export class VSCodeConnector extends AppConnector {
  constructor() {
    super({
      appName: "VS Code",
      appProcessNames: ["code", "Code", "VS Code"],
      timeout: 30000,
      supportedCommands: [
        {
          name: "open-file",
          description: "Open a file by name",
          action: 'Press Ctrl+P, type "{0}", press Enter',
          requiredApp: "code",
          timeout: 8000,
        },
        {
          name: "go-to-line",
          description: "Go to specific line number",
          action: 'Press Ctrl+G, type "{0}", press Enter',
          requiredApp: "code",
          timeout: 5000,
        },
        {
          name: "search-text",
          description: "Search for text in files",
          action: 'Press Ctrl+Shift+F, type "{0}", review results',
          requiredApp: "code",
          timeout: 10000,
        },
        {
          name: "find-replace",
          description: "Find and replace text",
          action: 'Press Ctrl+H, type "{0}" in find, type "{1}" in replace, click Replace All',
          requiredApp: "code",
          timeout: 12000,
        },
        {
          name: "open-terminal",
          description: "Open integrated terminal",
          action: 'Press Ctrl+`, run command: "{0}"',
          requiredApp: "code",
          timeout: 10000,
        },
        {
          name: "git-commit",
          description: "Stage and commit changes",
          action: 'Open Source Control, stage changes, type message "{0}", press Ctrl+Enter',
          requiredApp: "code",
          timeout: 15000,
        },
        {
          name: "format-document",
          description: "Format current document",
          action: "Press Ctrl+Shift+I to format, verify formatting applied",
          requiredApp: "code",
          timeout: 8000,
        },
        {
          name: "run-debug",
          description: "Start debugging",
          action: "Press F5 to start debug session, set breakpoint at {0}",
          requiredApp: "code",
          timeout: 10000,
        },
        {
          name: "install-extension",
          description: "Install VS Code extension",
          action: 'Press Ctrl+Shift+X, search "{0}", click Install',
          requiredApp: "code",
          timeout: 20000,
        },
        {
          name: "open-settings",
          description: "Open VS Code settings",
          action: "Press Ctrl+, to open settings, search for {0}",
          requiredApp: "code",
          timeout: 8000,
        },
      ],
    });
  }

  /**
   * High-level API: Open file
   */
  async openFile(filename: string): Promise<boolean> {
    const result = await this.executeCommand("open-file", filename);
    return result.success;
  }

  /**
   * High-level API: Go to line
   */
  async goToLine(lineNumber: number): Promise<boolean> {
    const result = await this.executeCommand("go-to-line", lineNumber.toString());
    return result.success;
  }

  /**
   * High-level API: Search
   */
  async searchText(query: string): Promise<boolean> {
    const result = await this.executeCommand("search-text", query);
    return result.success;
  }

  /**
   * High-level API: Find and Replace
   */
  async findReplace(findText: string, replaceText: string): Promise<boolean> {
    const result = await this.executeCommand("find-replace", findText, replaceText);
    return result.success;
  }

  /**
   * High-level API: Open terminal and run command
   */
  async runCommand(command: string): Promise<boolean> {
    const result = await this.executeCommand("open-terminal", command);
    return result.success;
  }

  /**
   * High-level API: Commit changes
   */
  async gitCommit(message: string): Promise<boolean> {
    const result = await this.executeCommand("git-commit", message);
    return result.success;
  }

  /**
   * High-level API: Format document
   */
  async formatDocument(): Promise<boolean> {
    const result = await this.executeCommand("format-document");
    return result.success;
  }

  /**
   * High-level API: Start debugging
   */
  async startDebug(breakpointLocation?: string): Promise<boolean> {
    const result = await this.executeCommand("run-debug", breakpointLocation || "main");
    return result.success;
  }

  /**
   * High-level API: Install extension
   */
  async installExtension(extensionName: string): Promise<boolean> {
    const result = await this.executeCommand("install-extension", extensionName);
    return result.success;
  }

  /**
   * High-level API: Open settings
   */
  async openSettings(searchTerm?: string): Promise<boolean> {
    const result = await this.executeCommand("open-settings", searchTerm || "extensions");
    return result.success;
  }
}

// Export singleton instance
export const vsCodeConnector = new VSCodeConnector();
