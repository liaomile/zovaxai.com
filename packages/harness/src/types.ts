/**
 * Harness 与界面层共用的事件与消息类型。
 * Harness 不依赖任何编辑器 API，界面层只消费这里定义的事件流来渲染气泡与工作流。
 */

export interface ToolCall {
  id: string;
  name: string;
  /** JSON 字符串形式的工具参数（与 DeepSeek/OpenAI function calling 一致） */
  arguments: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** deepseek-reasoner 的思考内容，与正文分开传递，界面渲染为可折叠气泡 */
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  /** role === 'tool' 时对应的 tool_call id */
  toolCallId?: string;
}

/** Harness 向界面层推送的流式事件（工作流时间线与气泡都由它驱动） */
export type HarnessEvent =
  | { type: 'reasoning-delta'; text: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call-start'; call: ToolCall }
  | { type: 'tool-call-approval-needed'; call: ToolCall }
  | { type: 'tool-call-result'; callId: string; ok: boolean; summary: string }
  | { type: 'step'; title: string; status: 'running' | 'done' | 'failed' }
  | { type: 'checkpoint'; id: string; label: string }
  | { type: 'done'; reason: 'completed' | 'aborted' | 'error'; message?: string };

/** 工具执行结果，由编辑器侧的适配层返回 */
export interface ToolResult {
  ok: boolean;
  /** 回给模型的结果文本（大输出需在适配层截断/摘要） */
  content: string;
}

/** 工具执行器：由 VS Code 侧实现并注入，harness 本身不知道编辑器的存在 */
export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResult>;
}

/** 审批闸口：写文件、执行命令等有副作用的工具调用必须先过这里 */
export interface ApprovalGate {
  approve(call: ToolCall): Promise<boolean>;
}
