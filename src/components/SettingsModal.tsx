import React, { useState, useEffect } from "react";
import {
  X, Save, Plus, Trash, Brain, Mic, Sliders, User,
  Volume2, ShieldCheck, ShieldOff, Check,
} from "lucide-react";
import { detectPitch, calculateRMS, VoiceProfile } from "../utils/voiceProfile";

export interface Mode {
  id: string;
  name: string;
  description: string;
  instruction: string;
  isCustom: boolean;
  emoji: string;
}

export interface MemoryEntry {
  id: string;
  content: string;
  category: "preference" | "fact" | "task" | "pattern" | "personal";
  importance: 1 | 2 | 3;
  timestamp: string;
}

export type ConfigType = {
  wakeWord: string;
  userName: string;
  activeModeId: string;
  modes: Mode[];
  memory: MemoryEntry[];
  voiceName: string;
  voiceResponseMode: "all" | "user";
  userVoiceProfile: VoiceProfile | null;
};

const VOICE_OPTIONS = [
  { id: "Aoede", label: "Aoede", desc: "Warm, natural" },
  { id: "Charon", label: "Charon", desc: "Deep, authoritative" },
  { id: "Fenrir", label: "Fenrir", desc: "Clear, energetic" },
  { id: "Kore", label: "Kore", desc: "Soft, friendly" },
  { id: "Zephyr", label: "Zephyr", desc: "Breathy, calm" },
];

const CATEGORY_COLORS: Record<string, string> = {
  personal: "text-violet-300 bg-violet-500/10",
  preference: "text-blue-300 bg-blue-500/10",
  pattern: "text-amber-300 bg-amber-500/10",
  fact: "text-emerald-300 bg-emerald-500/10",
  task: "text-rose-300 bg-rose-500/10",
};

export default function SettingsModal({
  isOpen, onClose, config, setConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigType | null;
  setConfig: (cfg: ConfigType) => void;
}) {
  const [local, setLocal] = useState<ConfigType | null>(null);
  const [tab, setTab] = useState<"profile" | "voice" | "modes" | "memory">("profile");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string>("");

  const recordVoiceProfile = async () => {
    try {
      setRecordingVoice(true);
      setRecordingStatus("Requesting microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(2048, 1, 1);
      
      source.connect(processor);
      processor.connect(audioCtx.destination);
      
      const pitches: number[] = [];
      const rmsValues: number[] = [];
      const recordTimeMs = 3000;
      
      setRecordingStatus("Recording... Speak normally for 3 seconds.");
      
      processor.onaudioprocess = (e) => {
        const buffer = e.inputBuffer.getChannelData(0);
        const rms = calculateRMS(buffer);
        rmsValues.push(rms);
        
        if (rms > 0.015) {
          const pitch = detectPitch(buffer, 16000);
          if (pitch !== -1) {
            pitches.push(pitch);
          }
        }
      };
      
      await new Promise((resolve) => setTimeout(resolve, recordTimeMs));
      
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach(t => t.stop());
      audioCtx.close();
      
      if (pitches.length < 5) {
        setRecordingStatus("No clear voice pitch detected. Please speak louder and try again.");
        setRecordingVoice(false);
        return;
      }
      
      pitches.sort((a, b) => a - b);
      const meanPitch = pitches.reduce((sum, p) => sum + p, 0) / pitches.length;
      const p10 = pitches[Math.floor(pitches.length * 0.1)];
      const p90 = pitches[Math.floor(pitches.length * 0.9)];
      const averageRMS = rmsValues.reduce((sum, v) => sum + v, 0) / rmsValues.length;
      const rmsThreshold = Math.max(0.012, averageRMS * 0.4);
      
      const profile: VoiceProfile = {
        meanPitch: Math.round(meanPitch),
        minPitch: Math.round(p10),
        maxPitch: Math.round(p90),
        rmsThreshold: Number(rmsThreshold.toFixed(4)),
      };
      
      setLocal({
        ...local,
        userVoiceProfile: profile,
      });
      setRecordingStatus(`Voice profile recorded: Mean ${profile.meanPitch}Hz`);
      setRecordingVoice(false);
      
    } catch (err: any) {
      console.error(err);
      setRecordingStatus(`Error: ${err.message}`);
      setRecordingVoice(false);
    }
  };

  useEffect(() => {
    if (config) setLocal(JSON.parse(JSON.stringify(config)));
  }, [config, isOpen]);

  if (!isOpen || !local) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      if (res.ok) {
        const body = await res.json();
        setConfig(body.config);
        setSaved(true);
        setTimeout(() => { setSaved(false); onClose(); }, 800);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleClearMemory = async () => {
    await fetch("/api/memory/clear", { method: "POST" });
    setLocal({ ...local, memory: [] });
  };

  const addCustomMode = () => {
    const newMode: Mode = {
      id: `custom-${Date.now()}`,
      name: "My Mode",
      description: "Custom behavior",
      emoji: "🛠️",
      instruction: "You are Nova. Describe custom behavior here...",
      isCustom: true,
    };
    setLocal({ ...local, modes: [...local.modes, newMode], activeModeId: newMode.id });
  };

  const tabs = [
    { id: "profile", label: "Profile", icon: User },
    { id: "voice", label: "Voice", icon: Volume2 },
    { id: "modes", label: "Modes", icon: Sliders },
    { id: "memory", label: "Memory", icon: Brain },
  ] as const;

  const memoryByCategory = local.memory.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, MemoryEntry[]>);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(8,8,16,0.90)", backdropFilter: "blur(24px)" }}
    >
      <div
        className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden"
        style={{
          background: "rgba(12,12,22,0.98)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <span className="text-sm">⚙️</span>
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Nova Settings</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Personalize your AI assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all"
          >
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-3 shrink-0">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-150 ${
                tab === t.id
                  ? "bg-violet-500/20 text-violet-300 border border-violet-500/30"
                  : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
              }`}
            >
              <t.icon size={11} />
              {t.label}
              {t.id === "memory" && local.memory.length > 0 && (
                <span className="ml-0.5 text-[9px] bg-violet-500/30 text-violet-300 px-1 rounded-full">
                  {local.memory.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0">

          {/* ── Profile Tab ────────────────────────────────────────────── */}
          {tab === "profile" && (
            <div className="space-y-5">
              <div>
                <label className="text-xs text-slate-400 font-medium mb-2 block">Your Name</label>
                <input
                  type="text"
                  value={local.userName}
                  onChange={e => setLocal({ ...local, userName: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  placeholder="Chiru"
                />
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Nova will greet you by this name and personalise responses.
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-2 block">Wake Word</label>
                <input
                  type="text"
                  value={local.wakeWord}
                  onChange={e => setLocal({ ...local, wakeWord: e.target.value.toLowerCase().trim() })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                  placeholder="nova"
                />
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Say this word to wake Nova. Keep it short (1-2 syllables) for best recognition. E.g. "nova", "hey nova", "iris".
                </p>
              </div>

              <div>
                <label className="text-xs text-slate-400 font-medium mb-2 block">Voice Response Mode</label>
                <select
                  value={local.voiceResponseMode || "all"}
                  onChange={e => setLocal({ ...local, voiceResponseMode: e.target.value as "all" | "user" })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500/50 transition-all cursor-pointer"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <option value="all" className="bg-[#0c0c16]">Respond to All Voices</option>
                  <option value="user" className="bg-[#0c0c16]">Respond to Registered User Only</option>
                </select>
                <p className="text-[11px] text-slate-600 mt-1.5">
                  Choose whether Nova responds to any voice in the room or filters for your recorded voice profile only.
                </p>
              </div>

              {local.voiceResponseMode === "user" && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-white">Registered Voice Profile</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Filter speech by your fundamental frequency (pitch)</p>
                    </div>
                    {local.userVoiceProfile && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full font-semibold font-mono">
                        Active ({local.userVoiceProfile.meanPitch} Hz)
                      </span>
                    )}
                  </div>

                  {local.userVoiceProfile ? (
                    <div className="text-xs text-slate-300 space-y-2 font-mono">
                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-black/20 p-2.5 rounded-xl border border-white/5">
                        <div>Mean Pitch: <span className="text-violet-300">{local.userVoiceProfile.meanPitch} Hz</span></div>
                        <div>Pitch Range: <span className="text-violet-300">{local.userVoiceProfile.minPitch}Hz - {local.userVoiceProfile.maxPitch}Hz</span></div>
                        <div>RMS Thresh: <span className="text-violet-300">{local.userVoiceProfile.rmsThreshold}</span></div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={recordingVoice}
                          onClick={recordVoiceProfile}
                          className="px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 border border-violet-500/30 rounded-xl font-medium transition-all text-[11px] disabled:opacity-50"
                        >
                          Re-record Voice
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocal({ ...local, userVoiceProfile: null })}
                          className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 rounded-xl font-medium transition-all text-[11px]"
                        >
                          Clear Profile
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs text-amber-400 leading-relaxed">
                        ⚠️ No voice profile recorded yet. Please click the button below to register your voice footprint.
                      </p>
                      <button
                        type="button"
                        disabled={recordingVoice}
                        onClick={recordVoiceProfile}
                        className="px-4 py-2 bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white rounded-xl font-semibold transition-all text-xs flex items-center gap-2 shadow-lg shadow-violet-500/15 disabled:opacity-50"
                      >
                        <Mic size={12} />
                        Record My Voice (3s)
                      </button>
                    </div>
                  )}

                  {recordingStatus && (
                    <p className={`text-[11px] font-mono p-2 rounded-lg bg-black/35 ${
                      recordingVoice ? "text-violet-400 animate-pulse" 
                      : recordingStatus.includes("Error") || recordingStatus.includes("No clear") 
                      ? "text-red-400 border border-red-500/10" 
                      : "text-emerald-400 border border-emerald-500/10"
                    }`}>
                      {recordingStatus}
                    </p>
                  )}
                </div>
              )}

              <div
                className="p-4 rounded-2xl space-y-2"
                style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.18)" }}
              >
                <p className="text-xs text-violet-300 font-semibold">How wake word works</p>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Nova listens in the background using the Web Speech API. When detected, it automatically connects to a Gemini Live session and greets you.
                  Say "goodbye" or "bye" to end the session and return to standby.
                </p>
              </div>
            </div>
          )}

          {/* ── Voice Tab ──────────────────────────────────────────────── */}
          {tab === "voice" && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500">Choose Nova's voice. Changes apply on the next session.</p>
              <div className="space-y-2">
                {VOICE_OPTIONS.map(v => (
                  <div
                    key={v.id}
                    onClick={() => setLocal({ ...local, voiceName: v.id })}
                    className={`flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-150 ${
                      local.voiceName === v.id
                        ? "border border-violet-500/40"
                        : "border border-white/5 hover:border-white/10"
                    }`}
                    style={{
                      background: local.voiceName === v.id ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs ${
                        local.voiceName === v.id ? "bg-violet-500/20 text-violet-300" : "bg-white/5 text-slate-500"
                      }`}>
                        <Volume2 size={12} />
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${local.voiceName === v.id ? "text-violet-200" : "text-slate-300"}`}>
                          {v.label}
                        </p>
                        <p className="text-[11px] text-slate-500">{v.desc}</p>
                      </div>
                    </div>
                    {local.voiceName === v.id && <Check size={14} className="text-violet-400" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Modes Tab ──────────────────────────────────────────────── */}
          {tab === "modes" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Select Nova's operating mode. Each mode has different capabilities.</p>
                <button
                  onClick={addCustomMode}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition-colors"
                >
                  <Plus size={11} />
                  Custom Mode
                </button>
              </div>

              <div className="space-y-2.5">
                {local.modes.map(mode => {
                  const isActive = local.activeModeId === mode.id;
                  const isUnrestricted = mode.id === "unrestricted";
                  return (
                    <div
                      key={mode.id}
                      onClick={() => setLocal({ ...local, activeModeId: mode.id })}
                      className={`p-4 rounded-2xl cursor-pointer transition-all duration-150 ${
                        isActive
                          ? isUnrestricted
                            ? "border border-red-500/40"
                            : "border border-violet-500/40"
                          : "border border-white/5 hover:border-white/10"
                      }`}
                      style={{
                        background: isActive
                          ? isUnrestricted
                            ? "rgba(239,68,68,0.08)"
                            : "rgba(139,92,246,0.08)"
                          : "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{mode.emoji || "🤖"}</span>
                          <div>
                            {mode.isCustom ? (
                              <input
                                type="text"
                                value={mode.name}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const newModes = local.modes.map(m => m.id === mode.id ? { ...m, name: e.target.value } : m);
                                  setLocal({ ...local, modes: newModes });
                                }}
                                className="bg-transparent text-sm font-bold text-white focus:outline-none border-b border-white/20 pb-0.5 w-40"
                              />
                            ) : (
                              <p className={`text-sm font-bold flex items-center gap-1.5 ${
                                isActive
                                  ? isUnrestricted ? "text-red-300" : "text-violet-200"
                                  : "text-slate-300"
                              }`}>
                                {mode.name}
                                {isActive && <Check size={11} className={isUnrestricted ? "text-red-400" : "text-violet-400"} />}
                              </p>
                            )}
                            <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                              {isUnrestricted && <ShieldOff size={10} className="text-red-400" />}
                              {!isUnrestricted && !mode.isCustom && <ShieldCheck size={10} className="text-slate-500" />}
                              {mode.description || "Custom behavior mode"}
                            </p>
                          </div>
                        </div>
                        {mode.isCustom && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setLocal({
                                ...local,
                                modes: local.modes.filter(m => m.id !== mode.id),
                                activeModeId: local.activeModeId === mode.id ? local.modes[0].id : local.activeModeId,
                              });
                            }}
                            className="text-red-400/40 hover:text-red-400 transition-colors p-1 rounded"
                          >
                            <Trash size={12} />
                          </button>
                        )}
                      </div>

                      {mode.isCustom && (
                        <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                          <input
                            type="text"
                            value={mode.description}
                            onChange={e => {
                              const newModes = local.modes.map(m => m.id === mode.id ? { ...m, description: e.target.value } : m);
                              setLocal({ ...local, modes: newModes });
                            }}
                            className="w-full text-[11px] text-slate-400 bg-white/3 border border-white/8 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/40"
                            placeholder="Short description..."
                          />
                          <textarea
                            value={mode.instruction}
                            onChange={e => {
                              const newModes = local.modes.map(m => m.id === mode.id ? { ...m, instruction: e.target.value } : m);
                              setLocal({ ...local, modes: newModes });
                            }}
                            rows={4}
                            className="w-full text-[11px] text-slate-400 bg-white/3 border border-white/8 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/40 resize-none leading-relaxed"
                            placeholder="Describe how Nova should behave in this mode. Be specific about tone, capabilities, and restrictions."
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Memory Tab ─────────────────────────────────────────────── */}
          {tab === "memory" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-medium">Nova's Memory</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">{local.memory.length} facts stored — auto-extracted from conversations</p>
                </div>
                <button
                  onClick={handleClearMemory}
                  className="flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-400 transition-colors font-medium"
                >
                  <Trash size={11} />
                  Clear All
                </button>
              </div>

              {local.memory.length === 0 ? (
                <div
                  className="rounded-2xl p-8 flex flex-col items-center justify-center gap-3 text-center"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <Brain className="w-8 h-8 text-slate-600" />
                  <div>
                    <p className="text-sm text-slate-500 font-medium">No memories yet</p>
                    <p className="text-[11px] text-slate-600 mt-1">
                      Nova automatically extracts important facts from your conversations and stores them here. Have a few sessions first!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(memoryByCategory).map(([cat, entries]) => (
                    <div key={cat}>
                      <p className="text-[10px] uppercase tracking-widest text-slate-600 mb-2 font-bold">{cat}</p>
                      <div className="space-y-1.5">
                        {(entries as MemoryEntry[]).map(m => (
                          <div
                            key={m.id}
                            className="flex items-start justify-between p-2.5 rounded-xl"
                            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                          >
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 mt-0.5 ${CATEGORY_COLORS[m.category] || "text-slate-400"}`}>
                                {m.importance === 3 ? "★★★" : m.importance === 2 ? "★★" : "★"}
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed">{m.content}</p>
                            </div>
                            <button
                              onClick={() => setLocal({ ...local, memory: local.memory.filter(x => x.id !== m.id) })}
                              className="text-slate-600 hover:text-red-400 transition-colors ml-2 shrink-0"
                            >
                              <Trash size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                className="p-3.5 rounded-2xl"
                style={{ background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.15)" }}
              >
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <span className="text-violet-400 font-medium">How smart memory works:</span> After each session, Nova uses Gemini AI to extract only meaningful facts — your preferences, patterns, and important context. Raw command outputs and small talk are never saved. These facts are injected at the start of future sessions so Nova always knows your context.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-2 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all disabled:opacity-50 min-w-[120px] justify-center"
            style={{
              background: saved
                ? "rgba(52,211,153,0.3)"
                : "linear-gradient(135deg, rgba(139,92,246,0.5), rgba(99,102,241,0.5))",
              border: saved ? "1px solid rgba(52,211,153,0.4)" : "1px solid rgba(139,92,246,0.4)",
            }}
          >
            {saved ? (
              <><Check size={14} /> Saved!</>
            ) : saving ? (
              "Saving..."
            ) : (
              <><Save size={14} /> Save Changes</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
