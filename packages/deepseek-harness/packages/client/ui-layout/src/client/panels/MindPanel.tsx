import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, MindContextMode, MindPane } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type MindContextSnapshot = {
  pressureTokens?: number
  projectedTokens?: number
  contextWindow?: number
  systemTokens?: number
  toolsTokens?: number
  messageTokens?: number
}

export type MindMemorySnapshot = {
  shortTerm: string
  longTerm: string
  shortPath?: string
  longPath?: string
}

export type MindWorldSnapshot = {
  root?: string
  generatedAt?: string
  stats?: Record<string, unknown>
  pyramid?: Record<string, string[]>
  path?: string
}

export type MindPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  /** Live long-context meter from the current session projections. */
  getContextSnapshot: () => MindContextSnapshot
  /** Load short / long memory markdown from the Nova workspace. */
  loadMemory: () => Promise<MindMemorySnapshot>
  /** Load file-tree world model IDE snapshot. */
  loadWorld: () => Promise<MindWorldSnapshot | null>
  /** Persist IDE context depth so the Nova runtime prefers it. */
  persistContextMode: (mode: MindContextMode) => Promise<void>
}

const MODE_HELP: Record<MindContextMode, string> = {
  fast: '轻量：本会话对话 + 突触热记忆（约 4–8K）',
  standard: '标准：+ 跨会话记忆 + 因果线索 + 热文件（约 12–20K）',
  deep: '深度理解：+ 项目脑 / PFNN / 数学层（约 40–60K，任务向）',
}

const PANES: { id: MindPane; label: string }[] = [
  { id: 'context', label: '长上下文' },
  { id: 'memory', label: '记忆' },
  { id: 'world', label: '世界地图' },
]

function formatTokens(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(Math.round(n))
}

/** Nova Mind workbench: long-context meter, memory layers, world map. */
export function MindPanel({
  useStore, actions, getContextSnapshot, loadMemory, loadWorld, persistContextMode,
}: MindPanelProps) {
  const pane = useStore(s => s.mindPane)
  const mode = useStore(s => s.mindContextMode)
  const [ctx, setCtx] = useState<MindContextSnapshot>({})
  const [memory, setMemory] = useState<MindMemorySnapshot>({ shortTerm: '', longTerm: '' })
  const [world, setWorld] = useState<MindWorldSnapshot | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refreshContext = useCallback(() => {
    setCtx(getContextSnapshot())
  }, [getContextSnapshot])

  const refreshAll = useCallback(async () => {
    setBusy(true)
    setStatus(null)
    try {
      refreshContext()
      const [mem, map] = await Promise.all([loadMemory(), loadWorld()])
      setMemory(mem)
      setWorld(map)
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [loadMemory, loadWorld, refreshContext])

  useEffect(() => {
    void refreshAll()
    const timer = window.setInterval(() => { refreshContext() }, 2000)
    return () => { window.clearInterval(timer) }
  }, [refreshAll, refreshContext])

  const occupancy = useMemo(() => {
    const used = ctx.pressureTokens
    const window = ctx.contextWindow
    if (used === undefined || window === undefined || window <= 0) return null
    const percent = Math.max(0, Math.min(100, Math.round((used / window) * 100)))
    return { used, window, percent }
  }, [ctx])

  const onMode = async (next: MindContextMode) => {
    actions.setMindContextMode(next)
    setStatus('Saving context mode…')
    try {
      await persistContextMode(next)
      setStatus(`Context depth → ${next}`)
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const pyramidLevels = useMemo(() => {
    const pyramid = world?.pyramid
    if (pyramid === undefined) return [] as { level: string; items: string[] }[]
    return Object.keys(pyramid)
      .sort()
      .map(level => ({ level, items: pyramid[level] ?? [] }))
  }, [world])

  return (
    <div className={css.mindRoot}>
      <div className={css.toolbar}>
        <strong className={css.title}>认知 · Mind</strong>
        <button type="button" className={css.btn} disabled={busy} onClick={() => { void refreshAll() }}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className={css.mindTabs} role="tablist" aria-label="Mind panes">
        {PANES.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={pane === tab.id}
            className={clsx(css.btn, pane === tab.id && css.btnPrimary)}
            onClick={() => { actions.setMindPane(tab.id) }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {status !== null && <p className={css.hint}>{status}</p>}

      {pane === 'context' && (
        <div className={css.mindBody}>
          <section className={css.mindCard}>
            <h3 className={css.mindHeading}>长上下文占用</h3>
            {occupancy === null ? (
              <p className={css.hint}>当前会话尚无 contextPressure（发一轮对话后会出现）。</p>
            ) : (
              <>
                <div className={css.mindMeterTrack} aria-hidden>
                  <div className={css.mindMeterFill} style={{ width: `${occupancy.percent}%` }} />
                </div>
                <p className={css.mindMetric}>
                  {occupancy.percent}% · {formatTokens(occupancy.used)} / {formatTokens(occupancy.window)}
                  {ctx.projectedTokens !== undefined && ctx.projectedTokens > 0
                    ? ` · next +${formatTokens(ctx.projectedTokens)}`
                    : ''}
                </p>
                <ul className={css.mindBreakdown}>
                  <li>System {formatTokens(ctx.systemTokens)}</li>
                  <li>Tools {formatTokens(ctx.toolsTokens)}</li>
                  <li>Messages {formatTokens(ctx.messageTokens)}</li>
                </ul>
              </>
            )}
          </section>

          <section className={css.mindCard}>
            <h3 className={css.mindHeading}>上下文理解深度</h3>
            <p className={css.hint}>{MODE_HELP[mode]}</p>
            <div className={css.toolbar}>
              {(['fast', 'standard', 'deep'] as const).map(option => (
                <button
                  key={option}
                  type="button"
                  className={clsx(css.btn, mode === option && css.btnPrimary)}
                  onClick={() => { void onMode(option) }}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className={css.hint}>
              写入 `reports/nova_workspace/.nova_ide_context_mode.json`，Nova 运行时优先采用。
            </p>
          </section>
        </div>
      )}

      {pane === 'memory' && (
        <div className={css.mindBody}>
          <section className={css.mindCard}>
            <h3 className={css.mindHeading}>短期记忆 · 今日日记</h3>
            {memory.shortPath !== undefined && (
              <p className={css.hint}>{memory.shortPath}</p>
            )}
            <pre className={css.mindPre}>{memory.shortTerm.trim() || '（暂无短时日记）'}</pre>
          </section>
          <section className={css.mindCard}>
            <h3 className={css.mindHeading}>长期记忆 · MEMORY.md</h3>
            {memory.longPath !== undefined && (
              <p className={css.hint}>{memory.longPath}</p>
            )}
            <pre className={css.mindPre}>{memory.longTerm.trim() || '（暂无长期记忆文件）'}</pre>
          </section>
        </div>
      )}

      {pane === 'world' && (
        <div className={css.mindBody}>
          <section className={css.mindCard}>
            <h3 className={css.mindHeading}>世界地图 · 文件树世界模型</h3>
            {world === null ? (
              <p className={css.hint}>
                未找到 `.nova/file_tree_world_model.ide.json`。可在 Nova Agent 侧生成后刷新。
              </p>
            ) : (
              <>
                <p className={css.hint}>
                  {world.root ?? 'workspace'}
                  {world.generatedAt !== undefined ? ` · ${world.generatedAt}` : ''}
                  {world.path !== undefined ? ` · ${world.path}` : ''}
                </p>
                {world.stats !== undefined && (
                  <ul className={css.mindBreakdown}>
                    {'n_files' in world.stats && <li>Files {String(world.stats.n_files)}</li>}
                    {'n_dirs' in world.stats && <li>Dirs {String(world.stats.n_dirs)}</li>}
                    {'n_communities' in world.stats && <li>Communities {String(world.stats.n_communities)}</li>}
                    {'pagerank_top1' in world.stats && <li>Top {String(world.stats.pagerank_top1)}</li>}
                  </ul>
                )}
                {pyramidLevels.map(level => (
                  <div key={level.level} className={css.mindPyramid}>
                    <div className={css.mindPyramidLevel}>{level.level}</div>
                    <div className={css.mindPyramidItems}>
                      {level.items.slice(0, level.level === 'L0' || level.level === 'L1' ? 40 : 16).map(item => (
                        <span key={`${level.level}:${item}`} className={css.mindChip}>{item}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
