import { runVisionToActionLoop } from "./vision-to-action";
import { captureDesktopContext, isEnvironmentReady, waitForEnvironment } from "./desktop-mapper";

/**
 * Base App Connector Framework
 * Provides common interface for all app-specific integrations
 */

export interface AppCommand {
  name: string;
  description: string;
  action: string;
  requiredApp?: string;
  timeout?: number;
}

export interface CommandResult {
  success: boolean;
  command: string;
  app: string;
  message: string;
  timestamp: number;
  executionTime: number;
}

export interface AppConnectorConfig {
  appName: string;
  appProcessNames: string[]; // Possible process/window names
  supportedCommands: AppCommand[];
  timeout?: number; // Default timeout in ms
}

/**
 * Base class for app connectors
 */
export class AppConnector {
  protected config: AppConnectorConfig;
  protected commandHistory: CommandResult[] = [];

  constructor(config: AppConnectorConfig) {
    this.config = config;
  }

  /**
   * Check if app is available
   */
  async isAvailable(): Promise<boolean> {
    return await isEnvironmentReady(this.config.appProcessNames[0]);
  }

  /**
   * Wait for app to be ready
   */
  async ensureReady(timeoutMs: number = 30000): Promise<boolean> {
    console.log(`[CONNECTOR] Ensuring ${this.config.appName} is ready...`);
    return await waitForEnvironment(this.config.appProcessNames[0], timeoutMs);
  }

  /**
   * Get supported commands
   */
  getSupportedCommands(): AppCommand[] {
    return this.config.supportedCommands;
  }

  /**
   * Execute app-specific command
   */
  async executeCommand(commandName: string, ...args: string[]): Promise<CommandResult> {
    const startTime = Date.now();

    try {
      const command = this.config.supportedCommands.find((c) => c.name === commandName);

      if (!command) {
        throw new Error(`Command not supported: ${commandName}`);
      }

      // Ensure app is ready
      if (command.requiredApp) {
        const ready = await this.ensureReady(command.timeout || this.config.timeout || 30000);
        if (!ready) {
          throw new Error(`${command.requiredApp} not ready within timeout`);
        }
      }

      // Build action with args
      let action = command.action;
      args.forEach((arg, i) => {
        action = action.replace(`{${i}}`, arg);
      });

      console.log(`[CONNECTOR] Executing ${this.config.appName}: ${commandName}`);

      // Execute via vision-to-action loop
      const result = await runVisionToActionLoop(action, 3);

      const executionTime = Date.now() - startTime;

      const cmdResult: CommandResult = {
        success: result.success,
        command: commandName,
        app: this.config.appName,
        message: result.verificationMessage,
        timestamp: Date.now(),
        executionTime,
      };

      this.commandHistory.push(cmdResult);
      console.log(`[CONNECTOR] ✅ ${commandName} completed in ${executionTime}ms`);
      return cmdResult;
    } catch (error: any) {
      const executionTime = Date.now() - startTime;

      const cmdResult: CommandResult = {
        success: false,
        command: commandName,
        app: this.config.appName,
        message: error.message,
        timestamp: Date.now(),
        executionTime,
      };

      this.commandHistory.push(cmdResult);
      console.error(`[CONNECTOR] ❌ ${commandName} failed: ${error.message}`);
      return cmdResult;
    }
  }

  /**
   * Get command execution history
   */
  getHistory(): CommandResult[] {
    return [...this.commandHistory];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCommands: number;
    successRate: number;
    averageExecutionTime: number;
    recentFailures: string[];
  } {
    const total = this.commandHistory.length;
    const successful = this.commandHistory.filter((c) => c.success).length;
    const successRate = total === 0 ? 0 : Math.round((successful / total) * 100);

    const avgTime =
      total === 0 ? 0 : Math.round(this.commandHistory.reduce((sum, c) => sum + c.executionTime, 0) / total);

    const recentFailures = this.commandHistory
      .filter((c) => !c.success)
      .slice(-5)
      .map((c) => `${c.command}: ${c.message}`);

    return {
      totalCommands: total,
      successRate,
      averageExecutionTime: avgTime,
      recentFailures,
    };
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.commandHistory = [];
  }
}

/**
 * Global connector registry
 */
const connectorRegistry = new Map<string, AppConnector>();

/**
 * Register connector
 */
export function registerConnector(connector: AppConnector, name: string): void {
  connectorRegistry.set(name, connector);
  console.log(`[CONNECTOR_REGISTRY] Registered: ${name}`);
}

/**
 * Get connector
 */
export function getConnector(name: string): AppConnector | null {
  return connectorRegistry.get(name) || null;
}

/**
 * List registered connectors
 */
export function listConnectors(): string[] {
  return Array.from(connectorRegistry.keys());
}

/**
 * Execute command on any connector
 */
export async function executeConnectorCommand(
  connectorName: string,
  command: string,
  ...args: string[]
): Promise<CommandResult> {
  const connector = getConnector(connectorName);

  if (!connector) {
    return {
      success: false,
      command,
      app: connectorName,
      message: `Connector not found: ${connectorName}`,
      timestamp: Date.now(),
      executionTime: 0,
    };
  }

  return connector.executeCommand(command, ...args);
}

/**
 * Get all connector statistics
 */
export function getAllConnectorStats(): Record<
  string,
  { totalCommands: number; successRate: number; averageExecutionTime: number }
> {
  const stats: Record<string, any> = {};

  connectorRegistry.forEach((connector, name) => {
    const connectorStats = connector.getStats();
    stats[name] = {
      totalCommands: connectorStats.totalCommands,
      successRate: connectorStats.successRate,
      averageExecutionTime: connectorStats.averageExecutionTime,
    };
  });

  return stats;
}
