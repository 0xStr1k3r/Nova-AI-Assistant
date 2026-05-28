/**
 * TenantDashboard Component - Multi-tenant analytics overview
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useDashboardAPI } from '../hooks/useDashboardAPI';

function formatTimestamp(timestamp: number | null) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleTimeString();
}

function MetricCard({ label, value, subLabel }: { label: string; value: string | number; subLabel?: string }) {
  return (
    <div
      className="p-3"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--bg-border)",
        borderRadius: 8,
      }}
    >
      <p className="text-[10px] uppercase tracking-widest font-mono" style={{ color: "var(--text-3)" }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: "var(--text-1)" }}>{value}</p>
      {subLabel && <p className="text-xs" style={{ color: "var(--text-2)" }}>{subLabel}</p>}
    </div>
  );
}

export default function TenantDashboard() {
  const {
    tenants,
    overview,
    tenantAnalytics,
    loading,
    error,
    fetchTenants,
    fetchOverview,
    fetchTenantAnalytics,
  } = useDashboardAPI();
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  useEffect(() => {
    fetchTenants();
    fetchOverview();
    const interval = setInterval(() => {
      fetchTenants();
      fetchOverview();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchTenants, fetchOverview]);

  useEffect(() => {
    if (!selectedTenantId && tenants.length > 0) {
      setSelectedTenantId(tenants[0].id);
    }
  }, [tenants, selectedTenantId]);

  useEffect(() => {
    if (!selectedTenantId) return;
    fetchTenantAnalytics(selectedTenantId);
    const interval = setInterval(() => fetchTenantAnalytics(selectedTenantId), 15000);
    return () => clearInterval(interval);
  }, [selectedTenantId, fetchTenantAnalytics]);

  const overviewTotals = overview?.totals;
  const tenantTotals = tenantAnalytics?.stats?.totals;

  const overviewChannels = useMemo(() => overview?.channels || [], [overview]);
  const tenantChannels = useMemo(() => tenantAnalytics?.stats?.channels || [], [tenantAnalytics]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>Multi-tenant Dashboard</h3>
        {loading && <span className="text-xs" style={{ color: "var(--text-2)" }}>Syncing…</span>}
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-950 px-2 py-1 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Agent Groups"
          value={overviewTotals?.agentGroups ?? 0}
          subLabel={`${overviewTotals?.activeSessions ?? 0} active sessions`}
        />
        <MetricCard
          label="Inbound"
          value={overviewTotals?.inboundTotal ?? 0}
          subLabel={`${overviewTotals?.inboundPending ?? 0} pending · ${overviewTotals?.inboundProcessed ?? 0} processed`}
        />
        <MetricCard
          label="Outbound"
          value={overviewTotals?.outboundTotal ?? 0}
          subLabel={`${overviewTotals?.outboundPending ?? 0} pending · ${overviewTotals?.outboundSent ?? 0} sent`}
        />
        <MetricCard
          label="Failures"
          value={overviewTotals?.outboundFailed ?? 0}
          subLabel={`Last inbound ${formatTimestamp(overview?.lastInboundAt)} · Last outbound ${formatTimestamp(overview?.lastOutboundAt)}`}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1 space-y-2">
          <h4 className="text-xs uppercase tracking-widest font-mono" style={{ color: "var(--text-3)" }}>Tenants</h4>
          <div className="space-y-2">
            {tenants.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>No tenants registered</p>
            ) : (
              tenants.map((tenant) => {
                const active = selectedTenantId === tenant.id;
                return (
                  <motion.button
                    key={tenant.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedTenantId(tenant.id)}
                    className="w-full text-left px-3 py-2 rounded-lg transition-colors"
                    style={
                      active
                        ? {
                            background: "var(--blue-soft)",
                            border: "1px solid var(--blue-border)",
                            color: "#93c5fd",
                          }
                        : {
                            background: "var(--bg-elevated)",
                            border: "1px solid var(--bg-border)",
                            color: "var(--text-2)",
                          }
                    }
                    onMouseEnter={(e) => {
                      if (!active) {
                        e.currentTarget.style.borderColor = "var(--bg-border-h)";
                        e.currentTarget.style.color = "var(--text-1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!active) {
                        e.currentTarget.style.borderColor = "var(--bg-border)";
                        e.currentTarget.style.color = "var(--text-2)";
                      }
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate" style={{ color: active ? "#93c5fd" : "var(--text-1)" }}>{tenant.name}</span>
                      <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                        {tenant.status}
                      </span>
                    </div>
                    <p className="text-[10px] mt-1 truncate" style={{ color: "var(--text-3)" }}>
                      {tenant.enabledChannels.join(', ') || 'No channels'}
                    </p>
                  </motion.button>
                );
              })
            )}
          </div>

          <div
            className="p-3"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--bg-border)",
              borderRadius: 8,
            }}
          >
            <p className="text-[10px] uppercase tracking-widest font-mono mb-2" style={{ color: "var(--text-3)" }}>Channel Traffic</p>
            {overviewChannels.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-3)" }}>No channel data yet</p>
            ) : (
              <div className="space-y-2">
                {overviewChannels.slice(0, 6).map((channel) => (
                  <div key={channel.channelId} className="flex items-center justify-between text-xs" style={{ color: "var(--text-2)" }}>
                    <span className="capitalize">{channel.channelId}</span>
                    <span>
                      {channel.inbound + channel.outbound} · {channel.failed} failed
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs uppercase tracking-widest font-mono" style={{ color: "var(--text-3)" }}>Tenant Analytics</h4>
            {tenantAnalytics?.tenant && (
              <span className="text-xs" style={{ color: "var(--text-2)" }}>
                {tenantAnalytics.tenant.isMultiUser ? 'Multi-user' : 'Single-user'}
              </span>
            )}
          </div>

          {!tenantAnalytics?.tenant ? (
            <div
              className="p-4 text-xs"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--bg-border)",
                borderRadius: 8,
                color: "var(--text-3)",
              }}
            >
              Select a tenant to view analytics.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Sessions"
                  value={tenantTotals?.activeSessions ?? 0}
                  subLabel={tenantAnalytics.tenant.description || '—'}
                />
                <MetricCard
                  label="Inbound"
                  value={tenantTotals?.inboundTotal ?? 0}
                  subLabel={`${tenantTotals?.inboundPending ?? 0} pending · ${tenantTotals?.inboundProcessed ?? 0} processed`}
                />
                <MetricCard
                  label="Outbound"
                  value={tenantTotals?.outboundTotal ?? 0}
                  subLabel={`${tenantTotals?.outboundPending ?? 0} pending · ${tenantTotals?.outboundSent ?? 0} sent`}
                />
                <MetricCard
                  label="Failures"
                  value={tenantTotals?.outboundFailed ?? 0}
                  subLabel={`Last inbound ${formatTimestamp(tenantAnalytics.stats.lastInboundAt)} · Last outbound ${formatTimestamp(tenantAnalytics.stats.lastOutboundAt)}`}
                />
              </div>

              <div
                className="p-3"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--bg-border)",
                  borderRadius: 8,
                }}
              >
                <p className="text-[10px] uppercase tracking-widest font-mono mb-2" style={{ color: "var(--text-3)" }}>
                  Tenant Channel Traffic
                </p>
                {tenantChannels.length === 0 ? (
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>No traffic recorded</p>
                ) : (
                  <div className="space-y-2">
                    {tenantChannels.map((channel) => (
                      <div key={channel.channelId} className="flex items-center justify-between text-xs" style={{ color: "var(--text-2)" }}>
                        <span className="capitalize">{channel.channelId}</span>
                        <span>
                          {channel.inbound} in · {channel.outbound} out · {channel.failed} failed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
