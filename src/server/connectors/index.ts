/**
 * App Connectors Index
 * Central registry for all application connectors
 */

import { registerConnector } from "../app-connector-base";
import { slackConnector } from "./slack";
import { vsCodeConnector } from "./vscode";
import { discordConnector } from "./discord";
import { terminalConnector } from "./terminal";
import { browserConnector } from "./browser";

/**
 * Initialize all connectors
 * Call this at server startup
 */
export function initializeConnectors(): void {
  console.log("[CONNECTORS] Initializing all app connectors...");

  registerConnector(slackConnector, "slack");
  registerConnector(vsCodeConnector, "vscode");
  registerConnector(discordConnector, "discord");
  registerConnector(terminalConnector, "terminal");
  registerConnector(browserConnector, "browser");

  console.log("[CONNECTORS] ✅ All connectors registered (5 total)");
}

// Export individual connectors
export { slackConnector } from "./slack";
export { vsCodeConnector } from "./vscode";
export { discordConnector } from "./discord";
export { terminalConnector } from "./terminal";
export { browserConnector } from "./browser";

// Re-export base framework
export { AppConnector, AppCommand, CommandResult, AppConnectorConfig } from "../app-connector-base";
export {
  registerConnector,
  getConnector,
  listConnectors,
  executeConnectorCommand,
  getAllConnectorStats,
} from "../app-connector-base";
