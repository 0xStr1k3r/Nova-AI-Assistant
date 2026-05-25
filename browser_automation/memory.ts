import * as fs from "fs";

const MEMORY_PATH = "/home/chiru/.config/nova-voice-assistant/browser_memory.json";

type BookmarkEntry = {
  title: string;
  url: string;
  createdAt: string;
};

type BrowserMemory = {
  bookmarks: BookmarkEntry[];
  preferences: Record<string, string>;
};

function loadMemory(): BrowserMemory {
  if (!fs.existsSync(MEMORY_PATH)) {
    return { bookmarks: [], preferences: {} };
  }
  try {
    const raw = fs.readFileSync(MEMORY_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { bookmarks: [], preferences: {} };
  }
}

function saveMemory(mem: BrowserMemory) {
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(mem, null, 2));
}

export function addBookmark(title: string, url: string): string {
  const mem = loadMemory();
  const existing = mem.bookmarks.find((b) => b.url === url);
  if (existing) {
    return `Bookmark already exists for ${url}.`;
  }
  mem.bookmarks.push({ title, url, createdAt: new Date().toISOString() });
  saveMemory(mem);
  return `Bookmarked: ${title} (${url})`;
}

export function listBookmarks(): string {
  const mem = loadMemory();
  if (mem.bookmarks.length === 0) {
    return "No bookmarks saved yet.";
  }
  const formatted = mem.bookmarks
    .map((b, i) => `[${i + 1}] ${b.title} -> ${b.url}`)
    .join("\n");
  return `Bookmarks:\n${formatted}`;
}

export function removeBookmark(identifier: string): string {
  const mem = loadMemory();
  const next = mem.bookmarks.filter(
    (b) => b.url !== identifier && b.title.toLowerCase() !== identifier.toLowerCase()
  );
  if (next.length === mem.bookmarks.length) {
    return `No bookmark found for "${identifier}".`;
  }
  mem.bookmarks = next;
  saveMemory(mem);
  return `Removed bookmark: ${identifier}`;
}

export function setPreference(key: string, value: string): string {
  const mem = loadMemory();
  mem.preferences[key] = value;
  saveMemory(mem);
  return `Saved preference "${key}".`;
}

export function getPreference(key: string): string {
  const mem = loadMemory();
  return mem.preferences[key] ?? "Preference not found.";
}
