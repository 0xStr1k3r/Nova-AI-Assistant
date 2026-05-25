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
  ConversationMessage, ConversationSession, saveConversationSession,
  getConversationSessions, clearConversationSessions, formatRecentConversationsForPrompt,
} from "./src/server/db";

const execAsync = util.promisify(exec);

// Background agent execution state
let activeAgentProcess: any = null;
let activeAgentName = "";
let activeAgentPrompt = "";
let activeAgentStartTime = 0;
const STATUS_LOG_PATH = "/home/chiru/.config/nova-voice-assistant/coding_agent_status.log";

// ─── Model Constants (optimized for free-tier rate limits) ────────────────────
// Live API voice session: Only model supporting bidirectional audio streaming
const MODEL_LIVE    = "gemini-3.1-flash-live-preview";
// Memory extraction & utility tasks: Best free-tier limits (15 RPM, 350K TPM, 500 RPD)
const MODEL_MEMORY  = "gemini-2.0-flash";
const MODEL_UTILITY = "gemini-2.0-flash";

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
      model: MODEL_MEMORY,
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

// ─── Search Result Summarization ──────────────────────────────────────────────
// Uses a lightweight model to condense raw search results into a brief summary
async function summarizeSearchResults(
  ai: GoogleGenAI,
  query: string,
  results: any[]
): Promise<string> {
  if (!results || results.length === 0) return "No results found.";
  const raw = results.map((r, i) => `${i + 1}. ${r.title || ""}: ${r.snippet || ""}`).join("\n");
  try {
    const result = await ai.models.generateContent({
      model: MODEL_UTILITY,
      contents: [{ role: "user", parts: [{ text: `Summarize these search results for the query "${query}" into a concise, informative paragraph (max 3-4 sentences). Include key facts and numbers. Do NOT add any preamble like "Here is a summary".

Search Results:
${raw.substring(0, 3000)}` }] }],
    });
    const summary = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (summary && summary.length > 10) {
      console.log(`[SEARCH SUMMARY] Condensed ${results.length} results for "${query}"`);
      return summary;
    }
  } catch (err) {
    console.error("[SEARCH SUMMARY ERROR]", err);
  }
  // Fallback: return raw JSON if summarization fails
  return JSON.stringify(results);
}

// ─── Server ───────────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/live" });

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { headers: { "User-Agent": "aistudio-build" } },
  });

  wss.on("connection", async (clientWs, req) => {
    let session: any = null;
    const db = getDb();
    const activeMode = db.modes.find(m => m.id === db.activeModeId) || db.modes[0];
    const userName = db.userName || "there";
    const rawGreeting = db.greetingPhrase || "Hey {name}!";
    const greeting = rawGreeting.replace("{name}", userName);

    // Session transcript for smart memory extraction at end
    const sessionLog: string[] = [];

    // Conversation logging in JSON database
    const sessionStartTime = new Date().toISOString();
    const sessionId = `conv_${Date.now()}`;
    const conversationSession: ConversationSession = {
      id: sessionId,
      startTime: sessionStartTime,
      messages: [],
    };

    const logTurn = (role: string, text: string) => {
      if (text.trim().length > 3) {
        sessionLog.push(`${role}: ${text.substring(0, 200)}`);

        conversationSession.messages.push({
          role,
          text: text.trim(),
          timestamp: new Date().toISOString(),
        });
        saveConversationSession(conversationSession);
      }
    };

    const memoryContext = formatMemoryForPrompt(db.memory);
    const recentConversationsContext = formatRecentConversationsForPrompt();

    const integrations = db.integrations || { godoEnabled: false, obsidianEnabled: false, obsidianPath: "", opencodeEnabled: false };
    let integrationsPrompt = "";
    if (integrations.godoEnabled) {
      integrationsPrompt += `\n- GoDo CLI Task Manager is ACTIVE. You can view, add, or complete tasks by running "godo list", "godo add 'description'", or "godo complete <id>" via runLinuxCommand.`;
    }
    if (integrations.obsidianEnabled && integrations.obsidianPath) {
      integrationsPrompt += `\n- Obsidian Notes Vault is ACTIVE at path: "${integrations.obsidianPath}". You can query, read, create, update, or search markdown notes inside this folder using standard shell commands (grep, cat, echo, find) via runLinuxCommand.`;
    }
    if (integrations.opencodeEnabled) {
      integrationsPrompt += `\n- OpenCode Developer Agent CLI is ACTIVE. If in developer or administrative mode, you can delegate complex programming, multi-file code writing, test execution, or refactoring tasks by executing the "opencode" CLI tool. Command syntax: "opencode -p '<prompt>'". OpenCode runs headlessly and modifies the local codebase directly.
- The assistant is also fully integrated with and aware of other optional developer AI CLI tools that can be installed (e.g. Anthropic's Claude Code CLI "claude", or GitHub Copilot CLI "copilot"). Depending on the task requirements, you can invoke these globally installed CLI tools headlessly via runLinuxCommand to expand and accelerate your tasks.`;
    }

    const assistantName = db.wakeWord.charAt(0).toUpperCase() + db.wakeWord.slice(1);
    const systemInstruction = `${activeMode.instruction}

IDENTITY: Your name is ${assistantName}. You are speaking to ${userName}.
CAPABILITIES:
- You have the searchWeb tool to query the internet, and the fetchPage tool to read specific web pages. You have full internet and web access via these tools. Use them to answer search queries.
- You have the runLinuxCommand tool to run bash commands on your host system. Since the assistant daemon runs as a background service with root privileges and has complete passwordless sudo authority, you have full systemwide administration privileges to run sudo commands or manage services. Your command execution is guided by the selected operating mode.${integrationsPrompt}
- You have the runCodingAgent tool to invoke developer AI agents ('opencode', 'claude', 'copilot') headlessly. Since you and these agents have full passwordless sudo authority, you can delegate tasks that require advanced administrative permissions.
- PROTOCOL FOR DELEGATING TO CODING AGENTS: When calling runCodingAgent, do NOT send vague, short, or single-line prompts. You MUST plan the task thoroughly first and construct a highly detailed, comprehensive prompt so the coding agent gets the full picture to complete the task headlessly. Your entire planned instruction prompt will be automatically wrapped and escaped inside double quotes (" ") when executed in the command line, ensuring a single cohesive, perfectly parsed execution block:
  1. GOAL: Clearly define the objective of the changes.
  2. CONTEXT: List all files to be read/modified, active types/interfaces, or backend schemas.
  3. STEP-BY-STEP WORK: Provide precise requirements, design patterns, and edge cases to handle.
  4. VERIFICATION PLAN: Specify exactly what tests to run, how to build/compile, and what command commands to use to confirm success.
- You have the openBrowser tool to open the default web browser on the local Linux desktop and navigate to URLs or search and play songs/videos on YouTube. Use this whenever the user asks to open a site, navigate to a page, or play music/songs/videos.
VOICE RULES (non-negotiable):
- Max 2-3 SHORT sentences per response. You are being spoken aloud.
- NEVER say "Is there anything else I can help you with?" or any variant of that. EVER.
- NEVER offer further help at the end of responses. Answer and stop.
- Address the user as ${userName} occasionally to feel personal.
- When the session starts, say ONLY: "${greeting}" — nothing else. Just that greeting.
${memoryContext}
${recentConversationsContext}`;

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
      },
      {
        name: "delegateComplexTask",
        description: "Delegates a complex reasoning, coding, or text generation task to an advanced reasoning AI model. Use this when the user asks you to write code, solve a complex puzzle, or generate long-form content. You will receive the output generated by the advanced model.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            taskPrompt: {
              type: Type.STRING,
              description: "The complete, detailed prompt to send to the advanced model, including any relevant context the user provided."
            }
          },
          required: ["taskPrompt"]
        }
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

      functionDeclarations.push({
        name: "runCodingAgent",
        description: "Executes an advanced AI developer CLI agent ('opencode', 'claude', or 'copilot') headlessly to complete complex coding, multi-file writing, refactoring, testing, or debugging tasks. Runs in non-interactive mode with high timeouts.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            agent: {
              type: Type.STRING,
              enum: ["opencode", "claude", "copilot"],
              description: "The AI coding agent tool to execute.",
            },
            prompt: {
              type: Type.STRING,
              description: "The complete, detailed coding instruction/prompt to send to the developer agent.",
            },
          },
          required: ["agent", "prompt"],
        },
      });

      functionDeclarations.push({
        name: "getCodingAgentStatus",
        description: "Checks the running status and recent progress of the background coding agent. Returns whether an agent is active, which agent is running, and the last 15 lines of its terminal logs/status output. Call this to monitor progress or when the user asks for status updates.",
        parameters: {
          type: Type.OBJECT,
          properties: {},
          required: [],
        },
      });

      functionDeclarations.push({
        name: "openBrowser",
        description: "Opens the default web browser on the local Linux desktop and navigates to a URL or searches/plays a song on YouTube. Use this whenever the user asks to open a site, navigate to a webpage, or play music/songs/videos on YouTube.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            url: {
              type: Type.STRING,
              description: "The exact URL to navigate to (e.g. 'https://github.com'). Optional if youtubeSearchQuery is provided.",
            },
            youtubeSearchQuery: {
              type: Type.STRING,
              description: "The name of a song, artist, or video query to search and play on YouTube (e.g. 'shape of you ed sheeran'). Optional if url is provided.",
            },
          },
          required: [],
        },
      });
    }

    try {
      session = await ai.live.connect({
        model: MODEL_LIVE,
        callbacks: {
          onmessage: async (message: LiveServerMessage) => {
            // Forward all audio parts to client
            const parts = message.serverContent?.modelTurn?.parts ?? [];
            for (const part of parts) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
              // Log text parts for memory
              if (part.text) {
                logTurn("Nova", part.text);
              }
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
                    // Summarize results using lightweight model to save Live API tokens
                    resultStr = await summarizeSearchResults(ai, query, results);
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
                } else if (call.name === "runCodingAgent") {
                  const agent = (call.args as any).agent as string;
                  const prompt = (call.args as any).prompt as string;
                  
                  logTurn("AGENT", `Requested ${agent}: ${prompt}`);

                  // Check if another coding agent is already running
                  let isAlreadyRunning = false;
                  if (activeAgentProcess && activeAgentProcess.exitCode === null) {
                    isAlreadyRunning = true;
                  }

                  if (isAlreadyRunning) {
                    const errorMsg = `⚠️ Spawning blocked: An active developer coding agent (${activeAgentName}) is currently running in the background. Wait for the current agent task to complete or query getCodingAgentStatus.`;
                    console.log(`[AGENT BLOCKED] Spawning ${agent} blocked by active running ${activeAgentName}`);
                    
                    toolResponses.push({
                      id: call.id,
                      name: call.name,
                      response: {
                        status: "error",
                        result: errorMsg
                      },
                    });
                  } else {
                    // Start the new agent in the background
                    // Notify client that coding agent is starting
                    clientWs.send(JSON.stringify({
                      action: "agent_start",
                      agent,
                      prompt
                    }));

                    let command = "";
                    if (agent === "opencode") {
                      command = `opencode run --dangerously-skip-permissions ${JSON.stringify(prompt)}`;
                    } else if (agent === "claude") {
                      command = `export PAGER=cat && claude --non-interactive -p ${JSON.stringify(prompt)}`;
                    } else if (agent === "copilot") {
                      command = `export PAGER=cat && copilot explain ${JSON.stringify(prompt)}`;
                    }

                    // Write Start Header to status file
                    const startHeader = `================================================
CODING AGENT START: ${agent.toUpperCase()}
TIME: ${new Date().toISOString()}
PROMPT: ${prompt}
================================================\n\n`;
                    try {
                      fs.writeFileSync(STATUS_LOG_PATH, startHeader, "utf-8");
                    } catch (e: any) {
                      console.error(`Failed to write status header: ${e.message}`);
                    }

                    // Execute command in the background, redirecting stdout/stderr directly to file!
                    const bgCommand = `${command} >> ${STATUS_LOG_PATH} 2>&1`;
                    console.log(`[AGENT SPAWN] Spawning ${agent} in the background: ${bgCommand}`);
                    
                    activeAgentProcess = exec(bgCommand, {
                      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                    });
                    activeAgentName = agent;
                    activeAgentPrompt = prompt;
                    activeAgentStartTime = Date.now();

                    // Non-blocking exit handler
                    activeAgentProcess.on("exit", (code: number) => {
                      const exitMsg = `\n\n================================================
CODING AGENT FINISHED
TIME: ${new Date().toISOString()}
EXIT CODE: ${code}
SUCCESS: ${code === 0}
================================================\n`;
                      try {
                        fs.appendFileSync(STATUS_LOG_PATH, exitMsg, "utf-8");
                      } catch (e: any) {
                        console.error(`Failed to append status footer: ${e.message}`);
                      }

                      // Also notify WebSocket client!
                      clientWs.send(JSON.stringify({
                        action: "agent_end",
                        agent,
                        success: code === 0,
                      }));
                      console.log(`[AGENT EXIT] Background coding agent ${agent} finished with code ${code}`);
                    });

                    const spawnResult = `🤖 Successfully spawned the ${agent.toUpperCase()} coding agent in the background to handle the task. All logs and progress are being written to ${STATUS_LOG_PATH}. You can check its progress using the getCodingAgentStatus tool at any time (recommend checking every minute). Do not block; you can reply to the user normally now and tell them the agent is running in the background.`;

                    toolResponses.push({
                      id: call.id,
                      name: call.name,
                      response: {
                        status: "success",
                        result: spawnResult
                      },
                    });
                  }
                } else if (call.name === "getCodingAgentStatus") {
                  logTurn("AGENT_STATUS", "Checking background agent status");
                  
                  let isRunning = false;
                  if (activeAgentProcess && activeAgentProcess.exitCode === null) {
                    isRunning = true;
                  }

                  let recentLogs = "No active logs found.";
                  if (fs.existsSync(STATUS_LOG_PATH)) {
                    try {
                      const fullContent = fs.readFileSync(STATUS_LOG_PATH, "utf-8");
                      const lines = fullContent.split("\n");
                      // Return the last 20 lines of logs
                      recentLogs = lines.slice(-20).join("\n");
                    } catch (e: any) {
                      recentLogs = `Error reading status file: ${e.message}`;
                    }
                  }

                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: {
                      isRunning,
                      agent: activeAgentName || "none",
                      prompt: activeAgentPrompt || "none",
                      durationSeconds: activeAgentStartTime ? Math.round((Date.now() - activeAgentStartTime) / 1000) : 0,
                      recentLogs: recentLogs,
                    },
                  });
                } else if (call.name === "openBrowser") {
                  const url = (call.args as any).url as string;
                  const youtubeSearchQuery = (call.args as any).youtubeSearchQuery as string;
                  
                  logTurn("BROWSER", `Opening browser: URL=${url || "none"}, Query=${youtubeSearchQuery || "none"}`);

                  let targetUrl = "";
                  if (youtubeSearchQuery) {
                    const encoded = encodeURIComponent(youtubeSearchQuery);
                    targetUrl = `https://www.youtube.com/results?search_query=${encoded}`;
                  } else if (url) {
                    targetUrl = url;
                    if (!/^https?:\/\//i.test(targetUrl)) {
                      targetUrl = 'https://' + targetUrl;
                    }
                  }

                  let resultStr = "";
                  let success = true;
                  if (!targetUrl) {
                    resultStr = "ERROR: Neither URL nor YouTube search query was provided.";
                    success = false;
                  } else {
                    try {
                      const xdgCommand = `export DISPLAY=:0 && xdg-open ${JSON.stringify(targetUrl)}`;
                      console.log(`[BROWSER SPAWN] Executing: ${xdgCommand}`);
                      
                      await execAsync(xdgCommand, {
                        timeout: 5000,
                      });
                      resultStr = `Successfully opened browser and navigated to: ${targetUrl}`;
                      console.log(`[BROWSER OK] Opened ${targetUrl}`);
                    } catch (error: any) {
                      success = false;
                      try {
                        console.log(`[BROWSER FALLBACK] Retrying standard xdg-open without DISPLAY...`);
                        await execAsync(`xdg-open ${JSON.stringify(targetUrl)}`, { timeout: 5000 });
                        resultStr = `Successfully opened browser via fallback: ${targetUrl}`;
                        success = true;
                        console.log(`[BROWSER FALLBACK OK] Opened ${targetUrl}`);
                      } catch (err2: any) {
                        resultStr = `ERROR: Failed to open browser. ${error.message} (Fallback error: ${err2.message})`;
                        console.error(`[BROWSER FAIL] ${targetUrl}`, error.message);
                      }
                    }
                  }

                  clientWs.send(JSON.stringify({
                    action: "browser_opened",
                    url: targetUrl,
                    success
                  }));

                  toolResponses.push({
                    id: call.id,
                    name: call.name,
                    response: {
                      success,
                      result: resultStr,
                    },
                  });
                } else if (call.name === "delegateComplexTask") {
                  const taskPrompt = (call.args as any).taskPrompt as string;
                  logTurn("DELEGATE", "Delegated complex task to advanced model");
                  let resultStr = "";
                  try {
                    const result = await ai.models.generateContent({
                      model: "gemini-2.5-pro",
                      contents: [{ role: "user", parts: [{ text: taskPrompt }] }],
                    });
                    resultStr = result.candidates?.[0]?.content?.parts?.[0]?.text || "No output generated.";
                    console.log(`[DELEGATE OK] Task processed by advanced model.`);
                  } catch (error: any) {
                    resultStr = `ERROR: ${error.message}`;
                    console.error(`[DELEGATE FAIL]`, error.message);
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
            session.sendClientContent({
              turns: [{ role: "user", parts: [{ text: `Say your greeting now. Just say: "${greeting}"` }] }],
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
          session.sendClientContent({ turns: [{ role: "user", parts: [{ text: payload.text }] }] });
        }
      } catch (err) {
        console.error("[MESSAGE ERROR]", err);
      }
    });

    clientWs.on("close", async () => {
      console.log("[CLIENT DISCONNECTED] — extracting memories...");
      
      // Save final conversation session log
      conversationSession.endTime = new Date().toISOString();
      saveConversationSession(conversationSession);

      if (session) {
        try {
          await session.close();
          console.log("[GEMINI SESSION CLOSED CLEANLY]");
        } catch (e) {
          console.error("[GEMINI SESSION CLOSE ERROR]", e);
        }
      }
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

  app.get("/api/conversations", (_req, res) => {
    res.json(getConversationSessions());
  });

  app.post("/api/conversations/clear", (_req, res) => {
    clearConversationSessions();
    res.json({ success: true });
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
      server: {
        middlewareMode: true,
        hmr: {
          port: 24678
        }
      },
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
