/** Locale keys owned by the deliverables turn-tail row. */
export type DeliverablesKey =
  | 'produced.summary'
  | 'produced.summaryOne'
  | 'produced.summaryLead'
  | 'produced.summaryLeadOne'
  | 'produced.edited'
  | 'produced.open'
  | 'produced.showInFolder'

export const NS = 'deliverables' as const

export const zh: Record<DeliverablesKey, string> = {
  'produced.summary': '已编辑 {count} 个文件 +{added} −{removed}',
  'produced.summaryOne': '已编辑 1 个文件 +{added} −{removed}',
  'produced.summaryLead': '已编辑 {count} 个文件',
  'produced.summaryLeadOne': '已编辑 1 个文件',
  'produced.edited': '已编辑',
  'produced.open': '打开 {name}',
  'produced.showInFolder': '在文件夹中显示',
}

export const en: Record<DeliverablesKey, string> = {
  'produced.summary': 'Edited {count} files +{added} −{removed}',
  'produced.summaryOne': 'Edited 1 file +{added} −{removed}',
  'produced.summaryLead': 'Edited {count} files',
  'produced.summaryLeadOne': 'Edited 1 file',
  'produced.edited': 'Edited',
  'produced.open': 'Open {name}',
  'produced.showInFolder': 'Show in folder',
}
