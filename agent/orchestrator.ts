import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import * as util from "util";
import { runCustomNvidiaAgent, cancelledAgents } from "./agent-loop";
import { selectBestModelForTask } from "./model-selector";
import { SubTask } from "./types";

const execAsync = util.promisify(exec);
const PROJECT_ROOT = "/home/chiru/antigravity/Nexus-OS-Voice-Assistant";

function logProgress(msg: string, logPath: string, onProgress?: (msg: string) => void) {
  console.log(`[NVIDIA-ORCHESTRATOR] ${msg}`);
  fs.appendFileSync(logPath, `${msg}\n`, "utf-8");
  if (onProgress) {
    onProgress(msg);
  }
}

function cleanJsonString(raw: string): string {
  let clean = raw.trim();
  if (clean.startsWith("```")) {
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      clean = clean.substring(firstBrace, lastBrace + 1);
    }
  }
  return clean;
}

export async function runOrchestratedNvidiaAgent(
  agentId: string,
  prompt: string,
  apiKey: string,
  model: string,
  logPath: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  // Ensure config dir exists
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const startHeader = `================================================
MULTI-AGENT ORCHESTRATOR START
TIME: ${new Date().toISOString()}
MAIN PROMPT: ${prompt}
================================================\n\n`;
  fs.writeFileSync(logPath, startHeader, "utf-8");

  logProgress("Initializing multi-agent orchestrator...", logPath, onProgress);
  logProgress("Decomposing main objective into sub-tasks for parallel execution...", logPath, onProgress);

  let tasks: SubTask[] = [];
  try {
    const decompositionPrompt = `You are "Nova Multi-Agent Architect", a coordinator that decomposes complex software engineering objectives into smaller, independent sub-tasks that can be executed in parallel.

Analyze the overall objective: "${prompt}"

Identify the project files. Decompose the objective into a list of 1 to 4 logical sub-tasks.
For each sub-task, provide:
1. A unique ID (e.g., "task_1", "task_2")
2. A descriptive title.
3. A detailed, self-contained prompt/instruction for the sub-agent (specifying files to read, changes to make, and constraints).
4. A list of dependencies (other task IDs that must finish before this task starts, e.g. ["task_1"]). If independent, leave dependencies empty.

Reply strictly in JSON format as a list of task objects:
{
  "tasks": [
    {
      "id": "task_1",
      "title": "...",
      "prompt": "...",
      "dependencies": []
    }
  ]
}`;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "meta/llama-3.3-70b-instruct",
        messages: [
          { role: "system", content: "You are a software architect that plans multi-agent workflows. Reply strictly in JSON format." },
          { role: "user", content: decompositionPrompt }
        ],
        temperature: 0.1,
        max_tokens: 1500
      })
    });

    if (response.ok) {
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || "";
      const cleanJson = cleanJsonString(reply);
      const parsed = JSON.parse(cleanJson);
      if (parsed.tasks && Array.isArray(parsed.tasks)) {
        tasks = parsed.tasks;
      }
    }
  } catch (err: any) {
    logProgress(`[Architect WARNING] Task decomposition failed: ${err.message}. Defaulting to single task mode.`, logPath, onProgress);
  }

  // Fallback if no tasks were generated or resolved
  if (tasks.length === 0) {
    tasks = [{
      id: "task_1",
      title: "Execute entire objective",
      prompt: prompt,
      dependencies: []
    }];
  }

  logProgress(`[Orchestrator] Decomposed into ${tasks.length} sub-tasks:`, logPath, onProgress);
  for (const t of tasks) {
    logProgress(` - [${t.id}] ${t.title} (Dependencies: ${JSON.stringify(t.dependencies)})`, logPath, onProgress);
  }

  // Track task statuses
  const taskStatus = new Map<string, "pending" | "running" | "completed" | "failed">();
  const taskLogs = new Map<string, string>();
  for (const t of tasks) {
    taskStatus.set(t.id, "pending");
  }

  let activePromises: { id: string; promise: Promise<string> }[] = [];
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // Scheduler Loop
  while (Array.from(taskStatus.values()).some(s => s === "pending" || s === "running")) {
    // 1. Check for cancelled state
    if (cancelledAgents.has(agentId)) {
      logProgress("[Orchestrator] Main agent cancelled by assistant. Aborting sub-tasks.", logPath, onProgress);
      for (const t of tasks) {
        if (taskStatus.get(t.id) === "running") {
          cancelledAgents.add(`${agentId}_${t.id}`);
        }
      }
      break;
    }

    // 2. Start pending tasks whose dependencies are met
    for (const t of tasks) {
      if (taskStatus.get(t.id) === "pending") {
        const depsMet = t.dependencies.every(depId => taskStatus.get(depId) === "completed");
        if (depsMet) {
          logProgress(`[Orchestrator] Starting task [${t.id}]: "${t.title}"...`, logPath, onProgress);
          taskStatus.set(t.id, "running");

          const subtaskLogPath = logPath.replace(".log", `_${t.id}.log`);
          // Select best model dynamically
          const subtaskModel = model === "auto" || !model ? selectBestModelForTask(t.prompt) : model;

          logProgress(`[Orchestrator] Task [${t.id}] routed to model: ${subtaskModel}`, logPath, onProgress);

          const subtaskPromise = runCustomNvidiaAgent(
            `${agentId}_${t.id}`,
            t.prompt,
            apiKey,
            subtaskModel,
            subtaskLogPath,
            (msg) => {
              // Pipe sub-agent updates directly into coordinator progress logs
              logProgress(`[Task ${t.id}] ${msg}`, logPath, onProgress);
            }
          );

          activePromises.push({ id: t.id, promise: subtaskPromise });
        }
      }
    }

    // 3. Check for resolved subtask promises
    if (activePromises.length > 0) {
      const resolvedIndex = await Promise.race(
        activePromises.map(async (ap, idx) => {
          try {
            const resSummary = await ap.promise;
            return { index: idx, id: ap.id, success: true, summary: resSummary };
          } catch (err: any) {
            return { index: idx, id: ap.id, success: false, summary: err.message };
          }
        })
      );

      // Remove from active promises
      activePromises.splice(resolvedIndex.index, 1);

      if (resolvedIndex.success) {
        logProgress(`[Orchestrator] Task [${resolvedIndex.id}] completed successfully!`, logPath, onProgress);
        taskStatus.set(resolvedIndex.id, "completed");
        taskLogs.set(resolvedIndex.id, resolvedIndex.summary);
      } else {
        logProgress(`[Orchestrator] Task [${resolvedIndex.id}] failed: ${resolvedIndex.summary}`, logPath, onProgress);
        taskStatus.set(resolvedIndex.id, "failed");
      }
    }

    await delay(1500);
  }

  // Synthesis & Diagnostics
  logProgress("\n[Orchestrator] All sub-tasks processed. Running synthesis & validation checks...", logPath, onProgress);

  // Check compile diagnostics
  let compileSuccess = false;
  let compileErrorMsg = "";
  try {
    logProgress("[Orchestrator] Compiling project using 'npm run build'...", logPath, onProgress);
    const { stdout, stderr } = await execAsync("npm run build", { cwd: PROJECT_ROOT, timeout: 60000 });
    compileSuccess = true;
    logProgress("[Orchestrator] Compile check passed successfully!", logPath, onProgress);
  } catch (err: any) {
    compileErrorMsg = `STDOUT:\n${err.stdout}\nSTDERR:\n${err.stderr}`;
    logProgress(`[Orchestrator WARNING] Compile check failed: ${err.message}.`, logPath, onProgress);
  }

  // Self-Correction: Spawn a fixer agent if compilation failed!
  if (!compileSuccess && !cancelledAgents.has(agentId)) {
    logProgress("[Orchestrator] Initiating autonomous compiler fixer agent to resolve build errors...", logPath, onProgress);
    const fixerPrompt = `The project compile failed after making changes. Fix all compilation and linter errors to make the build pass.

Compile Output:
${compileErrorMsg.substring(0, 3000)}`;

    const fixerLogPath = logPath.replace(".log", "_fixer.log");
    try {
      const fixerModel = "qwen/qwen3-coder-480b-a35b-instruct"; // Best coder for fixing build errors
      const fixerSummary = await runCustomNvidiaAgent(
        `${agentId}_fixer`,
        fixerPrompt,
        apiKey,
        fixerModel,
        fixerLogPath,
        (msg) => {
          logProgress(`[Fixer] ${msg}`, logPath, onProgress);
        }
      );

      // Re-run compile check
      const check = await execAsync("npm run build", { cwd: PROJECT_ROOT, timeout: 60000 });
      compileSuccess = true;
      logProgress("[Orchestrator] Fixer agent successfully repaired build errors. Build passes!", logPath, onProgress);
    } catch (fixErr: any) {
      logProgress(`[Orchestrator ERROR] Fixer agent failed to repair compile issues: ${fixErr.message}`, logPath, onProgress);
    }
  }

  // Compile final summary report
  const summaryParts = Array.from(taskLogs.entries()).map(([id, sum]) => `Subtask [${id}]: ${sum}`).join("\n");
  const finalSummaryReport = `Orchestration summary:\n${summaryParts}\nBuild status: ${compileSuccess ? "PASS" : "FAIL"}`;

  const endHeader = `\n================================================
MULTI-AGENT ORCHESTRATOR FINISHED
TIME: ${new Date().toISOString()}
SUMMARY: ${finalSummaryReport}
================================================\n`;
  fs.appendFileSync(logPath, endHeader, "utf-8");

  return finalSummaryReport;
}
