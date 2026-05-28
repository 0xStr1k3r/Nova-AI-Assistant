import React, { useState, useEffect, useRef } from "react";
import {
  X, Save, Plus, Trash, Brain, Mic, Sliders, User,
  Volume2, ShieldCheck, ShieldOff, Check, Fingerprint,
  Wand2, ChevronRight, AlertCircle, Wifi, WifiOff, Link2, Clock,
} from "lucide-react";
import { verifier, initVoiceModel, VoiceProfile } from "../utils/voiceProfile";

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
  userVoiceProfiles: VoiceProfile[];
  greetingPhrase?: string;
  integrations?: {
    godoEnabled: boolean;
    obsidianEnabled: boolean;
    obsidianPath: string;
    customAgentEnabled?: boolean;
    codingProvider?: "nim" | "openrouter" | "groq";
    nvidiaApiKey?: string;
    nvidiaModel?: string;
    openrouterApiKey?: string;
    groqApiKey?: string;
    telegramEnabled?: boolean;
    telegramBotToken?: string;
    telegramWebhookUrl?: string;
    discordEnabled?: boolean;
    discordBotToken?: string;
    discordWebhookUrl?: string;
    slackEnabled?: boolean;
    slackBotToken?: string;
    slackVerificationToken?: string;
    slackWebhookUrl?: string;
    whatsappEnabled?: boolean;
    whatsappAccessToken?: string;
    whatsappPhoneNumberId?: string;
    whatsappWebhookUrl?: string;
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

const CATEGORY_COLORS: Record<string, string> = {
  personal:   "text-violet-300  bg-violet-500/15  border-violet-500/20",
  preference: "text-blue-300    bg-blue-500/15    border-blue-500/20",
  pattern:    "text-amber-300   bg-amber-500/15   border-amber-500/20",
  fact:       "text-emerald-300 bg-emerald-500/15 border-emerald-500/20",
  task:       "text-rose-300    bg-rose-500/15    border-rose-500/20",
};

const ENROLL_SENTENCES = [
  "",
  "Nova, wake up and help me with something important.",
  "My voice is my password — verify my identity now.",
  "This is the third and final phrase for my voice profile.",
];

export default function SettingsModal({
  isOpen, onClose, config, setConfig,
}: {
  isOpen: boolean;
  onClose: () => void;
  config: ConfigType | null;
  setConfig: (cfg: ConfigType) => void;
}) {
  const [local, setLocal]               = useState<ConfigType | null>(null);
  const [tab, setTab]                   = useState<"profile" | "voice" | "modes" | "integrations" | "channels" | "memory" | "history">("profile");
  const [conversations, setConversations] = useState<any[]>([]);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [recordingVoice, setRecordingVoice] = useState(false);

  useEffect(() => {
    if (tab === "history" && isOpen) {
      fetch("/api/conversations")
        .then(r => r.json())
        .then(setConversations)
        .catch(console.error);
    }
  }, [tab, isOpen]);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [newVoiceName, setNewVoiceName] = useState<string>("");
  const [enrollStep, setEnrollStep]     = useState<number>(0);
  const [recordingProgress, setRecordingProgress] = useState(0);
  // useRef avoids stale-closure bug when step 2 reads step 1's frames
  const accumulatedFramesRef            = useRef<number[][]>([]);
  const progressIntervalRef  = useRef<any>(null);

  useEffect(() => {
    if (config) setLocal(JSON.parse(JSON.stringify(config)));
  }, [config, isOpen]);

  if (!isOpen || !local) return null;

  // ── Advanced Voice Enrollment (ONNX-based) ───────────────────────────────
  const recordVoiceStep = async (step: number) => {
    if (!newVoiceName.trim()) {
      setRecordingStatus("⚠ Please enter a name for this voice profile first.");
      return;
    }
    const nameToRegister = newVoiceName.trim();
    if (step === 1) {
      const exists = local?.userVoiceProfiles?.some(
        p => p.name.toLowerCase() === nameToRegister.toLowerCase()
      );
      if (exists) {
        setRecordingStatus(`⚠ A profile for "${nameToRegister}" already exists.`);
        return;
      }
    }

    try {
      setRecordingVoice(true);
      setRecordingProgress(0);
      setRecordingStatus(`Preparing mic for phrase ${step}…`);
      
      await initVoiceModel();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };

      const RECORD_MS = 4000;
      setRecordingStatus(`🎙 Recording phrase ${step}/3 — speak clearly for 4 seconds`);

      // Progress bar ticker
      const startTime = Date.now();
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        setRecordingProgress(Math.min(100, (elapsed / RECORD_MS) * 100));
      }, 50);

      mediaRecorder.start(100);

      await new Promise(resolve => setTimeout(resolve, RECORD_MS));
      
      mediaRecorder.stop();
      clearInterval(progressIntervalRef.current);
      setRecordingProgress(100);

      // Wait for data to flush
      await new Promise(resolve => setTimeout(resolve, 100));
      stream.getTracks().forEach(t => t.stop());

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      setRecordingStatus(`⚙ Extracting deep learning voice footprint…`);

      // Extract embedding
      const result = await verifier.getEmbedding(audioBlob);
      const embedding = Array.from(result.embedding);

      accumulatedFramesRef.current = [...accumulatedFramesRef.current, embedding];

      if (step < 3) {
        setEnrollStep(step + 1);
        setRecordingStatus(`✔ Phrase ${step} embedded successfully. Ready for phrase ${step + 1}.`);
        setRecordingVoice(false);
        setRecordingProgress(0);
      } else {
        setRecordingStatus("⚙ Finalising master voiceprint…");

        const allEmbeddings = accumulatedFramesRef.current;
        const numEmbeddings = allEmbeddings.length;
        const numDims = allEmbeddings[0].length;

        // Average the embeddings for a robust master profile
        const averaged = new Array(numDims).fill(0);
        for (let j = 0; j < numEmbeddings; j++) {
          for (let i = 0; i < numDims; i++) {
            averaged[i] += allEmbeddings[j][i];
          }
        }
        
        // Re-normalise to unit length
        let sumSq = 0;
        for (let i = 0; i < numDims; i++) {
          averaged[i] /= numEmbeddings;
          sumSq += averaged[i] * averaged[i];
        }
        const mag = Math.sqrt(sumSq);
        if (mag > 1e-10) {
          for (let i = 0; i < numDims; i++) averaged[i] /= mag;
        }

        const profile: VoiceProfile = {
          name: nameToRegister,
          embedding: averaged,
        };

        setLocal(prev => ({
          ...prev!,
          userVoiceProfiles: [...(prev!.userVoiceProfiles || []), profile],
        }));

        accumulatedFramesRef.current = [];
        setNewVoiceName("");
        setEnrollStep(0);
        setRecordingStatus(`✅ Advanced voice profile for "${nameToRegister}" enrolled!`);
        setRecordingVoice(false);
        setRecordingProgress(0);
      }
    } catch (err: any) {
      clearInterval(progressIntervalRef.current);
      setRecordingStatus(`❌ Error: ${err.message}`);
      setRecordingVoice(false);
      setRecordingProgress(0);
    }
  };

  // ── General handlers ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setSaved(true);
        setTimeout(() => { setSaved(false); onClose(); }, 900);
      } else {
        setSaveError(data.error || "Failed to save configuration.");
      }
    } catch (e: any) {
      console.error(e);
      setSaveError(e.message || "Failed to save configuration.");
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
      id:          `custom-${Date.now()}`,
      name:        "My Mode",
      description: "Custom behavior",
      emoji:       "🛠️",
      instruction: "You are Nova. Describe custom behavior here…",
      isCustom:    true,
    };
    setLocal({ ...local, modes: [...local.modes, newMode], activeModeId: newMode.id });
  };

  const settingsPages = [
    { id: "profile", label: "Profile", icon: User, description: "Identity, wake word, and greeting" },
    { id: "voice", label: "Voice", icon: Volume2, description: "Pick the assistant voice" },
    { id: "modes", label: "Modes", icon: Sliders, description: "Safety and behavior profiles" },
    { id: "integrations", label: "Integrations", icon: Link2, description: "GoDo, Obsidian, and coding agents" },
    { id: "channels", label: "Channels", icon: Wifi, description: "Telegram, Discord, WhatsApp, and webhooks" },
    { id: "memory", label: "Memory", icon: Brain, description: "Saved facts and patterns" },
    { id: "history", label: "History", icon: Clock, description: "Recent conversations" },
  ] as const;

  const memoryByCategory = local.memory.reduce((acc, m) => {
    if (!acc[m.category]) acc[m.category] = [];
    acc[m.category].push(m);
    return acc;
  }, {} as Record<string, MemoryEntry[]>);

  const integrations = local.integrations || {
    godoEnabled: false,
    obsidianEnabled: false,
    obsidianPath: "",
    customAgentEnabled: false,
    codingProvider: "nim" as const,
    nvidiaApiKey: "",
    nvidiaModel: "auto",
    openrouterApiKey: "",
    groqApiKey: "",
    telegramEnabled: false,
    telegramBotToken: "",
    telegramWebhookUrl: "",
    discordEnabled: false,
    discordBotToken: "",
    discordWebhookUrl: "",
    slackEnabled: false,
    slackBotToken: "",
    slackVerificationToken: "",
    slackWebhookUrl: "",
    whatsappEnabled: false,
    whatsappAccessToken: "",
    whatsappPhoneNumberId: "",
    whatsappWebhookUrl: "",
    webhookChannels: {},
  };

  const webhookChannelList: Array<{ id: string; label: string }> = [
    { id: "teams", label: "Teams" },
    { id: "imessage", label: "iMessage" },
    { id: "matrix", label: "Matrix" },
    { id: "signal", label: "Signal" },
    { id: "viber", label: "Viber" },
    { id: "sms", label: "SMS" },
    { id: "email", label: "Email" },
    { id: "web", label: "Web" },
  ];

  const integrationHubCards = [
    {
      id: "godo",
      label: "GoDo",
      description: "Local task manager",
      active: !!integrations.godoEnabled,
      actionLabel: integrations.godoEnabled ? "Disable" : "Enable",
      onAction: () => updateIntegrationField("godoEnabled", !integrations.godoEnabled),
    },
    {
      id: "obsidian",
      label: "Obsidian",
      description: "Vault read/write/search",
      active: !!integrations.obsidianEnabled,
      actionLabel: integrations.obsidianEnabled ? "Disable" : "Enable",
      onAction: () => updateIntegrationField("obsidianEnabled", !integrations.obsidianEnabled),
    },
    {
      id: "coding",
      label: "Coding Agent",
      description: "NVIDIA NIM / OpenRouter / Groq",
      active: !!integrations.customAgentEnabled,
      actionLabel: integrations.customAgentEnabled ? "Disable" : "Enable",
      onAction: () => updateIntegrationField("customAgentEnabled", !integrations.customAgentEnabled),
    },
    {
      id: "telegram",
      label: "Telegram",
      description: "Channel connector",
      active: !!integrations.telegramEnabled,
      actionLabel: "Configure",
      onAction: () => setTab("channels"),
    },
    {
      id: "discord",
      label: "Discord",
      description: "Channel connector",
      active: !!integrations.discordEnabled,
      actionLabel: "Configure",
      onAction: () => setTab("channels"),
    },
    {
      id: "slack",
      label: "Slack",
      description: "Channel connector",
      active: !!integrations.slackEnabled,
      actionLabel: "Configure",
      onAction: () => setTab("channels"),
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      description: "Cloud API / webhook",
      active: !!integrations.whatsappEnabled,
      actionLabel: "Configure",
      onAction: () => setTab("channels"),
    },
    {
      id: "bridges",
      label: "Web Bridges",
      description: "Teams, iMessage, Matrix, Signal, Viber, SMS, Email, Web",
      active: Object.values(integrations.webhookChannels || {}).some((entry) => !!entry?.enabled),
      actionLabel: "Configure",
      onAction: () => setTab("channels"),
    },
  ];

  const updateWebhookChannel = (channelId: string, next: { enabled?: boolean; webhookUrl?: string }) => {
    setLocal({
      ...local,
      integrations: {
        ...integrations,
        webhookChannels: {
          ...(integrations.webhookChannels || {}),
          [channelId]: {
            ...(integrations.webhookChannels?.[channelId] || {}),
            ...next,
          },
        },
      },
    });
  };

  const updateIntegrationField = (field: string, value: string | boolean) => {
    setLocal({
      ...local,
      integrations: {
        ...integrations,
        [field]: value,
      } as any,
    });
  };

  const isStatusError   = recordingStatus.startsWith("⚠") || recordingStatus.startsWith("❌");
  const isStatusSuccess = recordingStatus.startsWith("✔") || recordingStatus.startsWith("✅");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(4,4,12,0.88)", backdropFilter: "blur(28px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden relative"
        style={{
          background: "linear-gradient(160deg, rgba(14,14,26,0.99) 0%, rgba(10,10,20,0.99) 100%)",
          border: "1px solid rgba(139,92,246,0.18)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 40px 100px rgba(0,0,0,0.8), 0 0 80px rgba(139,92,246,0.08)",
        }}
      >
        {/* Ambient top glow */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-violet-600/8 blur-3xl pointer-events-none" />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(99,102,241,0.2))", border: "1px solid rgba(139,92,246,0.35)" }}
            >
              <Wand2 size={16} className="text-violet-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Nova Settings</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Personalise your AI assistant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/8 transition-all duration-150"
          >
            <X size={15} />
          </button>
        </div>

        {/* ── Page Layout ─────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-hidden px-5 pt-4 pb-0">
          <div className="grid h-full min-h-0 grid-cols-[15rem_minmax(0,1fr)] gap-4">
            <aside className="min-h-0 overflow-y-auto space-y-2 pr-1">
              <p className="text-[10px] uppercase tracking-widest text-slate-500 font-mono px-1">Settings Pages</p>
              {settingsPages.map((page) => {
                const Icon = page.icon;
                const isActive = tab === page.id;
                return (
                  <button
                    key={page.id}
                    onClick={() => setTab(page.id)}
                    className={`w-full text-left rounded-2xl px-3 py-3 transition-all duration-200 ${
                      isActive ? "text-violet-200" : "text-slate-400 hover:text-slate-200"
                    }`}
                    style={isActive ? {
                      background: "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(99,102,241,0.12))",
                      border: "1px solid rgba(139,92,246,0.28)",
                    } : {
                      background: "rgba(255,255,255,0.025)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center ${isActive ? "bg-violet-500/20" : "bg-white/5"}`}>
                        <Icon size={13} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">{page.label}</p>
                        <p className="text-[10px] text-slate-500 truncate">{page.description}</p>
                      </div>
                    </div>
                    {page.id === "memory" && local.memory.length > 0 && (
                      <span className="inline-flex mt-2 text-[9px] bg-violet-500/35 text-violet-300 px-1.5 py-0.5 rounded-full font-bold">
                        {local.memory.length} saved
                      </span>
                    )}
                  </button>
                );
              })}
            </aside>

            {/* ── Content ─────────────────────────────────────────────── */}
            <div className="min-h-0 overflow-y-auto space-y-4 pr-1">

          {/* ════ PROFILE TAB ════════════════════════════════════════════ */}
          {tab === "profile" && (
            <div className="space-y-4">

              {/* Name + Wake word row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Your Name</label>
                  <input
                    type="text"
                    value={local.userName}
                    onChange={e => setLocal({ ...local, userName: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all font-medium"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                    placeholder="John"
                    onFocus={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.5)")}
                    onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Wake Word</label>
                  <input
                    type="text"
                    value={local.wakeWord}
                    onChange={e => setLocal({ ...local, wakeWord: e.target.value.toLowerCase().trim() })}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm text-violet-200 font-mono focus:outline-none transition-all"
                    style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}
                    placeholder="nova"
                    onFocus={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.5)")}
                    onBlur={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.2)")}
                  />
                </div>
              </div>

              {/* Custom Greeting Phrase */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider block">Greeting Phrase</label>
                <input
                  type="text"
                  value={local.greetingPhrase || ""}
                  onChange={e => setLocal({ ...local, greetingPhrase: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm text-white focus:outline-none transition-all font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                  placeholder="Hey {name}!"
                  onFocus={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.5)")}
                  onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")}
                />
                <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                  Use <code className="text-violet-300 font-mono">{`{name}`}</code> to dynamically insert your name. E.g. "Hello {`{name}`}!"
                </p>
              </div>



              {/* Wake word info */}
              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl"
                style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.15)" }}>
                <Mic size={13} className="text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    <span className="text-indigo-300 font-semibold">Wake word detection</span> runs in the background using
                    the Web Speech API. When the wake word is detected, Nova connects to Gemini Live. Say{" "}
                    <span className="text-white font-mono">"goodbye"</span> or{" "}
                    <span className="text-white font-mono">"bye"</span> to end a session.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ════ VOICE TAB ══════════════════════════════════════════════ */}
          {tab === "voice" && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500">Select Nova's voice. Changes take effect on the next session.</p>
              {VOICE_OPTIONS.map(v => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setLocal({ ...local, voiceName: v.id })}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl cursor-pointer transition-all duration-150 text-left ${
                    local.voiceName === v.id ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                  style={local.voiceName === v.id ? {
                    background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(99,102,241,0.1))",
                    border: "1px solid rgba(139,92,246,0.35)",
                  } : {
                    background: "rgba(255,255,255,0.025)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center gap-3.5">
                    <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-xl transition-all ${
                      local.voiceName === v.id ? "bg-violet-500/20" : "bg-white/5"
                    }`}>
                      {v.emoji}
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${local.voiceName === v.id ? "text-violet-200" : "text-slate-300"}`}>
                        {v.label}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{v.desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {local.voiceName === v.id && (
                      <span className="text-[10px] bg-violet-500/25 text-violet-300 px-2 py-0.5 rounded-full font-semibold">Active</span>
                    )}
                    <ChevronRight size={14} className={local.voiceName === v.id ? "text-violet-400" : "text-slate-700"} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ════ MODES TAB ══════════════════════════════════════════════ */}
          {tab === "modes" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500">Select Nova's operating mode. Each mode shapes tone and capabilities.</p>
                <button
                  onClick={addCustomMode}
                  className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-200 font-semibold transition-colors shrink-0 ml-3"
                >
                  <Plus size={12} /> Custom
                </button>
              </div>

              <div className="space-y-2">
                {local.modes.map(mode => {
                  const isActive         = local.activeModeId === mode.id;
                  const isUnrestricted   = mode.id === "unrestricted";
                  return (
                    <div
                      key={mode.id}
                      onClick={() => setLocal({ ...local, activeModeId: mode.id })}
                      className="p-4 rounded-2xl cursor-pointer transition-all duration-150"
                      style={isActive ? {
                        background: isUnrestricted ? "rgba(239,68,68,0.08)"  : "rgba(139,92,246,0.1)",
                        border:     isUnrestricted ? "1px solid rgba(239,68,68,0.3)" : "1px solid rgba(139,92,246,0.35)",
                      } : {
                        background: "rgba(255,255,255,0.025)",
                        border: "1px solid rgba(255,255,255,0.07)",
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{mode.emoji || "🤖"}</span>
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
                                isActive ? (isUnrestricted ? "text-red-300" : "text-violet-200") : "text-slate-300"
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
                            className="text-red-400/40 hover:text-red-400 transition-colors p-1 rounded-lg hover:bg-red-500/10"
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
                            className="w-full text-[11px] text-slate-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/40"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                            placeholder="Short description…"
                          />
                          <textarea
                            value={mode.instruction}
                            onChange={e => {
                              const newModes = local.modes.map(m => m.id === mode.id ? { ...m, instruction: e.target.value } : m);
                              setLocal({ ...local, modes: newModes });
                            }}
                            rows={4}
                            className="w-full text-[11px] text-slate-400 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500/40 resize-none leading-relaxed"
                            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}
                            placeholder="Describe how Nova should behave…"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ════ INTEGRATIONS TAB ══════════════════════════════════════ */}
          {tab === "integrations" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-white">App Integrations</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Connect third-party tools and applications to expand Nova's capabilities.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {integrationHubCards.map((card) => (
                  <div
                    key={card.id}
                    className="p-4 rounded-2xl space-y-3"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-white">{card.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">{card.description}</p>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          card.active ? "text-emerald-300 bg-emerald-500/15" : "text-slate-400 bg-white/5"
                        }`}
                      >
                        {card.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={card.onAction}
                      className="w-full px-3 py-2 rounded-xl text-[11px] font-semibold text-violet-200"
                      style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}
                    >
                      {card.actionLabel}
                    </button>
                  </div>
                ))}
              </div>

              {/* GoDo Integration */}
              <div
                className="p-4 rounded-2xl space-y-3"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)"
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                      style={{
                        background: local.integrations?.godoEnabled
                          ? "rgba(139,92,246,0.15)"
                          : "rgba(255,255,255,0.03)",
                        border: local.integrations?.godoEnabled
                          ? "1px solid rgba(139,92,246,0.3)"
                          : "1px solid rgba(255,255,255,0.06)",
                        color: local.integrations?.godoEnabled ? "#a78bfa" : "#64748b"
                      }}
                    >
                      GD
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">GoDo Task Manager</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Manage local tasks and TODO lists via the GoDo CLI.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                      setLocal({
                        ...local,
                        integrations: {
                          ...integrations,
                          godoEnabled: !integrations.godoEnabled
                        }
                      });
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      local.integrations?.godoEnabled ? "bg-violet-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        local.integrations?.godoEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Obsidian Integration */}
              <div
                className="p-4 rounded-2xl space-y-4"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)"
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                      style={{
                        background: local.integrations?.obsidianEnabled
                          ? "rgba(139,92,246,0.15)"
                          : "rgba(255,255,255,0.03)",
                        border: local.integrations?.obsidianEnabled
                          ? "1px solid rgba(139,92,246,0.3)"
                          : "1px solid rgba(255,255,255,0.06)",
                        color: local.integrations?.obsidianEnabled ? "#a78bfa" : "#64748b"
                      }}
                    >
                      OB
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Obsidian Notes Vault</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Read, write, search, and update Obsidian vault markdown files.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                      setLocal({
                        ...local,
                        integrations: {
                          ...integrations,
                          obsidianEnabled: !integrations.obsidianEnabled
                        }
                      });
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      local.integrations?.obsidianEnabled ? "bg-violet-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        local.integrations?.obsidianEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {local.integrations?.obsidianEnabled && (
                  <div className="space-y-1.5 pt-2 border-t border-white/5 animate-slide-up">
                    <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Obsidian Vault Path</label>
                    <input
                      type="text"
                      value={local.integrations?.obsidianPath || ""}
                      onChange={e => {
                        const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                        setLocal({
                          ...local,
                          integrations: {
                            ...integrations,
                            obsidianPath: e.target.value
                          }
                        });
                      }}
                      className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                      placeholder="/home/username/Documents/ObsidianVault"
                      onFocus={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.5)")}
                      onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")}
                    />
                    <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                      Absolute directory path to your active Obsidian Vault directory.
                    </p>
                  </div>
                )}
              </div>

              {/* Custom Coding Agent Integration */}
              <div
                className="p-4 rounded-2xl space-y-4"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)"
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
                      style={{
                        background: local.integrations?.customAgentEnabled
                          ? "rgba(139,92,246,0.15)"
                          : "rgba(255,255,255,0.03)",
                        border: local.integrations?.customAgentEnabled
                          ? "1px solid rgba(139,92,246,0.3)"
                          : "1px solid rgba(255,255,255,0.06)",
                        color: local.integrations?.customAgentEnabled ? "#a78bfa" : "#64748b"
                      }}
                    >
                      NV
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">Custom Coding Agent</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Heavy coding/tasks via NVIDIA NIM, OpenRouter, or GroqCloud.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                      setLocal({
                        ...local,
                        integrations: {
                          ...integrations,
                          customAgentEnabled: !integrations.customAgentEnabled
                        }
                      });
                    }}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      local.integrations?.customAgentEnabled ? "bg-violet-600" : "bg-slate-700"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        local.integrations?.customAgentEnabled ? "translate-x-4" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {local.integrations?.customAgentEnabled && (
                  <div className="space-y-3 pt-2 border-t border-white/5 animate-slide-up">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Coding Provider</label>
                      <select
                        value={local.integrations?.codingProvider || "nim"}
                        onChange={e => {
                          const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                          setLocal({
                            ...local,
                            integrations: {
                              ...integrations,
                              codingProvider: e.target.value as "nim" | "openrouter" | "groq"
                            }
                          });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all bg-slate-900 border border-white/10"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                      >
                        <option value="nim" className="bg-slate-900 text-white">NVIDIA NIM (Recommended for coding)</option>
                        <option value="openrouter" className="bg-slate-900 text-white">OpenRouter</option>
                        <option value="groq" className="bg-slate-900 text-white">GroqCloud</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                        {local.integrations?.codingProvider === "openrouter"
                          ? "OpenRouter API Key"
                          : local.integrations?.codingProvider === "groq"
                            ? "Groq API Key"
                            : "NVIDIA API Key"}
                      </label>
                      <input
                        type="password"
                        value={
                          local.integrations?.codingProvider === "openrouter"
                            ? (local.integrations?.openrouterApiKey || "")
                            : local.integrations?.codingProvider === "groq"
                              ? (local.integrations?.groqApiKey || "")
                              : (local.integrations?.nvidiaApiKey || "")
                        }
                        onChange={e => {
                          const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                          const codingProvider = integrations.codingProvider || "nim";
                          setLocal({
                            ...local,
                            integrations: {
                              ...integrations,
                              ...(codingProvider === "openrouter"
                                ? { openrouterApiKey: e.target.value }
                                : codingProvider === "groq"
                                  ? { groqApiKey: e.target.value }
                                  : { nvidiaApiKey: e.target.value })
                            }
                          });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono animate-slide-up"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                        placeholder={
                          local.integrations?.codingProvider === "openrouter"
                            ? "sk-or-..."
                            : local.integrations?.codingProvider === "groq"
                              ? "gsk_..."
                              : "nvapi-..."
                        }
                        onFocus={e => (e.currentTarget.style.border = "1px solid rgba(139,92,246,0.5)")}
                        onBlur={e => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.09)")}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Coding Model</label>
                      <select
                        value={local.integrations?.nvidiaModel || "auto"}
                        onChange={e => {
                          const integrations = local.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", customAgentEnabled: false, codingProvider: "nim", nvidiaApiKey: "", nvidiaModel: "auto", openrouterApiKey: "", groqApiKey: "" };
                          setLocal({
                            ...local,
                            integrations: {
                              ...integrations,
                              nvidiaModel: e.target.value
                            }
                          });
                        }}
                        className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all bg-slate-900 border border-white/10"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                      >
                        <option value="auto" className="bg-slate-900 text-white">Auto-Select Model (Recommended)</option>
                        <option value="llama-3.1-8b-instant" className="bg-slate-900 text-white">Groq: Llama 3.1 8B Instant</option>
                        <option value="llama-3.3-70b-versatile" className="bg-slate-900 text-white">Groq: Llama 3.3 70B Versatile</option>
                        <option value="openai/gpt-oss-20b" className="bg-slate-900 text-white">Groq: GPT-OSS 20B</option>
                        <option value="qwen/qwen3-32b" className="bg-slate-900 text-white">Groq: Qwen3 32B</option>
                        <option value="openrouter/free" className="bg-slate-900 text-white">OpenRouter: Auto Free Router</option>
                        <option value="google/gemini-2.0-flash-exp:free" className="bg-slate-900 text-white">OpenRouter: Gemini 2.0 Flash (free)</option>
                        <option value="meta-llama/llama-3.3-70b-instruct:free" className="bg-slate-900 text-white">OpenRouter: Llama 3.3 70B (free)</option>
                        <option value="qwen/qwen3-coder:free" className="bg-slate-900 text-white">OpenRouter: Qwen3 Coder (free)</option>
                        <option value="deepseek/deepseek-r1:free" className="bg-slate-900 text-white">OpenRouter: DeepSeek R1 (free)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div
                className="p-4 rounded-2xl space-y-3"
                style={{
                  background: "rgba(255, 255, 255, 0.02)",
                  border: "1px solid rgba(255, 255, 255, 0.05)"
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white">Messaging Channels</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Configure Telegram, Discord, Slack, WhatsApp, Teams, Matrix, Signal, Viber, SMS, Email, and Webhooks from the Channels page.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTab("channels")}
                    className="px-3 py-2 rounded-xl text-[11px] font-semibold text-violet-200"
                    style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)" }}
                  >
                    Open Channels
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {["Telegram", "Discord", "Slack", "WhatsApp", "Teams", "Matrix", "Signal", "Viber", "SMS", "Email", "Web"].map((channel) => (
                    <span
                      key={channel}
                      className="px-2.5 py-1 rounded-full text-[10px] text-slate-300"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {channel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ════ CHANNELS TAB ═══════════════════════════════════════════ */}
          {tab === "channels" && (
            <div className="space-y-5">
              <div>
                <p className="text-sm font-semibold text-white">NanoClaw Channels</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Connect messaging platforms directly from the GUI. Tokens are written to .env and loaded on restart.
                </p>
              </div>

              {[
                {
                  id: "telegram",
                  label: "Telegram",
                  toggle: integrations.telegramEnabled,
                  toggleField: "telegramEnabled" as const,
                  tokenLabel: "Bot Token",
                  tokenValue: integrations.telegramBotToken || "",
                  tokenPlaceholder: "123456:ABC-DEF...",
                  webhookLabel: "Webhook URL",
                  webhookValue: integrations.telegramWebhookUrl || "",
                  webhookPlaceholder: "https://your-domain.com/webhooks/telegram",
                  tokenField: "telegramBotToken" as const,
                  webhookField: "telegramWebhookUrl" as const,
                },
                {
                  id: "discord",
                  label: "Discord",
                  toggle: integrations.discordEnabled,
                  toggleField: "discordEnabled" as const,
                  tokenLabel: "Bot Token",
                  tokenValue: integrations.discordBotToken || "",
                  tokenPlaceholder: "Bot token",
                  webhookLabel: "Webhook URL",
                  webhookValue: integrations.discordWebhookUrl || "",
                  webhookPlaceholder: "https://discord.com/api/webhooks/...",
                  tokenField: "discordBotToken" as const,
                  webhookField: "discordWebhookUrl" as const,
                },
                {
                  id: "slack",
                  label: "Slack",
                  toggle: integrations.slackEnabled,
                  toggleField: "slackEnabled" as const,
                  tokenLabel: "Bot Token",
                  tokenValue: integrations.slackBotToken || "",
                  tokenPlaceholder: "xoxb-...",
                  webhookLabel: "Webhook URL",
                  webhookValue: integrations.slackWebhookUrl || "",
                  webhookPlaceholder: "https://hooks.slack.com/services/...",
                  tokenField: "slackBotToken" as const,
                  webhookField: "slackWebhookUrl" as const,
                  extraLabel: "Verification Token",
                  extraValue: integrations.slackVerificationToken || "",
                  extraPlaceholder: "Slack signing secret / verification token",
                  extraField: "slackVerificationToken" as const,
                },
                {
                  id: "whatsapp",
                  label: "WhatsApp",
                  toggle: integrations.whatsappEnabled,
                  toggleField: "whatsappEnabled" as const,
                  tokenLabel: "Access Token",
                  tokenValue: integrations.whatsappAccessToken || "",
                  tokenPlaceholder: "EAAG...",
                  webhookLabel: "Webhook URL",
                  webhookValue: integrations.whatsappWebhookUrl || "",
                  webhookPlaceholder: "https://your-domain.com/webhooks/whatsapp",
                  tokenField: "whatsappAccessToken" as const,
                  webhookField: "whatsappWebhookUrl" as const,
                  extraLabel: "Phone Number ID",
                  extraValue: integrations.whatsappPhoneNumberId || "",
                  extraPlaceholder: "123456789012345",
                  extraField: "whatsappPhoneNumberId" as const,
                },
              ].map((channel) => (
                <div
                  key={channel.id}
                  className="p-4 rounded-2xl space-y-3"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold text-white">{channel.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Enable and configure from here.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateIntegrationField(channel.toggleField, !channel.toggle)}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        channel.toggle ? "bg-violet-600" : "bg-slate-700"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          channel.toggle ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>

                  <div className="grid gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{channel.tokenLabel}</label>
                      <input
                        type="password"
                        value={channel.tokenValue}
                        onChange={(e) => updateIntegrationField(channel.tokenField, e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                        placeholder={channel.tokenPlaceholder}
                      />
                    </div>

                    {"extraField" in channel && (
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{channel.extraLabel}</label>
                        <input
                          type="text"
                          value={channel.extraValue}
                          onChange={(e) => updateIntegrationField(channel.extraField, e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                          placeholder={channel.extraPlaceholder}
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">{channel.webhookLabel}</label>
                      <input
                        type="text"
                        value={channel.webhookValue}
                        onChange={(e) => updateIntegrationField(channel.webhookField, e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono"
                        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                        placeholder={channel.webhookPlaceholder}
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="p-4 rounded-2xl space-y-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <div>
                  <p className="text-xs font-bold text-white">Webhook Channels</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">For Teams, iMessage bridges, Matrix, Signal, Viber, SMS, Email, and Web endpoints.</p>
                </div>

                <div className="grid gap-3">
                  {webhookChannelList.map((entry) => {
                    const current = integrations.webhookChannels?.[entry.id] || { enabled: false, webhookUrl: "" };
                    return (
                      <div key={entry.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold text-white capitalize">{entry.label}</p>
                          <button
                            type="button"
                            onClick={() => updateWebhookChannel(entry.id, { enabled: !current.enabled })}
                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              current.enabled ? "bg-violet-600" : "bg-slate-700"
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                current.enabled ? "translate-x-4" : "translate-x-0"
                              }`}
                            />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={current.webhookUrl || ""}
                          onChange={(e) => updateWebhookChannel(entry.id, { webhookUrl: e.target.value })}
                          className="mt-2 w-full px-3.5 py-2 rounded-xl text-xs text-white focus:outline-none transition-all font-mono"
                          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
                          placeholder={`https://your-domain.com/webhooks/${entry.id}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ════ MEMORY TAB ═════════════════════════════════════════════ */}
          {tab === "memory" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Nova's Memory</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {local.memory.length} fact{local.memory.length !== 1 ? "s" : ""} — auto-extracted from conversations
                  </p>
                </div>
                {local.memory.length > 0 && (
                  <button
                    onClick={handleClearMemory}
                    className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors font-semibold"
                  >
                    <Trash size={11} /> Clear All
                  </button>
                )}
              </div>

              {local.memory.length === 0 ? (
                <div
                  className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <Brain className="w-10 h-10 text-slate-700" />
                  <div>
                    <p className="text-sm text-slate-500 font-semibold">No memories yet</p>
                    <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                      Nova automatically extracts important facts from your conversations.
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
                            className="flex items-start justify-between p-3 rounded-xl group"
                            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
                          >
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold shrink-0 mt-0.5 border ${CATEGORY_COLORS[m.category] || "text-slate-400"}`}>
                                {"★".repeat(m.importance)}
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed">{m.content}</p>
                            </div>
                            <button
                              onClick={() => setLocal({ ...local, memory: local.memory.filter(x => x.id !== m.id) })}
                              className="text-slate-700 hover:text-red-400 transition-colors ml-2 shrink-0 opacity-0 group-hover:opacity-100"
                            >
                              <Trash size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl"
                style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <Brain size={13} className="text-violet-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <span className="text-violet-300 font-semibold">How it works:</span> After each session, Nova uses
                  Gemini AI to extract meaningful facts — preferences, patterns, context. Raw outputs and small talk are
                  never saved. These are injected at session start so Nova always knows your context.
                </p>
              </div>
            </div>
          )}

          {/* ════ HISTORY TAB ═════════════════════════════════════════════ */}
          {tab === "history" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Conversation History</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {conversations.length} session{conversations.length !== 1 ? "s" : ""} saved locally
                  </p>
                </div>
                {conversations.length > 0 && (
                  <button
                    onClick={async () => {
                      await fetch("/api/conversations/clear", { method: "POST" });
                      setConversations([]);
                    }}
                    className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 transition-colors font-semibold"
                  >
                    <Trash size={11} /> Clear History
                  </button>
                )}
              </div>

              {conversations.length === 0 ? (
                <div
                  className="rounded-2xl p-10 flex flex-col items-center gap-4 text-center"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <Clock className="w-10 h-10 text-slate-700" />
                  <div>
                    <p className="text-sm text-slate-500 font-semibold">No history found</p>
                    <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                      Conversations will be logged here with date and time stamps as you use the assistant.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                  {conversations.map((session, sIdx) => {
                    const startDate = new Date(session.startTime);
                    const formattedDate = startDate.toLocaleDateString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    });
                    const formattedTime = startDate.toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit"
                    });

                    return (
                      <div
                        key={session.id}
                        className="p-4 rounded-2xl space-y-3"
                        style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
                      >
                        {/* Session Header */}
                        <div className="flex items-center justify-between border-b border-white/5 pb-2">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-violet-400/60" />
                            <p className="text-xs font-bold text-slate-300">
                              {formattedDate} at {formattedTime}
                            </p>
                          </div>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {session.messages.length} message{session.messages.length !== 1 ? "s" : ""}
                          </span>
                        </div>

                        {/* Session Messages Snippet */}
                        <div className="space-y-2">
                          {session.messages.map((msg: any, mIdx: number) => {
                            const isUser = msg.role.toLowerCase() !== "nova" && !msg.role.startsWith("Tool");
                            const isTool = msg.role.startsWith("Tool") || msg.role === "SEARCH" || msg.role === "FETCH" || msg.role === "CMD" || msg.role === "DELEGATE";
                            
                            let roleLabel = msg.role;
                            if (msg.role === "SEARCH") roleLabel = "Web Search";
                            else if (msg.role === "FETCH") roleLabel = "Page Reader";
                            else if (msg.role === "CMD") roleLabel = "Linux Command";
                            else if (msg.role === "DELEGATE") roleLabel = "Pro Model";

                            return (
                              <div key={mIdx} className="flex gap-2 items-start text-[11px] leading-relaxed">
                                <span
                                  className={`px-1.5 py-0.5 rounded font-bold uppercase text-[9px] tracking-wide shrink-0 ${
                                    isUser
                                      ? "bg-blue-500/10 text-blue-300 border border-blue-500/20"
                                      : isTool
                                      ? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
                                      : "bg-violet-500/10 text-violet-300 border border-violet-500/20"
                                  }`}
                                >
                                  {roleLabel}
                                </span>
                                <div className="text-slate-300 break-words flex-1">
                                  {msg.text}
                                </div>
                                <span className="text-[9px] text-slate-600 font-mono self-center shrink-0">
                                  {new Date(msg.timestamp).toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                    hour12: false
                                  })}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex items-start gap-2.5 p-3.5 rounded-2xl"
                style={{ background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.15)" }}>
                <Clock size={13} className="text-violet-400 mt-0.5 shrink-0" />
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  <span className="text-violet-300 font-semibold">Continuous Context:</span> Conversation sessions are
                  saved with precise date and time stamps in an inline JSON database. To help the assistant, the most
                  recent sessions are automatically summarized and injected into the system prompt of subsequent connections.
                </p>
              </div>
            </div>
          )}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <div className="px-5 py-4 border-t border-white/6 flex items-center justify-between shrink-0">
          <div className="text-xs text-red-400 font-semibold px-2 animate-slide-up max-w-[55%] truncate" title={saveError || ""}>
            {saveError}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white hover:bg-white/6 transition-all"
              style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center gap-2 transition-all disabled:opacity-50 min-w-[130px] justify-center"
              style={saved ? {
                background: "linear-gradient(135deg, rgba(52,211,153,0.3), rgba(16,185,129,0.2))",
                border: "1px solid rgba(52,211,153,0.4)",
              } : {
                background: "linear-gradient(135deg, rgba(139,92,246,0.65), rgba(99,102,241,0.55))",
                border: "1px solid rgba(139,92,246,0.45)",
                boxShadow: "0 4px 20px rgba(139,92,246,0.2)",
              }}
            >
              {saved ? (
                <><Check size={14} /> Saved!</>
              ) : saving ? (
                "Saving…"
              ) : (
                <><Save size={14} /> Save Changes</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
