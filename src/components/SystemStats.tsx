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
  const isGated = voiceMode === "user";

  const stats = [
    {
      label: "System Mode",
      value: activeModeName,
      icon: Cpu,
      colorClass: "text-violet-400",
      bgClass: "bg-violet-500/5",
    },
    {
      label: "Wake Phrase",
      value: `"${wakeWord}"`,
      icon: Mic,
      colorClass: "text-cyan-400 font-mono",
      bgClass: "bg-cyan-500/5",
    },
    {
      label: "Smart Memory",
      value: `${memoryCount} facts`,
      icon: Brain,
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/5",
    },
    {
      label: "Voice Gating",
      value: "Open (All Voices)",
      icon: ShieldAlert,
      colorClass: "text-slate-400",
      bgClass: "bg-slate-500/5",
    },
  ];

  return (
    <div
      className="rounded-3xl p-5 shrink-0 select-none"
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(16px)",
      }}
    >
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2 font-mono">
        <Cpu className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
        Core Telemetry
      </h3>
      <div className="grid grid-cols-2 gap-3.5">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              className="p-3.5 rounded-2xl transition-all duration-300 hover:scale-[1.01] hover:bg-white/[0.015]"
              style={{
                background: "rgba(255, 255, 255, 0.015)",
                border: "1px solid rgba(255, 255, 255, 0.03)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className={`p-1 rounded-lg ${stat.bgClass}`}>
                  <Icon className={`w-3.5 h-3.5 ${stat.colorClass}`} />
                </div>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest font-mono font-bold">
                  {stat.label}
                </p>
              </div>
              <p className={`text-xs font-bold truncate text-white`}>
                {stat.value}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
