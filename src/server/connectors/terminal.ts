import { AppConnector, AppCommand } from "../app-connector-base";

/**
 * Terminal App Connector
 * Enables autonomous terminal operations via vision-to-action loop
 */

export class TerminalConnector extends AppConnector {
  constructor() {
    super({
      appName: "Terminal",
      appProcessNames: ["terminal", "Terminal", "bash", "zsh", "sh", "cmd"],
      timeout: 30000,
      supportedCommands: [
        {
          name: "run-command",
          description: "Run a shell command",
          action: 'Click terminal, type "{0}", press Enter, wait for completion',
          requiredApp: "terminal",
          timeout: 15000,
        },
        {
          name: "list-files",
          description: "List files in current directory",
          action: 'Run command: ls -la, take screenshot of output',
          requiredApp: "terminal",
          timeout: 8000,
        },
        {
          name: "navigate-directory",
          description: "Change directory",
          action: 'Run command: cd {0}, verify location change',
          requiredApp: "terminal",
          timeout: 8000,
        },
        {
          name: "install-package",
          description: "Install package using package manager",
          action: 'Run: {0} install {1}, wait for completion',
          requiredApp: "terminal",
          timeout: 60000,
        },
        {
          name: "check-status",
          description: "Check process/service status",
          action: 'Run command: systemctl status {0}, review output',
          requiredApp: "terminal",
          timeout: 10000,
        },
        {
          name: "kill-process",
          description: "Terminate a running process",
          action: 'Run command: pkill -f "{0}", verify termination',
          requiredApp: "terminal",
          timeout: 8000,
        },
        {
          name: "view-logs",
          description: "View system or application logs",
          action: 'Run command: tail -f {0}, review recent logs',
          requiredApp: "terminal",
          timeout: 10000,
        },
        {
          name: "git-operation",
          description: "Run git command",
          action: 'Run command: git {0}, verify result',
          requiredApp: "terminal",
          timeout: 15000,
        },
        {
          name: "docker-command",
          description: "Run docker command",
          action: 'Run command: docker {0}, wait for completion',
          requiredApp: "terminal",
          timeout: 30000,
        },
        {
          name: "python-script",
          description: "Run Python script",
          action: 'Run command: python3 {0}, capture output',
          requiredApp: "terminal",
          timeout: 20000,
        },
      ],
    });
  }

  /**
   * High-level API: Run command
   */
  async runCommand(command: string): Promise<boolean> {
    const result = await this.executeCommand("run-command", command);
    return result.success;
  }

  /**
   * High-level API: List files
   */
  async listFiles(): Promise<boolean> {
    const result = await this.executeCommand("list-files");
    return result.success;
  }

  /**
   * High-level API: Navigate directory
   */
  async navigateTo(directory: string): Promise<boolean> {
    const result = await this.executeCommand("navigate-directory", directory);
    return result.success;
  }

  /**
   * High-level API: Install package
   */
  async installPackage(packageManager: string, packageName: string): Promise<boolean> {
    const result = await this.executeCommand("install-package", packageManager, packageName);
    return result.success;
  }

  /**
   * High-level API: Check status
   */
  async checkStatus(serviceName: string): Promise<boolean> {
    const result = await this.executeCommand("check-status", serviceName);
    return result.success;
  }

  /**
   * High-level API: Kill process
   */
  async killProcess(processName: string): Promise<boolean> {
    const result = await this.executeCommand("kill-process", processName);
    return result.success;
  }

  /**
   * High-level API: View logs
   */
  async viewLogs(logPath: string): Promise<boolean> {
    const result = await this.executeCommand("view-logs", logPath);
    return result.success;
  }

  /**
   * High-level API: Git operation
   */
  async gitCommand(gitCommand: string): Promise<boolean> {
    const result = await this.executeCommand("git-operation", gitCommand);
    return result.success;
  }

  /**
   * High-level API: Docker command
   */
  async dockerCommand(dockerCommand: string): Promise<boolean> {
    const result = await this.executeCommand("docker-command", dockerCommand);
    return result.success;
  }

  /**
   * High-level API: Run Python script
   */
  async runPythonScript(scriptPath: string): Promise<boolean> {
    const result = await this.executeCommand("python-script", scriptPath);
    return result.success;
  }
}

// Export singleton instance
export const terminalConnector = new TerminalConnector();
