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
import { detectPitch, matchesVoiceProfile, calculateRMS } from "./utils/voiceProfile";

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
  const connectingLockRef = useRef(false);
  const standbyAudioCtxRef = useRef<AudioContext | null>(null);
  const standbyStreamRef = useRef<MediaStream | null>(null);
  const standbyProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const lastUserVoiceTimeRef = useRef<number>(0);

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

  const startStandbyAudioAnalysis = async () => {
    try {
      if (standbyAudioCtxRef.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      standbyStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      standbyAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      standbyProcessorRef.current = processor;
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      processor.onaudioprocess = (e) => {
        const buffer = e.inputBuffer.getChannelData(0);
        const profile = configRef.current?.userVoiceProfile;
        if (profile) {
          const isUser = matchesVoiceProfile(buffer, 16000, profile);
          if (isUser) {
            lastUserVoiceTimeRef.current = Date.now();
          }
        }
      };
    } catch (err) {
      console.warn("Could not start standby audio analysis for user verification:", err);
    }
  };

  const stopStandbyAudioAnalysis = () => {
    if (standbyProcessorRef.current) {
      try { standbyProcessorRef.current.disconnect(); } catch (_) {}
      standbyProcessorRef.current = null;
    }
    if (standbyStreamRef.current) {
      try {
        standbyStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (_) {}
      standbyStreamRef.current = null;
    }
    if (standbyAudioCtxRef.current) {
      try { standbyAudioCtxRef.current.close(); } catch (_) {}
      standbyAudioCtxRef.current = null;
    }
  };

  const startWakeWordListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      addLog("Speech recognition not supported.", "error");
      return;
    }
    if (isWakeListeningRef.current) return;

    if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfile) {
      startStandbyAudioAnalysis();
    }

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
        const currentStatus = statusRef.current;
        if (currentStatus !== "active" && currentStatus !== "connecting") {
          if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfile) {
            const timeSinceUserSpoke = Date.now() - lastUserVoiceTimeRef.current;
            if (timeSinceUserSpoke > 2500) {
              addLog("Wake word heard, but speaker pitch did not match registered user profile. Trigger ignored.", "info");
              return;
            }
          }
          addLog(`Wake word "${wakeWord}" detected — activating Nova`, "wake");
          stopWakeWordListening();
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
        setTimeout(() => {
          if (isWakeListeningRef.current) {
            try { recognition.start(); } catch (_) {}
          }
        }, 300);
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
    stopStandbyAudioAnalysis();
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
    if (connectingLockRef.current || wsRef.current || statusRef.current === "active" || statusRef.current === "connecting") {
      return;
    }
    connectingLockRef.current = true;
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
        const channelData = e.inputBuffer.getChannelData(0);
        let shouldSend = true;
        
        if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfile) {
          const isUser = matchesVoiceProfile(channelData, 16000, configRef.current.userVoiceProfile);
          if (isUser) {
            lastUserVoiceTimeRef.current = Date.now();
          }
          if (Date.now() - lastUserVoiceTimeRef.current > 1200) {
            shouldSend = false;
          }
        }

        if (ws.readyState === WebSocket.OPEN) {
          const dataToSend = shouldSend ? channelData : new Float32Array(channelData.length);
          ws.send(JSON.stringify({ audio: pcmToBase64(dataToSend) }));
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
    } finally {
      connectingLockRef.current = false;
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
      <div className="w-full min-h-screen lg:h-screen lg:overflow-hidden gradient-bg flex flex-col relative overflow-y-auto lg:overflow-y-visible">
        
        {/* Animated background gradient overlay */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-violet-600 rounded-full blur-3xl opacity-20 animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-600 rounded-full blur-3xl opacity-20 animate-pulse" style={{ animationDelay: "1s" }} />
        </div>

        {/* Header */}
        <div className="relative z-20 border-b border-white/10 backdrop-blur-sm px-6 py-4">
          <div className="flex items-center justify-between">
            
            {/* Logo and title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-none">Nova</h1>
                <p className="text-xs text-slate-400 font-mono mt-1">AI Voice Assistant · {activeModeName}</p>
              </div>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-3">
              {/* Wake word toggle */}
              <motion.button
                id="wake-toggle"
                onClick={toggleWakeWord}
                title="Toggle wake word listening"
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all duration-300 text-sm ${
                  isWakeWordListening
                    ? "bg-gradient-to-r from-violet-500 to-violet-600 border border-violet-400 text-white shadow-lg shadow-violet-500/30"
                    : "bg-white/5 border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-white/10"
                }`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {isWakeWordListening
                  ? <Mic className="w-4 h-4 animate-pulse" />
                  : <MicOff className="w-4 h-4" />}
                <span>{isWakeWordListening ? "Listening" : "Paused"}</span>
              </motion.button>

              {/* Status indicator */}
              <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                isConnected
                  ? "bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/20"
                  : isConnecting
                  ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border-amber-500/40 text-amber-300 shadow-lg shadow-amber-500/20"
                  : "bg-white/5 border-white/10 text-slate-500"
              }`}>
                <span className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-emerald-400 animate-pulse"
                  : isConnecting ? "bg-amber-400 animate-pulse"
                  : "bg-slate-600"
                }`} />
                <span>{isConnected ? "Active" : isConnecting ? "Connecting" : "Standby"}</span>
              </div>

              {/* Settings button */}
              <motion.button
                id="settings-btn"
                onClick={() => setShowSettings(true)}
                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-violet-500/20 hover:border-violet-500/30 transition-all duration-300"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <Settings className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 p-6 min-h-0 overflow-y-auto lg:overflow-hidden">

          {/* Left: Orb panel */}
          <div className="lg:col-span-3 glass-strong rounded-3xl flex flex-col items-center justify-center relative overflow-hidden p-8 hover-lift">



            {/* Central Orb */}
            <div className="relative z-10 orb-float">
             <motion.button
               id="main-orb"
               onClick={isConnected || isConnecting ? disconnect : connect}
               className={`w-48 h-48 rounded-full flex items-center justify-center relative transition-all duration-700 shadow-2xl`}
               style={{
                 background: isConnected
                   ? "radial-gradient(circle at 30% 30%, rgba(52,211,153,0.4), rgba(16,185,129,0.2))"
                   : isConnecting
                   ? "radial-gradient(circle at 30% 30%, rgba(251,191,36,0.3), rgba(245,158,11,0.15))"
                   : "radial-gradient(circle at 30% 30%, rgba(139,92,246,0.35), rgba(99,102,241,0.2))",
                 border: isConnected
                   ? "2px solid rgba(52,211,153,0.5)"
                   : isConnecting
                   ? "2px solid rgba(251,191,36,0.4)"
                   : "2px solid rgba(139,92,246,0.4)",
                 boxShadow: isConnected
                   ? "0 0 60px 20px rgba(52,211,153,0.15)"
                   : "0 0 40px 15px rgba(139,92,246,0.15)"
               }}
               whileHover={{ scale: 1.08 }}
               whileTap={{ scale: 0.92 }}
             >
               {/* Inner orb core */}
               <div
                 className="w-32 h-32 rounded-full flex items-center justify-center"
                 style={{
                   background: "radial-gradient(circle at 35% 35%, rgba(255,255,255,0.1), rgba(0,0,0,0.3))",
                   border: "2px solid rgba(139,92,246,0.2)",
                   backdropFilter: "blur(10px)"
                 }}
               >
                 <AnimatePresence mode="wait">
                   {isConnecting ? (
                     <motion.div key="connecting" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                       <Activity className="w-12 h-12 text-amber-300 animate-spin" />
                     </motion.div>
                   ) : isConnected ? (
                     <motion.div key="active" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex gap-1.5 items-end h-10">
                       {["bar-1","bar-2","bar-3","bar-4","bar-5","bar-6","bar-7"].map((b, i) => (
                         <div key={i} className={`w-2 bg-gradient-to-t from-emerald-400 to-cyan-300 rounded-full ${b}`} style={{ minHeight: "6px" }} />
                       ))}
                     </motion.div>
                   ) : (
                     <motion.div key="idle" initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                       <Mic className="w-12 h-12 text-violet-300" />
                     </motion.div>
                   )}
                 </AnimatePresence>
               </div>
             </motion.button>
            </div>

            {/* Status text */}
            <div className="mt-10 text-center z-10 space-y-2">
             <AnimatePresence mode="wait">
               <motion.p
                 key={status}
                 className="text-2xl font-semibold text-white"
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -10 }}
                 transition={{ duration: 0.3 }}
               >
                 {isConnected
                   ? `Listening, ${config?.userName || "User"}...`
                   : isConnecting
                   ? "Waking up..."
                   : isWakeWordListening
                   ? `Say "${config?.wakeWord || 'nova'}"`
                   : "Nova is ready"}
               </motion.p>
             </AnimatePresence>

             <p className="text-xs text-slate-400 font-mono tracking-wider uppercase">
               {isConnected
                 ? `Session ${formatTime(sessionTime)} · ${activeModeName}`
                 : isWakeWordListening
                 ? "Wake word detection active"
                 : "Click orb to connect"}
             </p>
            </div>

            {/* Hint text */}
            {!isConnected && (
             <motion.p 
               className="absolute bottom-6 text-xs text-slate-500 font-mono"
               animate={{ opacity: [0.5, 1, 0.5] }}
               transition={{ duration: 2, repeat: Infinity }}
             >
               TAP ORB TO {isConnecting ? "CANCEL" : "CONNECT"}
             </motion.p>
            )}
          </div>

          {/* Right: Activity log and stats */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">

             {/* Activity feed */}
             <div className="flex-1 glass rounded-3xl p-6 flex flex-col min-h-0 hover-lift">
              <div className="flex items-center justify-between mb-4 shrink-0">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 animate-pulse" />
                  Activity Log
                </span>
                <div className="flex items-center gap-2">
                  {logs.length > 0 && (
                    <button
                      onClick={() => setLogs([])}
                      className="text-[10px] text-slate-500 hover:text-red-400 font-mono hover:bg-white/5 px-2 py-0.5 rounded transition-all cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                  <span className="text-xs text-slate-500 font-mono bg-white/5 px-2 py-1 rounded-lg">{logs.length}</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-2">
                {logs.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 gap-3">
                    <Brain className="w-10 h-10 opacity-30" />
                    <p className="text-sm font-medium">No activity yet</p>
                  </div>
                ) : (
                  logs.map((log, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 15 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5"
                    >
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 uppercase tracking-wider ${
                        log.type === "error" ? "bg-red-500/15 text-red-400 border border-red-500/20"
                        : log.type === "success" ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
                        : log.type === "wake" ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                        : "bg-blue-500/10 text-blue-400 border border-blue-500/15"
                      }`}>
                        {log.type === "wake" ? "WAKE" : log.type === "success" ? "ONLINE" : log.type === "error" ? "ERROR" : "SYSTEM"}
                      </span>
                      <p className={`text-xs leading-relaxed font-mono ${
                        log.type === "error" ? "text-red-300"
                        : log.type === "success" ? "text-emerald-300"
                        : log.type === "wake" ? "text-violet-300"
                        : "text-slate-300"
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
            <div className="glass rounded-3xl p-6 shrink-0 hover-lift">
             <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest mb-4 flex items-center gap-2">
               <Activity className="w-3.5 h-3.5 text-violet-400" />
               System Status
             </h3>
             <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Mode</p>
                 <p className="text-sm font-semibold text-white">{activeModeName}</p>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Wake Word</p>
                 <p className="text-sm font-semibold text-violet-300 font-mono">"{config?.wakeWord || 'nova'}"</p>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">Memory</p>
                 <p className="text-sm font-semibold text-emerald-300">{config?.memory?.length || 0}</p>
               </div>
               <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">User</p>
                 <p className="text-sm font-semibold text-white">{config?.userName || 'User'}</p>
               </div>
             </div>
            </div>

            {/* Power / disconnect button when active */}
            {isConnected && (
             <motion.button
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               onClick={disconnect}
               className="shrink-0 glass rounded-3xl p-4 flex items-center justify-center gap-3 text-red-300 hover:text-red-100 hover:bg-red-500/20 border border-red-500/20 hover:border-red-500/40 transition-all duration-300 text-sm font-bold uppercase tracking-wider hover-lift"
             >
               <Power className="w-5 h-5" />
               End Session
             </motion.button>
            )}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative z-20 border-t border-white/10 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6 text-xs text-slate-500 font-mono uppercase tracking-widest">
            <span className="flex items-center gap-2">
             <span className="w-1 h-1 rounded-full bg-violet-400" />
             Nova v3.0
            </span>
            <span>Gemini Live API</span>
            <span>Modern UI</span>
          </div>
          <div className="text-xs text-slate-500 font-mono">
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
