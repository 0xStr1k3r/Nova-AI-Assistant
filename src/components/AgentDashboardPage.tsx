import React, { useState } from "react";
import { LayoutDashboard, Bot, ListTodo, Radio, Eye, GitBranch, Activity } from "lucide-react";
import AgentControl from "./AgentControl";
import TenantDashboard from "./TenantDashboard";
import TaskMonitor from "./TaskMonitor";
import ChannelStatus from "./ChannelStatus";
import ObserverPanel from "./ObserverPanel";
import WorkflowDesigner from "./WorkflowDesigner";

type AgentTab = "dashboard" | "agents" | "tasks" | "channels" | "observer" | "workflows";

const TABS: { id: AgentTab; label: string; Icon: React.ElementType; desc: string }[] = [
  { id: "dashboard",  label: "Dashboard",  Icon: LayoutDashboard, desc: "Tenant overview & traffic" },
  { id: "agents",     label: "Agents",     Icon: Bot,             desc: "Running agent groups" },
  { id: "tasks",      label: "Tasks",      Icon: ListTodo,        desc: "Scheduled jobs & timers" },
  { id: "channels",   label: "Channels",   Icon: Radio,           desc: "Inbound & outbound links" },
  { id: "observer",   label: "Observer",   Icon: Eye,             desc: "System events & signals" },
  { id: "workflows",  label: "Workflows",  Icon: GitBranch,       desc: "Recorded automation flows" },
];

const CARD: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--bg-border)",
  borderRadius: 12,
};

export default function AgentDashboardPage() {
  const [tab, setTab] = useState<AgentTab>("dashboard");

  return (
    <div className="h-full flex overflow-hidden" style={{ background: "var(--bg-base)" }}>

      {/* ── Left sidebar nav ─────────────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 overflow-y-auto py-6 px-3"
        style={{ width: 220, borderRight: "1px solid var(--bg-border)", background: "var(--bg-surface)" }}
      >
        {/* Title */}
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)" }}
          >
            <Activity size={14} style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Agent Control</p>
            <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em" }}>Multi-agent orchestration</p>
          </div>
        </div>

        <nav className="space-y-1">
          {TABS.map(({ id, label, Icon, desc }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-150"
                style={
                  active
                    ? { background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd" }
                    : { background: "transparent", border: "1px solid transparent", color: "var(--text-2)" }
                }
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = "var(--bg-elevated)";
                    e.currentTarget.style.border = "1px solid var(--bg-border)";
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.border = "1px solid transparent";
                  }
                }}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: active ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)" }}
                >
                  <Icon size={13} />
                </span>
                <div className="min-w-0">
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{label}</p>
                  <p style={{ fontSize: 10, color: "var(--text-3)", marginTop: 1 }} className="truncate">{desc}</p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Info footer */}
        <div className="mt-auto pt-4">
          <div
            className="p-3 rounded-xl"
            style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}
          >
            <p style={{ fontSize: 10, color: "var(--text-2)", lineHeight: 1.6 }}>
              Agents run autonomously in the background. Monitor status, tasks, and channels from this dashboard.
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6" style={{ background: "var(--bg-base)" }}>

        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {TABS.find(t => t.id === tab)?.desc}
            </p>
          </div>
          <StatusBadge tab={tab} />
        </div>

        {/* Tab content */}
        <div style={CARD} className="p-5 min-h-[400px]">
          {tab === "dashboard"  && <TenantDashboard />}
          {tab === "agents"     && <AgentControl compact={false} />}
          {tab === "tasks"      && <TaskMonitor compact={false} />}
          {tab === "channels"   && <ChannelStatus compact={false} />}
          {tab === "observer"   && <ObserverPanel compact={false} />}
          {tab === "workflows"  && <WorkflowDesigner />}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ tab }: { tab: AgentTab }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
      style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full animate-pulse"
        style={{ background: "var(--green)" }}
      />
      <span style={{ fontSize: 11, color: "var(--text-2)", fontFamily: "monospace" }}>
        LIVE
      </span>
    </div>
  );
}
