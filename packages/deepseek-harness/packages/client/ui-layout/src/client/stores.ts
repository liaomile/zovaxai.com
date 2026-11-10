/**
 * The root entry's transient layout store: panel geometry as plain widths in
 * px (0 = closed). Module level exports the factory only — a module-level
 * handle would pin the store's identity in the module
 * cache (a de-facto singleton surviving plugin reloads). register() receives
 * the factory (exclusive use: the framework instantiates per entry), AppFrame
 * derives its PropsStore share from the return type, and the service face
 * receives the bound actions through the registration's inject hook.
 */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import {
  clampWidth, DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from './columns.ts'

/** Left sidebar content mode (activity rail selection). */
export type SidebarView = 'sessions' | 'files'

/** One applied mutation hunk for the right-side preview (matches DiffBlock). */
export type EditorDiffHunk = {
  path: string
  oldText: string | null
  newText: string
}

/** Right file-preview body mode when a file tab is active. */
export type EditorPane = 'diff' | 'result' | 'both' | 'preview'

/**
 * Cursor Agents Window editor-group tabs (right column):
 * Browser / Changes / pwsh / opened files.
 */
export type WorkbenchTabKind =
  | 'file'
  | 'terminal'
  | 'browser'
  | 'changes'
  | 'canvas'
  | 'sideChat'
  | 'plans'
  | 'mind'
  | 'agents'

/** One role slot for parallel Agent launch. */
export type ParallelAgentRole = {
  id: string
  name: string
  brief: string
  goal: string
}

/** Nova cognition depth for layered context (fast / standard / deep). */
export type MindContextMode = 'fast' | 'standard' | 'deep'

/** Sub-pane inside the Mind workbench tab. */
export type MindPane = 'context' | 'memory' | 'world'

/** One local plan note in the Plans panel. */
export type WorkbenchPlan = {
  id: string
  title: string
  body: string
  done: boolean
}

/** Side-chat scratch message. */
export type SideChatMessage = {
  role: 'user' | 'assistant'
  text: string
}

/** One Cursor-style terminal session in the right workbench. */
export type TerminalSession = {
  id: string
  /** Display name in the terminals list (Cursor uses `pwsh`). */
  name: string
  cwd: string
  log: string[]
}

/**
 * Layout store state: panel width preferences in px (0 = closed), plus the
 * narrow-viewport pair — `narrow` mirrors AppFrame's breakpoint reading
 * (viewport < SIDEBAR_AUTO_COLLAPSE) so toggleSidebar can pick semantics, and
 * `narrowExpanded` is the manual override that re-expands the auto-collapsed
 * sidebar over the squeezed center without rewriting the width preference.
 * IDE shell fields: activity view + multi-tab right workbench.
 */
type LayoutState = {
  sidebar: number
  details: number
  narrow: boolean
  narrowExpanded: boolean
  sidebarView: SidebarView
  editorPath: string | null
  editorContent: string
  editorDirty: boolean
  editorTruncated: boolean
  editorError: string | null
  editorBusy: boolean
  editorDiffs: EditorDiffHunk[] | null
  editorPane: EditorPane
  workbenchTabs: WorkbenchTabKind[]
  workbenchActive: WorkbenchTabKind | null
  browserUrl: string
  browserInput: string
  /** @deprecated mirror of active session cwd — kept for existing readers. */
  terminalCwd: string
  /** @deprecated mirror of active session log — kept for existing readers. */
  terminalLog: string[]
  terminalSessions: TerminalSession[]
  activeTerminalId: string | null
  /** Cursor-style right list (Terminals + Agents) visibility. */
  terminalListOpen: boolean
  /** `user` = interactive pwsh; `agent` = that agent's read-only PTY. */
  terminalSurface: 'user' | 'agent'
  activeAgentId: string | null
  agentPtys: Record<string, { title: string; log: string[]; cwd: string; startedAt: number }>
  canvasContent: string
  sideChatDraft: string
  sideChatLog: SideChatMessage[]
  plans: WorkbenchPlan[]
  plansView: 'list' | 'detail' | 'new'
  activePlanId: string | null
  mindPane: MindPane
  mindContextMode: MindContextMode
  agentsGoal: string
  agentsRoles: ParallelAgentRole[]
  agentsLaunchLog: string[]
}

/**
 * Annotation twin of the actions literal below (the export needs a declared
 * return type); drift fails assignability at the defineStore call.
 */
type LayoutActions = {
  setSidebar: (draft: LayoutState, px: number) => void
  setDetails: (draft: LayoutState, px: number) => void
  toggleSidebar: (draft: LayoutState) => void
  setNarrow: (draft: LayoutState, narrow: boolean) => void
  openDetails: (draft: LayoutState) => void
  closeDetails: (draft: LayoutState) => void
  setSidebarView: (draft: LayoutState, view: SidebarView) => void
  beginOpenEditor: (draft: LayoutState, path: string) => void
  setEditorLoaded: (draft: LayoutState, path: string, content: string, truncated: boolean) => void
  setEditorError: (draft: LayoutState, path: string, message: string) => void
  setEditorDraft: (draft: LayoutState, content: string) => void
  setEditorDiffs: (draft: LayoutState, diffs: EditorDiffHunk[] | null) => void
  setEditorPane: (draft: LayoutState, pane: EditorPane) => void
  markEditorSaved: (draft: LayoutState) => void
  clearEditor: (draft: LayoutState) => void
  openWorkbenchTab: (draft: LayoutState, kind: WorkbenchTabKind) => void
  closeWorkbenchTab: (draft: LayoutState, kind: WorkbenchTabKind) => void
  setWorkbenchActive: (draft: LayoutState, kind: WorkbenchTabKind) => void
  setBrowserInput: (draft: LayoutState, value: string) => void
  navigateBrowser: (draft: LayoutState, url: string) => void
  setTerminalCwd: (draft: LayoutState, cwd: string) => void
  appendTerminalLog: (draft: LayoutState, line: string) => void
  clearTerminalLog: (draft: LayoutState) => void
  addTerminalSession: (draft: LayoutState, cwd?: string) => void
  removeTerminalSession: (draft: LayoutState, id: string) => void
  setActiveTerminalId: (draft: LayoutState, id: string) => void
  setTerminalListOpen: (draft: LayoutState, open: boolean) => void
  toggleTerminalList: (draft: LayoutState) => void
  selectUserTerminal: (draft: LayoutState, id?: string) => void
  selectAgentTerminal: (draft: LayoutState, id: string, title?: string) => void
  appendAgentPty: (draft: LayoutState, id: string, line: string, title?: string, cwd?: string) => void
  closeAgentPty: (draft: LayoutState, id: string) => void
  setCanvasContent: (draft: LayoutState, content: string) => void
  setSideChatDraft: (draft: LayoutState, draftText: string) => void
  appendSideChat: (draft: LayoutState, message: SideChatMessage) => void
  clearSideChat: (draft: LayoutState) => void
  addPlan: (draft: LayoutState, plan: WorkbenchPlan) => void
  updatePlan: (draft: LayoutState, plan: WorkbenchPlan) => void
  removePlan: (draft: LayoutState, id: string) => void
  hydratePlans: (draft: LayoutState, plans: WorkbenchPlan[]) => void
  setPlansView: (draft: LayoutState, view: LayoutState['plansView']) => void
  setActivePlanId: (draft: LayoutState, id: string | null) => void
  setMindPane: (draft: LayoutState, pane: MindPane) => void
  setMindContextMode: (draft: LayoutState, mode: MindContextMode) => void
  setAgentsGoal: (draft: LayoutState, goal: string) => void
  setAgentsRoles: (draft: LayoutState, roles: ParallelAgentRole[]) => void
  appendAgentsLaunchLog: (draft: LayoutState, line: string) => void
  clearAgentsLaunchLog: (draft: LayoutState) => void
}

function defaultAgentRoles(): ParallelAgentRole[] {
  return [
    { id: 'role-be', name: 'Backend', brief: 'API / 数据 / 服务端逻辑', goal: '' },
    { id: 'role-fe', name: 'Frontend', brief: 'UI / 交互 / 页面', goal: '' },
    { id: 'role-qa', name: 'Tests', brief: '单测 / 回归 / 验收', goal: '' },
  ]
}

function newTerminalId(): string {
  return `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function activeTerminal(d: LayoutState): TerminalSession | undefined {
  return d.terminalSessions.find(session => session.id === d.activeTerminalId)
}

function syncActiveTerminalMirrors(d: LayoutState): void {
  const active = activeTerminal(d)
  d.terminalCwd = active?.cwd ?? ''
  d.terminalLog = active?.log ?? []
}

function ensureTab(d: LayoutState, kind: WorkbenchTabKind): void {
  if (!d.workbenchTabs.includes(kind)) d.workbenchTabs.push(kind)
  d.workbenchActive = kind
  if (d.details === 0) d.details = DETAILS_DEFAULT
}

/** Cursor Agents Window always shows the right editor group. */
export const DEFAULT_AGENTS_WINDOW_TABS: WorkbenchTabKind[] = ['browser', 'changes', 'terminal']

function dropTab(d: LayoutState, kind: WorkbenchTabKind): void {
  d.workbenchTabs = d.workbenchTabs.filter(tab => tab !== kind)
  if (d.workbenchActive === kind) {
    d.workbenchActive = d.workbenchTabs[d.workbenchTabs.length - 1] ?? null
  }
  if (kind === 'file') {
    d.editorPath = null
    d.editorContent = ''
    d.editorDirty = false
    d.editorTruncated = false
    d.editorError = null
    d.editorBusy = false
    d.editorDiffs = null
    d.editorPane = 'result'
  }
  if (d.workbenchTabs.length === 0) d.details = 0
}

/**
 * Create the layout panel store handle. The preference IS the width, so
 * closing a panel forgets its drag width — reopening restores the contract
 * default. Actions are the complete write set: drag writes clamp
 * into the panel's contract range and never cross the open/closed line;
 * open/close transitions write 0 / the default explicitly. Below the
 * auto-collapse breakpoint (AppFrame feeds setNarrow) the sidebar toggle
 * flips the narrowExpanded override instead of the preference.
 * @returns the store handle (spec + type + identity + factory in one).
 */
export function createLayoutStore(): EngineStoreHandle<LayoutState, LayoutActions>  {
  const handle = defineStore({
    init: (): LayoutState => ({
      sidebar: SIDEBAR_DEFAULT,
      details: DETAILS_DEFAULT,
      narrow: false,
      narrowExpanded: false,
      sidebarView: 'sessions',
      editorPath: null,
      editorContent: '',
      editorDirty: false,
      editorTruncated: false,
      editorError: null,
      editorBusy: false,
      editorDiffs: null,
      editorPane: 'result',
      workbenchTabs: [...DEFAULT_AGENTS_WINDOW_TABS],
      workbenchActive: 'terminal',
      browserUrl: 'about:blank',
      browserInput: 'https://',
      terminalCwd: '',
      terminalLog: [],
      terminalSessions: [],
      activeTerminalId: null,
      terminalListOpen: true,
      terminalSurface: 'user',
      activeAgentId: null,
      agentPtys: {},
      canvasContent: '# Canvas\n\nSketch ideas, notes, or a freeform brief here.\n',
      sideChatDraft: '',
      sideChatLog: [],
      plans: [],
      plansView: 'list',
      activePlanId: null,
      mindPane: 'context',
      mindContextMode: 'standard',
      agentsGoal: '',
      agentsRoles: defaultAgentRoles(),
      agentsLaunchLog: [],
    }),
    actions: {
      setSidebar: (d, px: number) => { d.sidebar = clampWidth(px, SIDEBAR_MIN, SIDEBAR_MAX) },
      setDetails: (d, px: number) => { d.details = clampWidth(px, DETAILS_MIN, DETAILS_MAX) },
      toggleSidebar: (d) => {
        if (d.narrow) d.narrowExpanded = !d.narrowExpanded
        else d.sidebar = d.sidebar === 0 ? SIDEBAR_DEFAULT : 0
      },
      setNarrow: (d, narrow: boolean) => {
        if (d.narrow === narrow) return
        d.narrow = narrow
        d.narrowExpanded = false
      },
      openDetails: (d) => { if (d.details === 0) d.details = DETAILS_DEFAULT },
      closeDetails: (d) => { d.details = 0 },
      setSidebarView: (d, view: SidebarView) => { d.sidebarView = view },
      beginOpenEditor: (d, path: string) => {
        d.editorPath = path
        d.editorBusy = true
        d.editorError = null
        d.editorDirty = false
        d.editorTruncated = false
        d.editorDiffs = null
        d.editorPane = 'result'
        ensureTab(d, 'file')
      },
      setEditorLoaded: (d, path: string, content: string, truncated: boolean) => {
        d.editorPath = path
        d.editorContent = content
        d.editorTruncated = truncated
        d.editorBusy = false
        d.editorError = null
        d.editorDirty = false
        ensureTab(d, 'file')
      },
      setEditorError: (d, path: string, message: string) => {
        d.editorPath = path
        d.editorBusy = false
        d.editorError = message
        d.editorContent = ''
        d.editorDirty = false
        d.editorTruncated = false
        ensureTab(d, 'file')
      },
      setEditorDraft: (d, content: string) => {
        d.editorContent = content
        d.editorDirty = true
      },
      setEditorDiffs: (d, diffs: EditorDiffHunk[] | null) => {
        d.editorDiffs = diffs
        if (d.editorPane === 'preview') return
        d.editorPane = diffs !== null && diffs.length > 0 ? 'both' : 'result'
      },
      setEditorPane: (d, pane: EditorPane) => { d.editorPane = pane },
      markEditorSaved: (d) => { d.editorDirty = false },
      clearEditor: (d) => { dropTab(d, 'file') },
      openWorkbenchTab: (d, kind: WorkbenchTabKind) => { ensureTab(d, kind) },
      closeWorkbenchTab: (d, kind: WorkbenchTabKind) => { dropTab(d, kind) },
      setWorkbenchActive: (d, kind: WorkbenchTabKind) => {
        if (d.workbenchTabs.includes(kind)) d.workbenchActive = kind
      },
      setBrowserInput: (d, value: string) => { d.browserInput = value },
      navigateBrowser: (d, url: string) => {
        const trimmed = url.trim()
        if (trimmed === '') return
        const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
          ? trimmed
          : `https://${trimmed}`
        d.browserInput = withScheme
        d.browserUrl = withScheme
        ensureTab(d, 'browser')
      },
      setTerminalCwd: (d, cwd: string) => {
        const active = activeTerminal(d)
        if (active === undefined) {
          const id = newTerminalId()
          d.terminalSessions = [{ id, name: 'pwsh', cwd, log: [] }]
          d.activeTerminalId = id
        } else {
          active.cwd = cwd
        }
        syncActiveTerminalMirrors(d)
      },
      appendTerminalLog: (d, line: string) => {
        let active = activeTerminal(d)
        if (active === undefined) {
          const id = newTerminalId()
          active = { id, name: 'pwsh', cwd: d.terminalCwd, log: [] }
          d.terminalSessions = [active]
          d.activeTerminalId = id
        }
        active.log.push(line)
        if (active.log.length > 500) active.log.splice(0, active.log.length - 500)
        syncActiveTerminalMirrors(d)
      },
      clearTerminalLog: (d) => {
        const active = activeTerminal(d)
        if (active !== undefined) active.log = []
        syncActiveTerminalMirrors(d)
      },
      addTerminalSession: (d, cwd?: string) => {
        const id = newTerminalId()
        const seedCwd = cwd ?? activeTerminal(d)?.cwd ?? d.terminalCwd
        d.terminalSessions.push({ id, name: 'pwsh', cwd: seedCwd, log: [] })
        d.activeTerminalId = id
        d.terminalListOpen = true
        d.terminalSurface = 'user'
        d.activeAgentId = null
        syncActiveTerminalMirrors(d)
        ensureTab(d, 'terminal')
      },
      removeTerminalSession: (d, id: string) => {
        d.terminalSessions = d.terminalSessions.filter(session => session.id !== id)
        if (d.activeTerminalId === id) {
          d.activeTerminalId = d.terminalSessions[d.terminalSessions.length - 1]?.id ?? null
        }
        syncActiveTerminalMirrors(d)
        if (d.terminalSessions.length === 0) dropTab(d, 'terminal')
      },
      setActiveTerminalId: (d, id: string) => {
        if (!d.terminalSessions.some(session => session.id === id)) return
        d.activeTerminalId = id
        d.terminalSurface = 'user'
        d.activeAgentId = null
        syncActiveTerminalMirrors(d)
      },
      setTerminalListOpen: (d, open: boolean) => { d.terminalListOpen = open },
      toggleTerminalList: (d) => { d.terminalListOpen = !d.terminalListOpen },
      selectUserTerminal: (d, id?: string) => {
        d.terminalSurface = 'user'
        d.activeAgentId = null
        if (id !== undefined && d.terminalSessions.some(session => session.id === id)) {
          d.activeTerminalId = id
          syncActiveTerminalMirrors(d)
        }
        ensureTab(d, 'terminal')
      },
      selectAgentTerminal: (d, id: string, title?: string) => {
        const key = String(id)
        if (key === '') return
        const prev = d.agentPtys[key]
        d.agentPtys[key] = {
          title: (title && title.trim() !== '') ? title.trim() : (prev?.title ?? 'Agent'),
          log: prev?.log ?? [],
          cwd: prev?.cwd ?? d.terminalCwd,
          startedAt: prev?.startedAt ?? Date.now(),
        }
        d.terminalSurface = 'agent'
        d.activeAgentId = key
        d.terminalListOpen = true
        ensureTab(d, 'terminal')
      },
      appendAgentPty: (d, id: string, line: string, title?: string, cwd?: string) => {
        const key = String(id)
        if (key === '') return
        const prev = d.agentPtys[key]
        const log = [...(prev?.log ?? []), line]
        if (log.length > 500) log.splice(0, log.length - 500)
        d.agentPtys[key] = {
          title: (title && title.trim() !== '') ? title.trim() : (prev?.title ?? 'Agent'),
          log,
          cwd: (cwd && cwd.trim() !== '') ? cwd : (prev?.cwd ?? d.terminalCwd),
          startedAt: prev?.startedAt ?? Date.now(),
        }
      },
      closeAgentPty: (d, id: string) => {
        const key = String(id)
        if (key === '') return
        const next = { ...d.agentPtys }
        delete next[key]
        d.agentPtys = next
        if (d.activeAgentId === key) {
          d.activeAgentId = null
          d.terminalSurface = 'user'
        }
      },
      setCanvasContent: (d, content: string) => { d.canvasContent = content },
      setSideChatDraft: (d, draftText: string) => { d.sideChatDraft = draftText },
      appendSideChat: (d, message: SideChatMessage) => { d.sideChatLog.push(message) },
      clearSideChat: (d) => {
        d.sideChatLog = []
        d.sideChatDraft = ''
      },
      addPlan: (d, plan: WorkbenchPlan) => {
        d.plans.unshift(plan)
        d.activePlanId = plan.id
        d.plansView = 'detail'
      },
      updatePlan: (d, plan: WorkbenchPlan) => {
        const index = d.plans.findIndex(item => item.id === plan.id)
        if (index >= 0) d.plans[index] = plan
      },
      removePlan: (d, id: string) => {
        d.plans = d.plans.filter(plan => plan.id !== id)
        if (d.activePlanId === id) {
          d.activePlanId = d.plans[0]?.id ?? null
          d.plansView = d.activePlanId === null ? 'list' : 'detail'
        }
      },
      hydratePlans: (d, next: WorkbenchPlan[]) => {
        d.plans = next
        d.activePlanId = null
        d.plansView = 'list'
      },
      setPlansView: (d, view) => { d.plansView = view },
      setActivePlanId: (d, id) => {
        d.activePlanId = id
        if (id !== null) d.plansView = 'detail'
      },
      setMindPane: (d, pane: MindPane) => { d.mindPane = pane },
      setMindContextMode: (d, mode: MindContextMode) => { d.mindContextMode = mode },
      setAgentsGoal: (d, goal: string) => { d.agentsGoal = goal },
      setAgentsRoles: (d, roles: ParallelAgentRole[]) => { d.agentsRoles = roles },
      appendAgentsLaunchLog: (d, line: string) => {
        d.agentsLaunchLog.push(line)
        if (d.agentsLaunchLog.length > 80) d.agentsLaunchLog.splice(0, d.agentsLaunchLog.length - 80)
      },
      clearAgentsLaunchLog: (d) => { d.agentsLaunchLog = [] },
    },
  })
  return handle
}
