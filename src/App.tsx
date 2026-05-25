/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { pcmToBase64 } from "./utils/audio";
import { AudioStreamer } from "./utils/AudioStreamer";
import SettingsModal from "./components/SettingsModal";
import { verifier, initVoiceModel, calculateRMS } from "./utils/voiceProfile";

// Modular Sub-components
import Header from "./components/Header";
import InitOverlay from "./components/InitOverlay";
import OrbPanel from "./components/OrbPanel";
import ActivityLog from "./components/ActivityLog";
import SystemStats from "./components/SystemStats";

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
  // Rolling buffer for 4 seconds of audio (16000 sample rate * 4)
  const STANDBY_BUFFER_SIZE = 64000;
  const standbyAudioBufferRef = useRef<Float32Array>(new Float32Array(STANDBY_BUFFER_SIZE));
  const standbyBufferIdxRef = useRef<number>(0);
  const verifyingVoiceRef = useRef<boolean>(false);

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
      await initVoiceModel(); // Ensure model is loaded in standby
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      standbyStreamRef.current = stream;
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      standbyAudioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);

      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      standbyProcessorRef.current = processor;

      source.connect(processor);

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // Muted — no loopback
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      standbyBufferIdxRef.current = 0;
      standbyAudioBufferRef.current.fill(0);

      processor.onaudioprocess = (e) => {
        const buffer = e.inputBuffer.getChannelData(0);
        // Push to circular buffer
        for (let i = 0; i < buffer.length; i++) {
          standbyAudioBufferRef.current[standbyBufferIdxRef.current] = buffer[i];
          standbyBufferIdxRef.current = (standbyBufferIdxRef.current + 1) % STANDBY_BUFFER_SIZE;
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
      addLog("Speech recognition not supported in this browser.", "error");
      return;
    }
    if (isWakeListeningRef.current) return;

    if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfiles && configRef.current.userVoiceProfiles.length > 0) {
      startStandbyAudioAnalysis();
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = async (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      transcript = transcript.trim().toLowerCase();
      
      const wakeWord = configRef.current?.wakeWord?.toLowerCase() || "nova";
      if (transcript.includes(wakeWord)) {
        const currentStatus = statusRef.current;
        if (currentStatus !== "active" && currentStatus !== "connecting" && !verifyingVoiceRef.current) {
          
          if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfiles && configRef.current.userVoiceProfiles.length > 0) {
            verifyingVoiceRef.current = true;
            addLog("Verifying speaker identity with AI model...", "info");
            
            // Linearize circular buffer
            const linearBuffer = new Float32Array(STANDBY_BUFFER_SIZE);
            const idx = standbyBufferIdxRef.current;
            linearBuffer.set(standbyAudioBufferRef.current.subarray(idx));
            linearBuffer.set(standbyAudioBufferRef.current.subarray(0, idx), STANDBY_BUFFER_SIZE - idx);
            
            try {
              // Extract embedding from the last 4 seconds
              const res = await verifier.getEmbedding(linearBuffer);
              const currentEmbedding = res.embedding;
              
              let matched = false;
              for (const profile of configRef.current.userVoiceProfiles) {
                if (!profile.embedding || profile.embedding.length === 0) continue;
                const sim = verifier.compareEmbeddings(currentEmbedding, new Float32Array(profile.embedding));
                // Similarity threshold of 0.65 is usually strict enough for NeXt-TDNN
                if (sim >= 0.65) {
                  matched = true;
                  break;
                }
              }
              
              verifyingVoiceRef.current = false;
              if (!matched) {
                addLog(`Wake word heard, but speaker voice did not match profile.`, "info");
                return;
              }
            } catch (err) {
              verifyingVoiceRef.current = false;
              console.error("Voice verification failed", err);
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
      // Reset the sliding window verifier for the new session
      standbyBufferIdxRef.current = 0;
      standbyAudioBufferRef.current.fill(0);
      lastUserVoiceTimeRef.current = Date.now(); // Give the user a grace period at session start

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      streamerRef.current = new AudioStreamer(audioCtx);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      mediaStreamRef.current = stream;

      const source = audioCtx.createMediaStreamSource(stream);

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;               // high resolution: 1024 bins across 0–8 kHz
      analyser.smoothingTimeConstant = 0.15;  // minimal smoothing for transient accuracy

      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      source.connect(analyser);
      analyser.connect(processor);

      const gainNode = audioCtx.createGain();
      gainNode.gain.value = 0; // Muted loopback
      processor.connect(gainNode);
      gainNode.connect(audioCtx.destination);
 
      addLog("Connecting to Nova AI core...", "info");
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${location.host}/live`);
      wsRef.current = ws;
 
      processor.onaudioprocess = (e) => {
        const channelData = e.inputBuffer.getChannelData(0);
        const rms = calculateRMS(channelData);
        let shouldSend = true;

        if (configRef.current?.voiceResponseMode === "user" && configRef.current?.userVoiceProfiles && configRef.current.userVoiceProfiles.length > 0) {
          // If we want to check user voice during active conversation, we could run a background check here
          // But with continuous Live API, we can just let it run. It's more efficient to just gate the wake word.
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
        if (msg.action === "agent_start") {
          addLog(`🤖 Spawned Agent [${msg.agentId}] (model: ${msg.model}): "${msg.prompt}"`, "info");
        }
        if (msg.action === "agent_log") {
          addLog(`[Agent ${msg.agentId}] ${msg.message}`, "info");
        }
        if (msg.action === "agent_end") {
          if (msg.success) {
            addLog(`✅ Agent [${msg.agentId}] completed the task! Summary: ${msg.summary || "Success"}`, "success");
          } else {
            addLog(`⚠️ Agent [${msg.agentId}] failed. Error: ${msg.error || "Check logs"}`, "error");
          }
        }
        if (msg.action === "browser_opened") {
          if (msg.success) {
            addLog(`🌐 Opened browser and navigated to: ${msg.url}`, "success");
          } else {
            addLog(`❌ Failed to open browser for: ${msg.url}`, "error");
          }
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

    setTimeout(() => {
      if (configRef.current?.wakeWord) startWakeWordListening();
      else setStatus("idle");
    }, 1200);
  };

  const initSystem = () => {
    setHasInteracted(true);
    localStorage.setItem("nova_engaged", "true");
  };

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const activeModeName = config?.modes?.find((m: any) => m.id === config?.activeModeId)?.name || "Assistant";

  const voiceProfileCount = config?.userVoiceProfiles?.length || 0;
  const voiceMode = config?.voiceResponseMode;

  return (
    <div className="min-h-screen bg-[#060610] text-white overflow-hidden relative flex items-center justify-center select-none">

      {/* ── Background ambience ──────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[-15%] w-[65%] h-[65%] rounded-full bg-violet-700/10 blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-700/8 blur-[160px]" />
        <div className="absolute top-[40%] right-[5%] w-[25%] h-[35%] rounded-full bg-cyan-600/5 blur-[100px]" />
        {isConnected && (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
          >
            <div className="absolute top-[-5%] left-[15%] w-[65%] h-[55%] rounded-full bg-emerald-600/6 blur-[130px]" />
          </motion.div>
        )}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "linear-gradient(rgba(139,92,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(139,92,246,0.5) 1px, transparent 1px)", backgroundSize: "80px 80px" }}
        />
        <div className="scan-line" />
      </div>

      <InitOverlay
        hasInteracted={hasInteracted}
        initSystem={initSystem}
        wakeWord={config?.wakeWord || "nova"}
      />

      <div className="w-full min-h-screen lg:h-screen flex flex-col relative overflow-y-auto lg:overflow-hidden">

        <Header
          isWakeWordListening={isWakeWordListening}
          toggleWakeWord={toggleWakeWord}
          status={status}
          activeModeName={activeModeName}
          setShowSettings={setShowSettings}
          wakeWord={config?.wakeWord || "nova"}
        />

        <div className="relative z-10 flex-1 grid grid-cols-1 lg:grid-cols-5 gap-5 p-5 min-h-0 overflow-y-auto lg:overflow-hidden">

          <OrbPanel
            status={status}
            userName={config?.userName || "User"}
            wakeWord={config?.wakeWord || "nova"}
            activeModeName={activeModeName}
            sessionTime={sessionTime}
            connect={connect}
            disconnect={disconnect}
          />

          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <ActivityLog
              logs={logs}
              onClear={() => setLogs([])}
            />

            <SystemStats
              activeModeName={activeModeName}
              wakeWord={config?.wakeWord || "nova"}
              memoryCount={config?.memory?.length || 0}
              voiceProfileCount={voiceProfileCount}
              voiceMode={voiceMode}
            />
          </div>
        </div>

        <div
          className="relative z-20 px-6 py-3 flex items-center justify-between shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)", backdropFilter: "blur(12px)", background: "rgba(6,6,16,0.5)" }}
        >
          <div className="flex items-center gap-5 text-[10px] text-slate-600 font-mono uppercase tracking-widest">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
              Nova v3.1
            </span>
            <span>Gemini Live</span>
            <span>Bark-Scale Voiceprint</span>
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
