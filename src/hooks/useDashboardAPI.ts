/**
 * useDashboardAPI Hook - Modular API client for multi-tenant analytics
 * Provides: tenant list, global overview, per-tenant stats
 */

import { useCallback, useState } from 'react';

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
  enabledChannels: string[];
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface OverviewResponse {
  stats: DashboardStats;
  tenants: number;
  generatedAt: number;
}

export interface TenantAnalyticsResponse {
  tenant: TenantSummary;
  stats: DashboardStats;
  generatedAt: number;
}

export function useDashboardAPI() {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [overview, setOverview] = useState<DashboardStats | null>(null);
  const [tenantAnalytics, setTenantAnalytics] = useState<TenantAnalyticsResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    setLoadingTenants(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/tenants');
      if (!res.ok) throw new Error('Failed to fetch tenants');
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingTenants(false);
    }
  }, []);

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    setError(null);
    try {
      const res = await fetch('/api/dashboard/overview');
      if (!res.ok) throw new Error('Failed to fetch overview');
      const data = await res.json() as OverviewResponse;
      setOverview(data.stats || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const fetchTenantAnalytics = useCallback(async (tenantId: string) => {
    setLoadingTenant(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/tenants/${tenantId}`);
      if (!res.ok) throw new Error('Failed to fetch tenant analytics');
      const data = await res.json() as TenantAnalyticsResponse;
      setTenantAnalytics(data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoadingTenant(false);
    }
  }, []);

  return {
    tenants,
    overview,
    tenantAnalytics,
    loading: loadingOverview || loadingTenants || loadingTenant,
    loadingOverview,
    loadingTenants,
    loadingTenant,
    error,
    fetchTenants,
    fetchOverview,
    fetchTenantAnalytics,
  };
}
