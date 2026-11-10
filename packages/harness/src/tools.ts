/**
 * 工具定义（JSON Schema）。Harness 只声明工具长什么样、是否有副作用；
 * 真正的实现由编辑器侧的适配层提供，全部复用 VS Code 内嵌能力，不重造轮子。
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** 有副作用的工具（写文件、跑命令）必须经过 ApprovalGate 审批 */
  mutating: boolean;
}

const pathParam = {
  type: 'object',
  properties: { path: { type: 'string', description: '工作区相对路径' } },
  required: ['path'],
} as const;

export const builtinTools: ToolDefinition[] = [
  {
    name: 'read_file',
    description: '读取工作区内某个文件的全文。适配层实现：VS Code 文件服务。',
    parameters: pathParam,
    mutating: false,
  },
  {
    name: 'search_text',
    description: '在整个工作区按文本/正则搜索。适配层实现：VS Code 内置 ripgrep 搜索服务。',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' }, isRegex: { type: 'boolean' } },
      required: ['query'],
    },
    mutating: false,
  },
  {
    name: 'get_diagnostics',
    description: '读取当前工作区的报错与警告（Problems 面板 / LSP 诊断），用于定位需要修复的问题。',
    parameters: { type: 'object', properties: { path: { type: 'string', description: '可选，只看某个文件' } } },
    mutating: false,
  },
  {
    name: 'edit_file',
    description: '修改文件：给出完整的替换片段。适配层实现：WorkspaceEdit，改动先进入原生 diff 视图供用户确认。',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        oldText: { type: 'string', description: '要被替换的原文片段，必须与文件内容精确匹配' },
        newText: { type: 'string', description: '替换后的新片段' },
      },
      required: ['path', 'oldText', 'newText'],
    },
    mutating: true,
  },
  {
    name: 'run_command',
    description: '在集成终端执行命令并回收输出。适配层实现：VS Code 集成终端。',
    parameters: {
      type: 'object',
      properties: { command: { type: 'string' }, cwd: { type: 'string', description: '可选，工作区相对路径' } },
      required: ['command'],
    },
    mutating: true,
  },
];
