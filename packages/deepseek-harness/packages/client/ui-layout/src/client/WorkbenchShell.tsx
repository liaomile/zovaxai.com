/**
 * Cursor Agents Window right editor group:
 * tab strip Browser | Changes | pwsh | files, plus menu, terminal list.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, WorkbenchTabKind } from './stores.ts'
import { WorkbenchPane } from './WorkbenchPane.tsx'
import { BrowserPanel } from './panels/BrowserPanel.tsx'
import { TerminalPanel, type RunCommandResult, type TerminalAgentEntry } from './panels/TerminalPanel.tsx'
import { CanvasPanel } from './panels/CanvasPanel.tsx'
import { SideChatPanel } from './panels/SideChatPanel.tsx'
import { PlansPanel } from './panels/PlansPanel.tsx'
import { ChangesPanel } from './panels/ChangesPanel.tsx'
import {
  MindPanel,
  type MindContextSnapshot,
  type MindMemorySnapshot,
  type MindWorldSnapshot,
} from './panels/MindPanel.tsx'
import {
  AgentsPanel,
  type ParallelLaunchResult,
  type ParallelLaunchRole,
} from './panels/AgentsPanel.tsx'
import type { MindContextMode } from './stores.ts'
import css from './WorkbenchShell.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type WorkbenchShellProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  saveFile: (path: string, content: string) => Promise<void>
  openFilePath: (path: string) => Promise<void>
  listDirectory: (path?: string) => Promise<{
    path: string
    entries: readonly { name: string; path: string; kind: string }[]
  }>
  readTextFile: (path: string) => Promise<{ path: string; content: string }>
  openPath: (path: string) => Promise<void>
  runCommand: (
    command: string,
    options?: { cwd?: string; timeoutMs?: number; signal?: AbortSignal },
  ) => Promise<RunCommandResult>
  promptCurrentSession: (text: string) => Promise<void>
  startSideSession?: (() => Promise<void>) | undefined
  agentEntries?: readonly TerminalAgentEntry[]
  openAgent?: (id: string) => void
  getContextSnapshot: () => MindContextSnapshot
  loadMemory: () => Promise<MindMemorySnapshot>
  loadWorld: () => Promise<MindWorldSnapshot | null>
  persistContextMode: (mode: MindContextMode) => Promise<void>
  spawnParallelAgents: (input: {
    goal: string
    roles: ParallelLaunchRole[]
    isolateWorktrees?: boolean
  }) => Promise<ParallelLaunchResult[]>
  /** Live workspace/session directory — terminal prompt follows this, never a hardcoded repo. */
  workspaceCwd?: string
}

const TAB_ORDER: WorkbenchTabKind[] = [
  'browser', 'changes', 'terminal', 'file', 'canvas', 'sideChat', 'plans', 'mind', 'agents',
]

function tabGlyph(kind: WorkbenchTabKind): string {
  if (kind === 'browser') return '◎'
  if (kind === 'changes') return '±'
  if (kind === 'terminal') return '>_'
  if (kind === 'file') return '☰'
  return '·'
}

function tabLabel(kind: WorkbenchTabKind, editorPath: string | null): string {
  if (kind === 'file') {
    if (editorPath !== null && editorPath !== '') {
      return editorPath.replace(/^.*[/\\]/, '') || editorPath
    }
    return 'File'
  }
  if (kind === 'terminal') return 'pwsh'
  if (kind === 'browser') return 'Browser'
  if (kind === 'changes') return 'Changes'
  if (kind === 'canvas') return 'Canvas'
  if (kind === 'sideChat') return 'Chat'
  if (kind === 'plans') return 'Plans'
  if (kind === 'mind') return 'Mind'
  return 'Agents'
}

type PlusItem = {
  kind: WorkbenchTabKind
  label: string
  shortcut: string
  submenu?: boolean
}

/** Cursor Agents Window “+”: Browser / Changes / Terminal first. */
const PLUS_ITEMS: PlusItem[] = [
  { kind: 'browser', label: 'Browser', shortcut: 'Ctrl+Shift+B' },
  { kind: 'changes', label: 'Changes', shortcut: '' },
  { kind: 'terminal', label: 'Terminal', shortcut: 'Ctrl+`' },
  { kind: 'file', label: 'File', shortcut: 'Ctrl+G' },
  { kind: 'plans', label: 'More', shortcut: '', submenu: true },
]

/** Multi-tab right workbench with Cursor-like + menu. */
export function WorkbenchShell({
  useStore,
  actions,
  saveFile,
  openFilePath,
  listDirectory,
  readTextFile,
  openPath,
  runCommand,
  promptCurrentSession,
  startSideSession,
  agentEntries,
  openAgent,
  getContextSnapshot,
  loadMemory,
  loadWorld,
  persistContextMode,
  spawnParallelAgents,
  workspaceCwd = '',
}: WorkbenchShellProps) {
  const tabs = useStore(s => s.workbenchTabs)
  const active = useStore(s => s.workbenchActive)
  const editorPath = useStore(s => s.editorPath)
  const terminalSurface = useStore(s => s.terminalSurface)
  const activeAgentId = useStore(s => s.activeAgentId)
  const agentPtys = useStore(s => s.agentPtys)
  const listOpen = useStore(s => s.terminalListOpen)
  const orderedTabs = [...tabs].sort(
    (a, b) => TAB_ORDER.indexOf(a) - TAB_ORDER.indexOf(b),
  )
  const agentTabs = Object.entries(agentPtys)
  const [menuOpen, setMenuOpen] = useState(false)
  const [plansOpen, setPlansOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const openTab = useCallback(async (kind: WorkbenchTabKind) => {
    if (kind === 'sideChat') {
      actions.clearSideChat()
      actions.openWorkbenchTab('sideChat')
      return
    }
    if (kind === 'plans') {
      actions.setPlansView('list')
      actions.openWorkbenchTab('plans')
      return
    }
    if (kind === 'terminal') {
      actions.selectUserTerminal()
      return
    }
    actions.openWorkbenchTab(kind)
  }, [actions])

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (event: MouseEvent) => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
        setPlansOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc) }
  }, [menuOpen])

  if (tabs.length === 0 || active === null) return null

  return (
    <div className={css.root}>
      <div className={css.tabBar}>
        <div className={css.tabs}>
          {orderedTabs.map((tab) => {
            const label = tabLabel(tab, editorPath)
            return (
            <button
              key={tab}
              type="button"
              className={clsx(
                css.tab,
                active === tab && !(tab === 'terminal' && terminalSurface === 'agent') && css.tabActive,
              )}
              title={tab === 'file' && editorPath !== null ? editorPath : label}
              onClick={() => {
                if (tab === 'terminal') actions.selectUserTerminal()
                actions.setWorkbenchActive(tab)
              }}
            >
              <span className={css.tabGlyph} aria-hidden>{tabGlyph(tab)}</span>
              <span>{label}</span>
              <span
                className={css.tabClose}
                role="button"
                tabIndex={0}
                aria-label={`Close ${label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.closeWorkbenchTab(tab)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    actions.closeWorkbenchTab(tab)
                  }
                }}
              >
                ×
              </span>
            </button>
            )
          })}
          {agentTabs.map(([id, pty]) => (
            <button
              key={`agent-${id}`}
              type="button"
              className={clsx(
                css.tab,
                css.tabAgent,
                active === 'terminal' && terminalSurface === 'agent' && activeAgentId === id && css.tabActive,
              )}
              title={pty.title}
              onClick={() => {
                actions.selectAgentTerminal(id, pty.title)
                actions.setWorkbenchActive('terminal')
              }}
            >
              <span className={css.tabGlyph} aria-hidden>∞</span>
              <span>{pty.title}</span>
              <span
                className={css.tabClose}
                role="button"
                tabIndex={0}
                aria-label={`Close ${pty.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.closeAgentPty(id)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    event.stopPropagation()
                    actions.closeAgentPty(id)
                  }
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className={css.plusWrap} ref={menuRef}>
          <button
            type="button"
            className={css.plus}
            aria-label="Open workbench view"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => {
              setMenuOpen(open => !open)
              setPlansOpen(false)
            }}
          >
            +
          </button>
          {menuOpen && (
            <div className={css.menu} role="menu">
              {PLUS_ITEMS.map((item) => (
                <div key={item.kind} className={css.menuRow}>
                  <button
                    type="button"
                    role="menuitem"
                    className={css.menuItem}
                    onClick={() => {
                      if (item.submenu) {
                        setPlansOpen(open => !open)
                        return
                      }
                      setMenuOpen(false)
                      void openTab(item.kind)
                    }}
                    onMouseEnter={() => {
                      if (item.submenu) setPlansOpen(true)
                    }}
                  >
                    <span className={css.menuLabel}>{item.label}</span>
                    {item.submenu
                      ? <span className={css.menuChevron}>›</span>
                      : <span className={css.menuShortcut}>{item.shortcut}</span>}
                  </button>
                  {item.submenu && plansOpen && (
                    <div className={css.submenu} role="menu">
                      {([
                        { kind: 'canvas' as const, label: 'Canvas' },
                        { kind: 'mind' as const, label: 'Mind' },
                        { kind: 'agents' as const, label: 'Agents' },
                        { kind: 'plans' as const, label: 'Plans' },
                      ]).map(extra => (
                        <button
                          key={extra.kind}
                          type="button"
                          role="menuitem"
                          className={css.menuItem}
                          onClick={() => {
                            setMenuOpen(false)
                            setPlansOpen(false)
                            if (extra.kind === 'plans') actions.setPlansView('list')
                            actions.openWorkbenchTab(extra.kind)
                          }}
                        >
                          {extra.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={clsx(css.plus, listOpen && css.tabActive)}
          title={listOpen ? 'Hide Terminals / Agents' : 'Show Terminals / Agents'}
          aria-pressed={listOpen}
          onClick={() => { actions.toggleTerminalList() }}
        >
          ▯
        </button>
      </div>

      <div className={css.body}>
        {active === 'file' && (
          <WorkbenchPane
            useStore={useStore}
            actions={actions}
            saveFile={saveFile}
            openFilePath={openFilePath}
            listDirectory={listDirectory}
            openPath={openPath}
          />
        )}
        {active === 'terminal' && (
          <TerminalPanel
            useStore={useStore}
            actions={actions}
            listDirectory={listDirectory}
            runCommand={runCommand}
            openPath={openPath}
            agentEntries={agentEntries}
            startNewAgent={startSideSession}
            workspaceCwd={workspaceCwd}
          />
        )}
        {active === 'browser' && (
          <BrowserPanel
            useStore={useStore}
            actions={actions}
            readTextFile={readTextFile}
            openPath={openPath}
          />
        )}
        {active === 'changes' && (
          <ChangesPanel
            useStore={useStore}
            actions={actions}
            openFilePath={openFilePath}
            runCommand={runCommand}
            workspaceCwd={workspaceCwd}
          />
        )}
        {active === 'canvas' && (
          <CanvasPanel useStore={useStore} actions={actions} saveFile={saveFile} />
        )}
        {active === 'sideChat' && (
          <SideChatPanel
            useStore={useStore}
            actions={actions}
            promptCurrentSession={promptCurrentSession}
            startSideSession={startSideSession}
          />
        )}
        {active === 'plans' && <PlansPanel useStore={useStore} actions={actions} />}
        {active === 'mind' && (
          <MindPanel
            useStore={useStore}
            actions={actions}
            getContextSnapshot={getContextSnapshot}
            loadMemory={loadMemory}
            loadWorld={loadWorld}
            persistContextMode={persistContextMode}
          />
        )}
        {active === 'agents' && (
          <AgentsPanel
            useStore={useStore}
            actions={actions}
            agentEntries={agentEntries}
            spawnParallelAgents={spawnParallelAgents}
            promptCurrentSession={promptCurrentSession}
            startNewAgent={startSideSession}
            openAgent={openAgent}
          />
        )}
      </div>
    </div>
  )
}
