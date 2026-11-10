/**
 * IDE Files tree: one-level browse with includeFiles, opens text into the
 * center workbench via ctx.layout begin/load actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconChevronRightOutline14, IconCodeOutline16, IconFolderClose16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DirectoryEntry, DirectoryListing } from '@deepseek-ai/dsh-client-runtime/client'
import css from './FilesExplorer.module.css'

export type FilesExplorerProps = {
  wide: boolean
  listDirectory: (
    path?: string,
    signal?: AbortSignal,
    options?: { includeFiles?: boolean },
  ) => Promise<DirectoryListing>
  readTextFile: (path: string, signal?: AbortSignal) => Promise<{ path: string; content: string; truncated: boolean }>
  beginOpenEditor: (path: string) => void
  setEditorLoaded: (path: string, content: string, truncated: boolean) => void
  setEditorError: (path: string, message: string) => void
  /** Optional workspace root to start from; absent lists Host home. */
  rootPath?: string | null
  t: (key: 'files.title' | 'files.empty' | 'files.error' | 'files.up') => string
}

/** Sort directories first, then files, both by name. */
function sortEntries(entries: readonly DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    const ak = a.kind === 'file' ? 1 : 0
    const bk = b.kind === 'file' ? 1 : 0
    if (ak !== bk) return ak - bk
    return a.name.localeCompare(b.name)
  })
}

/** Files activity panel. */
export function FilesExplorer({
  wide,
  listDirectory,
  readTextFile,
  beginOpenEditor,
  setEditorLoaded,
  setEditorError,
  rootPath,
  t,
}: FilesExplorerProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const gen = useRef(0)

  const load = useCallback(async (path?: string) => {
    const seq = ++gen.current
    setBusy(true)
    setError(null)
    const ac = new AbortController()
    try {
      const next = await listDirectory(path, ac.signal, { includeFiles: true })
      if (seq !== gen.current) return
      setListing(next)
    } catch (err: unknown) {
      if (seq !== gen.current) return
      setError(err instanceof Error ? err.message : String(err))
      setListing(null)
    } finally {
      if (seq === gen.current) setBusy(false)
    }
  }, [listDirectory])

  useEffect(() => {
    void load(rootPath ?? undefined)
  }, [load, rootPath])

  const openFile = useCallback(async (entry: DirectoryEntry) => {
    beginOpenEditor(entry.path)
    try {
      const file = await readTextFile(entry.path)
      setEditorLoaded(file.path, file.content, file.truncated)
    } catch (err: unknown) {
      setEditorError(entry.path, err instanceof Error ? err.message : String(err))
    }
  }, [beginOpenEditor, readTextFile, setEditorError, setEditorLoaded])

  if (!wide) {
    return <div className={css.railPlaceholder} aria-hidden />
  }

  const entries = sortEntries(
    (listing?.entries ?? []).filter(e => showHidden || !e.hidden),
  )
  const parentPath = listing !== null && listing.crumbs.length > 1
    ? listing.crumbs[listing.crumbs.length - 2]?.path
    : undefined

  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.title}>{t('files.title')}</span>
        <label className={css.hiddenToggle}>
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => { setShowHidden(e.target.checked) }}
          />
          .
        </label>
      </div>
      {listing !== null && (
        <div className={css.crumbs} title={listing.path}>
          {parentPath !== undefined && (
            <button type="button" className={css.up} onClick={() => { void load(parentPath) }}>
              {t('files.up')}
            </button>
          )}
          <span className={css.path}>{listing.path}</span>
        </div>
      )}
      {error !== null && <div className={css.error} role="alert">{error || t('files.error')}</div>}
      <div className={css.list} data-busy={busy || undefined}>
        {entries.length === 0 && !busy && error === null && (
          <div className={css.empty}>{t('files.empty')}</div>
        )}
        {entries.map((entry) => {
          const isDir = entry.kind !== 'file'
          return (
            <button
              key={entry.path}
              type="button"
              className={clsx(css.row, isDir ? css.dir : css.file)}
              onClick={() => {
                if (isDir) void load(entry.path)
                else void openFile(entry)
              }}
            >
              {isDir
                ? <IconFolderClose16 size={14} className={css.icon} />
                : <IconCodeOutline16 size={14} className={css.icon} />}
              <span className={css.name}>{entry.name}</span>
              {isDir && <IconChevronRightOutline14 size={12} className={css.chevron} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
