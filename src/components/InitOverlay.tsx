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
          style={{
            background: "radial-gradient(circle at center, #090918 0%, #030308 100%)",
            backdropFilter: "blur(28px)",
          }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.6, ease: "easeInOut" } }}
        >
          {/* Cyber HUD particle grid background decoration */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <div
              className="w-full h-full"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(139, 92, 246, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(139, 92, 246, 0.4) 1px, transparent 1px)",
                backgroundSize: "60px 60px",
              }}
            />
          </div>

          {/* Floating glowing nodes */}
          <div className="absolute w-[40vw] h-[40vw] rounded-full bg-violet-600/5 blur-[120px] top-[10%] left-[20%] animate-pulse" />
          <div className="absolute w-[35vw] h-[35vw] rounded-full bg-cyan-600/5 blur-[100px] bottom-[15%] right-[20%] animate-pulse" style={{ animationDelay: "2s" }} />

          <motion.div
            className="text-center space-y-9 max-w-md px-10 relative z-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.15, duration: 0.6, ease: "easeOut" } }}
          >
            {/* Core glowing logo node */}
            <div className="relative mx-auto w-32 h-32">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 opacity-30 blur-2xl animate-pulse" />
              <div className="absolute inset-[-4px] rounded-full border border-violet-500/10 animate-ping opacity-20" style={{ animationDuration: "3s" }} />
              <div className="absolute inset-0 rounded-full border border-violet-500/20" />
              <div
                className="relative w-32 h-32 rounded-full flex items-center justify-center"
                style={{
                  background: "radial-gradient(circle at 35% 35%, rgba(139, 92, 246, 0.28), rgba(99, 102, 241, 0.12))",
                  border: "1px solid rgba(139, 92, 246, 0.35)",
                  boxShadow: "inset 0 0 20px rgba(139, 92, 246, 0.3)",
                }}
              >
                <Zap className="w-14 h-14 text-violet-200 drop-shadow-[0_0_12px_rgba(139,92,246,0.5)]" />
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-3.5">
              <h1 className="text-6xl font-black tracking-tight font-display bg-gradient-to-r from-violet-200 via-indigo-200 to-cyan-200 bg-clip-text text-transparent">
                Nova
              </h1>
              <div className="w-12 h-0.5 bg-gradient-to-r from-violet-500 to-indigo-500 mx-auto rounded-full" />
              <p className="text-slate-400 text-sm leading-relaxed max-w-xs mx-auto">
                Next-generation local AI assistant.<br />
                Say <span className="text-violet-300 font-bold font-mono">"{wakeWord || "nova"}"</span> or click the orb to connect.
              </p>
            </div>

            {/* Activation Button */}
            <div className="space-y-4">
              <motion.button
                id="init-button"
                onClick={initSystem}
                className="w-full py-4.5 rounded-2xl font-bold text-sm tracking-wide relative overflow-hidden group select-none cursor-pointer"
                style={{
                  background: "linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(99, 102, 241, 0.3))",
                  border: "1px solid rgba(139, 92, 246, 0.5)",
                  boxShadow: "0 8px 32px rgba(139, 92, 246, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 ease-out" />
                <span className="relative text-white tracking-widest uppercase font-mono font-bold">
                  Initialize Assistant
                </span>
              </motion.button>
              <p className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">
                Requires Microphone Access
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
