/**
 * Right-side file preview: change stats + unified diff + final file body, plus
 * an HTML browser preview and a "+" menu to switch modes (Cursor-aligned).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { DiffBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, EditorDiffHunk, EditorPane } from './stores.ts'
import css from './WorkbenchPane.module.css'

export type WorkbenchPaneProps = PropsStore<ReturnType<typeof createLayoutStore>> & {
  /** Persist the current buffer through the Host write API. */
  saveFile: (path: string, content: string) => Promise<void>
  /** Open a path into this pane (used by the empty-state browser). */
  openFilePath: (path: string) => Promise<void>
  listDirectory: (path?: string) => Promise<{
    path: string
    entries: readonly { name: string; path: string; kind: string }[]
  }>
  openPath: (path: string) => Promise<void>
}

/** Count +/- lines the same way DiffBlock totals its footer. */
function diffStats(diffs: readonly EditorDiffHunk[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const hunk of diffs) {
    if (hunk.oldText !== null && hunk.oldText !== '') {
      const body = hunk.oldText.endsWith('\n') ? hunk.oldText.slice(0, -1) : hunk.oldText
      removed += body === '' ? 0 : body.split('\n').length
    }
    if (hunk.newText !== '') {
      const body = hunk.newText.endsWith('\n') ? hunk.newText.slice(0, -1) : hunk.newText
      added += body === '' ? 0 : body.split('\n').length
    }
  }
  return { added, removed }
}

/** True when the path is a static HTML document we can render in an iframe. */
function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path)
}

type PaneOption = { id: EditorPane; label: string }

/** Empty File tab: browse a directory and open files in-place. */
function FileBrowserEmpty({
  listDirectory, openFilePath, openPath,
}: Pick<WorkbenchPaneProps, 'listDirectory' | 'openFilePath' | 'openPath'>) {
  const [cwd, setCwd] = useState('')
  const [entries, setEntries] = useState<readonly { name: string; path: string; kind: string }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (path?: string) => {
    setBusy(true)
    setError(null)
    try {
      const listing = await listDirectory(path)
      setCwd(listing.path)
      setEntries(listing.entries)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [listDirectory])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className={css.root}>
      <div className={css.tabBar}>
        <div className={css.tab} title={cwd}>
          <span className={css.tabName}>{cwd || 'Browse files'}</span>
        </div>
        <div className={css.tabActions}>
          <button type="button" className={css.action} disabled={busy} onClick={() => { void load(cwd || undefined) }}>
            Refresh
          </button>
          <button
            type="button"
            className={css.action}
            disabled={cwd === ''}
            onClick={() => { void openPath(cwd) }}
          >
            Show folder
          </button>
          <button
            type="button"
            className={css.action}
            onClick={() => {
              const path = window.prompt('Open file path')
              if (path !== null && path.trim() !== '') void openFilePath(path.trim())
            }}
          >
            Open path…
          </button>
        </div>
      </div>
      {error !== null && <div className={css.error} role="alert">{error}</div>}
      <div className={css.body}>
        <ul className={css.dirList}>
          {cwd !== '' && (
            <li>
              <button
                type="button"
                className={css.dirItem}
                onClick={() => {
                  const sep = cwd.includes('\\') ? '\\' : '/'
                  const parts = cwd.replace(/[/\\]+$/, '').split(/[/\\]/)
                  if (parts.length > 1) {
                    parts.pop()
                    const parent = parts.join(sep)
                    void load(/^[A-Za-z]:$/.test(parent) ? `${parent}${sep}` : parent || sep)
                  }
                }}
              >
                ..
              </button>
            </li>
          )}
          {entries.map(entry => (
            <li key={entry.path}>
              <button
                type="button"
                className={css.dirItem}
                onClick={() => {
                  if (entry.kind === 'directory') void load(entry.path)
                  else void openFilePath(entry.path)
                }}
              >
                <span className={css.dirKind}>{entry.kind === 'directory' ? 'dir' : 'file'}</span>
                {entry.name}
              </button>
            </li>
          ))}
          {!busy && entries.length === 0 && (
            <li className={css.empty}>This folder is empty.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

/** Right-side IDE file preview pane. */
export function WorkbenchPane({
  useStore, actions, saveFile, openFilePath, listDirectory, openPath,
}: WorkbenchPaneProps) {
  const path = useStore(s => s.editorPath)
  const content = useStore(s => s.editorContent)
  const dirty = useStore(s => s.editorDirty)
  const truncated = useStore(s => s.editorTruncated)
  const error = useStore(s => s.editorError)
  const busy = useStore(s => s.editorBusy)
  const diffs = useStore(s => s.editorDiffs)
  const pane = useStore(s => s.editorPane)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const stats = useMemo(
    () => (diffs !== null && diffs.length > 0 ? diffStats(diffs) : null),
    [diffs],
  )
  const hasDiff = stats !== null
  const html = path !== null && isHtmlPath(path)

  const paneOptions = useMemo((): PaneOption[] => {
    const options: PaneOption[] = [{ id: 'result', label: '代码' }]
    if (html) options.push({ id: 'preview', label: '浏览器' })
    if (hasDiff) {
      options.push({ id: 'diff', label: '变更' }, { id: 'both', label: '对照' })
    }
    return options
  }, [hasDiff, html])

  // Prefer browser preview for HTML opens that have no mutation hunks yet.
  useEffect(() => {
    if (!html || hasDiff || path === null) return
    if (pane === 'result') actions.setEditorPane('preview')
  }, [actions, hasDiff, html, pane, path])

  const onChange = useCallback((value: string) => {
    actions.setEditorDraft(value)
    setSaveError(null)
  }, [actions])

  const onSave = useCallback(async () => {
    if (path === null || !dirty || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveFile(path, content)
      actions.markEditorSaved()
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [actions, content, dirty, path, saveFile, saving])

  if (path === null) {
    return (
      <FileBrowserEmpty
        listDirectory={listDirectory}
        openFilePath={openFilePath}
        openPath={openPath}
      />
    )
  }

  const baseName = path.replace(/^.*[/\\]/, '') || path
  const activePane = paneOptions.some(opt => opt.id === pane) ? pane : 'result'
  const showDiff = hasDiff && (activePane === 'diff' || activePane === 'both')
  const showResult = activePane === 'result' || activePane === 'both'
  const showPreview = activePane === 'preview'
  const showModeTabs = paneOptions.length > 1

  return (
    <div className={css.root}>
      <div className={css.tabBar}>
        <div className={css.tab} title={path} data-dirty={dirty || undefined}>
          <span className={css.tabName}>{baseName}{dirty ? ' •' : ''}</span>
          {stats !== null && (
            <span className={css.stats} aria-label={`added ${stats.added}, removed ${stats.removed}`}>
              <span className={css.added}>+{stats.added}</span>
              <span className={css.removed}>−{stats.removed}</span>
            </span>
          )}
          {html && showPreview && <span className={css.badge}>preview</span>}
          {truncated && <span className={css.badge}>truncated</span>}
          {busy && <span className={css.badge}>loading</span>}
        </div>
        <div className={css.tabActions}>
          <button
            type="button"
            className={css.action}
            disabled={!dirty || busy || saving || showPreview}
            onClick={() => { void onSave() }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className={css.action}
            onClick={() => { void openPath(path.replace(/[/\\][^/\\]+$/, '') || path) }}
          >
            Show folder
          </button>
          <button
            type="button"
            className={css.action}
            onClick={() => { actions.clearEditor() }}
          >
            Close
          </button>
        </div>
      </div>

      {showModeTabs && (
        <div className={css.paneTabs} role="tablist" aria-label="Preview mode">
          {paneOptions.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activePane === tab.id}
              className={clsx(css.paneTab, activePane === tab.id && css.paneTabActive)}
              onClick={() => { actions.setEditorPane(tab.id) }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {(error !== null || saveError !== null) && (
        <div className={css.error} role="alert">{error ?? saveError}</div>
      )}

      <div className={clsx(css.body, showDiff && showResult && css.bodySplit)}>
        {showDiff && diffs !== null && (
          <div className={css.diffPane}>
            <DiffBlock diffs={diffs} maxLines={80} className={css.diffBlock} />
          </div>
        )}
        {showResult && (
          <textarea
            className={css.editor}
            value={content}
            spellCheck={false}
            readOnly={busy}
            onChange={(e) => { onChange(e.target.value) }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                e.preventDefault()
                void onSave()
              }
            }}
            aria-label={baseName}
          />
        )}
        {showPreview && (
          <iframe
            className={css.preview}
            title={`${baseName} preview`}
            sandbox="allow-scripts allow-forms allow-modals"
            srcDoc={content}
          />
        )}
      </div>
    </div>
  )
}
