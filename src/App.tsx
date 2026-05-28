/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { pcmToBase64 } from "./utils/audio";
import { AudioStreamer } from "./utils/AudioStreamer";
import { verifier, initVoiceModel, calculateRMS } from "./utils/voiceProfile";

// Layout
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import InitOverlay from "./components/InitOverlay";

// Views
import OrbPanel from "./components/OrbPanel";
import ActivityLog from "./components/ActivityLog";
import SystemStats from "./components/SystemStats";
import SettingsPage from "./components/SettingsPage";
import AgentDashboardPage from "./components/AgentDashboardPage";

type AppStatus = "idle" | "wake_listening" | "connecting" | "active";
type AppView = "home" | "settings" | "agents";

export default function App() {
  const [status, setStatus]               = useState<AppStatus>("idle");
  const [view, setView]                   = useState<AppView>("home");
  const [logs, setLogs]                   = useState<{ msg: string; type: "info" | "success" | "error" | "wake" }[]>([]);
  const [config, setConfig]               = useState<any>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [sessionTime, setSessionTime]     = useState(0);

  const wsRef                  = useRef<WebSocket | null>(null);
  const audioCtxRef            = useRef<AudioContext | null>(null);
  const mediaStreamRef         = useRef<MediaStream | null>(null);
  const processorRef           = useRef<ScriptProcessorNode | null>(null);
  const streamerRef            = useRef<AudioStreamer | null>(null);
  const recognitionRef         = useRef<any>(null);
  const isWakeListeningRef     = useRef(false);
  const sessionTimerRef        = useRef<any>(null);
  const statusRef              = useRef<AppStatus>("idle");
  const configRef              = useRef<any>(null);
  const connectingLockRef      = useRef(false);
  const standbyAudioCtxRef     = useRef<AudioContext | null>(null);
  const standbyStreamRef       = useRef<MediaStream | null>(null);
  const standbyProcessorRef    = useRef<ScriptProcessorNode | null>(null);
  const lastUserVoiceTimeRef   = useRef<number>(0);
  const STANDBY_BUFFER_SIZE    = 64000;
  const standbyAudioBufferRef  = useRef<Float32Array>(new Float32Array(STANDBY_BUFFER_SIZE));
  const standbyBufferIdxRef    = useRef<number>(0);
  const verifyingVoiceRef      = useRef<boolean>(false);

  const isConnected          = status === "active";
  const isConnecting         = status === "connecting";
  const isWakeWordListening  = status === "wake_listening";

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { configRef.current = config; }, [config]);

  const addLog = (msg: string, type: "info" | "success" | "error" | "wake" = "info") => {
    setLogs(prev => [...prev, { msg, type }].slice(-60));
  };

  useEffect(() => { fetch("/api/config").then(r => r.json()).then(setConfig); }, []);

  useEffect(() => {
    const checkMic = async () => {
      try {
        if (navigator.permissions?.query) {
          const s = await navigator.permissions.query({ name: "microphone" as PermissionName });
          if (s.state === "granted") { setHasInteracted(true); localStorage.setItem("nova_engaged", "true"); }
          s.onchange = () => {
            if (s.state === "granted") { setHasInteracted(true); localStorage.setItem("nova_engaged", "true"); }
            else { setHasInteracted(false); localStorage.removeItem("nova_engaged"); }
          };
        } else if (localStorage.getItem("nova_engaged") === "true") setHasInteracted(true);
      } catch { if (localStorage.getItem("nova_engaged") === "true") setHasInteracted(true); }
    };
    checkMic();
  }, []);

  useEffect(() => {
    const resume = () => { if (audioCtxRef.current?.state === "suspended") audioCtxRef.current.resume().catch(() => {}); };
    window.addEventListener("click", resume);
    return () => window.removeEventListener("click", resume);
  }, []);

  useEffect(() => {
    if (isConnected) {
      setSessionTime(0);
      sessionTimerRef.current = setInterval(() => setSessionTime(t => t + 1), 1000);
    } else clearInterval(sessionTimerRef.current);
    return () => clearInterval(sessionTimerRef.current);
  }, [isConnected]);

  useEffect(() => {
    if (hasInteracted && config && status === "idle") startWakeWordListening();
  }, [hasInteracted, config]);

  const startStandbyAudioAnalysis = async () => {
    try {
      if (standbyAudioCtxRef.current) return;
      await initVoiceModel();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      standbyStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      standbyAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      standbyProcessorRef.current = processor;
      source.connect(processor);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      standbyBufferIdxRef.current = 0;
      standbyAudioBufferRef.current.fill(0);
      processor.onaudioprocess = (e) => {
        const buffer = e.inputBuffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
          standbyAudioBufferRef.current[standbyBufferIdxRef.current] = buffer[i];
          standbyBufferIdxRef.current = (standbyBufferIdxRef.current + 1) % STANDBY_BUFFER_SIZE;
        }
      };
    } catch (err) { console.warn("Could not start standby audio analysis:", err); }
  };

  const stopStandbyAudioAnalysis = () => {
    if (standbyProcessorRef.current) { try { standbyProcessorRef.current.disconnect(); } catch (_) {} standbyProcessorRef.current = null; }
    if (standbyStreamRef.current)    { try { standbyStreamRef.current.getTracks().forEach(t => t.stop()); } catch (_) {} standbyStreamRef.current = null; }
    if (standbyAudioCtxRef.current)  { try { standbyAudioCtxRef.current.close(); } catch (_) {} standbyAudioCtxRef.current = null; }
  };

  const startWakeWordListening = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) { addLog("Speech recognition not supported.", "error"); return; }
    if (isWakeListeningRef.current) return;
    if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfiles?.length > 0) startStandbyAudioAnalysis();
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = async (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      transcript = transcript.trim().toLowerCase();
      const wakeWord = configRef.current?.wakeWord?.toLowerCase() || "nova";
      if (transcript.includes(wakeWord)) {
        const cur = statusRef.current;
        if (cur !== "active" && cur !== "connecting" && !verifyingVoiceRef.current) {
          if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfiles?.length > 0) {
            verifyingVoiceRef.current = true;
            addLog("Verifying speaker identity…", "info");
            const linear = new Float32Array(STANDBY_BUFFER_SIZE);
            const idx = standbyBufferIdxRef.current;
            linear.set(standbyAudioBufferRef.current.subarray(idx));
            linear.set(standbyAudioBufferRef.current.subarray(0, idx), STANDBY_BUFFER_SIZE - idx);
            try {
              const res = await verifier.getEmbedding(linear);
              let matched = false;
              for (const p of configRef.current.userVoiceProfiles) {
                if (!p.embedding?.length) continue;
                if (verifier.compareEmbeddings(res.embedding, new Float32Array(p.embedding)) >= 0.65) { matched = true; break; }
              }
              verifyingVoiceRef.current = false;
              if (!matched) { addLog("Wake word heard — speaker not matched.", "info"); return; }
            } catch (err) { verifyingVoiceRef.current = false; console.error("Voice verification failed", err); return; }
          }
          addLog(`Wake word "${wakeWord}" detected — activating Nova`, "wake");
          stopWakeWordListening();
          connect();
        }
      }
    };
    recognition.onerror = (e: any) => { if (e.error !== "no-speech" && e.error !== "aborted") addLog(`Mic error: ${e.error}`, "error"); };
    recognition.onend = () => { if (isWakeListeningRef.current) setTimeout(() => { if (isWakeListeningRef.current) try { recognition.start(); } catch (_) {} }, 300); };
    recognition.start();
    recognitionRef.current = recognition;
    isWakeListeningRef.current = true;
    setStatus("wake_listening");
    addLog(`Listening for wake word "${config?.wakeWord || "nova"}"`, "info");
  };

  const stopWakeWordListening = () => {
    isWakeListeningRef.current = false;
    stopStandbyAudioAnalysis();
    if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch (_) {} recognitionRef.current = null; }
  };

  const toggleWakeWord = () => {
    if (isWakeWordListening) { stopWakeWordListening(); setStatus("idle"); addLog("Wake word paused.", "info"); }
    else startWakeWordListening();
  };

  const connect = async () => {
    if (connectingLockRef.current || wsRef.current || statusRef.current === "active" || statusRef.current === "connecting") return;
    connectingLockRef.current = true;
    try {
      setStatus("connecting");
      addLog("Initialising voice pipeline…", "info");
      standbyBufferIdxRef.current = 0;
      standbyAudioBufferRef.current.fill(0);
      lastUserVoiceTimeRef.current = Date.now();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      streamerRef.current = new AudioStreamer(audioCtx);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;
      const source   = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.15;
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      source.connect(analyser);
      analyser.connect(processor);
      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0;
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      addLog("Connecting to Nova AI core…", "info");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/live`);
      wsRef.current = ws;
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ audio: pcmToBase64(e.inputBuffer.getChannelData(0)) }));
      };
      ws.onopen  = () => { addLog(`Nova is online — speak naturally, ${configRef.current?.userName || "there"}`, "success"); setStatus("active"); stopWakeWordListening(); };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.audio) streamerRef.current?.addPCM16(msg.audio);
        if (msg.interrupted) { addLog("Response interrupted", "info"); streamerRef.current?.stop(); }
        if (msg.action === "endSession") { addLog("Nova ended the session", "info"); disconnect(); }
        if (msg.action === "agent_start") addLog(`🤖 Agent [${msg.agentId}] (${msg.model}): "${msg.prompt}"`, "info");
        if (msg.action === "agent_log")   addLog(`[Agent ${msg.agentId}] ${msg.message}`, "info");
        if (msg.action === "agent_end")   msg.success ? addLog(`✅ Agent [${msg.agentId}]: ${msg.summary || "Done"}`, "success") : addLog(`⚠️ Agent [${msg.agentId}]: ${msg.error || "Failed"}`, "error");
        if (msg.action === "browser_opened") msg.success ? addLog(`🌐 Opened: ${msg.url}`, "success") : addLog(`❌ Failed to open: ${msg.url}`, "error");
      };
      ws.onclose = () => { addLog("Session closed", "info"); disconnect(); };
      ws.onerror = () => { addLog("Connection error", "error"); disconnect(); };
    } catch (err: any) {
      addLog(`Failed to connect: ${err.message}`, "error");
      disconnect();
    } finally { connectingLockRef.current = false; }
  };

  const disconnect = () => {
    if (processorRef.current) processorRef.current.disconnect();
    mediaStreamRef.current?.getTracks().forEach(t => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    wsRef.current?.close();
    processorRef.current = null; mediaStreamRef.current = null;
    audioCtxRef.current  = null; wsRef.current          = null; streamerRef.current = null;
    setTimeout(() => { if (configRef.current?.wakeWord) startWakeWordListening(); else setStatus("idle"); }, 1200);
  };

  const initSystem = () => { setHasInteracted(true); localStorage.setItem("nova_engaged", "true"); };
  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const activeModeName = config?.modes?.find((m: any) => m.id === config?.activeModeId)?.name || "Assistant";
  const voiceProfileCount = config?.userVoiceProfiles?.length || 0;
  const voiceMode = config?.voiceResponseMode;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>

      {/* Init overlay */}
      <InitOverlay hasInteracted={hasInteracted} initSystem={initSystem} wakeWord={config?.wakeWord || "nova"} />

      {/* Sidebar */}
      <Sidebar view={view} setView={setView} isConnected={isConnected} isWakeWordListening={isWakeWordListening} />

      {/* Main content column */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <Header
          isWakeWordListening={isWakeWordListening}
          toggleWakeWord={toggleWakeWord}
          status={status}
          activeModeName={activeModeName}
          view={view}
          wakeWord={config?.wakeWord || "nova"}
        />

        {/* View area */}
        <main className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            {view === "home" && (
              <motion.div
                key="home"
                className="h-full overflow-y-auto"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {/* Background ambience */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[160px]" style={{ background: "rgba(59,130,246,0.04)" }} />
                  <div className="absolute bottom-[-15%] right-[-10%] w-[45%] h-[45%] rounded-full blur-[180px]" style={{ background: "rgba(99,102,241,0.03)" }} />
                  {isConnected && <div className="absolute top-[10%] left-[20%] w-[50%] h-[40%] rounded-full blur-[140px]" style={{ background: "rgba(16,185,129,0.04)" }} />}
                  {/* Subtle grid */}
                  <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)", backgroundSize: "64px 64px" }} />
                </div>

                <div className="relative z-10 grid grid-cols-1 lg:grid-cols-5 gap-5 p-5 min-h-full">
                  <OrbPanel
                    status={status}
                    userName={config?.userName || "User"}
                    wakeWord={config?.wakeWord || "nova"}
                    activeModeName={activeModeName}
                    sessionTime={sessionTime}
                    connect={connect}
                    disconnect={disconnect}
                  />
                  <div className="lg:col-span-2 flex flex-col gap-4 min-h-0" style={{ minHeight: 500 }}>
                    <ActivityLog logs={logs} onClear={() => setLogs([])} />
                    <SystemStats
                      activeModeName={activeModeName}
                      wakeWord={config?.wakeWord || "nova"}
                      memoryCount={config?.memory?.length || 0}
                      voiceProfileCount={voiceProfileCount}
                      voiceMode={voiceMode}
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {view === "settings" && (
              <motion.div
                key="settings"
                className="h-full"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <SettingsPage config={config} setConfig={setConfig} />
              </motion.div>
            )}

            {view === "agents" && (
              <motion.div
                key="agents"
                className="h-full"
                initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.2 }}
              >
                <AgentDashboardPage />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Status bar */}
        <footer
          className="relative z-20 px-6 py-2.5 flex items-center justify-between shrink-0"
          style={{ borderTop: "1px solid var(--bg-border)", background: "var(--bg-surface)" }}
        >
          <div className="flex items-center gap-5 font-mono" style={{ fontSize: "10px", color: "var(--text-3)", letterSpacing: "0.08em" }}>
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--blue)" }} />
              Nova v3.1
            </span>
            <span>Gemini Live</span>
            <span>Bark-Scale Voiceprint</span>
          </div>
          <div className="font-mono" style={{ fontSize: "10px", color: isConnected ? "var(--green)" : "var(--text-3)", letterSpacing: "0.06em" }}>
            {isConnected ? `● LIVE ${formatTime(sessionTime)}` : isWakeWordListening ? "○ STANDBY" : "◌ OFFLINE"}
          </div>
        </footer>
      </div>
    </div>
  );
}
