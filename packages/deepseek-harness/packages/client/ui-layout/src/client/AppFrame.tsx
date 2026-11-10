/**
 * Three-column shell frame, registered into the built-in 'root' slot (the web
 * shell renders only 'root'). Owns the grid tracks (sidebar | center |
 * details), the drag handles (pointer capture + rAF throttle), the concession
 * chain (columns.ts), and the child-slot render decisions.
 *
 * Cursor Agents Window: center is the conversation; the right column is the
 * editor group (Browser / Changes / pwsh / files).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { computeColumns, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_DEFAULT } from './columns.ts'
import type { createLayoutStore } from './stores.ts'
import { WorkbenchShell } from './WorkbenchShell.tsx'
import css from './AppFrame.module.css'

/** Injected Host / session faces for the multi-tab workbench. */
export type AppFrameInjected = {
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
  ) => Promise<{
    stdout: string
    stderr: string
    exitCode: number | null
    timedOut: boolean
    cwd: string
  }>
  promptCurrentSession: (text: string) => Promise<void>
  startSideSession?: (() => Promise<void>) | undefined
  openAgent?: (id: string) => void
  getContextSnapshot: () => import('./panels/MindPanel.tsx').MindContextSnapshot
  loadMemory: () => Promise<import('./panels/MindPanel.tsx').MindMemorySnapshot>
  loadWorld: () => Promise<import('./panels/MindPanel.tsx').MindWorldSnapshot | null>
  persistContextMode: (mode: import('./stores.ts').MindContextMode) => Promise<void>
  spawnParallelAgents: (input: {
    goal: string
    roles: import('./panels/AgentsPanel.tsx').ParallelLaunchRole[]
    isolateWorktrees?: boolean
  }) => Promise<import('./panels/AgentsPanel.tsx').ParallelLaunchResult[]>
}

/** Full composed props: runtime share + child-slot render share + store share. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'conversation' | 'details' | 'shell.overlay'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & AppFrameInjected

/** Center column grid item (session-body building block). */
function CenterColumn(props: { children?: ReactNode }) {
  return <div className={css.centerCol}>{props.children}</div>
}

/** Details column grid item; width 0 keeps the subtree mounted (never unmount on close). */
function DetailsColumn(props: { children?: ReactNode }) {
  return <div className={css.detailsCol}>{props.children}</div>
}

/**
 * One drag handle: pointer capture, rAF-throttled dx reports against the drag-start origin.
 * `side` keys the hover-reveal CSS to the owning column.
 */
function DragHandle(props: { side: 'sidebar' | 'details'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }) {
  const [dragging, setDragging] = useState(false)
  const origin = useRef(0)
  const latest = useRef(0)
  const frame = useRef<number | null>(null)
  const callbacks = useRef({ onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd })
  callbacks.current = { onStart: props.onStart, onDrag: props.onDrag, onEnd: props.onEnd }

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    origin.current = e.clientX
    latest.current = e.clientX
    callbacks.current.onStart()
    setDragging(true)
  }, [])
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    latest.current = e.clientX
    frame.current ??= requestAnimationFrame(() => {
      frame.current = null
      callbacks.current.onDrag(latest.current - origin.current)
    })
  }, [])
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null }
    callbacks.current.onDrag(latest.current - origin.current)
    setDragging(false)
    callbacks.current.onEnd()
  }, [])

  return (
    <div
      className={css.handle}
      style={{ left: props.left }}
      data-side={props.side}
      data-dragging={dragging || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

/** The three-column frame (see module doc). */
export function AppFrame({
  useStore,
  useSessions,
  useWorkspaces,
  actions,
  renderSlot,
  saveFile,
  openFilePath,
  listDirectory,
  readTextFile,
  openPath,
  runCommand,
  promptCurrentSession,
  startSideSession,
  openAgent,
  getContextSnapshot,
  loadMemory,
  loadWorld,
  persistContextMode,
  spawnParallelAgents,
}: AppFrameProps) {
  const panels = useStore(s => s)
  const workbenchOpen = panels.workbenchTabs.length > 0
  const sessionIds = useSessions(s => s.ids)
  const sessionsById = useSessions(s => s.byId)
  const agentEntries = useMemo(
    () => sessionIds
      .map(id => sessionsById[id])
      .filter((row): row is NonNullable<typeof row> =>
        row !== undefined && row.blank === false)
      .map(row => ({
        id: row.id,
        label: 'Nova' as const,
        detail: row.displayTitle || row.title || row.cwd || row.id,
        running: row.running,
      })),
    [sessionIds, sessionsById],
  )
  const detailsSession = useSessions((s) => {
    const current = s.current
    return current !== undefined && s.byId[current]?.blank === false ? current : undefined
  })
  const sessionCwd = useSessions((s) => {
    const current = s.current
    if (current === undefined) return ''
    return String(s.byId[current]?.cwd || '').trim()
  })
  const workspaceItems = useWorkspaces(s => s.items)
  const recentWorkspaceId = useWorkspaces(s => s.recentWorkspaceId)
  const resolvedCwd = useMemo(() => {
    if (sessionCwd !== '') return sessionCwd
    if (detailsSession !== undefined) {
      const owned = workspaceItems.find(item =>
        item.sessionIds.some(id => String(id) === String(detailsSession)))
      if (owned?.path) return owned.path
    }
    const recent = workspaceItems.find(item => item.workspaceId === recentWorkspaceId)
    if (recent?.path) return recent.path
    return workspaceItems[0]?.path ?? ''
  }, [detailsSession, recentWorkspaceId, sessionCwd, workspaceItems])
  const frameRef = useRef<HTMLDivElement | null>(null)
  const [viewport, setViewport] = useState(() => window.innerWidth)

  const lastSession = useRef(detailsSession)
  useLayoutEffect(() => {
    if (detailsSession === undefined) return
    if (lastSession.current !== undefined && lastSession.current !== detailsSession) {
      // Keep a live workbench open across session switches; only collapse
      // the right column when it was showing tool details.
      if (!workbenchOpen) actions.closeDetails()
    }
    lastSession.current = detailsSession
  }, [actions, detailsSession, workbenchOpen])

  // Track the frame's own box (not the window): rAF-throttled ResizeObserver.
  useEffect(() => {
    const el = frameRef.current
    /* v8 ignore next -- the ref is always attached by effect time: the frame div renders unconditionally. */
    if (el === null) return
    let raf: number | null = null
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = null
        const width = el.getBoundingClientRect().width
        if (width > 0) setViewport(width)
      })
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [])

  // Narrow viewports auto-collapse the sidebar; the store mirror keeps
  // toggleSidebar's semantics right (narrow toggles flip the manual
  // re-expand override, stores.ts). Collapsed is decided here, so the
  // solver stays breakpoint-free: a narrow re-expand passes the preference
  // (or the default when the wide preference is closed) and the center
  // absorbs the squeeze.
  const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
  useEffect(() => { actions.setNarrow(narrow) }, [actions, narrow])
  const sidebarCollapsed = narrow ? !panels.narrowExpanded : panels.sidebar === 0
  const sidebarPreference = sidebarCollapsed
    ? 0
    : panels.sidebar === 0 ? SIDEBAR_DEFAULT : panels.sidebar
  // Right column opens for tool details (needs a live session) or the workbench.
  const detailsPreference = workbenchOpen || detailsSession !== undefined ? panels.details : 0
  const cols = computeColumns(viewport, sidebarPreference, detailsPreference)
  const colsRef = useRef(cols)
  colsRef.current = cols

  // The drag base is the rendered width captured at drag start (grabbing a
  // concession-clamped panel must not jump back to the stored preference);
  // it stays frozen for the whole gesture so dx deltas do not compound.
  const sidebarBase = useRef(0)
  const detailsBase = useRef(0)
  // Track-level transitions pause for the whole gesture: eased tracks would
  // detach the column edge from the pointer (AppFrame.module.css).
  const [dragging, setDragging] = useState(false)
  const onDragEnd = useCallback(() => { setDragging(false) }, [])
  const onSidebarStart = useCallback(() => { sidebarBase.current = colsRef.current.sidebar; setDragging(true) }, [])
  const onDetailsStart = useCallback(() => { detailsBase.current = colsRef.current.details; setDragging(true) }, [])
  const onSidebarDrag = useCallback((dx: number) => {
    actions.setSidebar(sidebarBase.current + dx)
  }, [actions])
  const onDetailsDrag = useCallback((dx: number) => {
    actions.setDetails(detailsBase.current - dx)
  }, [actions])

  // Cursor-aligned workbench shortcuts (available even before the first tab opens).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey
      if (!meta) return
      const key = event.key.toLowerCase()
      if (key === 'g' && !event.shiftKey) {
        event.preventDefault()
        const path = window.prompt('Open file path')
        if (path !== null && path.trim() !== '') void openFilePath(path.trim())
      } else if ((key === 'j' && !event.shiftKey) || key === '`') {
        event.preventDefault()
        actions.openWorkbenchTab('terminal')
      } else if (key === 'l' && !event.shiftKey) {
        event.preventDefault()
        actions.clearSideChat()
        actions.openWorkbenchTab('sideChat')
      } else if (key === 'i' && !event.shiftKey) {
        event.preventDefault()
        actions.openWorkbenchTab('agents')
      } else if (key === 'b' && event.shiftKey) {
        event.preventDefault()
        actions.openWorkbenchTab('browser')
      } else if (key === 'a' && event.shiftKey) {
        event.preventDefault()
        actions.openWorkbenchTab('canvas')
      } else if (key === 's' && event.shiftKey) {
        event.preventDefault()
        actions.clearSideChat()
        actions.openWorkbenchTab('sideChat')
      } else if (key === 'm' && event.shiftKey) {
        event.preventDefault()
        actions.openWorkbenchTab('mind')
      } else if (key === 'p' && event.shiftKey) {
        event.preventDefault()
        actions.openWorkbenchTab('agents')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [actions, openFilePath])

  return (
    <div
      ref={frameRef}
      className={css.frame}
      style={{ gridTemplateColumns: `${cols.sidebar}px minmax(0, 1fr) ${cols.details}px` }}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      data-details-collapsed={cols.details === 0 || undefined}
      data-dragging={dragging || undefined}
    >
      <div className={css.sidebarCol}>
        {renderSlot('sidebar', {
          collapsed: sidebarCollapsed,
          width: cols.sidebar,
          sidebarView: panels.sidebarView,
        })}
      </div>
      <>
        <CenterColumn>{renderSlot('conversation', {})}</CenterColumn>
        <DetailsColumn>
          {workbenchOpen
            ? (
              <WorkbenchShell
                useStore={useStore}
                actions={actions}
                saveFile={saveFile}
                openFilePath={openFilePath}
                listDirectory={listDirectory}
                readTextFile={readTextFile}
                openPath={openPath}
                runCommand={runCommand}
                promptCurrentSession={promptCurrentSession}
                startSideSession={startSideSession}
                agentEntries={agentEntries}
                openAgent={openAgent}
                getContextSnapshot={getContextSnapshot}
                loadMemory={loadMemory}
                loadWorld={loadWorld}
                persistContextMode={persistContextMode}
                spawnParallelAgents={spawnParallelAgents}
                workspaceCwd={resolvedCwd}
              />
            )
            : renderSlot('details', {})}
        </DetailsColumn>
      </>
      <div className={css.overlayLayer} data-shell-overlay>
        {renderSlot('shell.overlay', {})}
        {!workbenchOpen && (
          <button
            type="button"
            className={css.floatingPlus}
            title="Open workbench (Ctrl+J Terminal)"
            aria-label="Open workbench"
            onClick={() => { actions.openWorkbenchTab('terminal') }}
          >
            +
          </button>
        )}
      </div>
      {/* The collapsed rail is fixed-width: no resize handle while closed. */}
      {!sidebarCollapsed && <DragHandle side="sidebar" left={cols.sidebar} onStart={onSidebarStart} onDrag={onSidebarDrag} onEnd={onDragEnd} />}
      {cols.details > 0 && <DragHandle side="details" left={viewport - cols.details} onStart={onDetailsStart} onDrag={onDetailsDrag} onEnd={onDragEnd} />}
    </div>
  )
}
