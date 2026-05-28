/**
 * WebSocket Handler - Modular real-time event streaming
 * Exports: Setup function and event emitter for agent updates
 */

import { EventEmitter } from 'events';
import type WebSocket from 'ws';
import { eventBuffer } from './observer-api';

// ============ Type Definitions ============

export interface AgentWSMessage {
  type: 'agent-status' | 'task-executed' | 'message-queued' | 'observer-event' | 'error';
  agentId: string;
  timestamp: number;
  data: Record<string, any>;
}

// ============ Event Emitter for Server-to-Client ============

export const agentEventEmitter = new EventEmitter();

// ============ WebSocket Handler ============

export function setupWebSocketHandler(wss: any): void {
  console.log('[WS-HANDLER] Setting up WebSocket handler');

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean; agentId?: string }) => {
    console.log('[WS-HANDLER] Client connected');
    ws.isAlive = true;

    // Heartbeat mechanism
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle incoming messages
    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data);

        switch (message.type) {
          case 'subscribe':
            ws.agentId = message.agentId;
            ws.send(JSON.stringify({
              type: 'subscribed',
              agentId: message.agentId,
              timestamp: Date.now(),
            }));
            console.log(`[WS-HANDLER] Client subscribed to agent: ${message.agentId}`);
            break;

          case 'ping':
            ws.send(JSON.stringify({
              type: 'pong',
              timestamp: Date.now(),
            }));
            break;

          case 'get-status':
            // Client requests current status
            const recentEvents = eventBuffer.getRecent(5);
            ws.send(JSON.stringify({
              type: 'status-update',
              agentId: ws.agentId,
              recentEvents,
              timestamp: Date.now(),
            }));
            break;

          default:
            console.warn('[WS-HANDLER] Unknown message type:', message.type);
        }
      } catch (err) {
        console.error('[WS-HANDLER] Message parse error:', err);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Invalid message format',
          timestamp: Date.now(),
        }));
      }
    });

    // Handle close
    ws.on('close', () => {
      console.log(`[WS-HANDLER] Client disconnected: ${ws.agentId || 'unknown'}`);
    });

    // Handle errors
    ws.on('error', (err: Error) => {
      console.error('[WS-HANDLER] WebSocket error:', err.message);
    });
  });

  // Heartbeat interval
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { isAlive?: boolean; terminate?: () => void }) => {
      if (ws.isAlive === false) {
        ws.terminate?.();
        return;
      }
      ws.isAlive = false;
      ws.ping?.();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });
}

// ============ Broadcast Events to Clients ============

export function broadcastAgentEvent(message: AgentWSMessage): void {
  agentEventEmitter.emit('agent-event', message);
}

export function broadcastTaskExecution(agentId: string, taskId: string, status: 'success' | 'failed'): void {
  const message: AgentWSMessage = {
    type: 'task-executed',
    agentId,
    timestamp: Date.now(),
    data: { taskId, status },
  };
  broadcastAgentEvent(message);
}

export function broadcastMessageQueued(agentId: string, channelId: string, messageId: string): void {
  const message: AgentWSMessage = {
    type: 'message-queued',
    agentId,
    timestamp: Date.now(),
    data: { channelId, messageId },
  };
  broadcastAgentEvent(message);
}

export function broadcastObserverEvent(agentId: string, eventType: string, eventData: Record<string, any>): void {
  const message: AgentWSMessage = {
    type: 'observer-event',
    agentId,
    timestamp: Date.now(),
    data: { eventType, ...eventData },
  };
  broadcastAgentEvent(message);
}

// ============ Wire Event Emitter to Broadcast ============

agentEventEmitter.on('agent-event', (message: AgentWSMessage) => {
  // In a real implementation, would broadcast to connected clients
  console.log(`[WS-HANDLER] Event: ${message.type} for agent ${message.agentId}`);
});

// Export setup function
export default setupWebSocketHandler;
