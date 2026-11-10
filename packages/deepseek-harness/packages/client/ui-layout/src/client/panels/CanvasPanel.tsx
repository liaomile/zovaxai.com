import { useCallback, useMemo, useState } from 'react'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type CanvasPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  saveFile: (path: string, content: string) => Promise<void>
}

/** Very small markdown → HTML for the canvas preview (no deps). */
function renderMarkdownLite(source: string): string {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const withCode = escaped.replace(/`([^`]+)`/g, '<code>$1</code>')
  const lines = withCode.split('\n')
  const out: string[] = []
  let inList = false
  for (const line of lines) {
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    if (heading !== null) {
      if (inList) { out.push('</ul>'); inList = false }
      const level = heading[1]!.length
      out.push(`<h${level}>${heading[2]}</h${level}>`)
      continue
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line)
    if (bullet !== null) {
      if (!inList) { out.push('<ul>'); inList = true }
      out.push(`<li>${bullet[1]}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    if (line.trim() === '') out.push('<br/>')
    else out.push(`<p>${line}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('\n')
}

/** Freeform markdown canvas with live preview + save-to-file. */
export function CanvasPanel({ useStore, actions, saveFile }: CanvasPanelProps) {
  const content = useStore(s => s.canvasContent)
  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [status, setStatus] = useState<string | null>(null)
  const html = useMemo(() => renderMarkdownLite(content), [content])

  const onSave = useCallback(async () => {
    const path = window.prompt('Save canvas as…', 'canvas.md')
    if (path === null || path.trim() === '') return
    setStatus('Saving…')
    try {
      await saveFile(path.trim(), content)
      setStatus(`Saved ${path.trim()}`)
    } catch (err: unknown) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }, [content, saveFile])

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <strong className={css.title}>Canvas</strong>
        <button type="button" className={css.btn} data-active={mode === 'edit' || undefined} onClick={() => { setMode('edit') }}>Edit</button>
        <button type="button" className={css.btn} data-active={mode === 'split' || undefined} onClick={() => { setMode('split') }}>Split</button>
        <button type="button" className={css.btn} data-active={mode === 'preview' || undefined} onClick={() => { setMode('preview') }}>Preview</button>
        <button type="button" className={css.btnPrimary} onClick={() => { void onSave() }}>Save…</button>
      </div>
      {status !== null && <p className={css.hint}>{status}</p>}
      <div className={mode === 'split' ? `${css.split} ${css.canvasBody}` : css.canvasBody}>
        {(mode === 'edit' || mode === 'split') && (
          <textarea
            className={css.editor}
            value={content}
            spellCheck={false}
            aria-label="Canvas"
            onChange={(e) => { actions.setCanvasContent(e.target.value) }}
          />
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div
            className={css.previewPane}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  )
}
