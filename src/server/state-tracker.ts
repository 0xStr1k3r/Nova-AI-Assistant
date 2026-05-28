/**
 * State Tracker: Maintains UI state, window context, and execution history
 * Enables context-aware autonomous decision making
 */

interface WindowInfo {
  id: string;
  title: string;
  appName: string;
  focused: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  lastActive: number;
}

interface DesktopState {
  timestamp: number;
  activeWindow: WindowInfo | null;
  openWindows: WindowInfo[];
  screenResolution: { width: number; height: number };
  userContext?: string;
}

interface ActionContext {
  userGoal: string;
  currentStep: number;
  totalSteps: number;
  previousAction?: string;
  stateHistory: DesktopState[];
  successRate: number;
}

interface ExecutionMemory {
  goals: Map<string, ActionContext>;
  stateSnapshots: Map<string, DesktopState>;
  failedAttempts: Array<{ action: string; reason: string; timestamp: number }>;
  successfulActions: Array<{ action: string; timestamp: number }>;
}

const executionMemory: ExecutionMemory = {
  goals: new Map(),
  stateSnapshots: new Map(),
  failedAttempts: [],
  successfulActions: [],
};

/**
 * Record current desktop state
 */
export function recordDesktopState(state: DesktopState, label?: string): void {
  const key = label || `state-${state.timestamp}`;
  executionMemory.stateSnapshots.set(key, state);
  console.log(`[STATE_TRACKER] Recorded state: ${key}`);
}

/**
 * Get last recorded state
 */
export function getLastState(): DesktopState | null {
  const states = Array.from(executionMemory.stateSnapshots.values());
  return states.length > 0 ? states[states.length - 1] : null;
}

/**
 * Start tracking a goal/task
 */
export function trackGoal(goalId: string, goal: string, totalSteps: number): ActionContext {
  const context: ActionContext = {
    userGoal: goal,
    currentStep: 0,
    totalSteps,
    stateHistory: [],
    successRate: 0,
  };

  executionMemory.goals.set(goalId, context);
  console.log(`[STATE_TRACKER] Tracking goal: ${goalId} (${totalSteps} steps)`);
  return context;
}

/**
 * Update goal progress
 */
export function updateGoalProgress(
  goalId: string,
  stepNumber: number,
  success: boolean,
  state?: DesktopState
): ActionContext | null {
  const context = executionMemory.goals.get(goalId);
  if (!context) return null;

  context.currentStep = stepNumber;
  if (state) context.stateHistory.push(state);

  const successCount = executionMemory.successfulActions.filter((a) => a.action.includes(goalId)).length;
  context.successRate = Math.round((successCount / (context.currentStep || 1)) * 100);

  console.log(
    `[STATE_TRACKER] Goal progress: ${goalId} (${stepNumber}/${context.totalSteps}, ${context.successRate}% success)`
  );

  if (stepNumber >= context.totalSteps && success) {
    console.log(`[STATE_TRACKER] ✅ Goal complete: ${goalId}`);
    executionMemory.goals.delete(goalId);
  }

  return context;
}

/**
 * Get goal context
 */
export function getGoalContext(goalId: string): ActionContext | null {
  return executionMemory.goals.get(goalId) || null;
}

/**
 * Record failed action
 */
export function recordFailedAction(action: string, reason: string): void {
  executionMemory.failedAttempts.push({
    action,
    reason,
    timestamp: Date.now(),
  });

  // Keep only recent failures
  if (executionMemory.failedAttempts.length > 100) {
    executionMemory.failedAttempts.shift();
  }

  console.log(`[STATE_TRACKER] Failed: ${action} (${reason})`);
}

/**
 * Record successful action
 */
export function recordSuccessfulAction(action: string): void {
  executionMemory.successfulActions.push({
    action,
    timestamp: Date.now(),
  });

  // Keep only recent successes
  if (executionMemory.successfulActions.length > 100) {
    executionMemory.successfulActions.shift();
  }

  console.log(`[STATE_TRACKER] ✅ Success: ${action}`);
}

/**
 * Get action statistics
 */
export function getActionStats(): {
  totalAttempts: number;
  successRate: number;
  recentFailures: string[];
  topSuccessfulActions: string[];
} {
  const total = executionMemory.failedAttempts.length + executionMemory.successfulActions.length;
  const successRate = total === 0 ? 0 : Math.round((executionMemory.successfulActions.length / total) * 100);

  // Get recent failures
  const recentFailures = executionMemory.failedAttempts
    .slice(-5)
    .map((f) => `${f.action} (${f.reason})`);

  // Get most common successful actions
  const actionCounts = new Map<string, number>();
  executionMemory.successfulActions.forEach((a) => {
    actionCounts.set(a.action, (actionCounts.get(a.action) || 0) + 1);
  });

  const topSuccessfulActions = Array.from(actionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((e) => `${e[0]} (${e[1]}x)`);

  return {
    totalAttempts: total,
    successRate,
    recentFailures,
    topSuccessfulActions,
  };
}

/**
 * Check if action was recently attempted (retry detection)
 */
export function wasRecentlyAttempted(action: string, withinMs: number = 5000): boolean {
  const now = Date.now();
  const recent = executionMemory.failedAttempts.filter((f) => {
    return f.action === action && now - f.timestamp < withinMs;
  });

  return recent.length > 0;
}

/**
 * Get failure pattern analysis
 */
export function analyzeFailurePatterns(): {
  commonFailures: Array<{ action: string; count: number; lastReason: string }>;
  failureRate: number;
} {
  const failureMap = new Map<string, { count: number; lastReason: string }>();

  executionMemory.failedAttempts.forEach((f) => {
    const entry = failureMap.get(f.action) || { count: 0, lastReason: "" };
    entry.count++;
    entry.lastReason = f.reason;
    failureMap.set(f.action, entry);
  });

  const commonFailures = Array.from(failureMap.entries())
    .map(([action, data]) => ({ action, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const total = executionMemory.failedAttempts.length + executionMemory.successfulActions.length;
  const failureRate = total === 0 ? 0 : Math.round((executionMemory.failedAttempts.length / total) * 100);

  return {
    commonFailures,
    failureRate,
  };
}

/**
 * Clear history for new session
 */
export function clearExecutionHistory(): void {
  executionMemory.goals.clear();
  executionMemory.stateSnapshots.clear();
  executionMemory.failedAttempts = [];
  executionMemory.successfulActions = [];
  console.log("[STATE_TRACKER] Execution history cleared");
}

/**
 * Export execution summary
 */
export function getExecutionSummary(): {
  activeGoals: number;
  totalAttempts: number;
  successRate: number;
  executionTime: number;
  stateSnapshots: number;
} {
  const stats = getActionStats();
  const firstAttempt = [
    ...executionMemory.failedAttempts,
    ...executionMemory.successfulActions,
  ].sort((a, b) => a.timestamp - b.timestamp)[0];

  const lastAttempt = [
    ...executionMemory.failedAttempts,
    ...executionMemory.successfulActions,
  ].sort((a, b) => b.timestamp - a.timestamp)[0];

  const executionTime = firstAttempt && lastAttempt ? lastAttempt.timestamp - firstAttempt.timestamp : 0;

  return {
    activeGoals: executionMemory.goals.size,
    totalAttempts: stats.totalAttempts,
    successRate: stats.successRate,
    executionTime,
    stateSnapshots: executionMemory.stateSnapshots.size,
  };
}
