// @vitest-environment jsdom
/**
 * createLayoutStore unit account: init shape, the action write set (clamp
 * inside actions), and the absence of browser persistence. Uses the
 * test-sanctioned path: factory self-call + .create() gives the
 * real engine instance (same create path as production).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createLayoutStore } from '@deepseek-ai/dsh-client-ui-layout/src/client/stores.ts'
import {
  DETAILS_DEFAULT, DETAILS_MAX, DETAILS_MIN,
  SIDEBAR_DEFAULT, SIDEBAR_MAX, SIDEBAR_MIN,
} from '@deepseek-ai/dsh-client-ui-layout/src/client/columns.ts'

const PERSIST_KEY = 'dsh.layout.panels'

beforeEach(() => { localStorage.clear() })

describe('createLayoutStore', () => {
  it('initializes the sidebar at its default width, details closed, wide viewport assumed', () => {
    const { store } = createLayoutStore().create()
    expect(store.getSnapshot()).toEqual({
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
      workbenchTabs: ['browser', 'changes', 'terminal'],
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
      agentsRoles: [
        { id: 'role-be', name: 'Backend', brief: 'API / 数据 / 服务端逻辑', goal: '' },
        { id: 'role-fe', name: 'Frontend', brief: 'UI / 交互 / 页面', goal: '' },
        { id: 'role-qa', name: 'Tests', brief: '单测 / 回归 / 验收', goal: '' },
      ],
      agentsLaunchLog: [],
    })
  })

  it('each create() is an independent instance (factory is not a singleton)', () => {
    const a = createLayoutStore().create()
    const b = createLayoutStore().create()
    a.actions.setSidebar(400)
    expect(b.store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('setSidebar/setDetails clamp into the contract ranges', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(1)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MIN)
    actions.setSidebar(9999)
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_MAX)
    actions.setDetails(1)
    expect(store.getSnapshot().details).toBe(DETAILS_MIN)
    actions.setDetails(9999)
    expect(store.getSnapshot().details).toBe(DETAILS_MAX)
  })

  it('toggleSidebar flips closed <-> contract default (drag width forgotten)', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(0)
    actions.toggleSidebar()
    expect(store.getSnapshot().sidebar).toBe(SIDEBAR_DEFAULT)
  })

  it('narrow toggleSidebar flips only the re-expand override; the width preference survives', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setSidebar(400)
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot()).toMatchObject({ sidebar: 400, details: DETAILS_DEFAULT, narrow: true, narrowExpanded: true })
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(false)
    expect(store.getSnapshot().sidebar).toBe(400)
  })

  it('crossing the breakpoint drops the override; a same-value setNarrow keeps it', () => {
    const { store, actions } = createLayoutStore().create()
    actions.setNarrow(true)
    actions.toggleSidebar()
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(true)
    actions.setNarrow(false)
    expect(store.getSnapshot()).toMatchObject({ narrow: false, narrowExpanded: false })
    actions.setNarrow(true)
    expect(store.getSnapshot().narrowExpanded).toBe(false)
  })

  it('openDetails uses the contract default, preserves an open width, and closeDetails zeroes', () => {
    const { store, actions } = createLayoutStore().create()
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(DETAILS_DEFAULT)
    actions.setDetails(500)
    actions.openDetails()
    expect(store.getSnapshot().details).toBe(500)
    actions.closeDetails()
    expect(store.getSnapshot().details).toBe(0)
  })

  it('does not persist panel geometry', () => {
    const first = createLayoutStore().create()
    first.actions.setSidebar(400)
    first.actions.openDetails()
    first.actions.setDetails(500)
    expect(localStorage.getItem(PERSIST_KEY)).toBeNull()

    const second = createLayoutStore().create()
    expect(second.store.getSnapshot()).toMatchObject({
      sidebar: SIDEBAR_DEFAULT,
      details: DETAILS_DEFAULT,
      narrow: false,
      narrowExpanded: false,
      sidebarView: 'sessions',
      editorPath: null,
    })
  })

  it('editor actions load, draft, save, and clear the workbench buffer', () => {
    const { store, actions } = createLayoutStore().create()
    actions.beginOpenEditor('/tmp/a.ts')
    expect(store.getSnapshot()).toMatchObject({
      editorPath: '/tmp/a.ts',
      editorBusy: true,
      workbenchTabs: ['browser', 'changes', 'terminal', 'file'],
      workbenchActive: 'file',
      details: DETAILS_DEFAULT,
    })
    actions.setEditorLoaded('/tmp/a.ts', 'hello', false)
    expect(store.getSnapshot()).toMatchObject({
      editorContent: 'hello', editorBusy: false, editorDirty: false,
    })
    actions.setEditorDraft('console.log(1)')
    expect(store.getSnapshot().editorDirty).toBe(true)
    actions.markEditorSaved()
    expect(store.getSnapshot().editorDirty).toBe(false)
    actions.clearEditor()
    expect(store.getSnapshot()).toMatchObject({
      editorPath: null,
      workbenchTabs: ['browser', 'changes', 'terminal'],
      workbenchActive: 'terminal',
      details: DETAILS_DEFAULT,
    })
  })

  it('editor diffs switch the preview pane to both and clear on reopen', () => {
    const { store, actions } = createLayoutStore().create()
    actions.beginOpenEditor('/tmp/a.ts')
    actions.setEditorDiffs([{ path: 'a.ts', oldText: 'a', newText: 'b' }])
    expect(store.getSnapshot()).toMatchObject({
      editorPane: 'both',
      editorDiffs: [{ path: 'a.ts', oldText: 'a', newText: 'b' }],
    })
    actions.setEditorPane('diff')
    expect(store.getSnapshot().editorPane).toBe('diff')
    actions.beginOpenEditor('/tmp/b.ts')
    expect(store.getSnapshot()).toMatchObject({ editorDiffs: null, editorPane: 'result' })
  })

  it('plus-menu tabs open beside the file buffer and survive file close', () => {
    const { store, actions } = createLayoutStore().create()
    actions.beginOpenEditor('/tmp/a.ts')
    actions.openWorkbenchTab('terminal')
    actions.openWorkbenchTab('browser')
    expect(store.getSnapshot().workbenchTabs).toEqual(['browser', 'changes', 'terminal', 'file'])
    expect(store.getSnapshot().workbenchActive).toBe('browser')
    actions.clearEditor()
    expect(store.getSnapshot()).toMatchObject({
      workbenchTabs: ['browser', 'changes', 'terminal'],
      workbenchActive: 'browser',
      details: DETAILS_DEFAULT,
    })
    actions.navigateBrowser('example.com')
    expect(store.getSnapshot().browserUrl).toBe('https://example.com')
    actions.addPlan({ id: 'p1', title: 'Ship', body: '- a', done: false })
    expect(store.getSnapshot()).toMatchObject({
      plansView: 'detail',
      activePlanId: 'p1',
    })
  })

  it('agent list selects a read-only PTY without dropping pwsh', () => {
    const { store, actions } = createLayoutStore().create()
    actions.selectAgentTerminal('sess-1', 'Nova (git status)')
    expect(store.getSnapshot()).toMatchObject({
      terminalSurface: 'agent',
      activeAgentId: 'sess-1',
      workbenchActive: 'terminal',
    })
    expect(store.getSnapshot().agentPtys['sess-1']?.title).toBe('Nova (git status)')
    actions.selectUserTerminal()
    expect(store.getSnapshot().terminalSurface).toBe('user')
    expect(store.getSnapshot().activeAgentId).toBeNull()
    actions.selectAgentTerminal('sess-1', 'Nova (git status)')
    actions.appendAgentPty('sess-1', 'PS> git status')
    expect(store.getSnapshot().agentPtys['sess-1']?.log).toEqual(['PS> git status'])
    actions.closeAgentPty('sess-1')
    expect(store.getSnapshot().agentPtys['sess-1']).toBeUndefined()
    expect(store.getSnapshot().terminalSurface).toBe('user')
  })
})
