import React, { useState } from 'react';

/**
 * 聊天气泡（骨架）：
 * - 助手正文：流式追加渲染（后续接 Markdown + 代码高亮）
 * - 思考内容：独立折叠区，对应 deepseek-reasoner 的 reasoning_content
 * - 工具调用：渲染为卡片，而不是混在正文里
 * 这里只依赖 harness 的事件/消息类型，不直接调用编辑器 API。
 */

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  toolCards?: { id: string; name: string; status: 'waiting-approval' | 'running' | 'done' | 'failed'; summary?: string }[];
}

export function MessageBubble({ message }: { message: UiMessage }) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const isUser = message.role === 'user';
  return (
    <div className={`zovax-bubble zovax-bubble--${message.role}`}>
      {message.reasoning ? (
        <div className="zovax-reasoning">
          <button type="button" onClick={() => setReasoningOpen((v) => !v)}>
            {reasoningOpen ? '收起思考过程' : '展开思考过程'}
          </button>
          {reasoningOpen ? <pre>{message.reasoning}</pre> : null}
        </div>
      ) : null}
      <div className="zovax-bubble__content">{message.content}</div>
      {message.toolCards?.map((card) => (
        <div key={card.id} className={`zovax-tool-card zovax-tool-card--${card.status}`}>
          <span className="zovax-tool-card__name">{card.name}</span>
          <span className="zovax-tool-card__status">{card.status}</span>
          {card.summary ? <div className="zovax-tool-card__summary">{card.summary}</div> : null}
        </div>
      ))}
      {isUser ? null : null}
    </div>
  );
}

export function ChatView({ messages }: { messages: UiMessage[] }) {
  return (
    <div className="zovax-chat">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
    </div>
  );
}
