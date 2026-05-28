import React from "react";
import { Zap } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface InitOverlayProps {
  hasInteracted: boolean;
  initSystem: () => void;
  wakeWord: string;
}

export default function InitOverlay({
  hasInteracted,
  initSystem,
  wakeWord,
}: InitOverlayProps) {
  return (
    <AnimatePresence>
      {!hasInteracted && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden"
          style={{ background: "#0a0c10", backdropFilter: "blur(28px)" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, ease: "easeInOut" } }}
        >
          {/* Subtle grid */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />

          {/* Ambient glows */}
          <div
            className="absolute w-[45vw] h-[45vw] rounded-full animate-pulse"
            style={{ background: "rgba(59,130,246,0.04)", filter: "blur(120px)", top: "5%", left: "15%" }}
          />
          <div
            className="absolute w-[35vw] h-[35vw] rounded-full animate-pulse"
            style={{ background: "rgba(99,102,241,0.03)", filter: "blur(100px)", bottom: "10%", right: "15%", animationDelay: "2s" }}
          />

          <motion.div
            className="text-center space-y-10 max-w-sm px-10 relative z-10"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.1, duration: 0.5, ease: "easeOut" } }}
          >
            {/* Logo orb */}
            <div className="relative mx-auto w-28 h-28">
              <div
                className="absolute inset-0 rounded-full animate-pulse"
                style={{ background: "rgba(59,130,246,0.15)", filter: "blur(24px)" }}
              />
              <motion.div
                className="absolute inset-[-4px] rounded-full"
                style={{ border: "1px solid rgba(59,130,246,0.08)" }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
              <div
                className="relative w-28 h-28 rounded-full flex items-center justify-center"
                style={{
                  background: "radial-gradient(circle at 35% 35%, rgba(59,130,246,0.2), rgba(29,78,216,0.08))",
                  border: "1px solid rgba(59,130,246,0.25)",
                }}
              >
                <Zap className="w-12 h-12" style={{ color: "#60a5fa" }} />
              </div>
            </div>

            {/* Title */}
            <div className="space-y-3">
              <h1
                className="text-5xl font-bold tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #f0f4ff 0%, #93c5fd 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                Nova
              </h1>
              <div className="w-10 h-px mx-auto" style={{ background: "var(--accent-border)" }} />
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Your local AI assistant.{" "}
                <br />
                Say{" "}
                <span className="font-mono font-semibold" style={{ color: "#93c5fd" }}>
                  "{wakeWord || "nova"}"
                </span>{" "}
                or tap to connect.
              </p>
            </div>

            {/* CTA button */}
            <div className="space-y-3">
              <motion.button
                id="init-button"
                onClick={initSystem}
                className="w-full py-4 rounded-xl font-semibold text-sm tracking-wide relative overflow-hidden cursor-pointer select-none"
                style={{
                  background: "var(--accent-dim)",
                  border: "1px solid var(--accent-border)",
                  color: "#93c5fd",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div
                  className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-700"
                  style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)" }}
                />
                <span className="relative font-mono tracking-widest uppercase text-xs font-bold">
                  Initialize Assistant
                </span>
              </motion.button>
              <p
                className="font-mono uppercase"
                style={{ fontSize: "10px", color: "var(--text-muted)", letterSpacing: "0.1em" }}
              >
                Requires Microphone Access
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
