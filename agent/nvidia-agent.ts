import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);
const PROJECT_ROOT = "/home/chiru/antigravity/Nexus-OS-Voice-Assistant";
const ALLOWED_ROOT = "/home/chiru";

// Dynamic task-based model selection from the fast NIM catalog
export function selectBestModelForTask(prompt: string): string {
  const promptLower = prompt.toLowerCase();
  
  // 1. Vision/Visual/Layout styling queries
  if (
    promptLower.includes("screenshot") ||
    promptLower.includes("visual") ||
    promptLower.includes("image") ||
    promptLower.includes("png") ||
    promptLower.includes("jpeg") ||
    promptLower.includes("design") ||
    promptLower.includes("layout") ||
    promptLower.includes("css styling") ||
    promptLower.includes("look at") ||
    promptLower.includes("see on screen")
  ) {
    return "meta/llama-3.2-11b-vision-instruct"; // 0.22s - Vision instruct
  }
  
  // 2. Complex Coding, Architecture, DB schema, or large scale refactoring
  if (
    promptLower.includes("refactor") ||
    promptLower.includes("algorithm") ||
    promptLower.includes("complex") ||
    promptLower.includes("database") ||
    promptLower.includes("schema") ||
    promptLower.includes("optimise") ||
    promptLower.includes("optimize") ||
    promptLower.includes("architecture") ||
    promptLower.includes("implement full") ||
    promptLower.includes("class design") ||
    promptLower.includes("integrate") ||
    promptLower.includes("rewrite") ||
    promptLower.includes("fix all bugs") ||
    promptLower.includes("debug complex")
  ) {
    return "qwen/qwen3-coder-480b-a35b-instruct"; // 2.53s - Extremely powerful coder
  }
  
  // 3. Medium coding/scripting
  if (
    promptLower.includes("write") ||
    promptLower.includes("code") ||
    promptLower.includes("script") ||
    promptLower.includes("function") ||
    promptLower.includes("test") ||
    promptLower.includes("create file") ||
    promptLower.includes("implement")
  ) {
    return "meta/llama-3.3-70b-instruct"; // 1.28s - Solid coding instruction
  }
  
  // 4. System Admin, Daemon configuration, installation routines
  if (
    promptLower.includes("systemctl") ||
    promptLower.includes("service") ||
    promptLower.includes("install") ||
    promptLower.includes("setup") ||
    promptLower.includes("config") ||
    promptLower.includes("bash") ||
    promptLower.includes("shell") ||
    promptLower.includes("admin") ||
    promptLower.includes("run command")
  ) {
    return "deepseek-ai/deepseek-v4-pro"; // 0.46s - High reasoning accuracy
  }
  
  // 5. Default/Simple tasks
  return "meta/llama-3.1-8b-instruct"; // 0.21s - Fastest standard model
}

// Scrapes DuckDuckGo HTML results for search queries
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
    
    // Find result anchors: class="result__a"
    const matches = html.matchAll(/<a\s+class="[a-zA-Z0-9_-]*result__a[a-zA-Z0-9_-]*"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    
    let count = 0;
    for (const match of matches) {
      if (count >= 5) break;
      let rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      
      if (rawUrl.includes("uddg=")) {
        const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
        if (uddgMatch) {
          rawUrl = decodeURIComponent(uddgMatch[1]);
        }
      }
      if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

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

// Queries SearXNG instances with fallbacks (DuckDuckGo HTML scraper)
async function performWebSearch(query: string): Promise<any[]> {
  const searxInstances = [
    "https://search.mdosch.de/",
    "https://searx.oloke.xyz/",
    "https://etsi.me/",
    "https://searx.be/",
    "https://priv.au/",
    "https://searx.work/"
  ];
  
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

  // Fallback to DuckDuckGo HTML
  return await performDuckDuckGoHtmlSearch(query);
}

// Fetches target webpage and returns sanitized text
async function fetchWebpageContent(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }
  const html = await res.text();
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.substring(0, 5000); // Limit to 5000 characters
}

// Helper to log progress to console, file, and WebSocket callback
function logProgress(msg: string, logPath: string, onProgress?: (msg: string) => void) {
  console.log(`[NVIDIA-AGENT] ${msg}`);
  fs.appendFileSync(logPath, `${msg}\n`, "utf-8");
  if (onProgress) {
    onProgress(msg);
  }
}

// Prunes conversation history turns to save tokens
function pruneHistory(history: any[], logPath: string, onProgress?: (msg: string) => void): any[] {
  if (history.length > 14) {
    logProgress("[System] Pruning agent conversation context to prevent token overflows...", logPath, onProgress);
    const systemMsg = history[0];
    const initialUserMsg = history[1];
    
    // Retain the last 6 turns
    const recentHistory = history.slice(-6);
    return [systemMsg, initialUserMsg, ...recentHistory];
  }
  return history;
}

export async function runCustomNvidiaAgent(
  prompt: string,
  apiKey: string,
  model: string,
  logPath: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  // Resolve model selection
  let selectedModel = model;
  if (model === "auto" || !model) {
    selectedModel = selectBestModelForTask(prompt);
  }

  // Ensure config dir exists
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  // Write Start Header to status file
  const startHeader = `================================================
CUSTOM NVIDIA AGENT START
MODEL: ${selectedModel}
TIME: ${new Date().toISOString()}
PROMPT: ${prompt}
================================================\n\n`;
  fs.writeFileSync(logPath, startHeader, "utf-8");

  logProgress(`Initializing autonomous developer agent loop (Model: ${selectedModel})...`, logPath, onProgress);

  const systemInstruction = `You are "Nova Developer Agent", a premium local autonomous software engineering agent.
Your objective: "${prompt}"

You run inside the directory "${PROJECT_ROOT}" and have full passwordless sudo permissions.
You operate in a strict Reasoning + Action (ReAct) loop. In every turn, you MUST analyze past results and output:
Thought: <brief reasoning of what you need to do next>
Action: { "name": "tool_name", "args": { "arg_name": "arg_value" } }

Strict constraints:
1. Do not print markdown code blocks outside of the Action JSON block.
2. Only call one tool per turn.
3. Check the folder layout first using list_dir, find_files, or search_grep if you need to discover code.
4. Use edit_file for small edits rather than write_file (to preserve formatting, comments, and tokens).
5. Always compile, run scripts, or run tests to verify your changes work before calling finish.

Available Tools:
- list_dir: { "path": string } - Lists files recursively in a directory. Use "." for project root.
- find_files: { "query": string, "path": string } - Locates files matching target query within path.
- search_grep: { "query": string, "path": string } - Searches for textual patterns inside files.
- read_file: { "path": string } - Reads full content of a file.
- write_file: { "path": string, "content": string } - Overwrites or creates a new file.
- edit_file: { "path": string, "targetContent": string, "replacementContent": string } - Replaces unique targetContent block inside target file.
- run_command: { "cmd": string } - Executes shell command.
- web_search: { "query": string } - Queries Search engines (SearXNG / DuckDuckGo) to research frameworks, docs, or errors.
- fetch_webpage: { "url": string } - Fetches plain text HTML content of a URL for documentation lookup.
- finish: { "summary": string } - Ends task with final results summary.`;

  let conversationHistory: any[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: `Objective: ${prompt}\nBegin your execution loop now.` }
  ];

  let currentStep = 1;
  const maxSteps = 15;
  let finished = false;
  let finalSummary = "Agent timed out or reached execution limit.";

  while (currentStep <= maxSteps && !finished) {
    logProgress(`\n--- Step ${currentStep} / ${maxSteps} ---`, logPath, onProgress);
    
    // Context pruning check
    conversationHistory = pruneHistory(conversationHistory, logPath, onProgress);

    try {
      logProgress(`Querying NVIDIA API (${selectedModel})...`, logPath, onProgress);
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationHistory,
          temperature: 0.15,
          max_tokens: 2048
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "";
      
      logProgress(`[Agent Thought & Action]:\n${reply}`, logPath, onProgress);
      conversationHistory.push({ role: "assistant", content: reply });

      // Action parser
      const actionMatch = reply.match(/Action:\s*(\{[\s\S]*\})/);
      if (!actionMatch) {
        logProgress("WARNING: Could not parse Action JSON block. Requesting formatting recovery...", logPath, onProgress);
        conversationHistory.push({
          role: "user",
          content: "Formatting Error: I couldn't find a JSON block starting with 'Action: {'. Please strictly reply with 'Thought: <reasoning>' and 'Action: { \"name\": \"...\", \"args\": { ... } }' and try again."
        });
        currentStep++;
        continue;
      }

      let action: { name: string; args: any };
      try {
        action = JSON.parse(actionMatch[1]);
      } catch (err: any) {
        logProgress(`WARNING: Action JSON is malformed: ${err.message}. Requesting recovery...`, logPath, onProgress);
        conversationHistory.push({
          role: "user",
          content: `JSON Malformed: ${err.message}. Please verify the keys are properly quoted and try again.`
        });
        currentStep++;
        continue;
      }

      logProgress(`Executing tool "${action.name}"...`, logPath, onProgress);
      let toolOutput = "";

      switch (action.name) {
        case "list_dir": {
          const relPath = action.args.path || ".";
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot list directories outside the permitted home space.";
          } else if (!fs.existsSync(fullPath)) {
            toolOutput = `ERROR: Directory "${relPath}" does not exist.`;
          } else {
            const files = fs.readdirSync(fullPath, { withFileTypes: true });
            const list = files
              .filter(f => f.name !== "node_modules" && f.name !== ".git" && f.name !== "dist")
              .map(f => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`)
              .join("\n");
            toolOutput = `Files in "${relPath}":\n${list || "(empty)"}`;
          }
          break;
        }

        case "find_files": {
          const relPath = action.args.path || ".";
          const query = (action.args.query || "").toLowerCase();
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot search files outside the permitted home space.";
          } else if (!fs.existsSync(fullPath)) {
            toolOutput = `ERROR: Path "${relPath}" does not exist.`;
          } else {
            const results: string[] = [];
            const findFilesDir = (dir: string) => {
              const files = fs.readdirSync(dir, { withFileTypes: true });
              for (const f of files) {
                const fullF = path.join(dir, f.name);
                if (f.isDirectory()) {
                  if (f.name === "node_modules" || f.name === ".git" || f.name === "dist") continue;
                  findFilesDir(fullF);
                } else if (f.isFile()) {
                  if (f.name.toLowerCase().includes(query)) {
                    results.push(path.relative(PROJECT_ROOT, fullF));
                  }
                }
              }
            };
            findFilesDir(fullPath);
            toolOutput = results.length > 0
              ? `Found ${results.length} files:\n${results.slice(0, 50).join("\n")}`
              : `No files found matching: "${query}"`;
          }
          break;
        }

        case "search_grep": {
          const relPath = action.args.path || ".";
          const query = action.args.query;
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot search directories outside the permitted home space.";
          } else if (!fs.existsSync(fullPath)) {
            toolOutput = `ERROR: Path "${relPath}" does not exist.`;
          } else if (!query) {
            toolOutput = "ERROR: Missing 'query' parameter.";
          } else {
            const matches: string[] = [];
            const searchDir = (dir: string) => {
              const files = fs.readdirSync(dir, { withFileTypes: true });
              for (const f of files) {
                const fullF = path.join(dir, f.name);
                if (f.isDirectory()) {
                  if (f.name === "node_modules" || f.name === ".git" || f.name === "dist") continue;
                  searchDir(fullF);
                } else if (f.isFile()) {
                  const ext = path.extname(f.name).toLowerCase();
                  if ([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".sh", ".html", ".css"].includes(ext)) {
                    const content = fs.readFileSync(fullF, "utf-8");
                    if (content.includes(query)) {
                      const lines = content.split("\n");
                      lines.forEach((line, idx) => {
                        if (line.includes(query)) {
                          matches.push(`${path.relative(PROJECT_ROOT, fullF)}:L${idx + 1}: ${line.trim()}`);
                        }
                      });
                    }
                  }
                }
              }
            };
            searchDir(fullPath);
            toolOutput = matches.length > 0 
              ? `Found ${matches.length} matches:\n${matches.slice(0, 40).join("\n")}${matches.length > 40 ? "\n...[TRUNCATED]" : ""}`
              : `No matches found for query: "${query}"`;
          }
          break;
        }

        case "read_file": {
          const relPath = action.args.path;
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot read files outside the permitted home space.";
          } else if (!fs.existsSync(fullPath)) {
            toolOutput = `ERROR: File "${relPath}" does not exist.`;
          } else {
            const content = fs.readFileSync(fullPath, "utf-8");
            toolOutput = `File "${relPath}" Content:\n${content}`;
          }
          break;
        }

        case "write_file": {
          const relPath = action.args.path;
          const content = action.args.content || "";
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot write files outside the permitted home space.";
          } else {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, content, "utf-8");
            toolOutput = `File "${relPath}" written successfully (${content.length} characters).`;
          }
          break;
        }

        case "edit_file": {
          const relPath = action.args.path;
          const target = action.args.targetContent;
          const replacement = action.args.replacementContent;
          const fullPath = path.isAbsolute(relPath) ? relPath : path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(ALLOWED_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot edit files outside the permitted home space.";
          } else if (!fs.existsSync(fullPath)) {
            toolOutput = `ERROR: File "${relPath}" does not exist.`;
          } else if (target === undefined || replacement === undefined) {
            toolOutput = "ERROR: Missing 'targetContent' or 'replacementContent' parameters.";
          } else {
            const content = fs.readFileSync(fullPath, "utf-8");
            if (!content.includes(target)) {
              toolOutput = `ERROR: Target content not found in file. Make sure whitespace and characters match exactly.`;
            } else {
              const parts = content.split(target);
              if (parts.length > 2) {
                toolOutput = `ERROR: Target content is not unique (found ${parts.length - 1} occurrences). Provide more surrounding lines of context.`;
              } else {
                const newContent = content.replace(target, replacement);
                fs.writeFileSync(fullPath, newContent, "utf-8");
                toolOutput = `File "${relPath}" successfully edited.`;
              }
            }
          }
          break;
        }

        case "run_command": {
          const cmd = action.args.cmd;
          logProgress(`[Shell]: Running command: ${cmd}`, logPath, onProgress);
          try {
            const { stdout, stderr } = await execAsync(cmd, {
              cwd: PROJECT_ROOT,
              timeout: 45000,
              maxBuffer: 5 * 1024 * 1024
            });
            toolOutput = `Command executed.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`;
          } catch (execErr: any) {
            toolOutput = `ERROR: Command execution failed.\nCode: ${execErr.code}\nSignal: ${execErr.signal}\nSTDOUT:\n${execErr.stdout}\nSTDERR:\n${execErr.stderr}`;
          }
          break;
        }

        case "web_search": {
          const query = action.args.query;
          logProgress(`[Search]: Querying web search: "${query}"`, logPath, onProgress);
          try {
            const searchResults = await performWebSearch(query);
            toolOutput = searchResults.length > 0
              ? `Search Results for "${query}":\n` + searchResults.map((r, i) => `${i+1}. [${r.title}](${r.url})\nSnippet: ${r.content}`).join("\n\n")
              : "No search results found.";
          } catch (err: any) {
            toolOutput = `ERROR: Web search failed: ${err.message}`;
          }
          break;
        }

        case "fetch_webpage": {
          const url = action.args.url;
          logProgress(`[Scrape]: Fetching webpage content: ${url}`, logPath, onProgress);
          try {
            const parsedContent = await fetchWebpageContent(url);
            toolOutput = `Content of webpage "${url}":\n${parsedContent}`;
          } catch (err: any) {
            toolOutput = `ERROR: Fetching webpage content failed: ${err.message}`;
          }
          break;
        }

        case "finish": {
          finished = true;
          finalSummary = action.args.summary || "Completed task successfully.";
          toolOutput = "Task completed.";
          break;
        }

        default: {
          toolOutput = `ERROR: Unknown tool "${action.name}". Available tools: list_dir, find_files, search_grep, read_file, write_file, edit_file, run_command, web_search, fetch_webpage, finish.`;
        }
      }

      logProgress(`Tool Result:\n${toolOutput.substring(0, 800)}${toolOutput.length > 800 ? "\n...[TRUNCATED]" : ""}`, logPath, onProgress);
      conversationHistory.push({ role: "user", content: `Observation:\n${toolOutput}` });

    } catch (e: any) {
      logProgress(`CRITICAL AGENT ERROR: ${e.message}`, logPath, onProgress);
      conversationHistory.push({ role: "user", content: `Observation error: ${e.message}. Correct and retry.` });
    }

    currentStep++;
  }

  const endFooter = `\n================================================
CUSTOM NVIDIA AGENT FINISHED
TIME: ${new Date().toISOString()}
SUMMARY: ${finalSummary}
================================================\n`;
  fs.appendFileSync(logPath, endFooter, "utf-8");

  return finalSummary;
}
