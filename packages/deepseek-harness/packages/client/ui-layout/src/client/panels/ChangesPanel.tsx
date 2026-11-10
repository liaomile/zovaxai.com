import { useCallback, useEffect, useMemo, useState } from 'react'
import { DiffBlock } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, EditorDiffHunk } from '../stores.ts'
import type { RunCommandResult } from './TerminalPanel.tsx'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type GitChangeRow = {
  index: string
  worktree: string
  path: string
  origPath?: string
}

export type ChangesPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  openFilePath: (path: string) => Promise<void>
  runCommand?: (
    command: string,
    options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<RunCommandResult>
  workspaceCwd?: string
}

function groupByPath(diffs: readonly EditorDiffHunk[]): Map<string, EditorDiffHunk[]> {
  const map = new Map<string, EditorDiffHunk[]>()
  for (const hunk of diffs) {
    const path = hunk.path || 'untitled'
    const list = map.get(path) ?? []
    list.push(hunk)
    map.set(path, list)
  }
  return map
}

function baseName(path: string): string {
  return path.replace(/^.*[/\\]/, '') || path
}

function stripQuotes(value: string): string {
  return value.replace(/^"/, '').replace(/"$/, '')
}

/** Parse `git status --porcelain` (v1) into file rows. */
export function parseGitPorcelain(text: string): GitChangeRow[] {
  const rows: GitChangeRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (raw.length < 4) continue
    const index = raw[0] ?? ' '
    const worktree = raw[1] ?? ' '
    const rest = raw.slice(3)
    if (rest.includes(' -> ')) {
      const [orig, dest] = rest.split(' -> ')
      rows.push({
        index,
        worktree,
        path: stripQuotes((dest ?? '').trim()),
        origPath: stripQuotes((orig ?? '').trim()),
      })
    } else {
      rows.push({ index, worktree, path: stripQuotes(rest) })
    }
  }
  return rows
}

export function describeGitStatus(index: string, worktree: string): string {
  if (index === '?' && worktree === '?') return 'Untracked'
  if (index === 'D' || worktree === 'D') return 'Deleted'
  if (index === 'A' || worktree === 'A') return 'Added'
  if (index === 'R' || worktree === 'R') return 'Renamed'
  if (index === 'C' || worktree === 'C') return 'Copied'
  if (index === 'U' || worktree === 'U') return 'Conflict'
  if (index === 'M' || worktree === 'M') return 'Modified'
  const code = `${index}${worktree}`.trim()
  return code === '' ? 'Changed' : code
}

export function joinWorkspacePath(root: string, rel: string): string {
  if (rel === '') return root
  if (/^[A-Za-z]:[\\/]/.test(rel) || rel.startsWith('/')) return rel
  const sep = root.includes('\\') ? '\\' : '/'
  const base = root.replace(/[\\/]+$/, '')
  if (base === '') return rel
  return `${base}${sep}${rel.replace(/\//g, sep)}`
}

/** Cursor Agents Window “Changes”: git working tree + agent hunks. */
export function ChangesPanel({
  useStore,
  actions: _actions,
  openFilePath,
  runCommand,
  workspaceCwd = '',
}: ChangesPanelProps) {
  void _actions
  const diffs = useStore(s => s.editorDiffs)
  const grouped = useMemo(
    () => groupByPath(diffs ?? []),
    [diffs],
  )
  const files = [...grouped.keys()]
  const [gitRows, setGitRows] = useState<GitChangeRow[]>([])
  const [gitError, setGitError] = useState('')
  const [busy, setBusy] = useState(false)

  const refreshGit = useCallback(async () => {
    if (runCommand === undefined) return
    setBusy(true)
    try {
      const result = await runCommand('git status --porcelain -u', {
        ...(workspaceCwd !== '' ? { cwd: workspaceCwd } : {}),
        timeoutMs: 15_000,
      })
      const combined = `${result.stdout}\n${result.stderr}`
      if (result.exitCode !== 0 && result.exitCode !== null && parseGitPorcelain(result.stdout).length === 0) {
        setGitRows([])
        setGitError(result.stderr.trim() || 'Not a git repository.')
        return
      }
      setGitRows(parseGitPorcelain(result.stdout))
      setGitError(result.timedOut ? 'git status timed out.' : '')
      void combined
    } catch (err: unknown) {
      setGitRows([])
      setGitError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [runCommand, workspaceCwd])

  useEffect(() => {
    void refreshGit()
  }, [refreshGit])

  const empty = files.length === 0 && gitRows.length === 0 && gitError === ''

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <strong className={css.title}>
          {gitRows.length + files.length} change{gitRows.length + files.length === 1 ? '' : 's'}
        </strong>
        {runCommand !== undefined && (
          <button type="button" className={css.btn} disabled={busy} onClick={() => { void refreshGit() }}>
            {busy ? '…' : 'Refresh'}
          </button>
        )}
      </div>
      {gitError !== '' && <p className={css.hint}>{gitError}</p>}
      {empty && (
        <p className={css.hint}>No changes yet. Working-tree and agent edits show up here.</p>
      )}
      {gitRows.length > 0 && (
        <ul className={css.gitList}>
          {gitRows.map((row) => {
            const abs = joinWorkspacePath(workspaceCwd, row.path)
            return (
              <li key={`${row.index}${row.worktree}:${row.path}`}>
                <button
                  type="button"
                  className={css.gitRow}
                  title={abs}
                  onClick={() => { void openFilePath(abs) }}
                >
                  <span className={css.gitCode}>{describeGitStatus(row.index, row.worktree)}</span>
                  <span className={css.gitName}>{baseName(row.path)}</span>
                  <span className={css.hint}>{row.origPath ? `${row.origPath} → ${row.path}` : row.path}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className={css.mindBody}>
        {files.map((path) => {
          const hunks = grouped.get(path) ?? []
          return (
            <section key={path} className={css.mindCard}>
              <div className={css.toolbar}>
                <button
                  type="button"
                  className={css.btn}
                  title={path}
                  onClick={() => { void openFilePath(path) }}
                >
                  {baseName(path)}
                </button>
                <span className={css.hint}>{path}</span>
              </div>
              <DiffBlock diffs={hunks} maxLines={60} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
