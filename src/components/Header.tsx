import React from "react";
import { Mic, MicOff, Zap } from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  isWakeWordListening: boolean;
  toggleWakeWord: () => void;
  status: "idle" | "wake_listening" | "connecting" | "active";
  activeModeName: string;
  view: "home" | "settings" | "agents";
  wakeWord: string;
}

const VIEW_TITLES: Record<string, { title: string; sub: string }> = {
  home:     { title: "Nova OS",         sub: "Voice Assistant Hub" },
  settings: { title: "Settings",        sub: "Personalise your assistant" },
  agents:   { title: "Agent Control",   sub: "Multi-agent orchestration" },
};

export default function Header({
  isWakeWordListening,
  toggleWakeWord,
  status,
  activeModeName,
  view,
  wakeWord,
}: HeaderProps) {
  const isConnected  = status === "active";
  const isConnecting = status === "connecting";
  const { title, sub } = VIEW_TITLES[view] || VIEW_TITLES.home;

  return (
    <header
      className="relative z-20 px-5 py-3.5 flex items-center justify-between shrink-0"
      style={{
        borderBottom: "1px solid var(--bg-border)",
        background: "var(--bg-surface)",
      }}
    >
      {/* Page title */}
      <div className="flex items-center gap-3">
        <div>
          <h1 style={{ fontSize: 14, fontWeight: 700, color: "var(--text-1)", lineHeight: 1.2 }}>
            {title}
          </h1>
          <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {view === "home" ? activeModeName : sub}
          </p>
        </div>
      </div>

      {/* Controls — only show on home view */}
      <div className="flex items-center gap-2">
        {view === "home" && (
          <>
            {/* Wake word toggle */}
            <motion.button
              id="wake-toggle"
              onClick={toggleWakeWord}
              title="Toggle wake word listening"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 select-none"
              style={
                isWakeWordListening
                  ? { background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd" }
                  : { background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-2)" }
              }
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              {isWakeWordListening
                ? <Mic className="w-3.5 h-3.5 breathing" style={{ color: "#60a5fa" }} />
                : <MicOff className="w-3.5 h-3.5" />
              }
              <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
                {isWakeWordListening ? `HEARING "${wakeWord.toUpperCase()}"` : "SLEEPING"}
              </span>
            </motion.button>
          </>
        )}

        {/* Live status badge — always visible */}
        <div
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium select-none"
          style={
            isConnected
              ? { background: "var(--green-soft)", border: "1px solid rgba(16,185,129,0.25)", color: "#6ee7b7" }
              : isConnecting
              ? { background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#fcd34d" }
              : { background: "var(--bg-elevated)", border: "1px solid var(--bg-border)", color: "var(--text-3)" }
          }
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${isConnected || isConnecting ? "animate-pulse" : ""}`}
            style={{ background: isConnected ? "var(--green)" : isConnecting ? "var(--amber)" : "var(--text-3)" }}
          />
          <span className="font-mono" style={{ fontSize: 11, letterSpacing: "0.05em" }}>
            {isConnected ? "LIVE" : isConnecting ? "WAKING" : "STANDBY"}
          </span>
        </div>
      </div>
    </header>
  );
}
