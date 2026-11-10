import React from 'react';

/**
 * 工作流时间线（骨架）：
 * 把一次任务渲染成可追踪的步骤流：计划 → 工具调用 → 审批 → 结果 → 检查点。
 * 数据来自 harness 的 HarnessEvent 事件流（step / tool-call-* / checkpoint）。
 */

export interface WorkflowStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done' | 'failed';
  detail?: string;
}

const STATUS_ICON: Record<WorkflowStep['status'], string> = {
  pending: '○',
  running: '◐',
  done: '●',
  failed: '✕',
};

export function WorkflowTimeline({ steps }: { steps: WorkflowStep[] }) {
  if (!steps.length) return null;
  return (
    <ol className="zovax-workflow">
      {steps.map((step) => (
        <li key={step.id} className={`zovax-workflow__step zovax-workflow__step--${step.status}`}>
          <span className="zovax-workflow__icon">{STATUS_ICON[step.status]}</span>
          <span className="zovax-workflow__title">{step.title}</span>
          {step.detail ? <div className="zovax-workflow__detail">{step.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}
