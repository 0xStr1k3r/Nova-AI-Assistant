import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import * as util from "util";

const execAsync = util.promisify(exec);
const PROJECT_ROOT = "/home/chiru/antigravity/Nexus-OS-Voice-Assistant";
const STATUS_LOG_PATH = "/home/chiru/.config/nova-voice-assistant/coding_agent_status.log";

// Helper to log both to console, status file, and call a progress callback
function logProgress(msg: string, onProgress?: (msg: string) => void) {
  console.log(`[NVIDIA-AGENT] ${msg}`);
  fs.appendFileSync(STATUS_LOG_PATH, `${msg}\n`, "utf-8");
  if (onProgress) {
    onProgress(msg);
  }
}

export async function runCustomNvidiaAgent(
  prompt: string,
  apiKey: string,
  model: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const selectedModel = model || "meta/llama-3.3-70b-instruct";
  
  // Write Start Header to status file
  const startHeader = `================================================
CUSTOM NVIDIA AGENT START
MODEL: ${selectedModel}
TIME: ${new Date().toISOString()}
PROMPT: ${prompt}
================================================\n\n`;
  fs.writeFileSync(STATUS_LOG_PATH, startHeader, "utf-8");

  logProgress("Initializing agent conversation history...", onProgress);

  const systemInstruction = `You are an autonomous AI coding agent called "Nova Developer Agent".
Your task is to accomplish the user's objective: "${prompt}"

You operate inside the directory "${PROJECT_ROOT}". You have complete passwordless sudo authority to edit files, compile, test, or run scripts.
You run in a Reasoning + Action loop. In each turn, you MUST analyze observations and output:
1. Thought: A brief description of what you need to do next.
2. Action: A single JSON block matching one of the tools below.

Do not output code blocks or text outside this format. Only output:
Thought: <your thought>
Action: { "name": "tool_name", "args": { "arg_name": "arg_value" } }

Available tools:
- list_dir: { "path": string } - recursively lists files in a path (relative to project root). Use "." to list root.
- read_file: { "path": string } - reads content of a file.
- write_file: { "path": string, "content": string } - creates or overwrites a file.
- run_command: { "cmd": string } - executes a terminal command (e.g. "npm test", "node test.js", "npm run build").
- finish: { "summary": string } - completes the task.

Always check the directory layout first using list_dir if you do not know the files.
Write and compile code, and run tests to verify your edits are working before calling finish.`;

  const conversationHistory: any[] = [
    { role: "system", content: systemInstruction },
    { role: "user", content: `Objective: ${prompt}\nBegin your execution now.` }
  ];

  let currentStep = 1;
  const maxSteps = 15;
  let finished = false;
  let finalSummary = "Agent timed out or reached execution limit.";

  while (currentStep <= maxSteps && !finished) {
    logProgress(`\n--- Step ${currentStep} / ${maxSteps} ---`, onProgress);
    
    try {
      logProgress(`Querying NVIDIA model ${selectedModel}...`, onProgress);
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: conversationHistory,
          temperature: 0.1,
          max_tokens: 2000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`NVIDIA API HTTP error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "";
      
      logProgress(`[Agent Output]:\n${reply}`, onProgress);
      conversationHistory.push({ role: "assistant", content: reply });

      // Parse Thought and Action
      const actionMatch = reply.match(/Action:\s*(\{[\s\S]*\})/);
      if (!actionMatch) {
        logProgress("ERROR: Could not parse Action JSON block. Asking agent to correct its format.", onProgress);
        conversationHistory.push({
          role: "user",
          content: "Format Error: Please output 'Thought: <reasoning>' followed by 'Action: { \"name\": \"...\", \"args\": { ... } }' strictly."
        });
        currentStep++;
        continue;
      }

      let action: { name: string; args: any };
      try {
        action = JSON.parse(actionMatch[1]);
      } catch (err: any) {
        logProgress(`ERROR: Action block is not valid JSON. ${err.message}`, onProgress);
        conversationHistory.push({
          role: "user",
          content: `JSON Error: ${err.message}. Please correct your Action JSON block.`
        });
        currentStep++;
        continue;
      }

      logProgress(`Executing tool: ${action.name} with args: ${JSON.stringify(action.args)}`, onProgress);

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
            const list = files.map(f => `${f.isDirectory() ? "[DIR]" : "[FILE]"} ${f.name}`).join("\n");
            toolOutput = `Files in "${relPath}":\n${list || "(empty)"}`;
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
          toolOutput = `ERROR: Unknown tool "${action.name}". Available tools are: list_dir, read_file, write_file, run_command, finish.`;
        }
      }

      logProgress(`Tool Result:\n${toolOutput.substring(0, 1000)}${toolOutput.length > 1000 ? "\n...[TRUNCATED]" : ""}`, onProgress);
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
