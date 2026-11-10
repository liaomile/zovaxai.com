/**
 * Line-count helpers for Edit/Write hunks — same terminator rule as DiffBlock
 * so chat summaries and the right preview agree on +/- totals.
 */

/** One file hunk in the shape DiffBlock / openFile preview expect. */
export type DiffHunkLike = {
  path: string
  oldText: string | null
  newText: string
}

/** Count content lines on one side of a hunk. */
function sideLines(text: string | null): number {
  if (text === null || text === '') return 0
  const body = text.endsWith('\n') ? text.slice(0, -1) : text
  return body === '' ? 0 : body.split('\n').length
}

/** Sum +/- line counts across hunks. */
export function countDiffStats(diffs: readonly DiffHunkLike[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const hunk of diffs) {
    removed += sideLines(hunk.oldText)
    added += sideLines(hunk.newText)
  }
  return { added, removed }
}

/** Stats for hunks that touch a single path (ignore sibling files in a multi-hunk card). */
export function countDiffStatsForPath(
  diffs: readonly DiffHunkLike[],
  path: string,
): { added: number; removed: number } {
  return countDiffStats(diffs.filter(hunk => hunk.path === path))
}
