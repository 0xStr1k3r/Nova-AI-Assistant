import React, { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
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

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [logs]);

  const badge = (type: LogEntry["type"]) => {
    const map = {
      error:   { label: "ERR",  bg: "rgba(239,68,68,0.1)",   color: "#f87171",  border: "rgba(239,68,68,0.2)" },
      success: { label: "OK",   bg: "rgba(16,185,129,0.1)",  color: "#6ee7b7",  border: "rgba(16,185,129,0.2)" },
      wake:    { label: "WAKE", bg: "rgba(59,130,246,0.1)",  color: "#93c5fd",  border: "rgba(59,130,246,0.2)" },
      info:    { label: "SYS",  bg: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", border: "var(--bg-border)" },
    };
    return map[type];
  };

  const msgColor = (type: LogEntry["type"]) => {
    if (type === "error") return "#f87171";
    if (type === "success") return "#6ee7b7";
    if (type === "wake") return "#93c5fd";
    return "var(--text-secondary)";
  };

  return (
    <div
      className="flex-1 rounded-2xl p-5 flex flex-col min-h-0 relative"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--bg-border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0 select-none">
        <span
          className="flex items-center gap-2 font-mono font-semibold"
          style={{ fontSize: "11px", color: "var(--text-secondary)", letterSpacing: "0.08em", textTransform: "uppercase" }}
        >
          <Terminal className="w-3.5 h-3.5" style={{ color: "#60a5fa" }} />
          Terminal Logs
        </span>
        <div className="flex items-center gap-2">
          {logs.length > 0 && (
            <button
              onClick={onClear}
              className="font-mono px-2 py-0.5 rounded-lg transition-all cursor-pointer"
              style={{ fontSize: "10px", color: "var(--text-muted)", border: "1px solid var(--bg-border)", background: "var(--bg-elevated)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
            >
              Clear
            </button>
          )}
          <span
            className="font-mono px-2.5 py-0.5 rounded-lg"
            style={{ fontSize: "10px", color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--bg-border)" }}
          >
            {logs.length}
          </span>
        </div>
      </div>

      {/* Log Feed */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1 select-text"
      >
        <AnimatePresence initial={false}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 select-none">
              <Terminal className="w-8 h-8" style={{ color: "var(--text-muted)", opacity: 0.4 }} />
              <p className="font-mono uppercase" style={{ fontSize: "11px", color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                Console Standby
              </p>
            </div>
          ) : (
            logs.map((log, i) => {
              const b = badge(log.type);
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--bg-border)",
                  }}
                >
                  <span
                    className="font-mono font-bold shrink-0 uppercase px-1.5 py-0.5 rounded-md"
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.08em",
                      background: b.bg,
                      color: b.color,
                      border: `1px solid ${b.border}`,
                    }}
                  >
                    {b.label}
                  </span>
                  <p
                    className="font-mono leading-relaxed"
                    style={{ fontSize: "11px", color: msgColor(log.type) }}
                  >
                    {log.msg}
                  </p>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
