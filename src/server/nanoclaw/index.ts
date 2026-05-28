/**
 * NanoClaw Module Exports
 * Entry point for multi-channel routing system
 */

export { default as ChannelRouter, getRouter } from './router';
export type {
  Message,
  MessageChannel,
  ChannelUser,
  ConversationSession,
  AgentGroup,
  DeliveryTask,
  ChannelConfig,
  NovaResponse,
  ChannelAdapter,
} from './types';

export { default as ChannelOrchestrator, getOrchestrator } from './orchestrator';
export { getAdapterRegistry, createNewRegistry } from './channel-adapters/registry';

export { default as TelegramAdapter } from './channel-adapters/telegram';
export { default as DiscordAdapter } from './channel-adapters/discord';
export { default as SlackAdapter } from './channel-adapters/slack';

export { default as TaskScheduler, getTaskScheduler } from './task-scheduler';
export type { ScheduledTask } from './task-scheduler';

export { default as SystemObserver, getSystemObserver } from './system-observer';

/**
 * Initialize NanoClaw multi-channel system
 * Call this once at application startup
 */
export async function initializeNanoClaw(): Promise<void> {
  console.log('[NANOCLAW] Initializing multi-channel router...');

  const orchestrator = getOrchestrator();
  console.log('[NANOCLAW] ✅ NanoClaw router ready');
  console.log(`[NANOCLAW] Enabled channels: ${getAdapterRegistry().getStats().enabled.join(', ')}`);
}
