import React, { useState, useEffect, useRef } from "react";
import {
  Save, Plus, Trash, Brain, Mic, Sliders, User,
  Volume2, ShieldCheck, ShieldOff, Check, Fingerprint,
  Wand2, ChevronRight, AlertCircle, Wifi, Link2, Clock,
} from "lucide-react";
import { verifier, initVoiceModel, VoiceProfile } from "../utils/voiceProfile";

export interface Mode {
  id: string; name: string; description: string;
  instruction: string; isCustom: boolean; emoji: string;
}
export interface MemoryEntry {
  id: string; content: string;
  category: "preference" | "fact" | "task" | "pattern" | "personal";
  importance: 1 | 2 | 3; timestamp: string;
}
export type ConfigType = {
  wakeWord: string; userName: string; activeModeId: string;
  modes: Mode[]; memory: MemoryEntry[]; voiceName: string;
  voiceResponseMode: "all" | "user"; userVoiceProfiles: VoiceProfile[];
  greetingPhrase?: string;
  integrations?: {
    godoEnabled: boolean; obsidianEnabled: boolean; obsidianPath: string;
    customAgentEnabled?: boolean; codingProvider?: "nim" | "openrouter" | "groq";
    nvidiaApiKey?: string; nvidiaModel?: string; openrouterApiKey?: string;
    groqApiKey?: string; telegramEnabled?: boolean; telegramBotToken?: string;
    telegramWebhookUrl?: string; discordEnabled?: boolean; discordBotToken?: string;
    discordWebhookUrl?: string; slackEnabled?: boolean; slackBotToken?: string;
    slackVerificationToken?: string; slackWebhookUrl?: string;
    whatsappEnabled?: boolean; whatsappAccessToken?: string;
    whatsappPhoneNumberId?: string; whatsappWebhookUrl?: string;
    webhookChannels?: Record<string, { enabled?: boolean; webhookUrl?: string }>;
  };
};

const VOICE_OPTIONS = [
  { id: "Aoede",  label: "Aoede",  desc: "Warm · Natural",      emoji: "🌊" },
  { id: "Charon", label: "Charon", desc: "Deep · Authoritative", emoji: "🌑" },
  { id: "Fenrir", label: "Fenrir", desc: "Clear · Energetic",    emoji: "⚡" },
  { id: "Kore",   label: "Kore",   desc: "Soft · Friendly",      emoji: "🌸" },
  { id: "Zephyr", label: "Zephyr", desc: "Breathy · Calm",       emoji: "🍃" },
];

const ENROLL_SENTENCES = [
  "The quick brown fox jumps over the lazy dog.",
  "My voice is my password, verify me now.",
  "Nova, please activate and start listening.",
];

const CARD: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--bg-border)",
  borderRadius: 12,
};
const CARD_INNER: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--bg-border)",
  borderRadius: 10,
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`toggle-track ${on ? "on" : "off"}`}
    >
      <span className="toggle-thumb" />
    </button>
  );
}

function InputField({
  label, value, onChange, placeholder, type = "text", mono = false, hint,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }} className="block">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`input-field${mono ? " mono" : ""}`}
      />
      {hint && <p style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

export default function SettingsPage({ config, setConfig }: { config: any; setConfig: (c: any) => void }) {
  const [local, setLocal]       = useState<ConfigType | null>(null);
  const [tab, setTab]           = useState<string>("profile");
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [recordingStatus, setRecordingStatus] = useState("");
  const [newVoiceName, setNewVoiceName]       = useState("");
  const [enrollStep, setEnrollStep]           = useState(0);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingVoice, setRecordingVoice]   = useState(false);
  const accumulatedFramesRef = useRef<number[][]>([]);
  const progressIntervalRef  = useRef<any>(null);

  useEffect(() => { if (config) setLocal(JSON.parse(JSON.stringify(config))); }, [config]);

  useEffect(() => {
    if (tab === "history") {
      fetch("/api/conversations").then(r => r.json()).then(setConversations).catch(console.error);
    }
  }, [tab]);

  if (!local) return (
    <div className="flex-1 flex items-center justify-center" style={{ color: "var(--text-3)" }}>
      <p style={{ fontSize: 13 }}>Loading settings…</p>
    </div>
  );

  // ── Voice enrollment ────────────────────────────────────────────────────
  const recordVoiceStep = async (step: number) => {
    if (!newVoiceName.trim()) { setRecordingStatus("⚠ Enter a name first."); return; }
    const name = newVoiceName.trim();
    if (step === 1) {
      const exists = local.userVoiceProfiles?.some(p => p.name.toLowerCase() === name.toLowerCase());
      if (exists) { setRecordingStatus(`⚠ Profile for "${name}" already exists.`); return; }
    }
    try {
      setRecordingVoice(true);
      setRecordingProgress(0);
      setRecordingStatus(`Preparing mic for phrase ${step}…`);
      await initVoiceModel();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      const RECORD_MS = 4000;
      setRecordingStatus(`🎙 Recording phrase ${step}/3 — speak clearly for 4 seconds`);
      const start = Date.now();
      progressIntervalRef.current = setInterval(() => {
        setRecordingProgress(Math.min(100, ((Date.now() - start) / RECORD_MS) * 100));
      }, 50);
      recorder.start(100);
      await new Promise(r => setTimeout(r, RECORD_MS));
      recorder.stop();
      clearInterval(progressIntervalRef.current);
      setRecordingProgress(100);
      await new Promise(r => setTimeout(r, 100));
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: "audio/webm" });
      setRecordingStatus("⚙ Extracting voiceprint…");
      const result = await verifier.getEmbedding(blob);
      accumulatedFramesRef.current = [...accumulatedFramesRef.current, Array.from(result.embedding)];
      if (step < 3) {
        setEnrollStep(step + 1);
        setRecordingStatus(`✔ Phrase ${step} captured. Ready for phrase ${step + 1}.`);
        setRecordingVoice(false);
        setRecordingProgress(0);
      } else {
        setRecordingStatus("⚙ Finalising voiceprint…");
        const all = accumulatedFramesRef.current;
        const dims = all[0].length;
        const avg = Array.from({ length: dims }, (_, d) => all.reduce((s, e) => s + e[d], 0) / all.length);
        const profile: VoiceProfile = { id: `vp-${Date.now()}`, name, embedding: avg, createdAt: new Date().toISOString() };
        setLocal({ ...local, userVoiceProfiles: [...(local.userVoiceProfiles || []), profile] });
        setRecordingStatus(`✅ Voice profile "${name}" enrolled!`);
        setRecordingVoice(false);
        setRecordingProgress(0);
        setNewVoiceName("");
        setEnrollStep(0);
        accumulatedFramesRef.current = [];
      }
    } catch (err: any) {
      clearInterval(progressIntervalRef.current);
      setRecordingStatus(`❌ Error: ${err.message}`);
      setRecordingVoice(false);
      setRecordingProgress(0);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      const res = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(local) });
      const data = await res.json();
      if (res.ok) { setConfig(data.config); setSaved(true); setTimeout(() => setSaved(false), 2000); }
      else setSaveError(data.error || "Failed to save.");
    } catch (e: any) { setSaveError(e.message); }
    finally { setSaving(false); }
  };

  const integrations = local.integrations || {
    godoEnabled: false, obsidianEnabled: false, obsidianPath: "",
    customAgentEnabled: false, codingProvider: "nim" as const,
    nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "",
    telegramEnabled: false, telegramBotToken: "", telegramWebhookUrl: "",
    discordEnabled: false, discordBotToken: "", discordWebhookUrl: "",
    slackEnabled: false, slackBotToken: "", slackVerificationToken: "", slackWebhookUrl: "",
    whatsappEnabled: false, whatsappAccessToken: "", whatsappPhoneNumberId: "", whatsappWebhookUrl: "",
    webhookChannels: {},
  };

  const updateInt = (field: string, value: any) =>
    setLocal({ ...local, integrations: { ...integrations, [field]: value } as any });

  const updateWebhook = (id: string, next: any) =>
    setLocal({ ...local, integrations: { ...integrations, webhookChannels: { ...(integrations.webhookChannels || {}), [id]: { ...(integrations.webhookChannels?.[id] || {}), ...next } } } as any });

  const memByCategory = local.memory.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m); return acc;
  }, {} as Record<string, MemoryEntry[]>);

  const PAGES = [
    { id: "profile",      label: "Profile",      Icon: User,       desc: "Name, wake word, greeting" },
    { id: "voice",        label: "Voice",         Icon: Volume2,    desc: "Assistant voice selection" },
    { id: "modes",        label: "Modes",         Icon: Sliders,    desc: "Safety & behavior profiles" },
    { id: "integrations", label: "Integrations",  Icon: Link2,      desc: "Tools & coding agents" },
    { id: "channels",     label: "Channels",      Icon: Wifi,       desc: "Telegram, Discord, Slack…" },
    { id: "memory",       label: "Memory",        Icon: Brain,      desc: "Saved facts & patterns" },
    { id: "history",      label: "History",       Icon: Clock,      desc: "Recent conversations" },
  ];

  const webhookList = [
    { id: "teams", label: "Teams" }, { id: "imessage", label: "iMessage" },
    { id: "matrix", label: "Matrix" }, { id: "signal", label: "Signal" },
    { id: "viber", label: "Viber" }, { id: "sms", label: "SMS" },
    { id: "email", label: "Email" }, { id: "web", label: "Web" },
  ];

  const isStatusError   = recordingStatus.startsWith("⚠") || recordingStatus.startsWith("❌");
  const isStatusSuccess = recordingStatus.startsWith("✔") || recordingStatus.startsWith("✅");

  return (
    <div className="h-full flex overflow-hidden" style={{ background: "var(--bg-base)" }}>

      {/* ── Left nav ──────────────────────────────────────────────── */}
      <aside className="flex flex-col shrink-0 overflow-y-auto py-6 px-3" style={{ width: 220, borderRight: "1px solid var(--bg-border)", background: "var(--bg-surface)" }}>
        {/* Title */}
        <div className="flex items-center gap-2.5 px-2 mb-6">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)" }}>
            <Wand2 size={14} style={{ color: "#60a5fa" }} />
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)" }}>Settings</p>
            <p style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.06em" }}>Personalise Nova</p>
          </div>
        </div>

        <nav className="space-y-1">
          {PAGES.map(({ id, label, Icon, desc }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                className="w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-all duration-150"
                style={active ? {
                  background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd",
                } : {
                  background: "transparent", border: "1px solid transparent", color: "var(--text-2)",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "var(--bg-elevated)"; e.currentTarget.style.border = "1px solid var(--bg-border)"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.border = "1px solid transparent"; } }}
              >
                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: active ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)" }}>
                  <Icon size={13} />
                </span>
                <div className="min-w-0">
                  <p style={{ fontSize: 12, fontWeight: 600 }}>{label}</p>
                  {id === "memory" && local.memory.length > 0 && (
                    <span style={{ fontSize: 9, background: "var(--blue-soft)", color: "#93c5fd", border: "1px solid var(--blue-border)", borderRadius: 999, padding: "1px 6px", fontWeight: 700 }}>
                      {local.memory.length} saved
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Save actions */}
        <div className="mt-auto pt-4 space-y-2">
          {saveError && <p style={{ fontSize: 10, color: "var(--red)", padding: "0 4px" }}>{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={saved ? {
              background: "var(--green-soft)", border: "1px solid rgba(16,185,129,0.3)", color: "var(--green)", fontSize: 13,
            } : {
              background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd", fontSize: 13,
            }}
          >
            {saved ? (<><Check size={13} /> Saved!</>) : saving ? "Saving…" : (<><Save size={13} /> Save Changes</>)}
          </button>
        </div>
      </aside>

      {/* ── Content area ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-8" style={{ background: "var(--bg-base)" }}>
        <div className="max-w-2xl space-y-5">

          {/* ══ PROFILE ══════════════════════════════════════════════ */}
          {tab === "profile" && (
            <>
              <SectionHeader title="Profile" desc="Your identity, wake word, and greeting phrase." />
              <div style={CARD} className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Your Name" value={local.userName} onChange={v => setLocal({ ...local, userName: v })} placeholder="John" />
                  <InputField label="Wake Word" value={local.wakeWord} onChange={v => setLocal({ ...local, wakeWord: v.toLowerCase().trim() })} placeholder="nova" mono />
                </div>
                <InputField label="Greeting Phrase" value={local.greetingPhrase || ""} onChange={v => setLocal({ ...local, greetingPhrase: v })} placeholder="Hey {name}!" hint='Use {name} to insert your name. E.g. "Hello {name}!"' />
                <InfoBox icon={<Mic size={13} />} text='Wake word detection runs via the Web Speech API. When detected, Nova connects to Gemini Live. Say "goodbye" or "bye" to end a session.' />
              </div>

              {/* Voice Gating */}
              <SectionHeader title="Voice Gating" desc="Control who can activate Nova." />
              <div style={CARD} className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>User Voice Authentication</p>
                    <p style={{ fontSize: 11, color: "var(--text-2)", marginTop: 2 }}>Only respond to enrolled voice profiles</p>
                  </div>
                  <Toggle on={local.voiceResponseMode === "user"} onToggle={() => setLocal({ ...local, voiceResponseMode: local.voiceResponseMode === "user" ? "all" : "user" })} />
                </div>

                {local.voiceResponseMode === "user" && (
                  <div className="pt-3 space-y-4" style={{ borderTop: "1px solid var(--bg-border)" }}>
                    {/* Enrolled profiles */}
                    {(local.userVoiceProfiles || []).length > 0 && (
                      <div className="space-y-2">
                        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Enrolled Profiles</p>
                        {(local.userVoiceProfiles || []).map(p => (
                          <div key={p.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={CARD_INNER}>
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)" }}>
                                <Fingerprint size={12} style={{ color: "#60a5fa" }} />
                              </div>
                              <div>
                                <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{p.name}</p>
                                <p style={{ fontSize: 10, color: "var(--text-3)" }}>{new Date(p.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                            <button onClick={() => setLocal({ ...local, userVoiceProfiles: local.userVoiceProfiles.filter(x => x.id !== p.id) })} style={{ color: "var(--text-3)" }} onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
                              <Trash size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Enrollment */}
                    <div className="space-y-3 p-4 rounded-xl" style={CARD_INNER}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Enrol New Voice</p>
                      <InputField label="Profile Name" value={newVoiceName} onChange={setNewVoiceName} placeholder="e.g. Chiru" />
                      <div className="space-y-2">
                        {ENROLL_SENTENCES.map((sentence, idx) => {
                          const stepDone  = enrollStep > idx;
                          const stepReady = enrollStep === idx;
                          return (
                            <div key={idx} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: stepDone ? "rgba(16,185,129,0.06)" : stepReady ? "var(--blue-soft)" : "var(--bg-card)", border: `1px solid ${stepDone ? "rgba(16,185,129,0.2)" : stepReady ? "var(--blue-border)" : "var(--bg-border)"}` }}>
                              <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold" style={{ background: stepDone ? "rgba(16,185,129,0.2)" : "var(--bg-elevated)", color: stepDone ? "var(--green)" : "var(--text-3)" }}>
                                {stepDone ? "✓" : idx + 1}
                              </span>
                              <p style={{ fontSize: 11, color: stepDone ? "var(--green)" : stepReady ? "#93c5fd" : "var(--text-3)", flex: 1 }}>{sentence}</p>
                              {stepReady && !recordingVoice && (
                                <button onClick={() => recordVoiceStep(idx + 1)} className="px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd" }}>
                                  Record
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {recordingVoice && (
                        <div className="space-y-1.5">
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${recordingProgress}%`, background: "var(--blue)" }} />
                          </div>
                        </div>
                      )}
                      {recordingStatus && (
                        <p style={{ fontSize: 11, color: isStatusError ? "var(--red)" : isStatusSuccess ? "var(--green)" : "var(--text-2)" }}>
                          {recordingStatus}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ══ VOICE ════════════════════════════════════════════════ */}
          {tab === "voice" && (
            <>
              <SectionHeader title="Assistant Voice" desc="Select the voice Nova uses to speak. Changes take effect on the next session." />
              <div className="space-y-2">
                {VOICE_OPTIONS.map(v => {
                  const active = local.voiceName === v.id;
                  return (
                    <button key={v.id} type="button" onClick={() => setLocal({ ...local, voiceName: v.id })}
                      className="w-full flex items-center justify-between p-4 rounded-xl text-left transition-all duration-150"
                      style={active ? { background: "var(--blue-soft)", border: "1px solid var(--blue-border)" } : { ...CARD }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ background: active ? "rgba(59,130,246,0.15)" : "var(--bg-elevated)" }}>
                          {v.emoji}
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: active ? "#93c5fd" : "var(--text-1)" }}>{v.label}</p>
                          <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{v.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {active && <span style={{ fontSize: 10, background: "var(--blue-soft)", color: "#93c5fd", border: "1px solid var(--blue-border)", borderRadius: 999, padding: "2px 8px", fontWeight: 600 }}>Active</span>}
                        <ChevronRight size={14} style={{ color: active ? "#60a5fa" : "var(--text-3)" }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ══ MODES ════════════════════════════════════════════════ */}
          {tab === "modes" && (
            <>
              <div className="flex items-center justify-between">
                <SectionHeader title="Behaviour Modes" desc="Each mode shapes tone, safety level, and capabilities." />
                <button onClick={() => {
                  const m: Mode = { id: `custom-${Date.now()}`, name: "My Mode", description: "Custom behavior", emoji: "🛠️", instruction: "You are Nova. Describe custom behavior here…", isCustom: true };
                  setLocal({ ...local, modes: [...local.modes, m], activeModeId: m.id });
                }} className="flex items-center gap-1 text-xs font-semibold" style={{ color: "#60a5fa" }}>
                  <Plus size={12} /> New Mode
                </button>
              </div>
              <div className="space-y-2">
                {local.modes.map(mode => {
                  const isActive = local.activeModeId === mode.id;
                  const isUnrestricted = mode.id === "unrestricted";
                  return (
                    <div key={mode.id} onClick={() => setLocal({ ...local, activeModeId: mode.id })}
                      className="p-4 rounded-xl cursor-pointer transition-all duration-150"
                      style={isActive ? {
                        background: isUnrestricted ? "rgba(239,68,68,0.06)" : "var(--blue-soft)",
                        border: `1px solid ${isUnrestricted ? "rgba(239,68,68,0.25)" : "var(--blue-border)"}`,
                      } : CARD}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{mode.emoji || "🤖"}</span>
                          <div>
                            {mode.isCustom ? (
                              <input type="text" value={mode.name} onClick={e => e.stopPropagation()}
                                onChange={e => setLocal({ ...local, modes: local.modes.map(m => m.id === mode.id ? { ...m, name: e.target.value } : m) })}
                                className="bg-transparent font-semibold focus:outline-none border-b"
                                style={{ fontSize: 13, color: "var(--text-1)", borderColor: "var(--bg-border)", width: 160 }} />
                            ) : (
                              <p style={{ fontSize: 13, fontWeight: 600, color: isActive ? (isUnrestricted ? "#f87171" : "#93c5fd") : "var(--text-1)", display: "flex", alignItems: "center", gap: 6 }}>
                                {mode.name} {isActive && <Check size={11} />}
                              </p>
                            )}
                            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                              {isUnrestricted ? <ShieldOff size={10} style={{ color: "var(--red)" }} /> : <ShieldCheck size={10} />}
                              {mode.description || "Custom behavior mode"}
                            </p>
                          </div>
                        </div>
                        {mode.isCustom && (
                          <button onClick={e => { e.stopPropagation(); setLocal({ ...local, modes: local.modes.filter(m => m.id !== mode.id), activeModeId: local.activeModeId === mode.id ? local.modes[0].id : local.activeModeId }); }}
                            style={{ color: "var(--text-3)", padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
                            <Trash size={12} />
                          </button>
                        )}
                      </div>
                      {mode.isCustom && (
                        <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                          <input type="text" value={mode.description} placeholder="Short description…"
                            onChange={e => setLocal({ ...local, modes: local.modes.map(m => m.id === mode.id ? { ...m, description: e.target.value } : m) })}
                            className="input-field" style={{ fontSize: 11 }} />
                          <textarea value={mode.instruction} placeholder="Describe how Nova should behave…" rows={4}
                            onChange={e => setLocal({ ...local, modes: local.modes.map(m => m.id === mode.id ? { ...m, instruction: e.target.value } : m) })}
                            className="input-field resize-none leading-relaxed" style={{ fontSize: 11 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ══ INTEGRATIONS ═════════════════════════════════════════ */}
          {tab === "integrations" && (
            <>
              <SectionHeader title="Integrations" desc="Connect third-party tools to expand Nova's capabilities." />
              {/* GoDo */}
              <IntegrationCard title="GoDo Task Manager" abbr="GD" desc="Manage local tasks and TODO lists via the GoDo CLI."
                active={!!integrations.godoEnabled} onToggle={() => updateInt("godoEnabled", !integrations.godoEnabled)} />
              {/* Obsidian */}
              <IntegrationCard title="Obsidian Vault" abbr="OB" desc="Read, write, search, and update Obsidian vault markdown files."
                active={!!integrations.obsidianEnabled} onToggle={() => updateInt("obsidianEnabled", !integrations.obsidianEnabled)}>
                {integrations.obsidianEnabled && (
                  <InputField label="Vault Path" value={integrations.obsidianPath || ""} onChange={v => updateInt("obsidianPath", v)}
                    placeholder="/home/username/Documents/Vault" mono hint="Absolute path to your Obsidian vault directory." />
                )}
              </IntegrationCard>
              {/* Coding Agent */}
              <IntegrationCard title="Coding Agent" abbr="AI" desc="NVIDIA NIM / OpenRouter / Groq — multi-agent coding."
                active={!!integrations.customAgentEnabled} onToggle={() => updateInt("customAgentEnabled", !integrations.customAgentEnabled)}>
                {integrations.customAgentEnabled && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }} className="block">Provider</label>
                      <select value={integrations.codingProvider || "nim"} onChange={e => updateInt("codingProvider", e.target.value)}
                        className="input-field" style={{ background: "var(--bg-elevated)", cursor: "pointer" }}>
                        <option value="nim">NVIDIA NIM (Recommended)</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="groq">GroqCloud</option>
                      </select>
                    </div>
                    <InputField type="password"
                      label={integrations.codingProvider === "openrouter" ? "OpenRouter API Key" : integrations.codingProvider === "groq" ? "Groq API Key" : "NVIDIA API Key"}
                      value={integrations.codingProvider === "openrouter" ? (integrations.openrouterApiKey || "") : integrations.codingProvider === "groq" ? (integrations.groqApiKey || "") : (integrations.nvidiaApiKey || "")}
                      onChange={v => updateInt(integrations.codingProvider === "openrouter" ? "openrouterApiKey" : integrations.codingProvider === "groq" ? "groqApiKey" : "nvidiaApiKey", v)}
                      placeholder={integrations.codingProvider === "openrouter" ? "sk-or-..." : integrations.codingProvider === "groq" ? "gsk_..." : "nvapi-..."} mono />
                    <div className="space-y-1.5">
                      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.08em" }} className="block">Model</label>
                      <select value={integrations.nvidiaModel || "auto"} onChange={e => updateInt("nvidiaModel", e.target.value)}
                        className="input-field" style={{ background: "var(--bg-elevated)", cursor: "pointer" }}>
                        <option value="auto">Auto-Select (Recommended)</option>
                        <option value="llama-3.1-8b-instant">Groq: Llama 3.1 8B Instant</option>
                        <option value="llama-3.3-70b-versatile">Groq: Llama 3.3 70B Versatile</option>
                        <option value="qwen/qwen3-32b">Groq: Qwen3 32B</option>
                        <option value="openrouter/free">OpenRouter: Auto Free</option>
                        <option value="google/gemini-2.0-flash-exp:free">OpenRouter: Gemini 2.0 Flash (free)</option>
                        <option value="meta-llama/llama-3.3-70b-instruct:free">OpenRouter: Llama 3.3 70B (free)</option>
                        <option value="qwen/qwen3-coder:free">OpenRouter: Qwen3 Coder (free)</option>
                        <option value="deepseek/deepseek-r1:free">OpenRouter: DeepSeek R1 (free)</option>
                      </select>
                    </div>
                  </div>
                )}
              </IntegrationCard>
              {/* Channel hint */}
              <div className="p-4 rounded-xl" style={CARD}>
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Messaging Channels</p>
                    <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Telegram, Discord, Slack, WhatsApp and more</p>
                  </div>
                  <button onClick={() => setTab("channels")} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--blue-soft)", border: "1px solid var(--blue-border)", color: "#93c5fd" }}>
                    Configure →
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {["Telegram","Discord","Slack","WhatsApp","Teams","Matrix","Signal","Viber","SMS","Email","Web"].map(c => (
                    <span key={c} className="px-2 py-0.5 rounded-full text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-2)", border: "1px solid var(--bg-border)" }}>{c}</span>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ══ CHANNELS ═════════════════════════════════════════════ */}
          {tab === "channels" && (
            <>
              <SectionHeader title="Messaging Channels" desc="Connect messaging platforms. Tokens are written to .env and loaded on restart." />
              {[
                { id:"telegram", label:"Telegram", toggle: integrations.telegramEnabled, toggleField:"telegramEnabled", tokenLabel:"Bot Token", tokenValue: integrations.telegramBotToken||"", tokenField:"telegramBotToken", tokenPH:"123456:ABC-DEF...", webhookLabel:"Webhook URL", webhookValue: integrations.telegramWebhookUrl||"", webhookField:"telegramWebhookUrl", webhookPH:"https://your-domain.com/webhooks/telegram" },
                { id:"discord",  label:"Discord",  toggle: integrations.discordEnabled,  toggleField:"discordEnabled",  tokenLabel:"Bot Token", tokenValue: integrations.discordBotToken||"",  tokenField:"discordBotToken",  tokenPH:"Bot token", webhookLabel:"Webhook URL", webhookValue: integrations.discordWebhookUrl||"",  webhookField:"discordWebhookUrl",  webhookPH:"https://discord.com/api/webhooks/..." },
                { id:"slack",    label:"Slack",    toggle: integrations.slackEnabled,    toggleField:"slackEnabled",    tokenLabel:"Bot Token", tokenValue: integrations.slackBotToken||"",    tokenField:"slackBotToken",    tokenPH:"xoxb-...",  webhookLabel:"Webhook URL", webhookValue: integrations.slackWebhookUrl||"",    webhookField:"slackWebhookUrl",    webhookPH:"https://hooks.slack.com/services/...", extraLabel:"Verification Token", extraValue: integrations.slackVerificationToken||"", extraField:"slackVerificationToken", extraPH:"Signing secret" },
                { id:"whatsapp", label:"WhatsApp", toggle: integrations.whatsappEnabled, toggleField:"whatsappEnabled", tokenLabel:"Access Token", tokenValue: integrations.whatsappAccessToken||"", tokenField:"whatsappAccessToken", tokenPH:"EAAG...", webhookLabel:"Webhook URL", webhookValue: integrations.whatsappWebhookUrl||"", webhookField:"whatsappWebhookUrl", webhookPH:"https://your-domain.com/webhooks/whatsapp", extraLabel:"Phone Number ID", extraValue: integrations.whatsappPhoneNumberId||"", extraField:"whatsappPhoneNumberId", extraPH:"123456789012345" },
              ].map(ch => (
                <div key={ch.id} className="p-5 rounded-xl space-y-4" style={CARD}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{ch.label}</p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Enable and configure credentials</p>
                    </div>
                    <Toggle on={!!ch.toggle} onToggle={() => updateInt(ch.toggleField, !ch.toggle)} />
                  </div>
                  <div className="grid gap-3">
                    <InputField label={ch.tokenLabel} value={ch.tokenValue} onChange={v => updateInt(ch.tokenField, v)} placeholder={ch.tokenPH} type="password" mono />
                    {"extraField" in ch && <InputField label={(ch as any).extraLabel} value={(ch as any).extraValue} onChange={v => updateInt((ch as any).extraField, v)} placeholder={(ch as any).extraPH} mono />}
                    <InputField label={ch.webhookLabel} value={ch.webhookValue} onChange={v => updateInt(ch.webhookField, v)} placeholder={ch.webhookPH} mono />
                  </div>
                </div>
              ))}
              {/* Webhook channels */}
              <div className="p-5 rounded-xl space-y-4" style={CARD}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>Webhook Bridges</p>
                  <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>Teams, iMessage, Matrix, Signal, Viber, SMS, Email, Web</p>
                </div>
                <div className="space-y-2">
                  {webhookList.map(entry => {
                    const cur = integrations.webhookChannels?.[entry.id] || { enabled: false, webhookUrl: "" };
                    return (
                      <div key={entry.id} className="p-3 rounded-xl space-y-2" style={CARD_INNER}>
                        <div className="flex items-center justify-between">
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{entry.label}</p>
                          <Toggle on={!!cur.enabled} onToggle={() => updateWebhook(entry.id, { enabled: !cur.enabled })} />
                        </div>
                        <input type="text" value={cur.webhookUrl || ""} onChange={e => updateWebhook(entry.id, { webhookUrl: e.target.value })}
                          placeholder={`https://your-domain.com/webhooks/${entry.id}`} className="input-field mono" style={{ fontSize: 11 }} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ══ MEMORY ═══════════════════════════════════════════════ */}
          {tab === "memory" && (
            <>
              <div className="flex items-center justify-between">
                <SectionHeader title="Nova's Memory" desc={`${local.memory.length} fact${local.memory.length !== 1 ? "s" : ""} — auto-extracted from conversations`} />
                {local.memory.length > 0 && (
                  <button onClick={async () => { await fetch("/api/memory/clear", { method: "POST" }); setLocal({ ...local, memory: [] }); }}
                    className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--red)" }}>
                    <Trash size={11} /> Clear All
                  </button>
                )}
              </div>
              {local.memory.length === 0 ? (
                <EmptyState icon={<Brain size={32} />} title="No memories yet" desc="Nova automatically extracts important facts from your conversations." />
              ) : (
                <div className="space-y-4">
                  {Object.entries(memByCategory).map(([cat, entries]) => (
                    <div key={cat}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{cat}</p>
                      <div className="space-y-1.5">
                        {(entries as MemoryEntry[]).map(m => (
                          <div key={m.id} className="flex items-start justify-between p-3 rounded-xl group" style={CARD_INNER}>
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className="px-1.5 py-0.5 rounded-md text-xs font-bold shrink-0" style={{ background: "var(--blue-soft)", color: "#93c5fd", border: "1px solid var(--blue-border)", fontSize: 9 }}>{"★".repeat(m.importance)}</span>
                              <p style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.5 }}>{m.content}</p>
                            </div>
                            <button onClick={() => setLocal({ ...local, memory: local.memory.filter(x => x.id !== m.id) })}
                              className="ml-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "var(--text-3)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "var(--red)")} onMouseLeave={e => (e.currentTarget.style.color = "var(--text-3)")}>
                              <Trash size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <InfoBox icon={<Brain size={13} />} text="How it works: After each session, Nova uses Gemini AI to extract meaningful facts — preferences, patterns, context. These are injected at session start so Nova always knows your context." />
            </>
          )}

          {/* ══ HISTORY ══════════════════════════════════════════════ */}
          {tab === "history" && (
            <>
              <div className="flex items-center justify-between">
                <SectionHeader title="Conversation History" desc={`${conversations.length} session${conversations.length !== 1 ? "s" : ""} saved locally`} />
                {conversations.length > 0 && (
                  <button onClick={async () => { await fetch("/api/conversations/clear", { method: "POST" }); setConversations([]); }}
                    className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--red)" }}>
                    <Trash size={11} /> Clear History
                  </button>
                )}
              </div>
              {conversations.length === 0 ? (
                <EmptyState icon={<Clock size={32} />} title="No history found" desc="Conversations will appear here with timestamps as you use the assistant." />
              ) : (
                <div className="space-y-3">
                  {conversations.map((session, i) => {
                    const d = new Date(session.startTime);
                    return (
                      <div key={session.id} className="p-4 rounded-xl space-y-3" style={CARD}>
                        <div className="flex items-center justify-between pb-2" style={{ borderBottom: "1px solid var(--bg-border)" }}>
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full" style={{ background: "var(--blue)" }} />
                            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>{d.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })} at {d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          <span style={{ fontSize: 10, color: "var(--text-3)", fontFamily: "monospace" }}>{session.messages.length} msgs</span>
                        </div>
                        <div className="space-y-2">
                          {session.messages.map((msg: any, mi: number) => {
                            const isUser = msg.role.toLowerCase() !== "nova" && !msg.role.startsWith("Tool");
                            const isTool = msg.role.startsWith("Tool") || ["SEARCH","FETCH","CMD","DELEGATE"].includes(msg.role);
                            return (
                              <div key={mi} className="flex gap-2 items-start" style={{ fontSize: 11 }}>
                                <span className="px-1.5 py-0.5 rounded font-bold uppercase shrink-0" style={{ fontSize: 9, letterSpacing: "0.06em", background: isUser ? "rgba(59,130,246,0.1)" : isTool ? "rgba(245,158,11,0.1)" : "var(--blue-soft)", color: isUser ? "#93c5fd" : isTool ? "#fbbf24" : "#a78bfa", border: `1px solid ${isUser ? "var(--blue-border)" : isTool ? "rgba(245,158,11,0.25)" : "rgba(139,92,246,0.25)"}` }}>
                                  {msg.role}
                                </span>
                                <p style={{ color: "var(--text-2)", lineHeight: 1.5, flex: 1 }}>{msg.text}</p>
                                <span style={{ fontSize: 9, color: "var(--text-3)", fontFamily: "monospace", flexShrink: 0 }}>{new Date(msg.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <InfoBox icon={<Clock size={13} />} text="Continuous Context: Conversation sessions are saved with precise timestamps. The most recent sessions are automatically summarized and injected into the system prompt." />
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-2">
      <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{title}</h2>
      <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>{desc}</p>
    </div>
  );
}

function InfoBox({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.12)" }}>
      <span style={{ color: "#60a5fa", marginTop: 1, flexShrink: 0 }}>{icon}</span>
      <p style={{ fontSize: 11, color: "var(--text-2)", lineHeight: 1.6 }}>{text}</p>
    </div>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl p-12 flex flex-col items-center gap-3 text-center" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
      <span style={{ color: "var(--text-3)", opacity: 0.5 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-2)" }}>{title}</p>
        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4, maxWidth: 280 }}>{desc}</p>
      </div>
    </div>
  );
}

function IntegrationCard({ title, abbr, desc, active, onToggle, children }: {
  title: string; abbr: string; desc: string; active: boolean; onToggle: () => void; children?: React.ReactNode;
}) {
  return (
    <div className="p-5 rounded-xl space-y-4" style={{ background: "var(--bg-card)", border: "1px solid var(--bg-border)" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
            style={{ background: active ? "var(--blue-soft)" : "var(--bg-elevated)", border: `1px solid ${active ? "var(--blue-border)" : "var(--bg-border)"}`, color: active ? "#60a5fa" : "var(--text-3)" }}>
            {abbr}
          </div>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{title}</p>
            <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: 10, fontWeight: 600, color: active ? "var(--green)" : "var(--text-3)", background: active ? "var(--green-soft)" : "var(--bg-elevated)", border: `1px solid ${active ? "rgba(16,185,129,0.25)" : "var(--bg-border)"}`, borderRadius: 999, padding: "2px 8px" }}>
            {active ? "Active" : "Inactive"}
          </span>
          <Toggle on={active} onToggle={onToggle} />
        </div>
      </div>
      {children && (
        <div className="pt-3 space-y-3" style={{ borderTop: "1px solid var(--bg-border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
