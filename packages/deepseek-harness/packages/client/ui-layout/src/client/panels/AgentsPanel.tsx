import { useCallback, useState } from 'react'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, ParallelAgentRole } from '../stores.ts'
import type { TerminalAgentEntry } from './TerminalPanel.tsx'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type ParallelLaunchRole = {
  name: string
  brief: string
  goal: string
}

export type ParallelLaunchResult = {
  id: string
  name: string
  worktree?: string
}

export type AgentsPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  /** Agents Window list (sessions). */
  agentEntries?: readonly TerminalAgentEntry[]
  /** Fork N child sessions and prompt each with a role brief (parallel agents). */
  spawnParallelAgents: (input: {
    goal: string
    roles: ParallelLaunchRole[]
    isolateWorktrees?: boolean
  }) => Promise<ParallelLaunchResult[]>
  /** Ask the current agent to /multitask via subagent tools. */
  promptCurrentSession: (text: string) => Promise<void>
  /** Start a blank New Agent session. */
  startNewAgent?: () => Promise<void>
  /** Open a launched session in the center conversation. */
  openAgent?: (id: string) => void
}

const PRESETS: ParallelAgentRole[] = [
  { id: 'preset-be', name: 'Backend', brief: 'API / 数据 / 服务端', goal: '' },
  { id: 'preset-fe', name: 'Frontend', brief: 'UI / 交互 / 页面', goal: '' },
  { id: 'preset-qa', name: 'Tests', brief: '单测 / 回归 / 验收', goal: '' },
  { id: 'preset-docs', name: 'Docs', brief: '文档 / README / 注释', goal: '' },
  { id: 'preset-review', name: 'Reviewer', brief: '风险审查 / 简化 / 回归点', goal: '' },
]

function newRoleId(): string {
  return `role-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function buildMultitaskPrompt(goal: string): string {
  return [
    '/multitask',
    '请把下面目标拆成可并行的子任务，并立刻并行启动（不要排队串行、不要等用户确认）。',
    '优先工具：',
    '1) 原生 Task / subagent 工具（后台委派，结果回主会话）',
    '2) mcp__nova__nova_spawn_subagents_parallel（goals_json 为 JSON 字符串数组；默认本地 git worktree 隔离）',
    '3) 定位代码 mcp__nova__nova_codebase_search；打补丁 str_replace_editor 或 mcp__nova__nova_fast_apply',
    '4) 需要产品技能时再 mcp__nova__nova_search_skills / nova_invoke_skill（不要用它们改本仓库文件）',
    '依赖步骤保持顺序；独立步骤同时跑。完成后向本主会话回传简短结论与关键文件。',
    '',
    `目标：${goal}`,
  ].join('\n')
}

/**
 * Cursor-aligned Agents Window lite:
 * agent list + New Agent + /multitask (parent-delegated subagents),
 * with optional parallel isolated sessions as a secondary path.
 */
export function AgentsPanel({
  useStore,
  actions,
  agentEntries = [],
  spawnParallelAgents,
  promptCurrentSession,
  startNewAgent,
  openAgent,
}: AgentsPanelProps) {
  const goal = useStore(s => s.agentsGoal)
  const roles = useStore(s => s.agentsRoles)
  const log = useStore(s => s.agentsLaunchLog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [isolateWorktrees, setIsolateWorktrees] = useState(true)

  const updateRole = useCallback((id: string, patch: Partial<ParallelAgentRole>) => {
    actions.setAgentsRoles(roles.map(role => (role.id === id ? { ...role, ...patch } : role)))
  }, [actions, roles])

  const multitask = useCallback(async () => {
    const trimmedGoal = goal.trim()
    if (trimmedGoal === '') {
      setError('先填写目标，再 Multitask。')
      return
    }
    setBusy(true)
    setError(null)
    actions.clearAgentsLaunchLog()
    actions.appendAgentsLaunchLog('Multitask → current agent (subagent delegation)…')
    try {
      await promptCurrentSession(buildMultitaskPrompt(trimmedGoal))
      actions.appendAgentsLaunchLog('✓ Queued /multitask on current agent.')
      actions.appendAgentsLaunchLog('Watch the main chat for parallel subagent work.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      actions.appendAgentsLaunchLog(`✗ ${message}`)
    } finally {
      setBusy(false)
    }
  }, [actions, goal, promptCurrentSession])

  const launchParallel = useCallback(async () => {
    const trimmedGoal = goal.trim()
    if (trimmedGoal === '') {
      setError('先填写总目标。')
      return
    }
    const cleaned = roles
      .map(role => ({
        name: role.name.trim() || 'Agent',
        brief: role.brief.trim(),
        goal: role.goal.trim(),
      }))
      .filter(role => role.name !== '')
    if (cleaned.length === 0) {
      setError('至少保留一个角色。')
      return
    }
    setBusy(true)
    setError(null)
    actions.clearAgentsLaunchLog()
    actions.appendAgentsLaunchLog(
      `Launching ${cleaned.length} parallel agents${isolateWorktrees ? ' (git worktree isolate)' : ''}…`,
    )
    try {
      const launched = await spawnParallelAgents({
        goal: trimmedGoal,
        roles: cleaned,
        isolateWorktrees,
      })
      for (const item of launched) {
        const wt = item.worktree ? ` @ ${item.worktree}` : ''
        actions.appendAgentsLaunchLog(`✓ ${item.name} → ${item.id}${wt}`)
      }
      actions.appendAgentsLaunchLog('Done. Open any agent from the list above.')
      if (launched[0] !== undefined) openAgent?.(launched[0].id)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      actions.appendAgentsLaunchLog(`✗ ${message}`)
    } finally {
      setBusy(false)
    }
  }, [actions, goal, isolateWorktrees, openAgent, roles, spawnParallelAgents])

  const onNewAgent = useCallback(async () => {
    if (startNewAgent === undefined) {
      setError('New Agent 不可用。')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await startNewAgent()
      actions.appendAgentsLaunchLog('✓ New Agent session started.')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
    } finally {
      setBusy(false)
    }
  }, [actions, startNewAgent])

  return (
    <div className={css.mindRoot}>
      <div className={css.toolbar}>
        <strong className={css.title}>Agents</strong>
        <button
          type="button"
          className={css.btn}
          disabled={busy || startNewAgent === undefined}
          onClick={() => { void onNewAgent() }}
        >
          New Agent
        </button>
      </div>

      <p className={css.hint}>
        对齐 Cursor：主路径是当前 Agent 委派子 Agent（/multitask）；列表管理会话；并行隔离会话为次要路径。
      </p>

      <div className={css.mindCard}>
        <div className={css.toolbar}>
          <span className={css.mindHeading} style={{ margin: 0 }}>Agents</span>
          <span className={css.hint}>{agentEntries.length}</span>
        </div>
        {agentEntries.length === 0
          ? (
            <p className={css.termListEmpty}>No agents yet. New Agent 或先在主对话发一条消息。</p>
          )
          : (
            <div className={css.termListItems} role="list">
              {agentEntries.map(agent => (
                <button
                  key={agent.id}
                  type="button"
                  role="listitem"
                  className={css.termListItem}
                  title={agent.detail}
                  onClick={() => { openAgent?.(agent.id) }}
                >
                  <span className={css.termListIcon} data-running={agent.running || undefined}>
                    {agent.running ? '●' : '○'}
                  </span>
                  <span className={css.termListLabel}>{agent.detail}</span>
                </button>
              ))}
            </div>
          )}
      </div>

      <label className={css.mindCard}>
        <span className={css.mindHeading}>Goal</span>
        <textarea
          className={css.editor}
          style={{ minHeight: 72, flex: 'none' }}
          value={goal}
          placeholder="例如：修 flaky auth 测试，并更新登录文案"
          aria-label="Agents goal"
          onChange={(e) => { actions.setAgentsGoal(e.target.value) }}
        />
      </label>

      <div className={css.toolbar}>
        <button
          type="button"
          className={css.btnPrimary}
          disabled={busy}
          title="Ask current agent to spawn async subagents"
          onClick={() => { void multitask() }}
        >
          {busy ? 'Working…' : 'Multitask'}
        </button>
        <span className={css.hint}>≈ Cursor /multitask</span>
      </div>

      <div className={css.mindCard}>
        <div className={css.toolbar}>
          <strong className={css.title}>Parallel agents</strong>
          <button
            type="button"
            className={css.btn}
            onClick={() => { setAdvancedOpen(open => !open) }}
          >
            {advancedOpen ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className={css.hint}>
          次要路径：fork 多个会话；默认每个会话一个本地 git worktree（`.nova/worktrees/`），互不改主 checkout。
        </p>
        {advancedOpen && (
          <>
            <div className={css.toolbar}>
              <button
                type="button"
                className={css.btn}
                onClick={() => {
                  actions.setAgentsRoles(PRESETS.map(role => ({ ...role, id: newRoleId() })))
                }}
              >
                Reset roles
              </button>
              <button
                type="button"
                className={css.btnPrimary}
                disabled={busy}
                onClick={() => { void launchParallel() }}
              >
                {busy ? 'Launching…' : `Launch ${roles.length}`}
              </button>
              <label className={css.hint}>
                <input
                  type="checkbox"
                  checked={isolateWorktrees}
                  onChange={(e) => { setIsolateWorktrees(e.target.checked) }}
                />
                {' '}Isolate worktrees
              </label>
            </div>
            <div className={css.mindBody}>
              {roles.map((role, index) => (
                <div key={role.id} className={css.mindCard}>
                  <div className={css.toolbar}>
                    <strong className={css.title}>Role {index + 1}</strong>
                    <button
                      type="button"
                      className={css.btn}
                      disabled={roles.length <= 1 || busy}
                      onClick={() => {
                        actions.setAgentsRoles(roles.filter(item => item.id !== role.id))
                      }}
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    className={css.url}
                    value={role.name}
                    aria-label={`Role ${index + 1} name`}
                    placeholder="Role name"
                    onChange={(e) => { updateRole(role.id, { name: e.target.value }) }}
                  />
                  <input
                    className={css.url}
                    value={role.brief}
                    aria-label={`Role ${index + 1} brief`}
                    placeholder="职责简述"
                    onChange={(e) => { updateRole(role.id, { brief: e.target.value }) }}
                  />
                  <textarea
                    className={css.editor}
                    style={{ minHeight: 56, flex: 'none' }}
                    value={role.goal}
                    aria-label={`Role ${index + 1} goal`}
                    placeholder="可选：专属子任务（空白则按总目标 + 角色职责）"
                    onChange={(e) => { updateRole(role.id, { goal: e.target.value }) }}
                  />
                </div>
              ))}
            </div>
            <div className={css.toolbar}>
              <button
                type="button"
                className={css.btn}
                disabled={busy || roles.length >= 8}
                onClick={() => {
                  actions.setAgentsRoles([
                    ...roles,
                    { id: newRoleId(), name: `Agent ${roles.length + 1}`, brief: '', goal: '' },
                  ])
                }}
              >
                + Role
              </button>
              <span className={css.hint}>最多 8 个并行 Agent</span>
            </div>
          </>
        )}
      </div>

      {error !== null && <p className={css.hint} role="alert">{error}</p>}

      {log.length > 0 && (
        <pre className={css.mindPre}>{log.join('\n')}</pre>
      )}
    </div>
  )
}
