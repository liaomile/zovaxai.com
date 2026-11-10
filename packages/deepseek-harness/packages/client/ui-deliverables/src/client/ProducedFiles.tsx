// ProducedFiles: Cursor-aligned turn-tail summary — "Edited N files +X −Y"
// with a chevron that collapses the per-edit list. Each edit row opens the
// right-side preview with applied hunks when available.

import { useState } from 'react'
import type { HostDescriptionSource } from '@deepseek-ai/dsh-client-connection/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { basename } from './turn-deliverables.ts'
import type { ProducedFilesMatch } from './turn-deliverables.ts'
import type { NS } from './locales.ts'
import css from './ProducedFiles.module.css'

/** Registration-side Host capability facts. */
export interface ProducedFilesInjected {
  /** Whether the browser itself is connected over loopback. */
  isLoopback: boolean
  hooks: {
    /** Current generation's Host description, bound by the slot renderer. */
    hostDescription: HostDescriptionSource
  }
}

/** Matched edits plus the opener, locale, and injected Host capability. */
export type ProducedFilesProps = Pick<TurnTailOwnerProps, 'openFile'> & {
  matched: ProducedFilesMatch
} & PropsLocale<typeof NS> & InjectFace<ProducedFilesInjected>

/** Compact +/- fragment (omit a side when its count is zero). */
function DiffCounts({ added, removed }: { added: number; removed: number }) {
  if (added === 0 && removed === 0) return null
  return (
    <span className={css.counts}>
      {added > 0 && <span className={css.added}>+{added}</span>}
      {removed > 0 && <span className={css.removed}>−{removed}</span>}
    </span>
  )
}

/**
 * Render one turn's mutations as a collapsible Edited-files summary.
 * @param props - selector match, the chat view's file opener, and the locale seat.
 */
export function ProducedFiles({
  matched, openFile, isLoopback, useHostDescription, t,
}: ProducedFilesProps) {
  const hostCanOpenPath = useHostDescription(description => description?.canOpenPath === true)
  const canOpenPath = isLoopback && hostCanOpenPath
  const [expanded, setExpanded] = useState(true)
  const { edits, fileCount, added, removed } = matched

  const summary = fileCount === 1
    ? t('produced.summaryOne', { added: String(added), removed: String(removed) })
    : t('produced.summary', {
      count: String(fileCount),
      added: String(added),
      removed: String(removed),
    })

  return (
    <div className={css.root} data-produced-files>
      <button
        type="button"
        className={css.summary}
        aria-expanded={expanded}
        onClick={() => { setExpanded(open => !open) }}
      >
        <span className={css.summaryText}>
          <span className={css.summaryLead}>
            {fileCount === 1
              ? t('produced.summaryLeadOne')
              : t('produced.summaryLead', { count: String(fileCount) })}
          </span>
          <DiffCounts added={added} removed={removed} />
        </span>
        <span className={`${css.chevron}${expanded ? ` ${css.chevronOpen}` : ''}`} aria-hidden>
          ▾
        </span>
        <span className={css.srOnly}>{summary}</span>
      </button>

      {expanded && (
        <ul className={css.list}>
          {edits.map((edit, index) => (
            <li key={`${edit.seq}:${edit.path}:${String(index)}`} className={css.item}>
              <span className={css.action}>{t('produced.edited')}</span>
              <button
                type="button"
                className={css.file}
                title={edit.path}
                aria-label={t('produced.open', { name: edit.path })}
                onClick={() => {
                  openFile(
                    edit.path,
                    edit.diffs.length > 0 ? { diffs: edit.diffs } : undefined,
                  )
                }}
              >
                {basename(edit.path)}
              </button>
              <DiffCounts added={edit.added} removed={edit.removed} />
            </li>
          ))}
        </ul>
      )}

      {canOpenPath && (
        <button type="button" className={css.showFolder} onClick={() => { openFile('.') }}>
          {t('produced.showInFolder')}
        </button>
      )}
    </div>
  )
}

/** @deprecated Width-fit helper kept for older tests; the collapsible list no longer measures chips. */
export function fitProducedFiles(
  available: number,
  _gap: number,
  chipWidths: readonly number[],
  _moreWidthsByShown: readonly (number | undefined)[],
): number {
  if (available <= 0) return chipWidths.length
  return Math.min(chipWidths.length, 6)
}
