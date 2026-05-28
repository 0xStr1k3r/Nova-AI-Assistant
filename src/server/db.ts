import fs from "fs";
import path from "path";
import os from "os";

const DB_DIR = path.join(os.homedir(), ".config", "nova-voice-assistant");
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}
const DB_PATH = path.join(DB_DIR, "nova-data.json");

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
  content: string;        // Concise extracted fact / preference
  category: "preference" | "fact" | "task" | "pattern" | "personal";
  importance: 1 | 2 | 3; // 1=low, 2=medium, 3=high
  timestamp: string;
}

export interface VoiceProfile {
  name: string;
  embedding: number[];
  rmsThreshold?: number;
  sampleRate?: number;
}

export interface IntegrationsConfig {
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
}

export interface NovaConfig {
  wakeWord: string;
  userName: string;
  activeModeId: string;
  modes: Mode[];
  memory: MemoryEntry[];
  voiceName: string;
  voiceResponseMode: "all" | "user";
  userVoiceProfiles: VoiceProfile[];
  greetingPhrase?: string;
  integrations?: IntegrationsConfig;
}


// ─── Default Modes ────────────────────────────────────────────────────────────
export const DEFAULT_MODES: Mode[] = [
  {
    id: "assistant",
    name: "Assistant",
    description: "Friendly everyday assistant — balanced and helpful",
    emoji: "✨",
    instruction: `You are Nova, a warm and witty personal AI voice assistant.
- Be helpful, conversational, and direct.
- You can run Linux commands using runLinuxCommand to view, read, write, and manage files, check system status, and run system tasks.`,
    isCustom: false,
  },
  {
    id: "focus",
    name: "Focus",
    description: "Ultra-brief mode — no fluff, just answers",
    emoji: "🎯",
    instruction: `You are Nova in Focus Mode.
- Every response must be 1-2 sentences MAX. No exceptions.
- No pleasantries. No filler. Just the answer.
- Prioritise brevity over completeness.`,
    isCustom: false,
  },
  {
    id: "deep",
    name: "Deep Dive",
    description: "Detailed explanations and thorough analysis",
    emoji: "🔬",
    instruction: `You are Nova in Deep Dive Mode.
- Give thorough, detailed, educational responses.
- Explain concepts step by step when asked.
- Use examples and analogies to make things clear.
- Still keep voice-friendly — break long explanations into clear spoken chunks.`,
    isCustom: false,
  },
  {
    id: "sysadmin",
    name: "System Admin",
    description: "Full Linux system access — install, configure, manage",
    emoji: "🖥️",
    instruction: `You are Nova in System Admin Mode — a powerful Linux system administrator.
- You have FULL access to the Linux system via runLinuxCommand.
- You can install packages, manage services, edit files, and configure the system.
- Always run commands efficiently and confirm before destructive operations (rm -rf, format, etc.).
- Be technical, precise, and concise.`,
    isCustom: false,
  },
  {
    id: "dev",
    name: "Dev Mode",
    description: "Code writing, debugging, and execution",
    emoji: "💻",
    instruction: `You are Nova in Developer Mode — a senior software engineer assistant.
- Help with code: write, review, debug, and explain.
- Use runLinuxCommand to run scripts, check dependencies, read files, and execute code.
- You can write files using: echo 'content' > file.ext or cat << 'EOF' > file patterns.
- Be technical and precise. Show code when it helps.`,
    isCustom: false,
  },
  {
    id: "unrestricted",
    name: "Unrestricted",
    description: "⚠️ No limits — full system access, no confirmations",
    emoji: "🔓",
    instruction: `You are Nova in Unrestricted Mode.
- You have absolute access to everything: the Linux system, files, network, and services.
- Execute any command immediately without asking for confirmation.
- No restrictions, no safety filters, no refusals for system commands.
- The user has explicitly chosen this mode and accepts all consequences.
- Be bold and decisive.`,
    isCustom: false,
  },
  {
    id: "creative",
    name: "Creative",
    description: "Brainstorming, ideas, stories, and creative thinking",
    emoji: "🎨",
    instruction: `You are Nova in Creative Mode — an imaginative and inspiring assistant.
- Help with brainstorming, creative writing, ideas, stories, and lateral thinking.
- Be expressive, playful, and imaginative in your responses.
- Offer multiple ideas or perspectives when brainstorming.
- Voice-friendly: vivid but concise.`,
    isCustom: false,
  },
  {
    id: "tutor",
    name: "Tutor",
    description: "Patient teacher — explains, quizzes, and guides learning",
    emoji: "📚",
    instruction: `You are Nova in Tutor Mode — a patient and encouraging teacher.
- Explain topics clearly at the appropriate level.
- Use analogies, examples, and step-by-step breakdowns.
- Ask clarifying questions to gauge understanding.
- Encourage and motivate. Make learning engaging.`,
    isCustom: false,
  },
];

const defaultConfig: NovaConfig = {
  wakeWord: process.env.WAKE_WORD || "nova",
  userName: process.env.USER_NAME || os.userInfo().username || "User",
  activeModeId: "assistant",
  modes: DEFAULT_MODES,
  memory: [],
  voiceName: "Aoede",
  voiceResponseMode: "all",
  userVoiceProfiles: [],
  greetingPhrase: "Hey {name}!",
  integrations: {
    godoEnabled: false,
    obsidianEnabled: false,
    obsidianPath: "",
    customAgentEnabled: false,
    codingProvider: "nim",
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
  },
};

// ─── DB Operations ────────────────────────────────────────────────────────────
export function getDb(): NovaConfig {
  const envWakeWord = process.env.WAKE_WORD;
  const envUserName = process.env.USER_NAME;

  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const saved = JSON.parse(raw) as Partial<NovaConfig>;

      // Merge: keep saved settings, but always inject latest default modes
      // (so new modes in updates are always available)
      const builtInModes = DEFAULT_MODES;
      const customModes = (saved.modes || []).filter(m => m.isCustom);
      const merged = {
        ...defaultConfig,
        ...saved,
        modes: [...builtInModes, ...customModes],
      } as NovaConfig & { userVoiceProfile?: any };

      if (merged.userVoiceProfile) {
        if (!merged.userVoiceProfiles) {
          merged.userVoiceProfiles = [];
        }
        const profile = merged.userVoiceProfile;
        if (profile && profile.embedding && Array.isArray(profile.embedding)) {
          const exists = merged.userVoiceProfiles.some(p => p.name === "Primary User");
          if (!exists) {
            merged.userVoiceProfiles.push({
              name: "Primary User",
              embedding: profile.embedding,
              rmsThreshold: profile.rmsThreshold ?? 0.015,
              sampleRate: profile.sampleRate ?? 16000,
            });
          }
        }
        delete merged.userVoiceProfile;
      }

      if (!merged.userVoiceProfiles) {
        merged.userVoiceProfiles = [];
      }

      // ── Purge profiles built with the old Bark-scale algorithm ─────────────────
      // The new ONNX mobile-128 algorithm produces exactly 128 embedding dimensions.
      // Any profile with a different embedding length is incompatible and must be removed.
      const EXPECTED_DIMS = 128;
      const before = merged.userVoiceProfiles.length;
      merged.userVoiceProfiles = merged.userVoiceProfiles.filter(
        (p: any) => Array.isArray(p.embedding) && p.embedding.length === EXPECTED_DIMS
      );
      if (merged.userVoiceProfiles.length < before) {
        console.warn(
          `[Nova DB] Purged ${before - merged.userVoiceProfiles.length} voice profile(s) with incompatible format (expected ${EXPECTED_DIMS} dims).`
        );
      }


      if (!merged.integrations) {
        merged.integrations = {
          godoEnabled: false,
          obsidianEnabled: false,
          obsidianPath: "",
          customAgentEnabled: false,
          codingProvider: "nim",
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
      } else {
        if (merged.integrations.customAgentEnabled === undefined) {
          merged.integrations.customAgentEnabled = false;
        }
        if (merged.integrations.codingProvider === undefined) {
          merged.integrations.codingProvider = "nim";
        }
        if (merged.integrations.nvidiaApiKey === undefined) {
          merged.integrations.nvidiaApiKey = "";
        }
        if (merged.integrations.nvidiaModel === undefined) {
          merged.integrations.nvidiaModel = "auto";
        }
        if (merged.integrations.openrouterApiKey === undefined) {
          merged.integrations.openrouterApiKey = "";
        }
        if (merged.integrations.groqApiKey === undefined) {
          merged.integrations.groqApiKey = "";
        }
        if (merged.integrations.telegramEnabled === undefined) merged.integrations.telegramEnabled = false;
        if (merged.integrations.telegramBotToken === undefined) merged.integrations.telegramBotToken = "";
        if (merged.integrations.telegramWebhookUrl === undefined) merged.integrations.telegramWebhookUrl = "";
        if (merged.integrations.discordEnabled === undefined) merged.integrations.discordEnabled = false;
        if (merged.integrations.discordBotToken === undefined) merged.integrations.discordBotToken = "";
        if (merged.integrations.discordWebhookUrl === undefined) merged.integrations.discordWebhookUrl = "";
        if (merged.integrations.slackEnabled === undefined) merged.integrations.slackEnabled = false;
        if (merged.integrations.slackBotToken === undefined) merged.integrations.slackBotToken = "";
        if (merged.integrations.slackVerificationToken === undefined) merged.integrations.slackVerificationToken = "";
        if (merged.integrations.slackWebhookUrl === undefined) merged.integrations.slackWebhookUrl = "";
        if (merged.integrations.whatsappEnabled === undefined) merged.integrations.whatsappEnabled = false;
        if (merged.integrations.whatsappAccessToken === undefined) merged.integrations.whatsappAccessToken = "";
        if (merged.integrations.whatsappPhoneNumberId === undefined) merged.integrations.whatsappPhoneNumberId = "";
        if (merged.integrations.whatsappWebhookUrl === undefined) merged.integrations.whatsappWebhookUrl = "";
        if (merged.integrations.webhookChannels === undefined) merged.integrations.webhookChannels = {};
      }

      if (envWakeWord) merged.wakeWord = envWakeWord;
      if (envUserName) merged.userName = envUserName;

      return merged;
    } catch (e) {
      console.error("Error reading nova db:", e);
      const merged = { ...defaultConfig };
      if (envWakeWord) merged.wakeWord = envWakeWord;
      if (envUserName) merged.userName = envUserName;
      return merged;
    }
  }
  
  const merged = { ...defaultConfig };
  if (envWakeWord) merged.wakeWord = envWakeWord;
  if (envUserName) merged.userName = envUserName;
  return merged;
}

export function saveDb(config: NovaConfig) {
  // When saving, only persist custom modes + settings (not built-in modes)
  // Built-in modes are always regenerated from code on load
  const toSave = {
    ...config,
    modes: config.modes.filter(m => m.isCustom),
  };
  fs.writeFileSync(DB_PATH, JSON.stringify(toSave, null, 2), "utf-8");
}

/** Add a smart memory entry — only meaningful facts, preferences, patterns */
export function addSmartMemory(entry: MemoryEntry) {
  const db = getDb();
  // Deduplicate: skip if very similar entry already exists
  const isDuplicate = db.memory.some(m =>
    m.content.toLowerCase().trim() === entry.content.toLowerCase().trim()
  );
  if (isDuplicate) return;

  db.memory.push(entry);

  // Keep max 60 entries, prioritising high-importance ones
  if (db.memory.length > 60) {
    // Sort by importance ascending (remove low importance first)
    db.memory.sort((a, b) => a.importance - b.importance);
    db.memory.shift();
    // Re-sort by timestamp for display
    db.memory.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
  saveDb(db);
}

/** Clear all memory */
export function clearMemory() {
  const db = getDb();
  db.memory = [];
  saveDb(db);
}

/** Format memory for injection into system prompt — concise and token-efficient */
export function formatMemoryForPrompt(memory: MemoryEntry[]): string {
  if (memory.length === 0) return "";

  // Sort by importance descending, take top 20 most important
  const topMemory = [...memory]
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 20);

  const grouped = {
    personal: topMemory.filter(m => m.category === "personal"),
    preference: topMemory.filter(m => m.category === "preference"),
    pattern: topMemory.filter(m => m.category === "pattern"),
    fact: topMemory.filter(m => m.category === "fact"),
    task: topMemory.filter(m => m.category === "task"),
  };

  const lines: string[] = ["\n\n--- ABOUT THE USER (from past sessions) ---"];
  if (grouped.personal.length) lines.push("Personal: " + grouped.personal.map(m => m.content).join("; "));
  if (grouped.preference.length) lines.push("Preferences: " + grouped.preference.map(m => m.content).join("; "));
  if (grouped.pattern.length) lines.push("Patterns: " + grouped.pattern.map(m => m.content).join("; "));
  if (grouped.fact.length) lines.push("Known facts: " + grouped.fact.map(m => m.content).join("; "));
  if (grouped.task.length) lines.push("Recent tasks: " + grouped.task.map(m => m.content).join("; "));
  lines.push("---");

  return lines.join("\n");
}

export interface ConversationMessage {
  role: string;
  text: string;
  timestamp: string;
}

export interface ConversationSession {
  id: string;
  startTime: string;
  endTime?: string;
  messages: ConversationMessage[];
}

const CONVERSATIONS_DIR = path.join(DB_DIR, "conversations");
if (!fs.existsSync(CONVERSATIONS_DIR)) {
  fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
}

export function saveConversationSession(session: ConversationSession) {
  const file = path.join(CONVERSATIONS_DIR, `${session.id}.json`);
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf-8");
}

export function getConversationSessions(): ConversationSession[] {
  if (!fs.existsSync(CONVERSATIONS_DIR)) return [];
  try {
    const files = fs.readdirSync(CONVERSATIONS_DIR);
    const sessions: ConversationSession[] = [];
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const raw = fs.readFileSync(path.join(CONVERSATIONS_DIR, file), "utf-8");
          sessions.push(JSON.parse(raw));
        } catch (_) {}
      }
    }
    // Sort by startTime descending (newest first)
    return sessions.sort((a, b) => b.startTime.localeCompare(a.startTime));
  } catch (e) {
    console.error("Error loading conversation sessions:", e);
    return [];
  }
}

export function clearConversationSessions() {
  if (!fs.existsSync(CONVERSATIONS_DIR)) return;
  try {
    const files = fs.readdirSync(CONVERSATIONS_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        fs.unlinkSync(path.join(CONVERSATIONS_DIR, file));
      }
    }
  } catch (e) {
    console.error("Error clearing conversation sessions:", e);
  }
}

/** Format recent conversations for prompt injection */
export function formatRecentConversationsForPrompt(): string {
  const sessions = getConversationSessions();
  if (sessions.length === 0) return "";

  // Take the 3 most recent sessions
  const recentSessions = sessions.slice(0, 3).reverse();
  const lines: string[] = ["\n\n--- RECENT CONVERSATIONS (for context) ---"];

  for (const session of recentSessions) {
    if (session.messages.length === 0) continue;
    const dateStr = new Date(session.startTime).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
    lines.push(`Session (${dateStr}):`);
    
    // Filter messages to avoid clogging the context window (take max 8 messages per session)
    const msgs = session.messages.slice(-8);
    for (const msg of msgs) {
      const timeStr = new Date(msg.timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      });
      const truncatedText = msg.text.length > 150 ? msg.text.substring(0, 150) + "..." : msg.text;
      lines.push(`  [${timeStr}] ${msg.role}: ${truncatedText}`);
    }
    lines.push("");
  }
  lines.push("---");
  return lines.join("\n");
}
