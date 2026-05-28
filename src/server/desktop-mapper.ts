/**
 * Desktop Mapper: Maps active windows, applications, and user context
 * Provides environmental awareness for autonomous decision-making
 */

interface ApplicationInfo {
  name: string;
  type: "browser" | "editor" | "terminal" | "chat" | "media" | "system" | "other";
  isActive: boolean;
  lastActive?: number;
}

interface DesktopContext {
  timestamp: number;
  activeApp: ApplicationInfo | null;
  runningApps: ApplicationInfo[];
  recentActivity: string[];
  timeOfDay: string;
  userContext?: string;
}

const contextHistory: DesktopContext[] = [];
const maxHistoryLength = 50;

/**
 * Classify application by name/process
 */
function classifyApplication(name: string): ApplicationInfo["type"] {
  const lower = name.toLowerCase();

  if (lower.includes("firefox") || lower.includes("chrome") || lower.includes("safari") || lower.includes("edge")) {
    return "browser";
  }
  if (lower.includes("code") || lower.includes("vim") || lower.includes("nano") || lower.includes("sublime")) {
    return "editor";
  }
  if (lower.includes("terminal") || lower.includes("bash") || lower.includes("shell") || lower.includes("cmd")) {
    return "terminal";
  }
  if (lower.includes("slack") || lower.includes("discord") || lower.includes("telegram") || lower.includes("teams")) {
    return "chat";
  }
  if (lower.includes("vlc") || lower.includes("spotify") || lower.includes("youtube")) {
    return "media";
  }
  if (lower.includes("settings") || lower.includes("system")) {
    return "system";
  }

  return "other";
}

/**
 * Get time of day context
 */
function getTimeContext(): string {
  const hour = new Date().getHours();
  if (hour < 6) return "early_morning";
  if (hour < 9) return "morning";
  if (hour < 12) return "late_morning";
  if (hour < 14) return "noon";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  if (hour < 24) return "night";
  return "late_night";
}

/**
 * Build current desktop context
 */
export async function captureDesktopContext(
  runningApps: string[] = [],
  activeApp?: string
): Promise<DesktopContext> {
  const context: DesktopContext = {
    timestamp: Date.now(),
    activeApp: activeApp
      ? {
          name: activeApp,
          type: classifyApplication(activeApp),
          isActive: true,
        }
      : null,
    runningApps: runningApps.map((app) => ({
      name: app,
      type: classifyApplication(app),
      isActive: app === activeApp,
      lastActive: Date.now(),
    })),
    recentActivity: [],
    timeOfDay: getTimeContext(),
  };

  // Keep history
  contextHistory.push(context);
  if (contextHistory.length > maxHistoryLength) {
    contextHistory.shift();
  }

  console.log(`[DESKTOP_MAPPER] Context: ${context.activeApp?.name || "None"} (${context.runningApps.length} apps)`);
  return context;
}

/**
 * Identify what user is likely doing
 */
export function inferUserActivity(): string {
  if (contextHistory.length === 0) return "idle";

  const recent = contextHistory.slice(-5);
  const appCounts = new Map<string, number>();

  recent.forEach((ctx) => {
    if (ctx.activeApp) {
      appCounts.set(ctx.activeApp.type, (appCounts.get(ctx.activeApp.type) || 0) + 1);
    }
  });

  const mostCommon = Array.from(appCounts.entries()).sort((a, b) => b[1] - a[1])[0];

  if (!mostCommon) return "idle";

  const [appType, count] = mostCommon;

  if (count >= 3) {
    switch (appType) {
      case "editor":
        return "coding";
      case "terminal":
        return "command_execution";
      case "browser":
        return "web_browsing";
      case "chat":
        return "communication";
      case "media":
        return "media_consumption";
      default:
        return appType;
    }
  }

  return "multitasking";
}

/**
 * Check if environment is suitable for action
 */
export function isEnvironmentReady(requiredApp?: string, blockedApps?: string[]): boolean {
  if (contextHistory.length === 0) {
    console.warn("[DESKTOP_MAPPER] No context available");
    return false;
  }

  const current = contextHistory[contextHistory.length - 1];

  if (requiredApp && current.activeApp?.name !== requiredApp) {
    console.warn(`[DESKTOP_MAPPER] Required app not active: ${requiredApp}`);
    return false;
  }

  if (blockedApps && current.activeApp && blockedApps.includes(current.activeApp.name)) {
    console.warn(`[DESKTOP_MAPPER] Blocked app is active: ${current.activeApp.name}`);
    return false;
  }

  return true;
}

/**
 * Get context for decision-making
 */
export function getDecisionContext(): {
  currentActivity: string;
  timeOfDay: string;
  activeApp: string | null;
  appCount: number;
  contextStability: number; // 0-100: how stable is the current state
} {
  if (contextHistory.length === 0) {
    return {
      currentActivity: "idle",
      timeOfDay: getTimeContext(),
      activeApp: null,
      appCount: 0,
      contextStability: 0,
    };
  }

  const current = contextHistory[contextHistory.length - 1];
  const recent = contextHistory.slice(-10);

  // Calculate stability: how consistent is the active app
  const activeAppStability = recent.filter((c) => c.activeApp?.name === current.activeApp?.name).length;

  return {
    currentActivity: inferUserActivity(),
    timeOfDay: current.timeOfDay,
    activeApp: current.activeApp?.name || null,
    appCount: current.runningApps.length,
    contextStability: Math.round((activeAppStability / recent.length) * 100),
  };
}

/**
 * Wait for environment to be ready
 */
export async function waitForEnvironment(
  requiredApp?: string,
  timeoutMs: number = 30000
): Promise<boolean> {
  const startTime = Date.now();

  console.log(`[DESKTOP_MAPPER] Waiting for environment... (required: ${requiredApp || "any"})`);

  while (Date.now() - startTime < timeoutMs) {
    if (isEnvironmentReady(requiredApp)) {
      console.log(`[DESKTOP_MAPPER] ✅ Environment ready`);
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  console.warn(`[DESKTOP_MAPPER] ⚠️ Environment not ready within ${timeoutMs}ms`);
  return false;
}

/**
 * Get history of context changes
 */
export function getContextHistory(): DesktopContext[] {
  return [...contextHistory];
}

/**
 * Analyze application switching patterns
 */
export function analyzeAppSwitching(): {
  frequentApps: Array<{ name: string; type: string; frequency: number }>;
  switchCount: number;
  averageSessionLength: number;
} {
  if (contextHistory.length < 2) {
    return {
      frequentApps: [],
      switchCount: 0,
      averageSessionLength: 0,
    };
  }

  const appCounts = new Map<string, number>();
  let switchCount = 0;
  let prevApp = null;
  const sessionLengths: number[] = [];

  contextHistory.forEach((ctx, i) => {
    const currentApp = ctx.activeApp?.name;

    if (currentApp !== prevApp) {
      switchCount++;
      if (prevApp && i > 0) {
        const prevCtx = contextHistory[i - 1];
        sessionLengths.push(ctx.timestamp - prevCtx.timestamp);
      }
      prevApp = currentApp;
    }

    if (currentApp) {
      appCounts.set(currentApp, (appCounts.get(currentApp) || 0) + 1);
    }
  });

  const frequentApps = Array.from(appCounts.entries())
    .map(([name, count]) => ({
      name,
      type: classifyApplication(name),
      frequency: count,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5);

  const averageSessionLength =
    sessionLengths.length > 0 ? Math.round(sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length) : 0;

  return {
    frequentApps,
    switchCount,
    averageSessionLength,
  };
}

/**
 * Clear context history
 */
export function clearContextHistory(): void {
  contextHistory.length = 0;
  console.log("[DESKTOP_MAPPER] Context history cleared");
}

/**
 * Export context summary
 */
export function getContextSummary(): {
  snapshotCount: number;
  uniqueApps: number;
  currentActivity: string;
  timeSpan: number; // milliseconds
} {
  if (contextHistory.length === 0) {
    return {
      snapshotCount: 0,
      uniqueApps: 0,
      currentActivity: "idle",
      timeSpan: 0,
    };
  }

  const uniqueApps = new Set(contextHistory.map((c) => c.activeApp?.name).filter(Boolean)).size;

  const timeSpan = contextHistory[contextHistory.length - 1].timestamp - contextHistory[0].timestamp;

  return {
    snapshotCount: contextHistory.length,
    uniqueApps,
    currentActivity: inferUserActivity(),
    timeSpan,
  };
}
