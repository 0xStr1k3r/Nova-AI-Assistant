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

export interface NovaConfig {
  wakeWord: string;
  userName: string;
  activeModeId: string;
  modes: Mode[];
  memory: MemoryEntry[];
  voiceName: string;
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
- You can run safe read-only Linux commands (ls, top, free, df, uname, ps, date) using runLinuxCommand.
- NEVER run write, delete, or system-modifying commands in this mode.`,
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
  wakeWord: "nova",
  userName: "Chiru",
  activeModeId: "assistant",
  modes: DEFAULT_MODES,
  memory: [],
  voiceName: "Aoede",
};

// ─── DB Operations ────────────────────────────────────────────────────────────
export function getDb(): NovaConfig {
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, "utf-8");
      const saved = JSON.parse(raw) as Partial<NovaConfig>;

      // Merge: keep saved settings, but always inject latest default modes
      // (so new modes in updates are always available)
      const builtInModes = DEFAULT_MODES;
      const customModes = (saved.modes || []).filter(m => m.isCustom);
      return {
        ...defaultConfig,
        ...saved,
        modes: [...builtInModes, ...customModes],
      };
    } catch (e) {
      console.error("Error reading nova db:", e);
      return defaultConfig;
    }
  }
  return defaultConfig;
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
