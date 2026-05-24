import React from "react";
import { Mic, MicOff, Settings, Zap } from "lucide-react";
import { motion } from "motion/react";

interface HeaderProps {
  isWakeWordListening: boolean;
  toggleWakeWord: () => void;
  status: "idle" | "wake_listening" | "connecting" | "active";
  activeModeName: string;
  setShowSettings: (show: boolean) => void;
  wakeWord: string;
}

export default function Header({
  isWakeWordListening,
  toggleWakeWord,
  status,
  activeModeName,
  setShowSettings,
  wakeWord,
}: HeaderProps) {
  const isConnected = status === "active";
  const isConnecting = status === "connecting";

  return (
    <header
      className="relative z-20 px-6 py-4 flex items-center justify-between shrink-0 transition-all duration-300"
      style={{
        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(16px)",
        background: "linear-gradient(to bottom, rgba(6, 6, 16, 0.85), rgba(6, 6, 16, 0.4))",
      }}
    >
      {/* Brand Branding */}
      <div className="flex items-center gap-3.5">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center relative overflow-hidden group"
          style={{
            background: "linear-gradient(135deg, rgba(139, 92, 246, 0.6), rgba(99, 102, 241, 0.5))",
            border: "1px solid rgba(139, 92, 246, 0.4)",
            boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)",
          }}
        >
          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-black text-white tracking-tight leading-none font-display">
              Nova
            </h1>
            <span className="text-[9px] bg-violet-500/10 text-violet-300 border border-violet-500/25 px-1.5 py-0.5 rounded-full font-mono font-bold tracking-widest uppercase">
              OS
            </span>
          </div>
          <p className="text-[10px] text-slate-500 font-mono mt-0.5 uppercase tracking-widest">
            {activeModeName}
          </p>
        </div>
      </div>

      {/* Control panel buttons */}
      <div className="flex items-center gap-3">
        {/* Wake word status controller */}
        <motion.button
          id="wake-toggle"
          onClick={toggleWakeWord}
          title="Toggle wake word listening"
          className={`flex items-center gap-2.5 px-4 py-2 rounded-xl font-semibold text-xs transition-all duration-300 select-none ${
            isWakeWordListening
              ? "text-white"
              : "text-slate-400 hover:text-slate-200"
          }`}
          style={
            isWakeWordListening
              ? {
                  background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(99, 102, 241, 0.3))",
                  border: "1px solid rgba(139, 92, 246, 0.45)",
                  boxShadow: "0 4px 20px rgba(139, 92, 246, 0.15)",
                }
              : {
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }
          }
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          {isWakeWordListening ? (
            <Mic className="w-3.5 h-3.5 text-violet-300 animate-pulse" />
          ) : (
            <MicOff className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span className="font-mono">
            {isWakeWordListening ? `HEARING "${wakeWord.toUpperCase()}"` : "SLEEPING"}
          </span>
        </motion.button>

        {/* Live Status Badge */}
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold select-none border transition-all ${
            isConnected
              ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
              : isConnecting
              ? "text-amber-300 bg-amber-500/10 border-amber-500/20"
              : "text-slate-400 bg-white/3 border-white/5"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected
                ? "bg-emerald-400 animate-pulse"
                : isConnecting
                ? "bg-amber-400 animate-pulse"
                : "bg-slate-600"
            }`}
          />
          <span className="font-mono">
            {isConnected ? "LIVE" : isConnecting ? "WAKING" : "STANDBY"}
          </span>
        </div>

        {/* Settings modal controller */}
        <motion.button
          id="settings-btn"
          onClick={() => setShowSettings(true)}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-all duration-300"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px solid rgba(255, 255, 255, 0.06)",
          }}
          whileHover={{ scale: 1.05, rotate: 15 }}
          whileTap={{ scale: 0.95 }}
        >
          <Settings className="w-4.5 h-4.5" />
        </motion.button>
      </div>
    </header>
  );
}
