import React from "react";
import { Cpu, Brain, Mic, ShieldAlert } from "lucide-react";

interface SystemStatsProps {
  activeModeName: string;
  wakeWord: string;
  memoryCount: number;
  voiceProfileCount: number;
  voiceMode: "all" | "user";
}

export default function SystemStats({
  activeModeName,
  wakeWord,
  memoryCount,
  voiceProfileCount,
  voiceMode,
}: SystemStatsProps) {
  const stats = [
    {
      label: "System Mode",
      value: activeModeName,
      icon: Cpu,
      accentColor: "#60a5fa",
      accentBg: "rgba(59,130,246,0.08)",
    },
    {
      label: "Wake Phrase",
      value: `"${wakeWord}"`,
      icon: Mic,
      accentColor: "#34d399",
      accentBg: "rgba(16,185,129,0.08)",
    },
    {
      label: "Smart Memory",
      value: `${memoryCount} facts`,
      icon: Brain,
      accentColor: "#a78bfa",
      accentBg: "rgba(139,92,246,0.08)",
    },
    {
      label: "Voice Gating",
      value: voiceMode === "user" ? "User Only" : "Open (All Voices)",
      icon: ShieldAlert,
      accentColor: voiceMode === "user" ? "#fbbf24" : "var(--text-secondary)",
      accentBg: voiceMode === "user" ? "rgba(245,158,11,0.08)" : "var(--bg-elevated)",
    },
  ];

  return (
    <div
      className="rounded-2xl p-5 shrink-0 select-none"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--bg-border)",
      }}
    >
      <h3
        className="flex items-center gap-2 font-mono font-semibold mb-4"
        style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}
      >
        <Cpu className="w-3.5 h-3.5 breathing" style={{ color: "#60a5fa" }} />
        Core Telemetry
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="p-3.5 rounded-xl transition-all duration-200"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--bg-border)",
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--bg-border-hover)")}
              onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--bg-border)")}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="p-1 rounded-lg"
                  style={{ background: stat.accentBg }}
                >
                  <Icon className="w-3 h-3" style={{ color: stat.accentColor }} />
                </div>
                <p
                  className="font-mono font-semibold uppercase"
                  style={{ fontSize: "9px", color: "var(--text-muted)", letterSpacing: "0.08em" }}
                >
                  {stat.label}
                </p>
              </div>
              <p className="text-xs font-medium truncate text-white font-mono">{stat.value}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
