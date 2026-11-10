/**
 * Layout plugin, browser half: one register() call contributes AppFrame into
 * the runtime's built-in 'root' slot and, in the same breath, declares the
 * four child slots (declaration = exclusive render authority), seats the
 * layout store (panel geometry), and wires the panel-action service face.
 * ctx.layout is the cross-plugin panel-action contract; navigation state lives
 * with the runtime sessions service. A second effect seats the theme
 * presenter, which projects ctx.theme snapshots onto document.body.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type { PanelActions } from './service.ts'
import { AppFrame, type AppFrameInjected } from './AppFrame.tsx'
import { createLayoutStore } from './stores.ts'
import { LayoutController } from './service.ts'
import { ThemePresenter } from './theme-presenter.ts'

export type {
  EditorDiffHunk, EditorPane, MindContextMode, MindPane, ParallelAgentRole,
  SidebarView, SideChatMessage, TerminalSession, WorkbenchPlan, WorkbenchTabKind,
} from './stores.ts'
export type { AppFrameInjected } from './AppFrame.tsx'

function joinHostPath(root: string, rel: string): string {
  const right = rel.replace(/^[/\\]+/, '')
  if (root === '' || root === '/' || root === '\\') return `/${right.replace(/\\/g, '/')}`
  const sep = root.includes('\\') ? '\\' : '/'
  return `${root.replace(/[/\\]+$/, '')}${sep}${right.replace(/[/\\]+/g, sep)}`
}

function mindWorkspaceRoots(ctx: ClientContext): string[] {
  const roots: string[] = []
  try {
    const snap = ctx.workspaces.list.getSnapshot()
    for (const item of snap.items) {
      if (item.path !== '' && !roots.includes(item.path)) roots.push(item.path)
    }
  } catch { /* ignore */ }
  return roots
}

// Contract exports only (export-convergence rule: cross-package consumers
// keep a symbol exported; test-only/package-internal symbols live off /src).
// ILayout: the ctx.layout face consumers and test fakes type against.
// OwnerShare contracts below are the render-side halves registrants compose
// against; the frame components and the store factory are package-internal.
export { LayoutController } from './service.ts'
export type { ILayout } from './service.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The outward face only; the concrete service stays inside this plugin. */
    layout: import('./service.ts').ILayout
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    // The 'root' entry itself is the runtime's built-in slot (declared
    // there); these four are the frame's children, declared by the same
    // register() call that contributes AppFrame. Session owners never pass
    // sessionId: the framework injects it as a standard prop.
    /**
     * The whole left column. OCCUPIED by ui-sidebar's SidebarRoot, which
     * declares the workspace and settings seats inside it — registering here
     * replaces the navigation column outright rather than adding to it, and
     * the seats it declares disappear with it. To add something to the
     * sidebar, register into one of those inner seats instead.
     *
     * The occupant receives the frame's live column state (collapsed, width)
     * and is expected to render the compact control rail while collapsed.
     */
    'sidebar': { kind: 'single'; scope: 'root'; owner: SidebarOwnerProps }
    /**
     * The whole center column, across both the no-session hero and a live
     * conversation. OCCUPIED by ui-conversation's ConversationRoot, which
     * declares the session body, composer, and input seats inside it —
     * registering here replaces the entire conversation surface (and removes
     * every seat it declares) rather than adding to it.
     *
     * Current-session-optional: the occupant owns both states without
     * changing its React identity, so it keeps its own state across a session
     * switch. It receives no owner props; session facts arrive through the
     * framework hooks of the `session-maybe` scope.
     */
    'conversation': { kind: 'single'; scope: 'session-maybe'; owner: ConvOwnerProps }
    /**
     * The right details column, shown when the layout opens it. OCCUPIED by
     * ui-conversation's DetailsPanel, which declares the tool-details seat
     * inside it — registering here replaces the column and takes that seat
     * with it. Absent an occupant the column renders nothing.
     *
     * No owner props: the framework injects the session id and hooks for the
     * `session` scope, and `ctx.layout` owns whether the column is open.
     */
    'details': { kind: 'single'; scope: 'session'; owner: DetailsOwnerProps }
    /**
     * Frame-wide floating layer, above every column and outside their scroll
     * containers. Deliberately generic and unowned by any feature: a badge, a
     * toast stack or a status pill all belong here, and entries order among
     * themselves. The layer itself is click-through — entries opt back into
     * pointer events — so an occupant never blocks the app underneath.
     *
     * This is the additive seat for a frame-wide surface of your own: a fresh
     * `id` is added beside the shipped entries instead of replacing them.
     */
    'shell.overlay': { kind: 'list'; scope: 'root' }
  }
}

// OwnerShare contracts — the render-side share the slot owner supplies at
// renderSlot. Registrants IMPORT these and compose their full component props
// through the four-share intersection (PropsRuntime & PropsRenderSlots &
// PropsStore & I). Conversation business state and actions arrive through
// framework-standard hooks and each registrant's inject face, not owner props.

/** Sidebar owner share: live column state from the frame's concession solve. */
export interface SidebarOwnerProps {
  /** True when the sidebar is closed (the column renders the compact control rail). */
  collapsed: boolean
  /** Rendered column width in px (SIDEBAR_COLLAPSED when collapsed). */
  width: number
  /** Activity-rail selection: sessions browser vs Files tree. */
  sidebarView: import('./stores.ts').SidebarView
}

/** Conversation owner share: business state and actions belong to the registrant. */
export interface ConvOwnerProps {}

/** Details owner share: empty — sessionId arrives as a framework-standard prop. */
export interface DetailsOwnerProps {}

/** Required services (cordis fiber inject — the loader passes all module exports as an object plugin). */
export const inject = ['slots', 'theme', 'workspaces', 'sessions']

/**
 * Client plugin body: provide ctx.layout, then one register() call — AppFrame
 * into 'root' with the four child-slot declarations, the layout store seat,
 * and the inject hook that hands the store's bound actions to the service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const layout = new LayoutController()
  ctx.effect(() => {
    const disposeService = ctx.reflect.provide('layout', layout)
    const disposeRegistration = ctx.slots.register({
      name: 'root',
      children: {
        'sidebar': { kind: 'single', scope: 'root' },
        'conversation': { kind: 'single', scope: 'session-maybe' },
        'details': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
      },
      // Exclusive store: the factory itself — the framework instantiates per
      // entry and delivers useStore/actions to AppFrame as standard props.
      store: createLayoutStore,
      // Connect the root store to ctx.layout and hand Host file write to the
      // workbench Save action.
      inject: (actions: PanelActions): AppFrameInjected => {
        layout.attachPanels(actions)
        return {
          saveFile: async (path, content) => {
            await ctx.workspaces.writeTextFile(path, content)
          },
          openFilePath: async (path) => {
            layout.beginOpenEditor(path)
            try {
              const file = await ctx.workspaces.readTextFile(path)
              layout.setEditorLoaded(file.path, file.content, file.truncated)
            } catch (err: unknown) {
              layout.setEditorError(path, err instanceof Error ? err.message : String(err))
            }
          },
          listDirectory: async (path) => {
            const listing = await ctx.workspaces.listDirectory(path, undefined, { includeFiles: true })
            return {
              path: listing.path,
              entries: listing.entries.map(entry => ({
                name: entry.name,
                path: entry.path,
                kind: entry.kind ?? 'directory',
              })),
            }
          },
          readTextFile: async (path) => {
            const file = await ctx.workspaces.readTextFile(path)
            return { path: file.path, content: file.content }
          },
          openPath: async (path) => {
            await ctx.workspaces.openPath(path)
          },
          runCommand: async (command, options) => {
            const snap = ctx.sessions.list.getSnapshot()
            const sid = snap.current
            const title = sid !== undefined
              ? (snap.byId[sid]?.displayTitle || 'Agent')
              : 'Agent'
            if (sid !== undefined) {
              ctx.layout.appendAgentPty(String(sid), command, String(title), options?.cwd)
            }
            const result = await ctx.workspaces.runCommand(command, options)
            if (sid !== undefined) {
              const body = [result.stdout, result.stderr].filter(part => part.trim() !== '').join('\n')
              if (body !== '') ctx.layout.appendAgentPty(String(sid), body, String(title), result.cwd)
            }
            return result
          },
          promptCurrentSession: async (text) => {
            const snapshot = ctx.sessions.list.getSnapshot()
            const current = snapshot.current
            if (current === undefined) {
              throw new Error('No active session. Start or open a session first.')
            }
            const face = ctx.sessions.binding(current)?.session
            if (face === undefined) {
              throw new Error('Current session is not ready yet.')
            }
            const result = await face.prompt([{ type: 'text', text }], 'queue')
            if (!result.ok) {
              throw new Error(result.error.message)
            }
          },
          startSideSession: async () => {
            ctx.workspaces.startSession()
          },
          openAgent: (id) => {
            ctx.sessions.open(id as never)
          },
          getContextSnapshot: () => {
            const snapshot = ctx.sessions.list.getSnapshot()
            const current = snapshot.current
            if (current === undefined) return {}
            const face = ctx.sessions.binding(current)?.session
            if (face === undefined) return {}
            const pressure = face.projections.faceOf('contextPressure').getSnapshot() as
              | { pressureTokens?: number; projectedTokens?: number; contextWindow?: number }
              | undefined
            const breakdown = face.projections.faceOf('contextBreakdown').getSnapshot() as
              | { systemTokens?: number; toolsTokens?: number; messageTokens?: number }
              | undefined
            return {
              ...(pressure ?? {}),
              ...(breakdown ?? {}),
            }
          },
          loadMemory: async () => {
            const roots = mindWorkspaceRoots(ctx)
            const today = new Date()
            const yyyy = today.getFullYear()
            const mm = String(today.getMonth() + 1).padStart(2, '0')
            const dd = String(today.getDate()).padStart(2, '0')
            const dayName = `${yyyy}-${mm}-${dd}.md`
            const longCandidates = [
              'reports/nova_workspace/MEMORY.md',
              'MEMORY.md',
              'reports/MEMORY.md',
            ]
            const shortCandidates = [
              `reports/nova_workspace/memory/${dayName}`,
              `memory/${dayName}`,
              `reports/nova_workspace/memory`,
            ]
            let longTerm = ''
            let longPath: string | undefined
            let shortTerm = ''
            let shortPath: string | undefined
            for (const root of roots) {
              for (const rel of longCandidates) {
                const path = joinHostPath(root, rel)
                try {
                  const file = await ctx.workspaces.readTextFile(path)
                  longTerm = file.content
                  longPath = file.path
                  break
                } catch { /* try next */ }
              }
              if (longTerm !== '') break
            }
            for (const root of roots) {
              for (const rel of shortCandidates) {
                const path = joinHostPath(root, rel)
                try {
                  if (rel.endsWith('memory')) {
                    const listing = await ctx.workspaces.listDirectory(path, undefined, { includeFiles: true })
                    const days = listing.entries
                      .filter(entry => (entry.kind ?? 'file') === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/i.test(entry.name))
                      .map(entry => entry.name)
                      .sort()
                      .reverse()
                    const pick = days[0]
                    if (pick === undefined) continue
                    const file = await ctx.workspaces.readTextFile(joinHostPath(listing.path, pick))
                    shortTerm = file.content
                    shortPath = file.path
                    break
                  }
                  const file = await ctx.workspaces.readTextFile(path)
                  shortTerm = file.content
                  shortPath = file.path
                  break
                } catch { /* try next */ }
              }
              if (shortTerm !== '') break
            }
            return { shortTerm, longTerm, shortPath, longPath }
          },
          loadWorld: async () => {
            const roots = mindWorkspaceRoots(ctx)
            const candidates = [
              '.nova/file_tree_world_model.ide.json',
              'nova_ide_src/.nova/file_tree_world_model.ide.json',
              'file_tree_world_model.ide.json',
            ]
            for (const root of roots) {
              for (const rel of candidates) {
                const path = joinHostPath(root, rel)
                try {
                  const file = await ctx.workspaces.readTextFile(path)
                  const parsed = JSON.parse(file.content) as {
                    root?: string
                    generated_at?: string
                    stats?: Record<string, unknown>
                    pyramid?: Record<string, string[]>
                  }
                  return {
                    root: parsed.root,
                    generatedAt: parsed.generated_at,
                    stats: parsed.stats,
                    pyramid: parsed.pyramid,
                    path: file.path,
                  }
                } catch { /* try next */ }
              }
            }
            return null
          },
          persistContextMode: async (mode) => {
            const roots = mindWorkspaceRoots(ctx)
            const payload = `${JSON.stringify({ chat_context_mode: mode, updated_at: new Date().toISOString() }, null, 2)}\n`
            const rel = 'reports/nova_workspace/.nova_ide_context_mode.json'
            let lastError: unknown
            for (const root of roots) {
              const path = joinHostPath(root, rel)
              try {
                await ctx.workspaces.writeTextFile(path, payload)
                return
              } catch (err) {
                lastError = err
              }
            }
            // Fallback: write under the listed directory root.
            try {
              const listing = await ctx.workspaces.listDirectory(undefined, undefined, { includeFiles: false })
              await ctx.workspaces.writeTextFile(joinHostPath(listing.path, rel), payload)
              return
            } catch (err) {
              throw lastError instanceof Error ? lastError : err
            }
          },
          spawnParallelAgents: async ({ goal, roles, isolateWorktrees = true }) => {
            const snapshot = ctx.sessions.list.getSnapshot()
            const current = snapshot.current
            if (current === undefined) {
              throw new Error('No active session. Open or start a session first.')
            }
            if (snapshot.byId[current]?.blank === true) {
              throw new Error('Current session is blank. Send one message in the main chat first.')
            }
            const capped = roles.slice(0, 8)
            const launched: { id: string; name: string; worktree?: string }[] = []
            for (const role of capped) {
              let worktree = ''
              if (isolateWorktrees) {
                const slug = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
                const rel = `.nova/worktrees/${slug}`
                try {
                  await ctx.workspaces.runCommand(
                    `git worktree add -b nova/task-${slug} "${rel}" HEAD`,
                    {
                      timeoutMs: 90_000,
                      ...(snapshot.byId[current]?.cwd ? { cwd: snapshot.byId[current]!.cwd } : {}),
                    },
                  )
                  worktree = rel
                } catch {
                  worktree = ''
                }
              }
              const childId = await ctx.sessions.fork({
                sessionId: current,
                increaseTitle: true,
              })
              // Binding can lag one tick after fork lands in the list store.
              let face = ctx.sessions.binding(childId)?.session
              if (face === undefined) {
                await new Promise<void>(resolve => { setTimeout(resolve, 50) })
                face = ctx.sessions.binding(childId)?.session
              }
              if (face === undefined) {
                throw new Error(`Forked session ${childId} is not ready yet.`)
              }
              const title = role.name.trim() || 'Agent'
              const renamed = await face.rename(title)
              if (!renamed.ok) {
                throw new Error(`Rename ${title} failed: ${renamed.error.message}`)
              }
              const task = role.goal.trim()
                || `请聚焦「${title}」相关工作，围绕总目标交付可验证结果。`
              const text = [
                `【并行 Agent · ${title}】`,
                role.brief.trim() !== '' ? `职责：${role.brief.trim()}` : '',
                `总目标：${goal.trim()}`,
                `你的子任务：${task}`,
                worktree !== ''
                  ? `隔离 git worktree：${worktree}。所有读写必须在此目录，不要改主 checkout。完成后可用 mcp__nova__nova_worktree_apply。`
                  : '未创建 worktree 时与主工作区共享文件，注意冲突。',
                '编码：mcp__nova__nova_codebase_search 定位；str_replace_editor 或 mcp__nova__nova_fast_apply 打补丁。禁止整文件重写。',
                '规则：只做本角色范围；可改代码/跑命令；不要等待其他角色。',
              ].filter(part => part !== '').join('\n')
              const prompted = await face.prompt([{ type: 'text', text }], 'queue')
              if (!prompted.ok) {
                throw new Error(`${title}: ${prompted.error.message}`)
              }
              launched.push({ id: childId, name: title, worktree: worktree || undefined })
            }
            return launched
          },
        }
      },
    }, AppFrame)
    return () => {
      disposeRegistration()
      // provide()'s disposer settles asynchronously; teardown is synchronous fire-and-forget.
      void disposeService()
    }
  }, 'ui-layout: service + root registration')

  // Theme presentation: pure DOM writes from resolved snapshots — initial
  // state through the getter once, then event-driven only; no React path.
  ctx.effect(() => {
    const presenter = new ThemePresenter()
    presenter.apply(ctx.theme.getTheme())
    const off = ctx.on('theme/change', (snapshot) => { presenter.apply(snapshot) })
    return () => {
      off()
      presenter.dispose()
    }
  }, 'ui-layout: theme presenter')
}
