/**
 * Dashboard API - Multi-tenant analytics endpoints
 * Provides: tenant list, global overview, per-tenant stats
 */

import type { Request, Response } from 'express';
import { getRouter } from './nanoclaw/router';
import { getAdapterRegistry } from './nanoclaw/channel-adapters/registry';
import type { AgentGroup, MessageChannel } from './nanoclaw/types';

export interface ChannelMetric {
  channelId: string;
  inbound: number;
  outbound: number;
  failed: number;
}

export interface DashboardTotals {
  agentGroups: number;
  activeSessions: number;
  inboundTotal: number;
  inboundPending: number;
  inboundProcessed: number;
  outboundTotal: number;
  outboundPending: number;
  outboundSent: number;
  outboundFailed: number;
}

export interface DashboardStats {
  totals: DashboardTotals;
  channels: ChannelMetric[];
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

export interface TenantSummary {
  id: string;
  name: string;
  description: string;
  isMultiUser: boolean;
  enabledChannels: MessageChannel[];
  status: string;
  createdAt: number;
  updatedAt: number;
}

const ALL_CHANNELS: MessageChannel[] = [
  'telegram',
  'discord',
  'slack',
  'whatsapp',
  'teams',
  'imessage',
  'matrix',
  'signal',
  'viber',
  'sms',
  'email',
  'web',
];

const asNumber = (value: any) => (value === null || value === undefined ? 0 : Number(value));

function getDefaultEnabledChannels(): MessageChannel[] {
  const enabled = getAdapterRegistry().getStats().enabled as MessageChannel[];
  return enabled.length > 0 ? enabled : ['web'];
}

async function ensureTenants(): Promise<TenantSummary[]> {
  const router = getRouter();
  let tenants = await router.listAgentGroups();

  if (tenants.length === 0) {
    const now = Date.now();
    const defaultId = process.env.AGENT_GROUP_ID || 'default';
    const defaultGroup: AgentGroup = {
      id: defaultId,
      name: 'Default Workspace',
      description: 'Primary Nova agent group',
      createdAt: now,
      updatedAt: now,
      isMultiUser: true,
      enabledChannels: getDefaultEnabledChannels(),
      status: 'active',
    };
    await router.registerAgentGroup(defaultGroup);
    tenants = await router.listAgentGroups();
  }

  return tenants.map((tenant) => ({
    id: tenant.id,
    name: tenant.name,
    description: tenant.description,
    isMultiUser: tenant.isMultiUser,
    enabledChannels: tenant.enabledChannels.length > 0 ? tenant.enabledChannels : ALL_CHANNELS,
    status: tenant.status,
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
  }));
}

async function buildStats(agentGroupId?: string, agentGroupCount: number = 1): Promise<DashboardStats> {
  const router = getRouter();
  const inboundWhere = agentGroupId ? 'WHERE agent_group_id = ?' : '';
  const outboundWhere = agentGroupId ? 'WHERE i.agent_group_id = ?' : '';
  const sessionWhere = agentGroupId ? 'WHERE agent_group_id = ? AND status = "active"' : 'WHERE status = "active"';

  const inboundRow = await router.queryOne<{
    total: number;
    pending: number;
    processed: number;
    lastReceived: number | null;
  }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) as processed,
      MAX(received_at) as lastReceived
     FROM inbound_messages
     ${inboundWhere}`,
    agentGroupId ? [agentGroupId] : []
  );

  const outboundRow = await router.queryOne<{
    total: number;
    pending: number;
    sent: number;
    failed: number;
    lastSent: number | null;
  }>(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN o.status IN ('pending', 'retrying') THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN o.status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN o.status = 'failed' THEN 1 ELSE 0 END) as failed,
      MAX(o.sent_at) as lastSent
     FROM outbound_delivery o
     JOIN inbound_messages i ON o.message_id = i.id
     ${outboundWhere}`,
    agentGroupId ? [agentGroupId] : []
  );

  const sessionRow = await router.queryOne<{ activeSessions: number }>(
    `SELECT COUNT(*) as activeSessions FROM conversation_sessions ${sessionWhere}`,
    agentGroupId ? [agentGroupId] : []
  );

  const inboundChannels = await router.queryAll<{ channelId: string; inbound: number }>(
    `SELECT channel_id as channelId, COUNT(*) as inbound
     FROM inbound_messages
     ${inboundWhere}
     GROUP BY channel_id`,
    agentGroupId ? [agentGroupId] : []
  );

  const outboundChannels = await router.queryAll<{ channelId: string; outbound: number; failed: number }>(
    `SELECT o.channel_id as channelId,
      COUNT(*) as outbound,
      SUM(CASE WHEN o.status = 'failed' THEN 1 ELSE 0 END) as failed
     FROM outbound_delivery o
     JOIN inbound_messages i ON o.message_id = i.id
     ${outboundWhere}
     GROUP BY o.channel_id`,
    agentGroupId ? [agentGroupId] : []
  );

  const channelMap = new Map<string, ChannelMetric>();
  inboundChannels.forEach((row) => {
    if (!row.channelId) return;
    channelMap.set(row.channelId, {
      channelId: row.channelId,
      inbound: asNumber(row.inbound),
      outbound: 0,
      failed: 0,
    });
  });
  outboundChannels.forEach((row) => {
    if (!row.channelId) return;
    const existing = channelMap.get(row.channelId) || {
      channelId: row.channelId,
      inbound: 0,
      outbound: 0,
      failed: 0,
    };
    existing.outbound = asNumber(row.outbound);
    existing.failed = asNumber(row.failed);
    channelMap.set(row.channelId, existing);
  });

  const channels = Array.from(channelMap.values()).sort((a, b) => {
    const aTotal = a.inbound + a.outbound;
    const bTotal = b.inbound + b.outbound;
    return bTotal - aTotal;
  });

  return {
    totals: {
      agentGroups: agentGroupCount,
      activeSessions: asNumber(sessionRow?.activeSessions),
      inboundTotal: asNumber(inboundRow?.total),
      inboundPending: asNumber(inboundRow?.pending),
      inboundProcessed: asNumber(inboundRow?.processed),
      outboundTotal: asNumber(outboundRow?.total),
      outboundPending: asNumber(outboundRow?.pending),
      outboundSent: asNumber(outboundRow?.sent),
      outboundFailed: asNumber(outboundRow?.failed),
    },
    channels,
    lastInboundAt: inboundRow?.lastReceived ?? null,
    lastOutboundAt: outboundRow?.lastSent ?? null,
  };
}

export const listTenants = async (_req: Request, res: Response) => {
  try {
    const tenants = await ensureTenants();
    res.json({
      tenants,
      total: tenants.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[DASHBOARD-API] listTenants failed:', err);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
};

export const getDashboardOverview = async (_req: Request, res: Response) => {
  try {
    const tenants = await ensureTenants();
    const stats = await buildStats(undefined, tenants.length);
    res.json({
      stats,
      tenants: tenants.length,
      generatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[DASHBOARD-API] getDashboardOverview failed:', err);
    res.status(500).json({ error: 'Failed to get dashboard overview' });
  }
};

export const getTenantAnalytics = async (req: Request, res: Response) => {
  try {
    const { agentGroupId } = req.params;
    const tenants = await ensureTenants();
    const tenant = tenants.find((t) => t.id === agentGroupId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const stats = await buildStats(agentGroupId, 1);
    res.json({
      tenant,
      stats,
      generatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[DASHBOARD-API] getTenantAnalytics failed:', err);
    res.status(500).json({ error: 'Failed to get tenant analytics' });
  }
};

export function setupDashboardAPI(app: any): void {
  app.get('/api/dashboard/overview', getDashboardOverview);
  app.get('/api/dashboard/tenants', listTenants);
  app.get('/api/dashboard/tenants/:agentGroupId', getTenantAnalytics);
  console.log('[DASHBOARD-API] Routes registered');
}
