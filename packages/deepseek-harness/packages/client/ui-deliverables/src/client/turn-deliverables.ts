/**
 * Turn-scoped produced-file Definition and readers. Client-only and
 * model-free: the vocabulary is the mutation tools' own follow-along
 * `locations` / applied diffs, never the closing prose.
 */
import type {
  ConversationNodeDefinition, ToolResultNode,
} from '@deepseek-ai/dsh-client-runtime/client'
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-client-runtime/client'
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { countDiffStats, countDiffStatsForPath, type DiffHunkLike } from './diff-stats.ts'

/** One successful mutation recorded against a Turn (may repeat the same path). */
export interface ProducedEdit {
  readonly seq: number
  readonly path: string
  readonly added: number
  readonly removed: number
  readonly diffs: readonly DiffHunkLike[]
}

/** Immutable produced-file facts published against one Turn. */
export interface DeliverablesTurnData {
  readonly produced: readonly ProducedEdit[]
}

/** Selector match for the turn-tail ProducedFiles row. */
export interface ProducedFilesMatch {
  /** Every successful mutation in closing order (same path may appear twice). */
  readonly edits: readonly ProducedEdit[]
  /** Distinct paths among `edits` (Cursor "Edited N files"). */
  readonly fileCount: number
  /** Total added / removed lines across every edit. */
  readonly added: number
  readonly removed: number
}

declare module '@deepseek-ai/dsh-client-runtime/client' {
  interface ConversationTurnDataMap {
    /** Successful mutation paths accumulated in this Turn. */
    deliverables: DeliverablesTurnData
  }
}

interface DeliverablesState extends DeliverablesTurnData {
  readonly turn: number
  readonly calls: ReadonlyMap<string, ToolResultNode['callView']>
}

/** Narrow unverified wire diffs to well-formed hunks (empty → []). */
function narrowDiffs(diffs: unknown): DiffHunkLike[] {
  if (!Array.isArray(diffs)) return []
  const out: DiffHunkLike[] = []
  for (const hunk of diffs) {
    if (typeof hunk !== 'object' || hunk === null) continue
    const { path, oldText, newText } = hunk as Record<string, unknown>
    if (typeof path !== 'string') continue
    if (oldText !== null && typeof oldText !== 'string') continue
    if (typeof newText !== 'string') continue
    out.push({ path, oldText, newText })
  }
  return out
}

/**
 * Paths a call view reports having created or changed, by render intent rather
 * than tool name: a diff card, or a generic card whose kind is `edit`.
 */
function mutationEntries(view: ToolResultNode['callView']): ProducedEdit[] {
  if (view === null) return []
  if (view.card === 'diff') {
    const diffs = narrowDiffs(view.diffs)
    const locations = view.locations ?? []
    const paths = locations.length > 0
      ? locations.map(location => location.path)
      : [...new Set(diffs.map(hunk => hunk.path))]
    return paths.map((path) => {
      const forPath = diffs.filter(hunk => hunk.path === path)
      const stats = forPath.length > 0
        ? countDiffStatsForPath(diffs, path)
        : { added: 0, removed: 0 }
      return {
        seq: 0,
        path,
        added: stats.added,
        removed: stats.removed,
        diffs: forPath,
      }
    })
  }
  if (view.card === 'generic' && view.kind === 'edit') {
    return (view.locations ?? []).map(location => ({
      seq: 0,
      path: location.path,
      added: 0,
      removed: 0,
      diffs: [],
    }))
  }
  return []
}

/**
 * Files produced by one Turn data value (unique paths, first-seen order).
 * @param data - engine-published Deliverables data for one Turn.
 * @param seq - closing Assistant seq; later Tool settlements are excluded.
 */
export function producedForClosing(
  data: Readonly<DeliverablesTurnData> | undefined,
  seq = Number.POSITIVE_INFINITY,
): readonly string[] {
  if (data === undefined) return []
  const paths: string[] = []
  const seen = new Set<string>()
  for (const produced of data.produced) {
    if (produced.seq > seq || seen.has(produced.path)) continue
    seen.add(produced.path)
    paths.push(produced.path)
  }
  return paths
}

/**
 * Build the turn-tail match: every mutation plus summary totals.
 * @param data - engine-published Deliverables data.
 * @param seq - closing Assistant seq.
 */
export function producedMatchForClosing(
  data: Readonly<DeliverablesTurnData> | undefined,
  seq = Number.POSITIVE_INFINITY,
): ProducedFilesMatch | null {
  if (data === undefined) return null
  const edits = data.produced.filter(edit => edit.seq <= seq)
  if (edits.length === 0) return null
  const files = new Set<string>()
  let added = 0
  let removed = 0
  for (const edit of edits) {
    files.add(edit.path)
    added += edit.added
    removed += edit.removed
  }
  return { edits, fileCount: files.size, added, removed }
}

/**
 * Claim the turn-tail chain only when its closing turn produced files.
 * @param owner - Turn-tail owner currency for the closing assistant.
 */
export function selectProducedFiles(owner: TurnTailOwnerProps): ProducedFilesMatch | null {
  return producedMatchForClosing(owner.turn.data.get('deliverables'), owner.seq)
}

/** Turn-local successful mutation accumulator; it publishes no view Node. */
export const deliverablesDefinition: ConversationNodeDefinition<DeliverablesState> = {
  kind: 'deliverables',
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    if (event.type === 'tool/call') return { id: String(event.data.turn), role: 'update' }
    if (event.type === 'tool/result' && isAppendSurfaceEvent(event)) {
      return { id: String(event.data.turn), role: 'update' }
    }
    return null
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('deliverables start requires turn/start')
    return { turn: match.event.data.turn, calls: new Map(), produced: [] }
  },
  update: (context, match) => {
    if (match.event.type === 'tool/call') {
      const calls = new Map(context.state.calls)
      calls.set(
        String(match.event.data.callId),
        match.view?.for === 'call' ? match.view.view : null,
      )
      return { ...context.state, calls }
    }
    if (match.event.type !== 'tool/result') return context.state
    const result = match.event.data.message.content[0]
    if (result.isError === true) return context.state
    const callId = String(match.event.data.message.source.callId)
    // Prefer the settled result view's applied hunks when present; fall back
    // to the call-time view (creates / running-window history).
    const resultView = match.view?.for === 'result' ? match.view.view : null
    const callView = context.state.calls.get(callId) ?? null
    const source = resultView?.card === 'diff' ? resultView : callView
    const additions = mutationEntries(source).map(entry => ({
      ...entry,
      seq: match.event.seq,
    }))
    return additions.length === 0
      ? context.state
      : { ...context.state, produced: [...context.state.produced, ...additions] }
  },
  buildLocationData: (context, scope) => scope !== 'turn' || context.state === undefined
    ? null
    : {
      kind: 'turn',
      turn: context.state.turn,
      key: 'deliverables',
      value: { produced: context.state.produced },
    },
}

/**
 * Trailing path segment, the part that identifies the file at a glance.
 * @param path - Slash- or backslash-separated path.
 */
export function basename(path: string): string {
  const at = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return at === -1 ? path : path.slice(at + 1)
}

/**
 * File-mention vocabulary over one turn's produced paths, for the closing
 * message's prose.
 * @param paths - The turn's produced paths (tool order, already deduped).
 * @param openFile - The chat view's file opener.
 * @param label - Localizes the accessible open-label for a resolved path.
 */
export function producedFileMentions(
  paths: readonly string[],
  openFile: (path: string) => void,
  label: (path: string) => string,
): MarkdownFileMentions {
  return {
    resolve(value) {
      const path = paths.includes(value) ? value : onlyPathWithBasename(paths, value)
      if (path === undefined) return undefined
      return { open: () => { openFile(path) }, label: label(path), title: path }
    },
  }
}

/** The single produced path whose basename is exactly `value`, else undefined. */
function onlyPathWithBasename(paths: readonly string[], value: string): string | undefined {
  const matches = paths.filter(path => basename(path) === value)
  return matches.length === 1 ? matches[0] : undefined
}
