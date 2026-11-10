import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import clsx from 'clsx'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type RunCommandResult = {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  cwd: string
}

/** One Agent row in the Cursor-style terminal list. */
export type TerminalAgentEntry = {
  id: string
  label: string
  detail: string
  running?: boolean
}

export type TerminalPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  listDirectory: (path?: string) => Promise<{
    path: string
    entries: readonly { name: string; path: string; kind: string }[]
  }>
  runCommand: (
    command: string,
    options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<RunCommandResult>
  openPath: (path: string) => Promise<void>
  agentEntries?: readonly TerminalAgentEntry[]
  startNewAgent?: () => Promise<void>
  /** Current workspace/session path (any folder the user opened). */
  workspaceCwd?: string
}

export function toPwshPath(cwd: string): string {
  const trimmed = cwd.trim()
  if (trimmed === '' || trimmed === '.') return ''
  if (/^[A-Za-z]:/.test(trimmed) || trimmed.includes('\\')) return trimmed.replace(/\//g, '\\')
  return trimmed
}

/** Cursor / Windows PowerShell prompt: `PS {cwd}>` */
export function formatPwshPrompt(cwd: string): string {
  const path = toPwshPath(cwd)
  if (path === '') return 'PS>'
  return `PS ${path}>`
}

/** Compact elapsed for Agents list (Cursor-style `12s` / `1m 4s`). */
export function formatElapsed(startedAt: number, now = Date.now()): string {
  const sec = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (sec < 60) return `${sec}s`
  const minutes = Math.floor(sec / 60)
  const rem = sec % 60
  if (minutes < 60) return rem === 0 ? `${minutes}m` : `${minutes}m ${rem}s`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

function truncateDetail(text: string, max = 28): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

async function resolveWorkspaceCwd(
  hint: string,
  listDirectory: TerminalPanelProps['listDirectory'],
): Promise<string> {
  const fromHint = toPwshPath(hint)
  if (fromHint !== '') return fromHint
  try {
    const listing = await listDirectory(hint || undefined)
    return toPwshPath(listing.path)
  } catch {
    return ''
  }
}

/** Cursor-aligned pwsh + Agents list (agent click → read-only PTY, not chat). */
export function TerminalPanel({
  useStore, actions, listDirectory, runCommand, openPath, agentEntries = [], startNewAgent,
  workspaceCwd = '',
}: TerminalPanelProps) {
  const sessions = useStore(s => s.terminalSessions)
  const activeId = useStore(s => s.activeTerminalId)
  const listOpen = useStore(s => s.terminalListOpen)
  const cwd = useStore(s => s.terminalCwd)
  const log = useStore(s => s.terminalLog)
  const surface = useStore(s => s.terminalSurface)
  const activeAgentId = useStore(s => s.activeAgentId)
  const agentPtys = useStore(s => s.agentPtys)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const history = useRef<string[]>([])
  const historyIndex = useRef(-1)
  const abortRef = useRef<AbortController | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastWorkspace = useRef('')

  const agentView = surface === 'agent' && activeAgentId !== null
  const agentPty = agentView ? agentPtys[activeAgentId] : undefined
  const bodyLog = agentView ? (agentPty?.log ?? []) : log
  const promptCwd = toPwshPath(
    agentView ? (agentPty?.cwd || cwd || workspaceCwd) : (cwd || workspaceCwd),
  )
  const prompt = formatPwshPrompt(promptCwd)

  useEffect(() => {
    const el = scroller.current
    if (el !== null) el.scrollTop = el.scrollHeight
  }, [bodyLog, busy, prompt, activeId, activeAgentId, surface])

  useEffect(() => {
    let cancelled = false
    void resolveWorkspaceCwd(workspaceCwd, listDirectory).then((path) => {
      if (cancelled || path === '') return
      const switched = lastWorkspace.current !== '' && lastWorkspace.current !== path
      lastWorkspace.current = path
      if (sessions.length === 0) {
        actions.addTerminalSession(path)
        return
      }
      if (toPwshPath(cwd) === '' || switched) actions.setTerminalCwd(path)
    })
    return () => { cancelled = true }
  }, [actions, cwd, listDirectory, sessions.length, workspaceCwd])

  useEffect(() => {
    if (agentView) return
    inputRef.current?.focus()
  }, [activeId, agentView])

  useEffect(() => {
    const live = agentEntries.some(agent => agent.running === true) || Object.keys(agentPtys).length > 0
    if (!live) return
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [agentEntries, agentPtys])

  const pushHistory = (line: string): void => {
    if (history.current[history.current.length - 1] === line) return
    history.current.push(line)
    if (history.current.length > 100) history.current.shift()
    historyIndex.current = -1
  }

  const run = useCallback(async (raw: string) => {
    const line = raw.trimEnd()
    if (line.trim() === '' || busy) return
    const livePrompt = formatPwshPrompt(cwd)
    actions.appendTerminalLog(`${livePrompt} ${line}`)
    pushHistory(line)
    const trimmed = line.trim()

    if (trimmed === 'clear' || trimmed === 'cls') {
      actions.clearTerminalLog()
      return
    }

    setBusy(true)
    const ac = new AbortController()
    abortRef.current = ac
    try {
      if (/^open(\s|$)/i.test(trimmed)) {
        const arg = trimmed.replace(/^open\s*/i, '').trim()
        if (arg === '') {
          actions.appendTerminalLog('Usage: open <path>')
        } else {
          const target = (/^[A-Za-z]:[\\/]/.test(arg) || arg.startsWith('/') || arg.startsWith('\\'))
            ? arg
            : `${toPwshPath(cwd)}${toPwshPath(cwd) !== '' ? '\\' : ''}${arg}`
          await openPath(target)
        }
        return
      }

      const result = await runCommand(trimmed, {
        ...(promptCwd !== '' ? { cwd: promptCwd } : {}),
        timeoutMs: 120_000,
        signal: ac.signal,
      })
      if (result.stdout !== '') actions.appendTerminalLog(result.stdout.replace(/\s+$/u, ''))
      if (result.stderr.trim() !== '') actions.appendTerminalLog(result.stderr.replace(/\s+$/u, ''))
      if (result.timedOut) actions.appendTerminalLog('Operation timed out.')
      if (result.cwd !== '') actions.setTerminalCwd(toPwshPath(result.cwd) || result.cwd)
    } catch (err: unknown) {
      actions.appendTerminalLog(err instanceof Error ? err.message : String(err))
    } finally {
      if (abortRef.current === ac) abortRef.current = null
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [actions, busy, cwd, openPath, promptCwd, runCommand])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const items = history.current
      if (items.length === 0) return
      const next = historyIndex.current < 0
        ? items.length - 1
        : Math.max(0, historyIndex.current - 1)
      historyIndex.current = next
      setInput(items[next] ?? '')
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const items = history.current
      if (historyIndex.current < 0) return
      const next = historyIndex.current + 1
      if (next >= items.length) {
        historyIndex.current = -1
        setInput('')
        return
      }
      historyIndex.current = next
      setInput(items[next] ?? '')
      return
    }
    if (event.key === 'c' && event.ctrlKey) {
      event.preventDefault()
      abortRef.current?.abort()
    }
    if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault()
      actions.clearTerminalLog()
    }
  }

  return (
    <div className={css.termSplit}>
      <div className={css.termRoot}>
        {agentView && (
          <div className={css.termBanner} role="status">
            Agent is using this terminal. It&apos;s read-only.
          </div>
        )}
        <div
          ref={scroller}
          className={css.termBody}
          aria-live="polite"
          onClick={() => { if (!agentView) inputRef.current?.focus() }}
        >
          {bodyLog.map((line, index) => (
            <pre key={`${agentView ? activeAgentId : activeId}:${index}:${line.slice(0, 24)}`} className={css.termLine}>{line}</pre>
          ))}
          {agentView ? (
            <pre className={css.termLine}>{prompt}</pre>
          ) : (
            <form
              className={css.termInputRow}
              onSubmit={(event) => {
                event.preventDefault()
                const value = input
                setInput('')
                void run(value)
              }}
            >
              <span className={css.termPrompt}>{prompt}</span>
              <input
                ref={inputRef}
                className={css.termInputField}
                value={input}
                spellCheck={false}
                aria-label="PowerShell input"
                autoComplete="off"
                disabled={busy}
                onChange={(e) => { setInput(e.target.value) }}
                onKeyDown={onKeyDown}
              />
              {busy && <span className={css.termBusy}>…</span>}
            </form>
          )}
        </div>
      </div>

      {listOpen && (
        <aside className={css.termList} aria-label="Terminals and agents">
          <div className={css.termListSection}>
            <div className={css.termListHead}>
              <span>{Math.max(sessions.length, 1)} Terminal{sessions.length === 1 || sessions.length === 0 ? '' : 's'}</span>
              <button
                type="button"
                className={css.termIconBtn}
                title="New terminal"
                onClick={() => { actions.addTerminalSession(cwd || undefined) }}
              >
                +
              </button>
            </div>
            <ul className={css.termListItems}>
              {(sessions.length === 0 ? [{ id: 'pending', name: 'pwsh' }] : sessions).map(session => (
                <li key={session.id}>
                  <button
                    type="button"
                    className={clsx(
                      css.termListItem,
                      !agentView && session.id === activeId && css.termListItemActive,
                    )}
                    onClick={() => {
                      if (session.id === 'pending') {
                        actions.selectUserTerminal()
                        return
                      }
                      actions.selectUserTerminal(session.id)
                    }}
                  >
                    <span className={css.termListIcon} aria-hidden>⌘</span>
                    <span className={css.termListLabel}>{session.name}</span>
                    {sessions.length > 1 && session.id !== 'pending' && (
                      <span
                        className={css.termListClose}
                        role="button"
                        tabIndex={0}
                        aria-label={`Close ${session.name}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          actions.removeTerminalSession(session.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            event.stopPropagation()
                            actions.removeTerminalSession(session.id)
                          }
                        }}
                      >
                        ×
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className={css.termListSection}>
            <div className={css.termListHead}>
              <span>Agents</span>
              <button
                type="button"
                className={css.termIconBtn}
                title="New Agent"
                onClick={() => { void startNewAgent?.() }}
              >
                +
              </button>
            </div>
            {agentEntries.length > 0 ? (
              <ul className={css.termListItems}>
                {agentEntries.map(agent => {
                  const pty = agentPtys[agent.id]
                  const snippet = pty?.log[pty.log.length - 1] || agent.detail
                  const elapsed = pty !== undefined ? formatElapsed(pty.startedAt, now) : ''
                  return (
                    <li key={agent.id}>
                      <button
                        type="button"
                        className={clsx(
                          css.termListItem,
                          css.termAgentItem,
                          agentView && activeAgentId === agent.id && css.termListItemActive,
                        )}
                        title={snippet}
                        onClick={() => {
                          actions.selectAgentTerminal(agent.id, `${agent.label} (${truncateDetail(snippet, 22)})`)
                        }}
                      >
                        <span className={css.termAgentIcon} aria-hidden>∞</span>
                        <span className={css.termListLabel}>
                          {agent.label}
                          {snippet !== '' && (
                            <span className={css.termAgentDetail}>
                              {' '}({truncateDetail(snippet)})
                            </span>
                          )}
                        </span>
                        {elapsed !== '' && <span className={css.termElapsed}>{elapsed}</span>}
                        {agent.running === true && <span className={css.termAgentDot} />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className={css.termListEmpty}>No agents yet.</p>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}
