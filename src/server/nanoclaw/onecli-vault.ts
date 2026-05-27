/**
 * OneCLI Vault integration stub
 * Lightweight wrapper to request injected credentials for containers
 * This is a minimal interface; actual integration requires OneCLI SDK or REST calls.
 */

export async function fetchCredential(name: string): Promise<string | null> {
  // Placeholder: read from environment or a secure file mount in production
  // Keep lightweight: prefer injected env vars via orchestration
  const envName = name.toUpperCase();
  return process.env[envName] || null;
}

export async function injectCredentialsToEnv(containerEnv: Record<string,string>, keys: string[]) {
  for (const k of keys) {
    const val = await fetchCredential(k);
    if (val) containerEnv[k] = val;
  }
  return containerEnv;
}

export default { fetchCredential, injectCredentialsToEnv };
