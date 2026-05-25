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
