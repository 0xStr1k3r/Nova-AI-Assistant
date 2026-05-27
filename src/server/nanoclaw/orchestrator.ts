/**
 * Channel Orchestrator - Main Inbound/Outbound Flow
 * Coordinates message flow from channels → Nova → channels
 * ~206 LOC: Message polling, Nova integration, delivery coordination
 */

import { getRouter } from './router';
import { getAdapterRegistry } from './channel-adapters/registry';
import type { Message, NovaResponse, MessageChannel } from './types';

interface OrchestrationConfig {
  agentGroupId: string;
  pollIntervalMs: number;
  deliveryRetryIntervalMs: number;
  maxConcurrentProcessing: number;
}

class ChannelOrchestrator {
  private router = getRouter();
  private registry = getAdapterRegistry();
  private config: OrchestrationConfig;
  private isRunning: boolean = false;
  private processingCount: number = 0;
  private novaHandler?: (msg: Message) => Promise<NovaResponse>;

  constructor(config: OrchestrationConfig) {
    this.config = config;
  }

  /**
   * Start orchestration: inbound polling + outbound delivery
   */
  async start(novaHandler: (msg: Message) => Promise<NovaResponse>): Promise<void> {
    if (this.isRunning) {
      console.warn('[ORCHESTRATOR] Already running');
      return;
    }

    this.novaHandler = novaHandler;
    this.isRunning = true;
    console.log('[ORCHESTRATOR] ✅ Started');

    // Initialize adapters from environment
    await this.registry.initializeFromEnv(this.config.agentGroupId);

    // Start polling loops
    this.startInboundPolling();
    this.startOutboundDelivery();
    this.startHealthCheck();
  }

  /**
   * Stop orchestration
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    console.log('[ORCHESTRATOR] ⏹️ Stopped');
  }

  /**
   * Register Nova message handler
   */
  setNovaHandler(handler: (msg: Message) => Promise<NovaResponse>): void {
    this.novaHandler = handler;
  }

  /**
   * Get orchestration stats
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      processingCount: this.processingCount,
      adapters: this.registry.getStats(),
      config: this.config,
    };
  }

  // ============ Inbound Flow ============

  private async startInboundPolling(): Promise<void> {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        // Poll all adapters for new messages
        const allMessages: Message[] = [];

        for (const adapter of this.registry.getAllAdapters()) {
          try {
            const messages = await adapter.pollMessages();
            allMessages.push(...messages);
          } catch (error) {
            console.error(`[ORCHESTRATOR] Polling error on ${adapter.name}:`, error);
          }
        }

        // Ingest messages into router
        for (const msg of allMessages) {
          await this.router.ingestMessage(msg);
        }

        // Process pending messages
        await this.processPendingMessages();
      } catch (error) {
        console.error('[ORCHESTRATOR] Inbound polling error:', error);
      }
    }, this.config.pollIntervalMs);
  }

  private async processPendingMessages(): Promise<void> {
    if (this.processingCount >= this.config.maxConcurrentProcessing) {
      return; // Back pressure
    }

    const messages = await this.router.getPendingMessages(10);

    for (const msg of messages) {
      this.processingCount++;

      try {
        // Process with Nova
        if (!this.novaHandler) {
          console.warn('[ORCHESTRATOR] No Nova handler registered');
          continue;
        }

        console.log(
          `[ORCHESTRATOR] Processing message from ${msg.channelId} user ${msg.userId}`
        );

        const response = await this.novaHandler(msg);

        // Queue response for delivery
        await this.router.queueResponse(msg.id, msg.channelId, msg.userId, response);

        // Mark as processed
        await this.router.markMessageProcessed(msg.id);

        console.log(
          `[ORCHESTRATOR] ✅ Processed message ${msg.id} from ${msg.channelId}`
        );
      } catch (error) {
        console.error(`[ORCHESTRATOR] Error processing message:`, error);
      } finally {
        this.processingCount--;
      }
    }
  }

  // ============ Outbound Flow ============

  private async startOutboundDelivery(): Promise<void> {
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.processDeliveryQueue();
      } catch (error) {
        console.error('[ORCHESTRATOR] Outbound delivery error:', error);
      }
    }, this.config.deliveryRetryIntervalMs);
  }

  private async processDeliveryQueue(): Promise<void> {
    const deliveries = await this.router.getPendingDeliveries(50);

    for (const delivery of deliveries) {
      try {
        const adapter = this.registry.getAdapter(delivery.channelId);
        if (!adapter) {
          console.error(
            `[ORCHESTRATOR] No adapter for channel ${delivery.channelId}`
          );
          continue;
        }

        // Attempt delivery
        console.log(
          `[ORCHESTRATOR] Delivering to ${delivery.channelId} user ${delivery.channelUserId}`
        );

        await adapter.sendMessage(
          delivery.channelUserId,
          delivery.content,
          delivery.mediaUrls
        );

        await this.router.markDeliverySent(delivery.id);
        console.log(`[ORCHESTRATOR] ✅ Delivered ${delivery.id}`);
      } catch (error) {
        console.error(`[ORCHESTRATOR] Delivery failed for ${delivery.id}:`, error);

        const shouldRetry = delivery.attempts < delivery.maxRetries;
        await this.router.markDeliveryFailed(delivery.id, String(error), shouldRetry);
      }
    }
  }

  // ============ Health Check ============

  private async startHealthCheck(): Promise<void> {
    setInterval(async () => {
      if (!this.isRunning) return;

      const stats = this.getStats();
      console.log(
        `[ORCHESTRATOR] Health: ${stats.adapters.enabled.length} channels, processing ${stats.processingCount}`
      );
    }, 30000); // Every 30 seconds
  }
}

let orchestratorInstance: ChannelOrchestrator | null = null;

export function getOrchestrator(config?: OrchestrationConfig): ChannelOrchestrator {
  if (!orchestratorInstance) {
    const defaultConfig: OrchestrationConfig = {
      agentGroupId: process.env.AGENT_GROUP_ID || 'default',
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '2000'),
      deliveryRetryIntervalMs: parseInt(process.env.DELIVERY_RETRY_INTERVAL_MS || '5000'),
      maxConcurrentProcessing: parseInt(process.env.MAX_CONCURRENT_PROCESSING || '5'),
    };

    orchestratorInstance = new ChannelOrchestrator(config || defaultConfig);
  }
  return orchestratorInstance;
}

export default ChannelOrchestrator;
