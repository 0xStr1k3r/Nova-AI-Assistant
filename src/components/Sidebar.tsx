import React from "react";
import { Mic2, Settings2, LayoutDashboard, Zap } from "lucide-react";

interface SidebarProps {
  view: "home" | "settings" | "agents";
  setView: (v: "home" | "settings" | "agents") => void;
  isConnected: boolean;
  isWakeWordListening: boolean;
}

const NAV_ITEMS = [
  { id: "home" as const,     Icon: Mic2,            label: "Voice Hub" },
  { id: "settings" as const, Icon: Settings2,        label: "Settings" },
  { id: "agents" as const,   Icon: LayoutDashboard,  label: "Agents" },
];

export default function Sidebar({
  view,
  setView,
  isConnected,
  isWakeWordListening,
}: SidebarProps) {
  const statusColor = isConnected
    ? "var(--green)"
    : isWakeWordListening
    ? "var(--blue)"
    : "var(--text-3)";

  const statusLabel = isConnected
    ? "Live"
    : isWakeWordListening
    ? "Standby"
    : "Offline";

  return (
    <aside
      className="flex flex-col items-center py-4 shrink-0"
      style={{
        width: 48,
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--bg-border)",
      }}
    >
      {/* App logo */}
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center mb-5 shrink-0"
        style={{
          background: "var(--blue-soft)",
          border: "1px solid var(--blue-border)",
        }}
        title="Nova OS"
      >
        <Zap className="w-4 h-4" style={{ color: "#60a5fa" }} />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1.5 flex-1">
        {NAV_ITEMS.map(({ id, Icon, label }) => {
          const isActive = view === id;
          return (
            <div key={id} className="relative sidebar-item">
              <button
                onClick={() => setView(id)}
                title={label}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150"
                style={
                  isActive
                    ? {
                        background: "var(--blue-soft)",
                        border: "1px solid var(--blue-border)",
                        color: "var(--blue)",
                      }
                    : {
                        background: "transparent",
                        border: "1px solid transparent",
                        color: "var(--text-3)",
                      }
                }
                onMouseEnter={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "var(--bg-elevated)";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text-2)";
                    (e.currentTarget as HTMLButtonElement).style.border =
                      "1px solid var(--bg-border)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    (e.currentTarget as HTMLButtonElement).style.background =
                      "transparent";
                    (e.currentTarget as HTMLButtonElement).style.color =
                      "var(--text-3)";
                    (e.currentTarget as HTMLButtonElement).style.border =
                      "1px solid transparent";
                  }
                }}
              >
                <Icon size={16} />
              </button>
              {/* Tooltip */}
              <span className="sidebar-tooltip">{label}</span>
            </div>
          );
        })}
      </nav>

      {/* Connection status dot */}
      <div className="relative sidebar-item mt-auto">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: "transparent",
            border: "1px solid transparent",
          }}
        >
          <span
            className="w-2 h-2 rounded-full"
            style={{
              background: statusColor,
              boxShadow: isConnected
                ? "0 0 6px rgba(16,185,129,0.6)"
                : isWakeWordListening
                ? "0 0 6px rgba(59,130,246,0.6)"
                : "none",
            }}
          />
        </div>
        <span className="sidebar-tooltip">{statusLabel}</span>
      </div>
    </aside>
  );
}
