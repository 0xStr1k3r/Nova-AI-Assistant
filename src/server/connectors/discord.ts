import { AppConnector, AppCommand } from "../app-connector-base";

/**
 * Discord App Connector
 * Enables autonomous Discord operations via vision-to-action loop
 */

export class DiscordConnector extends AppConnector {
  constructor() {
    super({
      appName: "Discord",
      appProcessNames: ["Discord", "discord"],
      timeout: 30000,
      supportedCommands: [
        {
          name: "send-message",
          description: "Send message to a channel",
          action: 'Open Discord, click channel {0}, click message box, type "{1}", press Enter',
          requiredApp: "Discord",
          timeout: 12000,
        },
        {
          name: "send-dm",
          description: "Send direct message to user",
          action: 'Open Discord, click DM with {0}, click message box, type "{1}", press Enter',
          requiredApp: "Discord",
          timeout: 12000,
        },
        {
          name: "join-voice",
          description: "Join a voice channel",
          action: 'Open Discord, find voice channel {0}, click to join',
          requiredApp: "Discord",
          timeout: 10000,
        },
        {
          name: "leave-voice",
          description: "Leave current voice channel",
          action: "Click disconnect button to leave voice channel",
          requiredApp: "Discord",
          timeout: 5000,
        },
        {
          name: "check-notifications",
          description: "Check unread messages",
          action: "Look at unread badge counts, click channels with notifications",
          requiredApp: "Discord",
          timeout: 8000,
        },
        {
          name: "add-reaction",
          description: "React to a message with emoji",
          action: 'Find message by {0}, click add reaction, select emoji :{1}:',
          requiredApp: "Discord",
          timeout: 10000,
        },
        {
          name: "pin-message",
          description: "Pin a message",
          action: 'Right-click message containing "{0}", select Pin Message',
          requiredApp: "Discord",
          timeout: 8000,
        },
        {
          name: "create-thread",
          description: "Create a thread",
          action: 'Right-click message with text "{0}", select "Create Thread"',
          requiredApp: "Discord",
          timeout: 10000,
        },
      ],
    });
  }

  /**
   * High-level API: Send message to channel
   */
  async sendMessage(channel: string, message: string): Promise<boolean> {
    const result = await this.executeCommand("send-message", channel, message);
    return result.success;
  }

  /**
   * High-level API: Send DM
   */
  async sendDM(username: string, message: string): Promise<boolean> {
    const result = await this.executeCommand("send-dm", username, message);
    return result.success;
  }

  /**
   * High-level API: Join voice
   */
  async joinVoice(channelName: string): Promise<boolean> {
    const result = await this.executeCommand("join-voice", channelName);
    return result.success;
  }

  /**
   * High-level API: Leave voice
   */
  async leaveVoice(): Promise<boolean> {
    const result = await this.executeCommand("leave-voice");
    return result.success;
  }

  /**
   * High-level API: Check notifications
   */
  async checkNotifications(): Promise<boolean> {
    const result = await this.executeCommand("check-notifications");
    return result.success;
  }

  /**
   * High-level API: Add reaction
   */
  async addReaction(messageText: string, emoji: string): Promise<boolean> {
    const result = await this.executeCommand("add-reaction", messageText, emoji);
    return result.success;
  }

  /**
   * High-level API: Pin message
   */
  async pinMessage(messageContent: string): Promise<boolean> {
    const result = await this.executeCommand("pin-message", messageContent);
    return result.success;
  }

  /**
   * High-level API: Create thread
   */
  async createThread(messageContent: string): Promise<boolean> {
    const result = await this.executeCommand("create-thread", messageContent);
    return result.success;
  }
}

// Export singleton instance
export const discordConnector = new DiscordConnector();
