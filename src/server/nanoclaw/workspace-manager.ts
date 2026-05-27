import fs from 'fs/promises';
import path from 'path';

export interface WorkspaceInfo {
  agentGroupId: string;
  workspacePath: string;
  dbPath: string;
  claudePath: string;
}

const BASE = process.env.NOVA_AGENTS_PATH || path.join(process.env.HOME || '', '.config', 'nova', 'agents');

export async function initWorkspace(agentGroupId: string): Promise<WorkspaceInfo> {
  const agentPath = path.join(BASE, agentGroupId);
  const dbPath = path.join(agentPath, 'memory.sqlite');
  const claudePath = path.join(agentPath, 'CLAUDE.md');

  // Ensure base directories
  await fs.mkdir(agentPath, { recursive: true });

  // Create CLAUDE.md template if missing
  try {
    await fs.access(claudePath);
  } catch (err) {
    const claudeTemplate = `# CLAUDE.md - Agent workspace\n\nAgent: ${agentGroupId}\n\nDescription: `;
    await fs.writeFile(claudePath, claudeTemplate, { encoding: 'utf8' });
  }

  // Ensure SQLite file exists (touch)
  try {
    await fs.access(dbPath);
  } catch (err) {
    // create empty file
    await fs.writeFile(dbPath, '', { encoding: 'utf8' });
  }

  return {
    agentGroupId,
    workspacePath: agentPath,
    dbPath,
    claudePath,
  };
}

export function getContainerMountsForAgent(agentInfo: WorkspaceInfo): Array<{ hostPath: string; containerPath: string; readonly?: boolean }> {
  // Mount workspace to /var/lib/nova/agents/{agentGroupId}
  const containerBase = `/var/lib/nova/agents/${agentInfo.agentGroupId}`;
  return [
    { hostPath: agentInfo.workspacePath, containerPath: containerBase, readonly: false },
  ];
}

export function getWorkspacePath(agentGroupId: string) {
  return path.join(BASE, agentGroupId);
}

export default { initWorkspace, getContainerMountsForAgent, getWorkspacePath };
