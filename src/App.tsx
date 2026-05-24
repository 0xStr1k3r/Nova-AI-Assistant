/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Settings, Power, Zap, Brain, Activity } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { pcmToBase64 } from "./utils/audio";
import { AudioStreamer } from "./utils/AudioStreamer";
import SettingsModal from "./components/SettingsModal";

type AppStatus = "idle" | "wake_listening" | "connecting" | "active";

export default function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [logs, setLogs] = useState<{ msg: string; type: "info" | "success" | "error" | "wake" }[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [lastCommand, setLastCommand] = useState("");
  const [sessionTime, setSessionTime] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const isWakeListeningRef = useRef(false);
  const sessionTimerRef = useRef<any>(null);
  // Refs that always hold the latest value — prevents stale closures inside recognition callbacks
  const statusRef = useRef<AppStatus>("idle");
  const configRef = useRef<any>(null);

  const isConnected = status === "active";
  const isConnecting = status === "connecting";
  const isWakeWordListening = status === "wake_listening";

  // Keep refs in sync
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { configRef.current = config; }, [config]);

  const addLog = (msg: string, type: "info" | "success" | "error" | "wake" = "info") => {
    setLogs(prev => [...prev, { msg, type }].slice(-60));
    if (type !== "info") setLastCommand(msg);
  };

  useEffect(() => {
    if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(setConfig);
  }, []);

  // Auto-detect if mic permission already granted
  useEffect(() => {
    const checkMic = async () => {
      try {
        if (navigator.permissions?.query) {
          const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (s.state === "granted") {
            setHasInteracted(true);
            localStorage.setItem("nova_engaged", "true");
          }
          s.onchange = () => {
            if (s.state === "granted") {
              setHasInteracted(true);
              localStorage.setItem("nova_engaged", "true");
            } else {
              setHasInteracted(false);
              localStorage.removeItem("nova_engaged");
            }
          };
        } else if (localStorage.getItem("nova_engaged") === "true") {
          setHasInteracted(true);
        }
      } catch {
        if (localStorage.getItem("nova_engaged") === "true") setHasInteracted(true);
      }
    };
    checkMic();
  }, []);

  // Resume AudioContext on click
  useEffect(() => {
    const resume = () => {
      if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {});
    };
    window.addEventListener("click", resume);
    return () => window.removeEventListener("click", resume);
  }, []);

  // Session timer
  useEffect(() => {
    if (isConnected) {
      setSessionTime(0);
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    } else {
      clearInterval(sessionTimerRef.current);
    }
    return () => clearInterval(sessionTimerRef.current);
  }, [isConnected]);

  // Auto-start wake word listening once interacted + config loaded
  useEffect(() => {
    if (hasInteracted && config && status === "idle") {
      startWakeWordListening();
    }
  }, [hasInteracted, config]);

  const startWakeWordListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      addLog("Speech recognition not supported.", "error");
      return;
    }
    if (isWakeListeningRef.current) return;

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript.trim().toLowerCase();
      // Use refs to read latest values — avoids stale closures
      const wakeWord = configRef.current?.wakeWord?.toLowerCase() || "nova";
      if (transcript.includes(wakeWord)) {
        addLog(`Wake word "${wakeWord}" detected — activating Nova`, "wake");
        const currentStatus = statusRef.current;
        if (currentStatus !== "active" && currentStatus !== "connecting") {
          connect();
        }
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== "no-speech" && e.error !== "aborted") {
        addLog(`Microphone error: ${e.error}`, "error");
      }
    };

    recognition.onend = () => {
      // Auto-restart if we are supposed to be listening
      if (isWakeListeningRef.current) {
        try { recognition.start(); } catch (_) {}
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    isWakeListeningRef.current = true;
    setStatus("wake_listening");
    addLog(`Listening for wake word "${config?.wakeWord || 'nova'}"`, "info");
  };

  const stopWakeWordListening = () => {
    isWakeListeningRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
      recognitionRef.current = null;
    }
  };

  const toggleWakeWord = () => {
    if (isWakeWordListening) {
      stopWakeWordListening();
      setStatus("idle");
      addLog("Wake word listening paused.", "info");
    } else {
      startWakeWordListening();
    }
  };

  const connect = async () => {
    try {
      setStatus("connecting");
      addLog("Initializing voice pipeline...", "info");

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      streamerRef.current = new AudioStreamer(audioCtx);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      source.connect(processor);
      processor.connect(audioCtx.destination);

      addLog("Connecting to Nova AI core...", "info");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/live`);
      wsRef.current = ws;

      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ audio: pcmToBase64(e.inputBuffer.getChannelData(0)) }));
        }
      };

      ws.onopen = () => {
        const userName = configRef.current?.userName || "there";
        addLog(`Nova is online — speak naturally, ${userName}`, "success");
        setStatus("active");
        stopWakeWordListening();
      };

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) streamerRef.current?.addPCM16(msg.audio);
        if (msg.interrupted) {
          addLog("Response interrupted", "info");
          streamerRef.current?.stop();
        }
        if (msg.action === "endSession") {
          addLog("Nova ended the session — saying goodbye", "info");
          disconnect();
        }
      };

      ws.onclose = () => {
        addLog("Session closed", "info");
        disconnect();
      };

      ws.onerror = () => {
        addLog("Connection error — check your network", "error");
        disconnect();
      };

    } catch (err: any) {
      addLog(`Failed to connect: ${err.message}`, "error");
      disconnect();
    }
  };

  const disconnect = () => {
    if (processorRef.current) processorRef.current.disconnect();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    wsRef.current?.close();

    processorRef.current = null;
    mediaStreamRef.current = null;
    audioCtxRef.current = null;
    wsRef.current = null;
    streamerRef.current = null;

    // Resume wake word listening after disconnect (use ref to avoid stale closure)
    setTimeout(() => {
      if (configRef.current?.wakeWord) startWakeWordListening();
      else setStatus("idle");
    }, 1200);
  };

  const initSystem = () => {
    setHasInteracted(true);
    localStorage.setItem("nova_engaged", "true");
  };

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const activeModeName = config?.modes?.find((m: any) => m.id === config?.activeModeId)?.name || "Assistant";

  return (
    <div className="min-h-screen bg-[#080810] text-white overflow-hidden relative flex items-center justify-center select-none">

      {/* Background ambience */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-15%] w-[60%] h-[60%] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-15%] w-[70%] h-[70%] rounded-full bg-indigo-600/8 blur-[150px]" />
        <div className="absolute top-[30%] right-[-5%] w-[30%] h-[40%] rounded-full bg-cyan-500/5 blur-[100px]" />
        {isConnected && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute top-[-10%] left-[20%] w-[60%] h-[50%] rounded-full bg-emerald-500/6 blur-[120px]" />
          </motion.div>
        )}
        <div className="scan-line" />
      </div>

      {/* Initialization overlay */}
      <AnimatePresence>
        {!hasInteracted && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(8,8,16,0.97)", backdropFilter: "blur(20px)" }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.6 } }}
          >
            <motion.div
              className="text-center space-y-8 max-w-sm px-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0, transition: { delay: 0.2 } }}
            >
              {/* Nova logo */}
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/30 to-indigo-500/30 blur-xl" />
                <div className="relative w-24 h-24 rounded-full border border-violet-500/40 bg-violet-500/10 flex items-center justify-center">
                  <Zap className="w-10 h-10 text-violet-400" />
                </div>
              </div>

              <div className="space-y-2">
                <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-violet-300 to-indigo-300 bg-clip-text text-transparent">Nova</h1>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Your personal AI assistant is ready. <br />
                  Say <span className="text-violet-400 font-semibold">"{config?.wakeWord || 'nova'}"</span> to wake me up.
                </p>
              </div>

              <motion.button
                id="init-button"
                onClick={initSystem}
                className="w-full py-3.5 rounded-2xl font-semibold text-sm tracking-wide transition-all duration-300 relative overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.3))",
                  border: "1px solid rgba(139,92,246,0.5)",
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="relative z-10 text-violet-200">Activate Nova</span>
              </motion.button>

              <p className="text-[11px] text-slate-600">Microphone access will be requested</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App */}
      <div className="relative z-10 w-full max-w-5xl h-screen max-h-[800px] flex flex-col p-4 sm:p-6 gap-4">

        {/* Top Bar */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center">
              <Zap className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">Nova</h1>
              <p className="text-[10px] text-slate-500 font-mono mt-0.5">AI Voice Assistant · {activeModeName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Wake word toggle */}
            <motion.button
              id="wake-toggle"
              onClick={toggleWakeWord}
              title="Toggle wake word listening"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all duration-200 ${
                isWakeWordListening
                  ? "bg-violet-500/20 border border-violet-500/40 text-violet-300"
                  : "bg-white/5 border border-white/10 text-slate-500 hover:text-slate-300"
              }`}
              whileTap={{ scale: 0.95 }}
            >
              {isWakeWordListening
                ? <Mic className="w-3 h-3 animate-pulse" />
                : <MicOff className="w-3 h-3" />}
              <span>{isWakeWordListening ? "Listening" : "Paused"}</span>
            </motion.button>

            {/* Status pill */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : isConnecting
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                : "bg-white/5 border-white/10 text-slate-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? "bg-emerald-400 animate-pulse"
                : isConnecting ? "bg-amber-400 animate-pulse"
                : "bg-slate-600"
              }`} />
              {isConnected ? "Active" : isConnecting ? "Connecting" : "Standby"}
            </div>

            {/* Settings */}
            <motion.button
              id="settings-btn"
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all"
              whileTap={{ scale: 0.9 }}
            >
              <Settings className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-4 min-h-0">

          {/* Left: Orb panel */}
          <div className="lg:col-span-3 glass rounded-3xl flex flex-col items-center justify-center relative overflow-hidden p-8">

            {/* Ambient ring decoration */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className={`w-[420px] h-[420px] rounded-full border border-violet-500/5 ring-1 ${isConnected ? "opacity-100" : "opacity-40"}`} />
              <div className={`absolute w-[330px] h-[330px] rounded-full border border-indigo-500/8 ring-2 ${isConnected ? "opacity-100" : "opacity-30"}`} />
              <div className={`absolute w-[240px] h-[240px] rounded-full border border-violet-500/10 ring-3 ${isConnected ? "opacity-100" : "opacity-20"}`} />
            </div>

            {/* Central Orb */}
            <div className="relative z-10 orb-float">
              <motion.button
                id="main-orb"
                onClick={isConnected || isConnecting ? disconnect : connect}
                className={`w-40 h-40 rounded-full flex items-center justify-center relative transition-all duration-700 ${
                  isConnected ? "orb-active" : "orb-standby"
                }`}
                style={{
                  background: isConnected
                    ? "radial-gradient(circle at 30% 30%, rgba(52,211,153,0.3), rgba(16,185,129,0.15))"
                    : isConnecting
                    ? "radial-gradient(circle at 30% 30%, rgba(251,191,36,0.2), rgba(245,158,11,0.1))"
                    : "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.3), rgba(99,102,241,0.15))",
                  border: isConnected
                    ? "1px solid rgba(52,211,153,0.3)"
                    : isConnecting
                    ? "1px solid rgba(251,191,36,0.3)"
                    : "1px solid rgba(139,92,246,0.3)",
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {/* Inner orb core */}
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center"
                  style={{
                    background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.08), rgba(0,0,0,0.4))",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <AnimatePresence mode="wait">
                    {isConnecting ? (
                      <motion.div key="connecting" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <Activity className="w-10 h-10 text-amber-400 animate-spin" />
                      </motion.div>
                    ) : isConnected ? (
                      <motion.div key="active" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex gap-1 items-end h-9">
                        {["bar-1","bar-2","bar-3","bar-4","bar-5","bar-6","bar-7"].map((b, i) => (
                          <div key={i} className={`w-1.5 bg-emerald-400 rounded-full ${b}`} style={{ minHeight: "4px" }} />
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div key="idle" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                        <Mic className="w-10 h-10 text-violet-300" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.button>
            </div>

            {/* Status text */}
            <div className="mt-10 text-center z-10 space-y-1">
              <AnimatePresence mode="wait">
                <motion.p
                  key={status}
                  className="text-xl font-light text-white"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  {isConnected
                    ? "Listening, Chiru..."
                    : isConnecting
                    ? "Waking up..."
                    : isWakeWordListening
                    ? `Say "${config?.wakeWord || 'nova'}" to start`
                    : "Nova is paused"}
                </motion.p>
              </AnimatePresence>

              <p className="text-[11px] text-slate-500 font-mono tracking-wider uppercase">
                {isConnected
                  ? `Session ${formatTime(sessionTime)} · ${activeModeName}`
                  : isWakeWordListening
                  ? "Wake word detection active"
                  : "Click orb to connect manually"}
              </p>
            </div>

            {/* Hint text */}
            {!isConnected && (
              <p className="absolute bottom-5 text-[10px] text-slate-600 font-mono">
                TAP ORB TO {isConnecting ? "CANCEL" : "CONNECT MANUALLY"}
              </p>
            )}
          </div>

          {/* Right: Activity log */}
          <div className="lg:col-span-2 flex flex-col gap-3 min-h-0">

            {/* Activity feed */}
            <div className="flex-1 glass rounded-3xl p-5 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Brain className="w-3 h-3 text-violet-400" />
                  Activity Log
                </span>
                <span className="text-[10px] text-slate-600 font-mono">{logs.length} events</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-1">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-2">
                    <Brain className="w-8 h-8 opacity-30" />
                    <p className="text-xs">No activity yet</p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2.5"
                    >
                      <div className={`w-1 rounded-full shrink-0 mt-1.5 ${
                        log.type === "error" ? "bg-red-500 h-3"
                        : log.type === "success" ? "bg-emerald-400 h-3"
                        : log.type === "wake" ? "bg-violet-400 h-3"
                        : "bg-slate-600 h-2"
                      }`} />
                      <p className={`text-xs leading-relaxed ${
                        log.type === "error" ? "text-red-300"
                        : log.type === "success" ? "text-emerald-300"
                        : log.type === "wake" ? "text-violet-300 font-medium"
                        : "text-slate-400"
                      }`}>
                        {log.msg}
                      </p>
                    </motion.div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </div>

            {/* System status card */}
            <div className="glass rounded-2xl p-4 shrink-0">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Mode</p>
                  <p className="text-xs text-slate-300 font-medium">{activeModeName}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Wake Word</p>
                  <p className="text-xs text-violet-300 font-medium font-mono">"{config?.wakeWord || 'nova'}"</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">Memory</p>
                  <p className="text-xs text-slate-300 font-medium">{config?.memory?.length || 0} facts</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">User</p>
                  <p className="text-xs text-slate-300 font-medium">{config?.userName || 'User'}</p>
                </div>
              </div>
            </div>

            {/* Power / disconnect button when active */}
            {isConnected && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={disconnect}
                className="shrink-0 glass rounded-2xl p-3 flex items-center justify-center gap-2 text-red-400/70 hover:text-red-300 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/30 transition-all duration-200 text-sm font-medium"
              >
                <Power className="w-4 h-4" />
                End Session
              </motion.button>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between shrink-0 px-1">
          <div className="flex items-center gap-4 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
            <span>Nova v3.0</span>
            <span>Gemini Live API</span>
            <span>BlackArch Linux</span>
          </div>
          <div className="text-[10px] text-slate-600 font-mono">
            {isConnected ? `● LIVE ${formatTime(sessionTime)}` : isWakeWordListening ? "○ STANDBY" : "◌ OFFLINE"}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          config={config}
          setConfig={setConfig}
        />
      )}
    </div>
  );
}
