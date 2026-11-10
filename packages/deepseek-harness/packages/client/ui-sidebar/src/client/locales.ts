/** `sidebar` namespace dictionaries: shell controls (brand row, New Session, fold toggle, activity). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
  'toggle.open': '打开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'activity.files': '文件',
  'activity.chat': '对话',
  'files.title': '文件',
  'files.empty': '此目录为空',
  'files.error': '无法读取目录',
  'files.up': '上级',
} satisfies Record<string, string>

/** The sidebar namespace key union. */
export type SidebarKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'session.new': 'New Session',
  'session.new.label': 'New session',
  'toggle.open': 'Open sidebar',
  'toggle.collapse': 'Collapse sidebar',
  'activity.files': 'Files',
  'activity.chat': 'Chat',
  'files.title': 'Files',
  'files.empty': 'This folder is empty',
  'files.error': 'Cannot read directory',
  'files.up': 'Up',
} satisfies Record<SidebarKey, string>
