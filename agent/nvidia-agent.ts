import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);
const PROJECT_ROOT = "/home/chiru/antigravity/Nexus-OS-Voice-Assistant";
const STATUS_LOG_PATH = "/home/chiru/.config/nova-voice-assistant/coding_agent_status.log";

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
    return "meta/llama-3.2-11b-vision-instruct"; // 0.22s - Very fast vision instruction model
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
    return "qwen/qwen3-coder-480b-a35b-instruct"; // 2.53s - Extremely powerful coder model
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
    return "meta/llama-3.3-70b-instruct"; // 1.28s - Stable, solid coding instruction
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
    return "deepseek-ai/deepseek-v4-pro"; // 0.46s - High reasoning accuracy for shell commands
  }
  
  // 5. Default/Simple tasks
  return "meta/llama-3.1-8b-instruct"; // 0.21s - Fastest standard response model
}

// Helper to log progress to console, status file, and WebSocket callback
function logProgress(msg: string, onProgress?: (msg: string) => void) {
  console.log(`[NVIDIA-AGENT] ${msg}`);
  fs.appendFileSync(STATUS_LOG_PATH, `${msg}\n`, "utf-8");
  if (onProgress) {
    onProgress(msg);
  }
}

// Prunes conversation history turns to save tokens and prevent context crash
function pruneHistory(history: any[], onProgress?: (msg: string) => void): any[] {
  if (history.length > 14) {
    logProgress("[System] Pruning agent conversation context to prevent token overflows...", onProgress);
    const systemMsg = history[0];
    const initialUserMsg = history[1];
    
    // Retain the last 6 turns (thoughts + actions + observations)
    const recentHistory = history.slice(-6);
    return [systemMsg, initialUserMsg, ...recentHistory];
  }
  return history;
}

export async function runCustomNvidiaAgent(
  prompt: string,
  apiKey: string,
  model: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  // Resolve correct model selection
  let selectedModel = model;
  if (model === "auto" || !model) {
    selectedModel = selectBestModelForTask(prompt);
  }

  // Write Start Header to status file
  const startHeader = `================================================
CUSTOM NVIDIA AGENT START
MODEL: ${selectedModel}
TIME: ${new Date().toISOString()}
PROMPT: ${prompt}
================================================\n\n`;
  fs.writeFileSync(STATUS_LOG_PATH, startHeader, "utf-8");

  logProgress(`Initializing autonomous developer agent loop (Model: ${selectedModel})...`, onProgress);

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
    logProgress(`\n--- Step ${currentStep} / ${maxSteps} ---`, onProgress);
    
    // Context pruning check
    conversationHistory = pruneHistory(conversationHistory, onProgress);

    try {
      logProgress(`Querying NVIDIA API (${selectedModel})...`, onProgress);
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
      
      logProgress(`[Agent Thought & Action]:\n${reply}`, onProgress);
      conversationHistory.push({ role: "assistant", content: reply });

      // Action parser with heuristics to extract JSON block even with extra text
      const actionMatch = reply.match(/Action:\s*(\{[\s\S]*\})/);
      if (!actionMatch) {
        logProgress("WARNING: Could not parse Action JSON block. Requesting formatting recovery...", onProgress);
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
        logProgress(`WARNING: Action JSON is malformed: ${err.message}. Requesting recovery...`, onProgress);
        conversationHistory.push({
          role: "user",
          content: `JSON Malformed: ${err.message}. Please verify the keys are properly quoted and try again.`
        });
        currentStep++;
        continue;
      }

      logProgress(`Executing tool "${action.name}"...`, onProgress);
      let toolOutput = "";

      switch (action.name) {
        case "list_dir": {
          const relPath = action.args.path || ".";
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot list directories outside the project root.";
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
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot search files outside the project root.";
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
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot search directories outside the project root.";
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
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot read files outside the project root.";
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
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot write files outside the project root.";
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
          const fullPath = path.resolve(PROJECT_ROOT, relPath);
          if (!fullPath.startsWith(PROJECT_ROOT)) {
            toolOutput = "ERROR: Access denied. Cannot edit files outside the project root.";
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
          logProgress(`[Shell]: Running command: ${cmd}`, onProgress);
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

        case "finish": {
          finished = true;
          finalSummary = action.args.summary || "Completed task successfully.";
          toolOutput = "Task completed.";
          break;
        }

        default: {
          toolOutput = `ERROR: Unknown tool "${action.name}". Available tools: list_dir, find_files, search_grep, read_file, write_file, edit_file, run_command, finish.`;
        }
      }

      logProgress(`Tool Result:\n${toolOutput.substring(0, 800)}${toolOutput.length > 800 ? "\n...[TRUNCATED]" : ""}`, onProgress);
      conversationHistory.push({ role: "user", content: `Observation:\n${toolOutput}` });

    } catch (e: any) {
      logProgress(`CRITICAL AGENT ERROR: ${e.message}`, onProgress);
      conversationHistory.push({ role: "user", content: `Observation error: ${e.message}. Correct and retry.` });
    }

    currentStep++;
  }

  const endFooter = `\n================================================
CUSTOM NVIDIA AGENT FINISHED
TIME: ${new Date().toISOString()}
SUMMARY: ${finalSummary}
================================================\n`;
  fs.appendFileSync(STATUS_LOG_PATH, endFooter, "utf-8");

  return finalSummary;
}
