/**
 * Container Runner - lightweight Docker orchestration helpers
 * Provides safe, resource-conscious functions to build/run/stop agent containers.
 * Intentionally minimal to avoid heavy dependencies; uses Docker CLI via child_process.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
const run = promisify(exec);

export interface RunOptions {
  imageTag?: string;
  containerName?: string;
  mounts?: Array<{ hostPath: string; containerPath: string; readonly?: boolean }>;
  env?: Record<string, string>;
  cpuShares?: number; // relative CPU shares
  memory?: string; // e.g., '256m'
}

export async function buildAgentImage(dockerfilePath = './src/server/nanoclaw/Dockerfile.agent', tag = 'nova-agent:latest') {
  const cmd = `docker build -f ${dockerfilePath} -t ${tag} .`;
  console.log('[CONTAINER] Building image:', cmd);
  const { stdout, stderr } = await run(cmd);
  if (stderr) console.warn('[CONTAINER] build stderr:', stderr);
  return stdout;
}

export async function runAgentContainer(options: RunOptions) {
  const tag = options.imageTag || 'nova-agent:latest';
  const name = options.containerName || `nova-agent-${Date.now()}`;
  const mounts = (options.mounts || [])
    .map(m => `-v ${m.hostPath}:${m.containerPath}${m.readonly ? ':ro' : ''}`)
    .join(' ');
  const envs = Object.entries(options.env || {})
    .map(([k, v]) => `-e ${k}='${v}'`)
    .join(' ');
  const cpu = options.cpuShares ? `--cpu-shares=${options.cpuShares}` : '';
  const mem = options.memory ? `--memory=${options.memory}` : '';

  const cmd = `docker run -d --name ${name} ${cpu} ${mem} ${envs} ${mounts} ${tag}`;
  console.log('[CONTAINER] Running:', cmd);
  const { stdout, stderr } = await run(cmd);
  if (stderr) console.warn('[CONTAINER] run stderr:', stderr);
  return stdout.trim();
}

export async function stopAgentContainer(containerName: string) {
  const cmd = `docker rm -f ${containerName}`;
  console.log('[CONTAINER] Stopping:', cmd);
  const { stdout, stderr } = await run(cmd);
  if (stderr) console.warn('[CONTAINER] stop stderr:', stderr);
  return stdout;
}

export async function listAgentContainers() {
  const cmd = `docker ps --filter "name=nova-agent" --format "{{.ID}}\t{{.Names}}\t{{.Status}}"`;
  const { stdout } = await run(cmd);
  return stdout.trim();
}

export default { buildAgentImage, runAgentContainer, stopAgentContainer, listAgentContainers };
