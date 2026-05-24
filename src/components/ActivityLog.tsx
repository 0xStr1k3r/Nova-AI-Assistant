import React, { useEffect, useRef } from "react";
import { Brain, Terminal } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LogEntry {
  msg: string;
  type: "info" | "success" | "error" | "wake";
}

interface ActivityLogProps {
  logs: LogEntry[];
  onClear: () => void;
}

export default function ActivityLog({ logs, onClear }: ActivityLogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom on new log additions
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs]);

  return (
    <div
      className="flex-1 rounded-3xl p-5 flex flex-col min-h-0 relative group/log"
      style={{
        background: "rgba(255, 255, 255, 0.02)",
        border: "1px solid rgba(255, 255, 255, 0.05)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header section */}
      <div className="flex items-center justify-between mb-4 shrink-0 select-none">
        <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2 font-mono">
          <Terminal className="w-3.5 h-3.5 text-violet-400" />
          Terminal Logs
        </span>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={onClear}
              className="text-[10px] text-slate-500 hover:text-rose-400 font-mono px-2 py-0.5 rounded-lg hover:bg-white/5 transition-all cursor-pointer border border-white/5"
            >
              Clear
            </button>
          )}
          <span
            className="text-[10px] text-slate-400 font-mono px-2.5 py-0.5 rounded-lg border border-white/5"
            style={{ background: "rgba(255, 255, 255, 0.03)" }}
          >
            {logs.length}
          </span>
        </div>
      </div>

      {/* Log Feed Console */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1 select-text scrollbar-thin"
      >
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-700 gap-3 select-none">
              <Brain className="w-10 h-10 opacity-20" />
              <p className="text-xs font-semibold text-slate-500 font-mono uppercase tracking-wider">
                Console Standby
              </p>
            </div>
          ) : (
            logs.map((log, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/[0.015]"
                style={{
                  background: "rgba(255, 255, 255, 0.015)",
                  border: "1px solid rgba(255, 255, 255, 0.03)",
                }}
              >
                {/* Visual state indicator badges */}
                <span
                  className={`text-[8px] font-black px-2 py-0.5 rounded-md shrink-0 uppercase tracking-wider border select-none font-mono ${
                    log.type === "error"
                      ? "bg-red-500/10 text-red-400 border-red-500/20"
                      : log.type === "success"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : log.type === "wake"
                      ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                      : "bg-blue-500/8 text-blue-400 border-blue-500/15"
                  }`}
                >
                  {log.type === "wake" ? "WAKE" : log.type === "success" ? "LIVE" : log.type === "error" ? "ERR" : "SYS"}
                </span>

                {/* Log message */}
                <p
                  className={`text-[11px] leading-relaxed font-mono ${
                    log.type === "error"
                      ? "text-red-300/90"
                      : log.type === "success"
                      ? "text-emerald-300/90"
                      : log.type === "wake"
                      ? "text-violet-300/90"
                      : "text-slate-400"
                  }`}
                >
                  {log.msg}
                </p>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
