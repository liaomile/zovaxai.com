import type { ChatMessage, HarnessEvent, ToolCall } from './types.js';
import type { ToolDefinition } from './tools.js';

/**
 * DeepSeek 接入层。
 * DeepSeek API 与 OpenAI 格式兼容：POST https://api.deepseek.com/chat/completions
 * - deepseek-chat：执行与工具调用
 * - deepseek-reasoner：规划与推理，其 reasoning_content 与 content 分开返回，这里分通道成事件
 */

export interface DeepSeekOptions {
  apiKey: string;
  baseUrl?: string;
  /** 规划模型，默认 deepseek-reasoner */
  plannerModel?: string;
  /** 执行模型，默认 deepseek-chat */
  executorModel?: string;
}

type StreamEvent = Extract<HarnessEvent, { type: 'reasoning-delta' | 'text-delta' | 'tool-call-start' }>;

export class DeepSeekProvider {
  private readonly baseUrl: string;
  readonly plannerModel: string;
  readonly executorModel: string;

  constructor(private readonly options: DeepSeekOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.plannerModel = options.plannerModel ?? 'deepseek-reasoner';
    this.executorModel = options.executorModel ?? 'deepseek-chat';
  }

  /**
   * 发起一次流式对话，逐段产出事件；本轮若包含工具调用，
   * 在流结束后以 tool-call-start 事件逐个给出（参数已拼装完整）。
   */
  async *streamChat(
    messages: ChatMessage[],
    tools: ToolDefinition[],
    model: string,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent | { type: 'assistant-message'; message: ChatMessage }> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: messages.map(toApiMessage),
        tools: tools.length
          ? tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }))
          : undefined,
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`DeepSeek API 请求失败: ${response.status} ${response.statusText}`);
    }

    let content = '';
    let reasoning = '';
    const toolCalls = new Map<number, ToolCall>();

    for await (const chunk of parseSse(response.body)) {
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
        reasoning += delta.reasoning_content;
        yield { type: 'reasoning-delta', text: delta.reasoning_content };
      }
      if (typeof delta.content === 'string' && delta.content) {
        content += delta.content;
        yield { type: 'text-delta', text: delta.content };
      }
      for (const tc of delta.tool_calls ?? []) {
        const existing = toolCalls.get(tc.index) ?? { id: tc.id ?? '', name: tc.function?.name ?? '', arguments: '' };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.name = tc.function.name;
        if (tc.function?.arguments) existing.arguments += tc.function.arguments;
        toolCalls.set(tc.index, existing);
      }
    }

    const calls = [...toolCalls.values()].filter((c) => c.name);
    for (const call of calls) yield { type: 'tool-call-start', call };
    yield {
      type: 'assistant-message',
      message: {
        role: 'assistant',
        content,
        reasoningContent: reasoning || undefined,
        toolCalls: calls.length ? calls : undefined,
      },
    };
  }
}

function toApiMessage(m: ChatMessage): Record<string, unknown> {
  const base: Record<string, unknown> = { role: m.role, content: m.content };
  if (m.toolCalls?.length) {
    base.tool_calls = m.toolCalls.map((c) => ({
      id: c.id,
      type: 'function',
      function: { name: c.name, arguments: c.arguments },
    }));
  }
  if (m.toolCallId) base.tool_call_id = m.toolCallId;
  return base;
}

/** 极简 SSE 解析：按行切分 `data:` 负载，遇到 [DONE] 结束。 */
async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<any> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
        /* 忽略不完整的心跳/空行 */
      }
    }
  }
}
