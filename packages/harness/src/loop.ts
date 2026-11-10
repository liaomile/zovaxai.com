import { DeepSeekProvider } from './provider.js';
import { builtinTools, type ToolDefinition } from './tools.js';
import type { ApprovalGate, ChatMessage, HarnessEvent, ToolExecutor } from './types.js';

/**
 * Agent 主循环（M2 骨架）：
 * 组装上下文 → 流式调用模型 → 收集工具调用 → 审批 → 执行 → 结果回灌 → 继续，直到模型不再调用工具。
 * 全程以 HarnessEvent 事件流对外推送，界面层据此渲染气泡与工作流时间线。
 */

export interface AgentLoopDeps {
  provider: DeepSeekProvider;
  executor: ToolExecutor;
  approval: ApprovalGate;
  tools?: ToolDefinition[];
  /** 单次任务最多迭代轮数，防止无限循环 */
  maxIterations?: number;
  /** 任务开始前建立检查点（由编辑器侧用 Git 实现），返回检查点 id */
  createCheckpoint?: (label: string) => Promise<string>;
}

export class AgentLoop {
  constructor(private readonly deps: AgentLoopDeps) {}

  async *run(history: ChatMessage[], signal?: AbortSignal): AsyncGenerator<HarnessEvent> {
    const tools = this.deps.tools ?? builtinTools;
    const maxIterations = this.deps.maxIterations ?? 25;
    const messages = [...history];

    if (this.deps.createCheckpoint) {
      const id = await this.deps.createCheckpoint('任务开始');
      yield { type: 'checkpoint', id, label: '任务开始' };
    }

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (signal?.aborted) {
        yield { type: 'done', reason: 'aborted' };
        return;
      }

      let assistantMessage: ChatMessage | undefined;
      const pendingCalls: string[] = [];
      try {
        for await (const event of this.deps.provider.streamChat(messages, tools, this.deps.provider.executorModel, signal)) {
          if (event.type === 'assistant-message') {
            assistantMessage = event.message;
          } else if (event.type === 'tool-call-start') {
            pendingCalls.push(event.call.id);
            yield event;
          } else {
            yield event;
          }
        }
      } catch (error) {
        yield { type: 'done', reason: 'error', message: error instanceof Error ? error.message : String(error) };
        return;
      }

      if (!assistantMessage) {
        yield { type: 'done', reason: 'error', message: '模型没有返回内容' };
        return;
      }
      messages.push(assistantMessage);

      const calls = assistantMessage.toolCalls ?? [];
      if (!calls.length) {
        yield { type: 'done', reason: 'completed' };
        return;
      }

      for (const call of calls) {
        const definition = tools.find((t) => t.name === call.name);
        if (definition?.mutating) {
          yield { type: 'tool-call-approval-needed', call };
          const approved = await this.deps.approval.approve(call);
          if (!approved) {
            messages.push({ role: 'tool', toolCallId: call.id, content: '用户拒绝了这次操作。' });
            yield { type: 'tool-call-result', callId: call.id, ok: false, summary: '用户拒绝' };
            continue;
          }
        }
        const result = await this.deps.executor.execute(call);
        messages.push({ role: 'tool', toolCallId: call.id, content: result.content });
        yield {
          type: 'tool-call-result',
          callId: call.id,
          ok: result.ok,
          summary: result.content.slice(0, 200),
        };
      }
    }

    yield { type: 'done', reason: 'error', message: `已达到最大迭代轮数 ${maxIterations}，任务中止` };
  }
}
