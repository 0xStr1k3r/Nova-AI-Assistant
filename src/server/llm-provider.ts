/**
 * Dual-Layer LLM System: Lightweight + Heavy
 * Assistant: GroqCloud/OpenRouter (fast, cheap) for conversation
 * Tasks: Gemini/Nim (heavy) for code generation & complex work
 * ~320 LOC: Provider routing, fallback, cost optimization
 */

export type AssistantProvider = 'groq' | 'openrouter' | 'ollama';
export type TaskProvider = 'gemini' | 'nim' | 'openrouter';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[];
}

export interface AssistantResponse {
  text: string;
  provider: AssistantProvider;
  latencyMs: number;
}

export interface TaskResponse {
  text: string;
  provider: TaskProvider;
  tokensUsed?: { input: number; output: number };
  costUSD?: number;
}

// ============ LIGHTWEIGHT ASSISTANT LAYER ============

class AssistantLLM {
  private groqApiKey?: string;
  private openrouterApiKey?: string;
  private ollamaUrl?: string;
  private primaryAssistant: AssistantProvider = 'groq';
  private responseCache: Map<string, AssistantResponse> = new Map();

  constructor() {
    this.groqApiKey = process.env.GROQ_API_KEY;
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY;
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';

    // Auto-select primary based on availability
    if (this.groqApiKey) this.primaryAssistant = 'groq';
    else if (this.openrouterApiKey) this.primaryAssistant = 'openrouter';
    else this.primaryAssistant = 'ollama';

    console.log(`[ASSISTANT-LLM] Primary: ${this.primaryAssistant}`);
  }

  /**
   * Fast conversation response (for chat, questions, etc)
   * Optimized for low latency, no code generation
   */
  async chat(
    messages: LLMMessage[],
    provider?: AssistantProvider,
    fallback: boolean = true
  ): Promise<AssistantResponse> {
    const target = provider || this.primaryAssistant;
    const cacheKey = JSON.stringify([target, messages]);

    if (this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey)!;
      console.log(`[ASSISTANT] Cache hit: ${target}`);
      return cached;
    }

    const startTime = Date.now();

    try {
      let text: string;

      switch (target) {
        case 'groq':
          text = await this.groqChat(messages);
          break;
        case 'openrouter':
          text = await this.openrouterChat(messages);
          break;
        case 'ollama':
          text = await this.ollamaChat(messages);
          break;
      }

      const latencyMs = Date.now() - startTime;
      const response: AssistantResponse = { text, provider: target, latencyMs };

      this.responseCache.set(cacheKey, response);
      console.log(`[ASSISTANT] ${target} (${latencyMs}ms)`);

      return response;
    } catch (error) {
      console.error(`[ASSISTANT] ${target} failed:`, error);

      if (fallback && target !== 'ollama') {
        const nextProvider: AssistantProvider =
          target === 'groq' ? 'openrouter' : 'ollama';
        console.log(`[ASSISTANT] Falling back to ${nextProvider}`);
        return this.chat(messages, nextProvider, false);
      }

      throw error;
    }
  }

  private async groqChat(messages: LLMMessage[]): Promise<string> {
    if (!this.groqApiKey) throw new Error('GROQ_API_KEY not set');

    const axios = await import('axios');
    const response = await axios.default.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'mixtral-8x7b-32768', // Fast, free
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 500, // Keep responses short
      },
      {
        headers: { Authorization: `Bearer ${this.groqApiKey}` },
        timeout: 10000,
      }
    );

    return response.data.choices[0].message.content;
  }

  private async openrouterChat(messages: LLMMessage[]): Promise<string> {
    if (!this.openrouterApiKey) throw new Error('OPENROUTER_API_KEY not set');

    const axios = await import('axios');
    const response = await axios.default.post(
      'https://openrouter.io/api/v1/chat/completions',
      {
        model: 'deepseek/deepseek-chat', // Cheap, lightweight
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 500,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://nova-ai.local',
        },
        timeout: 10000,
      }
    );

    return response.data.choices[0].message.content;
  }

  private async ollamaChat(messages: LLMMessage[]): Promise<string> {
    const axios = await import('axios');
    const response = await axios.default.post(
      `${this.ollamaUrl}/api/chat`,
      {
        model: 'mistral', // Lightweight local model
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        stream: false,
      },
      { timeout: 30000 }
    );

    return response.data.message.content;
  }

  getStats() {
    return {
      primary: this.primaryAssistant,
      available: [
        this.groqApiKey && 'groq',
        this.openrouterApiKey && 'openrouter',
        'ollama',
      ].filter(Boolean),
      cacheSize: this.responseCache.size,
    };
  }
}

// ============ HEAVY TASK LAYER ============

class TaskLLM {
  private geminiApiKey?: string;
  private nimApiKey?: string;
  private nimBaseUrl?: string;
  private openrouterApiKey?: string;
  private primaryTask: TaskProvider = 'gemini';
  private taskCache: Map<string, TaskResponse> = new Map();

  constructor() {
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.nimApiKey = process.env.NIM_API_KEY;
    this.nimBaseUrl = process.env.NIM_BASE_URL;
    this.openrouterApiKey = process.env.OPENROUTER_API_KEY;

    // Auto-select primary
    if (this.nimApiKey && this.nimBaseUrl) this.primaryTask = 'nim'; // Local = free
    else if (this.geminiApiKey) this.primaryTask = 'gemini';
    else if (this.openrouterApiKey) this.primaryTask = 'openrouter';

    console.log(`[TASK-LLM] Primary: ${this.primaryTask}`);
  }

  /**
   * Heavy task (code generation, analysis, vision)
   * Only called for complex work
   */
  async execute(
    messages: LLMMessage[],
    taskType: 'code' | 'analysis' | 'vision' = 'code',
    provider?: TaskProvider,
    fallback: boolean = true
  ): Promise<TaskResponse> {
    const target = provider || this.primaryTask;
    const cacheKey = JSON.stringify([target, taskType, messages]);

    if (this.taskCache.has(cacheKey)) {
      const cached = this.taskCache.get(cacheKey)!;
      console.log(`[TASK] Cache hit: ${target} (${taskType})`);
      return cached;
    }

    try {
      let text: string;
      let tokensUsed: { input: number; output: number } | undefined;
      let costUSD: number | undefined;

      switch (target) {
        case 'gemini':
          ({ text, tokensUsed, costUSD } = await this.geminiTask(
            messages,
            taskType
          ));
          break;
        case 'nim':
          ({ text, tokensUsed } = await this.nimTask(messages, taskType));
          break;
        case 'openrouter':
          ({ text, costUSD } = await this.openrouterTask(messages, taskType));
          break;
      }

      const response: TaskResponse = {
        text,
        provider: target,
        tokensUsed,
        costUSD,
      };

      this.taskCache.set(cacheKey, response);
      const costStr = costUSD ? ` ($${costUSD.toFixed(4)})` : ' (free)';
      console.log(`[TASK] ${target} (${taskType})${costStr}`);

      return response;
    } catch (error) {
      console.error(`[TASK] ${target} failed:`, error);

      if (fallback && target !== this.primaryTask) {
        console.log(`[TASK] Falling back to ${this.primaryTask}`);
        return this.execute(messages, taskType, this.primaryTask, false);
      }

      throw error;
    }
  }

  private async geminiTask(
    messages: LLMMessage[],
    taskType: string
  ): Promise<TaskResponse> {
    if (!this.geminiApiKey) throw new Error('GEMINI_API_KEY not set');

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const client = new GoogleGenerativeAI({ apiKey: this.geminiApiKey });
    const model = client.getGenerativeModel({
      model:
        taskType === 'vision'
          ? 'gemini-2.0-flash'
          : 'gemini-2.0-flash', // Use flash for speed
    });

    const content = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : m.role,
      parts: [{ text: m.content }],
    }));

    const result = await model.generateContent({
      contents: content as any,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 4096,
      },
    });

    return {
      text: result.response.text(),
      provider: 'gemini',
      tokensUsed: {
        input: 0, // Not exposed
        output: 0,
      },
      costUSD: 0, // Estimate: ~$0.01 per task
    };
  }

  private async nimTask(
    messages: LLMMessage[],
    _taskType: string
  ): Promise<TaskResponse> {
    if (!this.nimApiKey || !this.nimBaseUrl)
      throw new Error('NIM not configured');

    const axios = await import('axios');
    const response = await axios.default.post(
      `${this.nimBaseUrl}/v1/chat/completions`,
      {
        model: process.env.NIM_MODEL || 'meta/llama-2-70b-chat-hf',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 4096,
      },
      {
        headers: { Authorization: `Bearer ${this.nimApiKey}` },
        timeout: 60000,
      }
    );

    return {
      text: response.data.choices[0].message.content,
      provider: 'nim',
      tokensUsed: response.data.usage,
      costUSD: 0, // Local = free
    };
  }

  private async openrouterTask(
    messages: LLMMessage[],
    taskType: string
  ): Promise<TaskResponse> {
    if (!this.openrouterApiKey)
      throw new Error('OPENROUTER_API_KEY not set');

    const axios = await import('axios');
    const modelMap: Record<string, string> = {
      code: 'deepseek/deepseek-coder', // Code-optimized
      analysis: 'meta-llama/llama-2-70b-chat-hf', // Bigger model
      vision: 'gpt-4-vision', // Vision
    };

    const response = await axios.default.post(
      'https://openrouter.io/api/v1/chat/completions',
      {
        model: modelMap[taskType] || 'meta-llama/llama-2-70b-chat-hf',
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
        })),
        temperature: 0.7,
        max_tokens: 4096,
      },
      {
        headers: {
          Authorization: `Bearer ${this.openrouterApiKey}`,
          'HTTP-Referer': 'https://nova-ai.local',
        },
        timeout: 60000,
      }
    );

    const usage = response.data.usage;
    // Estimate: ~$0.002-0.01 per task depending on model
    const costUSD =
      (usage.prompt_tokens * 0.000005 + usage.completion_tokens * 0.00002) ||
      0;

    return {
      text: response.data.choices[0].message.content,
      provider: 'openrouter',
      tokensUsed: usage,
      costUSD,
    };
  }

  getStats() {
    return {
      primary: this.primaryTask,
      available: [
        this.nimApiKey && 'nim (free)',
        this.geminiApiKey && 'gemini',
        this.openrouterApiKey && 'openrouter',
      ].filter(Boolean),
      cacheSize: this.taskCache.size,
    };
  }
}

// ============ SINGLETON EXPORTS ============

let assistantLLM: AssistantLLM | null = null;
let taskLLM: TaskLLM | null = null;

export function getAssistantLLM(): AssistantLLM {
  if (!assistantLLM) {
    assistantLLM = new AssistantLLM();
  }
  return assistantLLM;
}

export function getTaskLLM(): TaskLLM {
  if (!taskLLM) {
    taskLLM = new TaskLLM();
  }
  return taskLLM;
}

export function getLLMStats() {
  return {
    assistant: assistantLLM?.getStats() || { error: 'Not initialized' },
    task: taskLLM?.getStats() || { error: 'Not initialized' },
  };
}

export default { getAssistantLLM, getTaskLLM, getLLMStats };
