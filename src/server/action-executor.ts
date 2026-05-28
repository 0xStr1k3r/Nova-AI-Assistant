import { runVisionToActionLoop } from "./vision-to-action";

/**
 * Action Executor: High-level interface for autonomous tasks
 * Handles workflow sequencing and error recovery
 */

interface TaskStep {
  id: string;
  action: string;
  description: string;
  retries?: number;
}

interface WorkflowTask {
  id: string;
  name: string;
  steps: TaskStep[];
  context?: Record<string, any>;
}

interface ExecutionLog {
  taskId: string;
  step: TaskStep;
  success: boolean;
  message: string;
  timestamp: number;
  attemptsUsed: number;
}

interface WorkflowResult {
  taskId: string;
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  logs: ExecutionLog[];
  finalMessage: string;
}

/**
 * Execute a complete workflow task
 */
export async function executeWorkflow(task: WorkflowTask): Promise<WorkflowResult> {
  console.log(`[EXECUTOR] Starting task: ${task.name}`);

  const logs: ExecutionLog[] = [];
  let completedSteps = 0;

  for (const step of task.steps) {
    const maxRetries = step.retries ?? 2;
    let attempts = 0;
    let stepSuccess = false;

    while (attempts < maxRetries && !stepSuccess) {
      attempts++;
      console.log(`[EXECUTOR] Step ${step.id} (attempt ${attempts}/${maxRetries}): ${step.description}`);

      try {
        const result = await runVisionToActionLoop(step.action, 3);
        stepSuccess = result.success;

        logs.push({
          taskId: task.id,
          step,
          success: stepSuccess,
          message: result.verificationMessage,
          timestamp: Date.now(),
          attemptsUsed: attempts,
        });

        if (stepSuccess) {
          completedSteps++;
          console.log(`[EXECUTOR] ✅ Step completed: ${step.id}`);
        } else {
          console.warn(`[EXECUTOR] ⚠️ Step partial success: ${step.id} (${result.verificationMessage})`);
        }
      } catch (error: any) {
        console.error(`[EXECUTOR] ❌ Step failed: ${error.message}`);
        logs.push({
          taskId: task.id,
          step,
          success: false,
          message: error.message,
          timestamp: Date.now(),
          attemptsUsed: attempts,
        });
      }

      if (!stepSuccess && attempts < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    if (!stepSuccess) {
      console.warn(`[EXECUTOR] Step failed after ${maxRetries} retries: ${step.id}`);
      break;
    }
  }

  const allSuccess = completedSteps === task.steps.length;
  const result: WorkflowResult = {
    taskId: task.id,
    success: allSuccess,
    completedSteps,
    totalSteps: task.steps.length,
    logs,
    finalMessage: allSuccess
      ? `✅ Task completed: ${task.name} (${completedSteps}/${task.steps.length} steps)`
      : `⚠️ Task partially completed: ${completedSteps}/${task.steps.length} steps. ${logs
          .filter((l) => !l.success)
          .map((l) => l.step.id)
          .join(", ")} failed`,
  };

  console.log(`[EXECUTOR] ${result.finalMessage}`);
  return result;
}

/**
 * Execute a simple one-step action
 */
export async function executeSimpleAction(action: string): Promise<ExecutionLog> {
  console.log(`[EXECUTOR] Simple action: ${action}`);

  try {
    const result = await runVisionToActionLoop(action, 3);

    const log: ExecutionLog = {
      taskId: `simple-${Date.now()}`,
      step: { id: "action", action, description: action },
      success: result.success,
      message: result.verificationMessage,
      timestamp: Date.now(),
      attemptsUsed: 1,
    };

    console.log(`[EXECUTOR] Result: ${result.success ? "✅" : "❌"}`);
    return log;
  } catch (error: any) {
    console.error(`[EXECUTOR] Action failed: ${error.message}`);
    return {
      taskId: `simple-${Date.now()}`,
      step: { id: "action", action, description: action },
      success: false,
      message: error.message,
      timestamp: Date.now(),
      attemptsUsed: 1,
    };
  }
}

/**
 * Parse natural language command to workflow
 */
export function parseCommandToWorkflow(command: string): WorkflowTask | null {
  console.log(`[EXECUTOR] Parsing command: "${command}"`);

  // Simple pattern matching for common tasks
  if (command.match(/open|go to|navigate to|visit/i)) {
    const urlMatch = command.match(/(https?:\/\/[^\s]+|[\w.-]+\.\w+)/);
    if (urlMatch) {
      return {
        id: `navigate-${Date.now()}`,
        name: `Navigate to ${urlMatch[1]}`,
        steps: [
          {
            id: "navigate",
            action: `Open the browser and navigate to ${urlMatch[1]}`,
            description: `Navigate to ${urlMatch[1]}`,
          },
        ],
      };
    }
  }

  if (command.match(/click|press|tap/i)) {
    return {
      id: `click-${Date.now()}`,
      name: `Click action`,
      steps: [
        {
          id: "click",
          action: `Click on the element mentioned: ${command}`,
          description: command,
        },
      ],
    };
  }

  if (command.match(/type|enter|input/i)) {
    const textMatch = command.match(/"([^"]*)"|'([^']*)'/);
    const text = textMatch ? textMatch[1] || textMatch[2] : command;
    return {
      id: `type-${Date.now()}`,
      name: `Type text`,
      steps: [
        {
          id: "type",
          action: `Type the text: "${text}"`,
          description: `Enter: ${text}`,
        },
      ],
    };
  }

  // Generic fallback
  return {
    id: `generic-${Date.now()}`,
    name: command,
    steps: [
      {
        id: "execute",
        action: command,
        description: command,
      },
    ],
  };
}

/**
 * Execute command with automatic parsing
 */
export async function executeCommand(command: string): Promise<WorkflowResult | ExecutionLog> {
  const workflow = parseCommandToWorkflow(command);

  if (!workflow) {
    console.error("[EXECUTOR] Could not parse command");
    return {
      taskId: `error-${Date.now()}`,
      step: { id: "error", action: command, description: command },
      success: false,
      message: "Could not parse command",
      timestamp: Date.now(),
      attemptsUsed: 0,
    };
  }

  if (workflow.steps.length === 1) {
    return executeSimpleAction(workflow.steps[0].action);
  } else {
    return executeWorkflow(workflow);
  }
}
