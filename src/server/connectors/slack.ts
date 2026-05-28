import { AppConnector, AppCommand } from "../app-connector-base";

/**
 * Slack App Connector
 * Enables autonomous Slack operations via vision-to-action loop
 */

export class SlackConnector extends AppConnector {
  constructor() {
    super({
      appName: "Slack",
      appProcessNames: ["Slack", "slack"],
      timeout: 30000,
      supportedCommands: [
        {
          name: "send-message",
          description: "Send message to a channel or user",
          action: 'Open Slack, navigate to {0}, click message box, type "{1}", press Enter',
          requiredApp: "Slack",
          timeout: 15000,
        },
        {
          name: "check-unread",
          description: "Check unread messages",
          action: "Open Slack, click on unread messages indicator, take screenshot to review messages",
          requiredApp: "Slack",
          timeout: 10000,
        },
        {
          name: "start-call",
          description: "Start a voice or video call with a user",
          action: "Open Slack, search for user {0}, click call button, select {1} (audio/video)",
          requiredApp: "Slack",
          timeout: 20000,
        },
        {
          name: "update-status",
          description: "Update Slack status",
          action: 'Click profile picture, select "Set status", type "{0}", press Save',
          requiredApp: "Slack",
          timeout: 10000,
        },
        {
          name: "search-messages",
          description: "Search for messages containing text",
          action: 'Click search box, type "{0}", press Enter, review results',
          requiredApp: "Slack",
          timeout: 12000,
        },
        {
          name: "add-reaction",
          description: "Add emoji reaction to a message",
          action: 'Find message about "{0}", hover over it, click emoji button, select :{1}:',
          requiredApp: "Slack",
          timeout: 10000,
        },
        {
          name: "create-channel",
          description: "Create a new Slack channel",
          action: 'Click "+" next to Channels, type name "{0}", select settings, click Create',
          requiredApp: "Slack",
          timeout: 15000,
        },
        {
          name: "pin-message",
          description: "Pin a message to channel",
          action: 'Find message with text "{0}", click menu, select "Pin to channel"',
          requiredApp: "Slack",
          timeout: 10000,
        },
      ],
    });
  }

  /**
   * High-level API: Send message
   */
  async sendMessage(channelOrUser: string, message: string): Promise<boolean> {
    const result = await this.executeCommand("send-message", channelOrUser, message);
    return result.success;
  }

  /**
   * High-level API: Check unread
   */
  async checkUnread(): Promise<boolean> {
    const result = await this.executeCommand("check-unread");
    return result.success;
  }

  /**
   * High-level API: Start call
   */
  async startCall(username: string, type: "audio" | "video" = "audio"): Promise<boolean> {
    const result = await this.executeCommand("start-call", username, type);
    return result.success;
  }

  /**
   * High-level API: Update status
   */
  async setStatus(status: string): Promise<boolean> {
    const result = await this.executeCommand("update-status", status);
    return result.success;
  }

  /**
   * High-level API: Search
   */
  async searchMessages(query: string): Promise<boolean> {
    const result = await this.executeCommand("search-messages", query);
    return result.success;
  }

  /**
   * High-level API: React
   */
  async addReaction(messageContent: string, emoji: string): Promise<boolean> {
    const result = await this.executeCommand("add-reaction", messageContent, emoji);
    return result.success;
  }

  /**
   * High-level API: Create channel
   */
  async createChannel(channelName: string): Promise<boolean> {
    const result = await this.executeCommand("create-channel", channelName);
    return result.success;
  }

  /**
   * High-level API: Pin message
   */
  async pinMessage(messageContent: string): Promise<boolean> {
    const result = await this.executeCommand("pin-message", messageContent);
    return result.success;
  }
}

// Export singleton instance
export const slackConnector = new SlackConnector();
