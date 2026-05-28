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
      className="lg:col-span-3 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden p-8 min-h-[460px] lg:min-h-0 select-none"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--bg-border)",
      }}
    >
      {/* Subtle corner brackets */}
      <div className="absolute top-4 left-4 w-5 h-5 border-t border-l" style={{ borderColor: "var(--bg-border-hover)" }} />
      <div className="absolute top-4 right-4 w-5 h-5 border-t border-r" style={{ borderColor: "var(--bg-border-hover)" }} />
      <div className="absolute bottom-4 left-4 w-5 h-5 border-b border-l" style={{ borderColor: "var(--bg-border-hover)" }} />
      <div className="absolute bottom-4 right-4 w-5 h-5 border-b border-r" style={{ borderColor: "var(--bg-border-hover)" }} />

      {/* Ambient glow */}
      <div
        className={`absolute w-80 h-80 rounded-full pointer-events-none transition-all duration-1000 blur-[120px]`}
        style={{
          background: isConnected
            ? "rgba(16,185,129,0.06)"
            : isConnecting
            ? "rgba(245,158,11,0.05)"
            : "rgba(59,130,246,0.04)",
          opacity: isConnected || isConnecting ? 1 : 0.6,
        }}
      />

      {/* Central Orb */}
      <div className="relative z-10 orb-float">
        {/* Glow layer */}
        <div className={`orb-glow ${isConnected ? "orb-glow-active" : ""}`} />

        <motion.button
          id="main-orb"
          onClick={isConnected || isConnecting ? disconnect : connect}
          className="w-52 h-52 rounded-full flex items-center justify-center relative select-none cursor-pointer focus:outline-none"
          style={{
            background: isConnected
              ? "radial-gradient(circle at 35% 35%, rgba(16,185,129,0.2), rgba(4,120,87,0.08))"
              : isConnecting
              ? "radial-gradient(circle at 35% 35%, rgba(245,158,11,0.15), rgba(180,83,9,0.06))"
              : "radial-gradient(circle at 35% 35%, rgba(59,130,246,0.15), rgba(29,78,216,0.06))",
            border: isConnected
              ? "1.5px solid rgba(16,185,129,0.35)"
              : isConnecting
              ? "1.5px solid rgba(245,158,11,0.3)"
              : "1.5px solid rgba(59,130,246,0.25)",
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.94 }}
        >
          {/* Pulse ring */}
          {(isConnected || isWakeWordListening) && (
            <motion.div
              className="absolute inset-[-14px] rounded-full pointer-events-none"
              style={{
                border: isConnected
                  ? "1px solid rgba(16,185,129,0.18)"
                  : "1px solid rgba(59,130,246,0.15)",
              }}
              animate={{ scale: [0.95, 1.12, 0.95], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
          )}

          {/* Inner glass */}
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center relative overflow-hidden"
            style={{
              background: "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.05), rgba(0,0,0,0.3))",
              border: "1px solid rgba(255,255,255,0.05)",
              backdropFilter: "blur(12px)",
            }}
          >
            <AnimatePresence mode="wait">
              {isConnecting ? (
                <motion.div
                  key="connecting"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Activity
                    className="w-14 h-14 animate-spin"
                    style={{ color: "var(--warn)", animationDuration: "2s" }}
                  />
                </motion.div>
              ) : isConnected ? (
                <motion.div
                  key="active"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="flex gap-1.5 items-end h-10"
                >
                  {["bar-1", "bar-2", "bar-3", "bar-4", "bar-5", "bar-6", "bar-7"].map((b, i) => (
                    <div
                      key={i}
                      className={`w-2 rounded-full ${b}`}
                      style={{
                        minHeight: 4,
                        background: "linear-gradient(to top, #10b981, #34d399)",
                      }}
                    />
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Mic
                    className="w-14 h-14"
                    style={{ color: "#60a5fa" }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.button>
      </div>

      {/* Status text */}
      <div className="mt-10 text-center z-10 space-y-2 max-w-sm">
        <AnimatePresence mode="wait">
          <motion.p
            key={status}
            className="text-2xl font-semibold tracking-tight text-white"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
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
        <p className="font-mono uppercase" style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.1em" }}>
          {isConnected
            ? `SESSION ACTIVE · ${formatTime(sessionTime)}`
            : isWakeWordListening
            ? "BACKGROUND LISTENER ENGAGED"
            : "TAP ORB TO INITIATE MANUALLY"}
        </p>
      </div>

      {/* Footer action */}
      <div className="absolute bottom-8 z-10 w-full px-8 flex justify-center">
        {isConnected ? (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={disconnect}
            className="px-5 py-2 rounded-xl flex items-center gap-2 text-xs font-medium font-mono tracking-wide transition-all cursor-pointer select-none"
            style={{
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.2)",
              background: "rgba(239,68,68,0.07)",
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <Power className="w-3.5 h-3.5" />
            END SESSION
          </motion.button>
        ) : (
          <motion.p
            className="font-mono uppercase"
            style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.1em" }}
            animate={{ opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            TAP ORB TO {isConnecting ? "CANCEL" : "WAKE"}
          </motion.p>
        )}
      </div>
    </div>
  );
}
