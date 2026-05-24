import React from "react";
import { Mic, Power, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface OrbPanelProps {
  status: "idle" | "wake_listening" | "connecting" | "active";
  userName: string;
  wakeWord: string;
  activeModeName: string;
  sessionTime: number;
  connect: () => void;
  disconnect: () => void;
}

export default function OrbPanel({
  status,
  userName,
  wakeWord,
  activeModeName,
  sessionTime,
  connect,
  disconnect,
}: OrbPanelProps) {
  const isConnected = status === "active";
  const isConnecting = status === "connecting";
  const isWakeWordListening = status === "wake_listening";

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      className="lg:col-span-3 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden p-8 min-h-[460px] lg:min-h-0 select-none group/panel"
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Sci-fi corner brackets decoration */}
      <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 border-violet-500/20 group-hover/panel:border-violet-500/40 transition-colors duration-300" />
      <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 border-violet-500/20 group-hover/panel:border-violet-500/40 transition-colors duration-300" />
      <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 border-violet-500/20 group-hover/panel:border-violet-500/40 transition-colors duration-300" />
      <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 border-violet-500/20 group-hover/panel:border-violet-500/40 transition-colors duration-300" />

      {/* Ambient background glow highlights */}
      <div
        className={`absolute w-72 h-72 rounded-full transition-all duration-1000 blur-[100px] pointer-events-none opacity-40 ${
          isConnected
            ? "bg-emerald-500/10 scale-110"
            : isConnecting
            ? "bg-amber-500/10 scale-105 animate-pulse"
            : "bg-violet-500/5"
        }`}
      />

      {/* Central Interactive Orb */}
      <div className="relative z-10 orb-float" style={{ filter: "drop-shadow(0 0 50px rgba(139,92,246,0.15))" }}>
        {/* Dynamic Glow Layer */}
        <div className={`orb-glow ${isConnected ? "orb-glow-active" : ""}`} />

        <motion.button
          id="main-orb"
          onClick={isConnected || isConnecting ? disconnect : connect}
          className="w-56 h-56 rounded-full flex items-center justify-center relative select-none cursor-pointer focus:outline-none"
          style={{
            background: isConnected
              ? "radial-gradient(circle at 35% 35%, rgba(52, 211, 153, 0.28), rgba(16, 185, 129, 0.12))"
              : isConnecting
              ? "radial-gradient(circle at 35% 35%, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.08))"
              : "radial-gradient(circle at 35% 35%, rgba(139, 92, 246, 0.22), rgba(99, 102, 241, 0.08))",
            border: isConnected
              ? "1.5px solid rgba(52, 211, 153, 0.4)"
              : isConnecting
              ? "1.5px solid rgba(251, 191, 36, 0.3)"
              : "1.5px solid rgba(139, 92, 246, 0.3)",
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.94 }}
        >
          {/* Subtle Outer Pulsing Wave */}
          {(isConnected || isWakeWordListening) && (
            <motion.div
              className="absolute inset-[-12px] rounded-full pointer-events-none"
              style={{
                border: isConnected
                  ? "1px solid rgba(52, 211, 153, 0.2)"
                  : "1px solid rgba(139, 92, 246, 0.18)",
              }}
              animate={{
                scale: [0.95, 1.12, 0.95],
                opacity: [0.35, 0, 0.35],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          {/* Inner Glass Orb */}
          <div
            className="w-40 h-40 rounded-full flex items-center justify-center relative overflow-hidden"
            style={{
              background: "radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.07), rgba(0, 0, 0, 0.4))",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(12px)",
              boxShadow: "inset 0 4px 20px rgba(255, 255, 255, 0.05)",
            }}
          >
            <AnimatePresence mode="wait">
              {isConnecting ? (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <Activity className="w-16 h-16 text-amber-300 animate-spin" style={{ animationDuration: "2s" }} />
                </motion.div>
              ) : isConnected ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex gap-1.5 items-end h-11"
                >
                  {["bar-1", "bar-2", "bar-3", "bar-4", "bar-5", "bar-6", "bar-7"].map((b, i) => (
                    <div
                      key={i}
                      className={`w-2.5 bg-gradient-to-t from-emerald-400 to-cyan-300 rounded-full ${b}`}
                      style={{ minHeight: 6 }}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <Mic className="w-16 h-16 text-violet-300 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.button>
      </div>

      {/* Voice Status Text */}
      <div className="mt-10 text-center z-10 space-y-2 max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            className="text-2xl font-bold tracking-tight text-white font-display"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {isConnected
              ? `Listening, ${userName}…`
              : isConnecting
              ? "Waking assistant..."
              : isWakeWordListening
              ? `Say "${wakeWord}"`
              : "Nova Standby"}
          </motion.p>
        </AnimatePresence>
        <p className="text-[11px] text-slate-500 font-mono tracking-widest uppercase">
          {isConnected
            ? `SESSION ACTIVE · ${formatTime(sessionTime)}`
            : isWakeWordListening
            ? "BACKGROUND LISTENER ENGAGED"
            : "TAP ORB TO INITIATE MANUALLY"}
        </p>
      </div>

      {/* Action Footer Trigger (End Session / Standby indicator) */}
      <div className="absolute bottom-8 z-10 w-full px-8 flex justify-center">
        {isConnected ? (
          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={disconnect}
            className="px-6 py-2.5 rounded-full flex items-center gap-2 text-xs font-bold font-mono tracking-wider text-rose-300 hover:text-white transition-all border border-rose-500/25 bg-rose-500/10 cursor-pointer select-none"
            whileHover={{ scale: 1.03, background: "rgba(239, 68, 68, 0.2)", borderColor: "rgba(239, 68, 68, 0.4)" }}
            whileTap={{ scale: 0.97 }}
          >
            <Power className="w-3.5 h-3.5" />
            END VOICE STREAM
          </motion.button>
        ) : (
          <motion.p
            className="text-[10px] text-slate-600 font-mono tracking-widest uppercase"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            TAP ORB TO {isConnecting ? "CANCEL" : "WAKE"}
          </motion.p>
        )}
      </div>
    </div>
  );
}
