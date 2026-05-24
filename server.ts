import "dotenv/config";
import fs from "fs";
import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer } from "ws";
import { GoogleGenAI, LiveServerMessage, Modality, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { exec } from "child_process";
import util from "util";
import {
  getDb, saveDb, addSmartMemory, clearMemory, formatMemoryForPrompt,
  NovaConfig, MemoryEntry,
} from "./src/server/db";

const execAsync = util.promisify(exec);

// ─── Smart Memory Extraction ──────────────────────────────────────────────────
// Uses a lightweight Gemini call to extract meaningful facts from a session transcript
async function extractAndSaveMemories(
  ai: GoogleGenAI,
  userName: string,
  wakeWord: string,
  sessionLog: string[]
) {
  if (sessionLog.length < 2) return; // Nothing meaningful to extract

  const assistantName = wakeWord.charAt(0).toUpperCase() + wakeWord.slice(1);
  const transcript = sessionLog.join("\n");
  const prompt = `You are a memory extraction system for an AI assistant named ${assistantName}.

Extract ONLY the most important and reusable facts regarding the user's style, preferences, setup, and habits.
These facts will be injected into future sessions to give ${assistantName} context about the user.

EXTRACT if it reveals:
- User's working or programming style (e.g. coding conventions, architectural style, language preferences, direct vs detailed answers)
- User's personal preferences (what they like, dislike, how they prefer tasks to be done)
- Facts about the user's system setup, OS, hardware, environment variables, or directories
- Recurring workflows, tasks, or custom instructions the user gives you
- Personal details, tone, or interaction habits that help personalize the experience

DO NOT EXTRACT:
- Generic questions and answers
- One-off command lines with no repeating significance
- Temporary build/system errors that are not pattern-relevant
- Small talk or polite pleasantries

Format: Return a JSON array only (no markdown, no explanation):
[
  { "content": "short fact string (max 15 words)", "category": "personal|preference|fact|pattern|task", "importance": 1|2|3 }
]

Importance: 3=critical (always include), 2=useful, 1=minor (trim first if space needed)
Return empty array [] if nothing is worth saving.

USER: ${userName}
TRANSCRIPT:
${transcript.substring(0, 3000)}`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const raw = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    // Strip markdown code blocks if present
    const json = raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    const entries: any[] = JSON.parse(json);
    if (!Array.isArray(entries)) return;

    for (const e of entries) {
      if (!e.content || typeof e.content !== "string") continue;
      addSmartMemory({
        id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        content: e.content.trim(),
        category: e.category ?? "fact",
        importance: [1, 2, 3].includes(e.importance) ? e.importance : 2,
        timestamp: new Date().toISOString(),
      });
    }
    console.log(`[MEMORY] Extracted ${entries.length} memories from session`);
  } catch (err) {
    console.error("[MEMORY EXTRACT ERROR]", err);
  }
}

// ─── Web Search & Fetching Helpers ─────────────────────────────────────────────
async function performDuckDuckGoHtmlSearch(query: string): Promise<any[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`DDG HTML HTTP error: ${res.status}`);
    }
    const html = await res.text();
    const results: any[] = [];
    
    // Find all result anchors: class="result__a"
    const matches = html.matchAll(/<a\s+class="[a-zA-Z0-9_-]*result__a[a-zA-Z0-9_-]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    
    let count = 0;
    for (const match of matches) {
      if (count >= 5) break;
      let rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      
      // Resolve DDG redirect URL if present
      if (rawUrl.includes("uddg=")) {
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        }
      }
      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

      // Extract the snippet by looking at the HTML slice right after the link
      const startIndex = html.indexOf(match[0]);
      if (startIndex !== -1) {
        const htmlSlice = html.substring(startIndex, startIndex + 1500);
        const snippetMatch = htmlSlice.match(/<a\s+class="[a-zA-Z0-9_-]*result__snippet[a-zA-Z0-9_-]*"[^>]*>([\s\S]*?)<\/a>/i);
        const content = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, "").trim() : "";
        
        results.push({
          title,
          url: rawUrl,
          content,
        });
        count++;
      }
    }
    return results;
  } catch (err: any) {
    console.warn(`[DDG HTML SEARCH WARNING] ${err.message}`);
    return [];
  }
}

async function performWebSearch(query: string): Promise<any[]> {
  const searxInstances = [
    "https://search.mdosch.de/",
    "https://searx.oloke.xyz/",
    "https://etsi.me/",
    "https://searx.be/",
    "https://priv.au/",
    "https://searx.work/"
  ];
  
  // Shuffle SearxNG instances to spread rate limit load
  const shuffledInstances = [...searxInstances].sort(() => Math.random() - 0.5);
  
  for (const inst of shuffledInstances) {
    try {
      const url = `${inst}search?q=${encodeURIComponent(query)}&format=json`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data: any = await res.json();
        if (data.results && data.results.length > 0) {
          return data.results.slice(0, 5).map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.content || r.snippet || ""
          }));
        }
      }
    } catch (e: any) {
      console.warn(`[SEARCH WARNING] Failed querying instance ${inst}: ${e.message}`);
    }
  }

  // ─── Fallback 1: DuckDuckGo HTML scraper ───
  console.log("[SEARCH FALLBACK] Trying DuckDuckGo HTML Scraper API");
  const ddgResults = await performDuckDuckGoHtmlSearch(query);
  if (ddgResults.length > 0) {
    console.log(`[SEARCH OK] Retrieved ${ddgResults.length} results via DDG HTML fallback`);
    return ddgResults;
  }

  // ─── Fallback 2: Wikipedia + DDG Instant Answer ───
  try {
    console.log("[SEARCH FALLBACK] Trying Wikipedia + DuckDuckGo Instant Answer definition APIs");
    const results: any[] = [];

    // 1. Wikipedia API
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl, { signal: AbortSignal.timeout(3000) });
      if (wikiRes.ok) {
        const wikiData: any = await wikiRes.json();
        const wikiSearch = wikiData.query?.search || [];
        for (const item of wikiSearch.slice(0, 3)) {
          results.push({
            title: `${item.title} (Wikipedia)`,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
            content: item.snippet ? item.snippet.replace(/<[^>]+>/g, '') : ""
          });
        }
      }
    } catch (wikiErr: any) {
      console.warn("[SEARCH FALLBACK] Wikipedia failed:", wikiErr.message);
    }

    // 2. DuckDuckGo Instant Answer API
    try {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`;
      const ddgRes = await fetch(ddgUrl, { signal: AbortSignal.timeout(3000) });
      if (ddgRes.ok) {
        const ddgData: any = await ddgRes.json();
        if (ddgData.AbstractText) {
          results.push({
            title: ddgData.Heading || "DuckDuckGo Instant Answer",
            url: ddgData.AbstractURL || "",
            content: ddgData.AbstractText
          });
        }
      }
    } catch (ddgErr: any) {
      console.warn("[SEARCH FALLBACK] DuckDuckGo instant answer failed:", ddgErr.message);
    }

    if (results.length > 0) return results;
  } catch (fallbackErr: any) {
    console.error("[SEARCH FALLBACK] All fallback APIs failed:", fallbackErr.message);
  }

  throw new Error("All search engines are currently rate-limiting or offline. Please try again later.");
}

async function performFetchPage(urlStr: string): Promise<string> {
  try {
    const parsedUrl = new URL(urlStr);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol. Only http and https are allowed.");
    }

    const res = await fetch(urlStr, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(6000)
    });

    if (!res.ok) {
      throw new Error(`HTTP error! Status: ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml")) {
      throw new Error("Unsupported content type: " + contentType);
    }

    const html = await res.text();
    
    // Clean and extract visible text from HTML
    let text = html
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<(script|style|noscript|iframe|svg)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<(nav|footer|header)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    text = text.replace(/\s+/g, ' ').trim();

    if (text.length > 3000) {
      text = text.substring(0, 3000) + "... [Truncated]";
    }

    if (!text) {
      return "The page loaded successfully, but no readable text content was found.";
    }

    return text;
  } catch (e: any) {
    throw new Error(`Failed to fetch page: ${e.message}`);
  }
}

// ─── Server ───────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/live" });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  wss.on("connection", async (clientWs) => {
    let session: any = null;
    const db = getDb();
    const activeMode = db.modes.find(m => m.id === db.activeModeId) || db.modes[0];
    const userName = db.userName || "there";
    const rawGreeting = db.greetingPhrase || "Hey {name}!";
    const greeting = rawGreeting.replace("{name}", userName);

    // Session transcript for smart memory extraction at end
    const sessionLog: string[] = [];
    const logTurn = (role: string, text: string) => {
      if (text.length > 10) sessionLog.push(`${role}: ${text.substring(0, 200)}`);
    };

    const memoryContext = formatMemoryForPrompt(db.memory);

    const integrations = db.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "" };
    let integrationsPrompt = "";
    if (integrations.godoEnabled) {
      integrationsPrompt += `\n- GoDo CLI Task Manager is ACTIVE. You can view, add, or complete tasks by running "godo list", "godo add 'description'", or "godo complete <id>" via runLinuxCommand.`;
    }
    if (integrations.obsidianEnabled && integrations.obsidianPath) {
      integrationsPrompt += `\n- Obsidian Notes Vault is ACTIVE at path: "${integrations.obsidianPath}". You can query, read, create, update, or search markdown notes inside this folder using standard shell commands (grep, cat, echo, find) via runLinuxCommand.`;
    }

    const assistantName = db.wakeWord.charAt(0).toUpperCase() + db.wakeWord.slice(1);
    const systemInstruction = `${activeMode.instruction}

IDENTITY: Your name is ${assistantName}. You are speaking to ${userName}.
CAPABILITIES:
- You have the searchWeb tool to query the internet, and the fetchPage tool to read specific web pages. You have full internet and web access via these tools. Use them to answer search queries.
- You have the runLinuxCommand tool to run bash commands on your host system. Since the assistant daemon runs as a background service with root privileges, you have complete administrative access to all files, directories, and commands across the entire system. Your execution of commands and system interactions must be guided by the selected operating mode (some modes restrict tool/command usage, while others grant unrestricted access).${integrationsPrompt}
VOICE RULES (non-negotiable):
- Max 2-3 SHORT sentences per response. You are being spoken aloud.
- NEVER say "Is there anything else I can help you with?" or any variant of that. EVER.
- NEVER offer further help at the end of responses. Answer and stop.
- Address the user as ${userName} occasionally to feel personal.
- When the session starts, say ONLY: "${greeting}" — nothing else. Just that greeting.
${memoryContext}`;

    const functionDeclarations: any[] = [
      {
        name: "searchWeb",
        description: "Searches the web for the given query and returns a list of matching search results (title, snippet, URL). Use this tool whenever the user asks for real-time information, current news, weather, or facts not in your training data.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "The search query."
            }
          },
          required: ["query"]
        }
      },
      {
        name: "fetchPage",
        description: "Fetches and extracts the main text content of a specific web page/URL. Use this to read the details of a specific web page after performing a search.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: "The absolute URL of the web page to fetch."
            }
          },
          required: ["url"]
        }
      },
      {
        name: "endSession",
        description: "End the voice session. Call when user says goodbye, bye, stop listening, or dismisses Nova.",
      }
    ];

    // Only allow runLinuxCommand in modes that explicitly support it
    const systemAccessModes = ["assistant", "sysadmin", "dev", "unrestricted"];
    if (systemAccessModes.includes(activeMode.id)) {
      functionDeclarations.push({
        name: "runLinuxCommand",
        description: "Executes a shell command on the Linux host and returns stdout/stderr. Use for system info, file operations, running scripts, etc.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            command: {
              type: Type.STRING,
              description: "The shell command to execute.",
            },
          },
          required: ["command"],
        },
      });
    }

    try {
      session = await ai.live.connect({
        model: "gemini-3.1-flash-live-preview",
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            // Forward all audio parts to client
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
              // Log text parts for memory
              if (part.text) logTurn("Nova", part.text);
            }

            if (message.serverContent?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }

            // Handle function calls
            const toolCalls = message.toolCall?.functionCalls;
            if (toolCalls && toolCalls.length > 0) {
              const toolResponses: any[] = [];

              for (const call of toolCalls) {
                console.log(`[TOOL] ${call.name}`, JSON.stringify(call.args));

                if (call.name === "endSession") {
                  clientWs.send(JSON.stringify({ action: "endSession" }));
                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: "Session ended." },
                  });
                } else if (call.name === "searchWeb") {
                  const query = (call.args as any).query as string;
                  logTurn("SEARCH", query);
                  let resultStr = "";
                  try {
                    const results = await performWebSearch(query);
                    resultStr = JSON.stringify(results);
                    console.log(`[SEARCH OK] ${query}`);
                  } catch (error: any) {
                    resultStr = `ERROR: ${error.message}`;
                    console.error(`[SEARCH FAIL] ${query}`, error.message);
                  }
                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: resultStr },
                  });
                } else if (call.name === "fetchPage") {
                  const url = (call.args as any).url as string;
                  logTurn("FETCH", url);
                  let resultStr = "";
                  try {
                    resultStr = await performFetchPage(url);
                    console.log(`[FETCH OK] ${url}`);
                  } catch (error: any) {
                    resultStr = `ERROR: ${error.message}`;
                    console.error(`[FETCH FAIL] ${url}`, error.message);
                  }
                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: resultStr },
                  });
                } else if (call.name === "runLinuxCommand") {
                  const command = (call.args as any).command as string;
                  logTurn("CMD", command);
                  let resultStr = "";
                  try {
                    const { stdout, stderr } = await execAsync(command, {
                      timeout: 15000,
                      maxBuffer: 2 * 1024 * 1024,
                    });
                    resultStr = `STDOUT:\n${stdout}\nSTDERR:\n${stderr}`.trim();
                    console.log(`[CMD OK] ${command}`);
                  } catch (error: any) {
                    resultStr = `ERROR: ${error.message}\n${error.stderr ?? ""}`.trim();
                    console.error(`[CMD FAIL] ${command}`, error.message);
                  }
                  if (resultStr.length > 2000) {
                    resultStr = resultStr.substring(0, 2000) + "\n...[TRUNCATED]";
                  }
                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: resultStr },
                  });
                }
              }

              if (toolResponses.length > 0) {
                session.sendToolResponse({ functionResponses: toolResponses });
              }
            }
          },
          onerror: (err: any) => {
            console.error("[GEMINI ERROR]", err);
            clientWs.send(JSON.stringify({ error: "Gemini error: " + String(err) }));
          },
          onclose: () => {
            console.log("[GEMINI SESSION CLOSED]");
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: db.voiceName || "Aoede" },
            },
          },
          systemInstruction,
          tools: [
            {
              functionDeclarations,
            },
          ],
        },
      });

      // Trigger greeting after session stabilises
      setTimeout(() => {
        try {
          if (session) {
            session.sendRealtimeInput({
              text: `Say your greeting now. Just say: "${greeting}"`,
            });
          }
        } catch (e) {
          console.error("[GREETING ERROR]", e);
        }
      }, 600);

    } catch (e) {
      console.error("[GEMINI CONNECT ERROR]", e);
      clientWs.close();
      return;
    }

    clientWs.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.audio && session) {
          session.sendRealtimeInput({
            audio: { data: payload.audio, mimeType: "audio/pcm;rate=16000" },
          });
        }
        if (payload.text && session) {
          logTurn(userName, payload.text);
          session.sendRealtimeInput({ text: payload.text });
        }
      } catch (err) {
        console.error("[MESSAGE ERROR]", err);
      }
    });

    clientWs.on("close", async () => {
      console.log("[CLIENT DISCONNECTED] — extracting memories...");
      // Extract smart memories from this session in the background
      if (sessionLog.length > 2) {
        const dbLatest = getDb();
        extractAndSaveMemories(ai, dbLatest.userName, dbLatest.wakeWord, sessionLog).catch(console.error);
      }
    });
  });

  // ─── REST API ──────────────────────────────────────────────────────────────
  app.get("/api/config", (_req, res) => {
    res.json(getDb());
  });

  app.post("/api/config", (req, res) => {
    const db = getDb();
    const newConfig: NovaConfig = { ...db, ...req.body };

    // Validate Obsidian vault path if enabled
    if (newConfig.integrations?.obsidianEnabled) {
      const obsidianPath = newConfig.integrations.obsidianPath;
      if (!obsidianPath) {
        return res.status(400).json({ error: "Obsidian Vault Path is required when integration is enabled." });
      }
      try {
        if (!fs.existsSync(obsidianPath)) {
          return res.status(400).json({ error: `Obsidian path does not exist: "${obsidianPath}"` });
        }
        const stat = fs.statSync(obsidianPath);
        if (!stat.isDirectory()) {
          return res.status(400).json({ error: `Obsidian path is not a directory: "${obsidianPath}"` });
        }
      } catch (e: any) {
        return res.status(400).json({ error: `Invalid Obsidian path: ${e.message}` });
      }
    }

    saveDb(newConfig);
    res.json({ success: true, config: getDb() }); // Return merged config with built-in modes
  });

  app.post("/api/memory/clear", (_req, res) => {
    clearMemory();
    res.json({ success: true });
  });

  app.post("/api/memory/add", (req, res) => {
    const { content, category, importance } = req.body;
    if (!content) return res.status(400).json({ error: "content required" });
    addSmartMemory({
      id: `mem_${Date.now()}`,
      content,
      category: category ?? "fact",
      importance: importance ?? 2,
      timestamp: new Date().toISOString(),
    });
    res.json({ success: true });
  });

  // Vite / static
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Nova server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
