import { useCallback, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

const BOOKMARKS = [
  { label: 'Blank', url: 'about:blank' },
  { label: 'example.com', url: 'https://example.com' },
  { label: 'MDN', url: 'https://developer.mozilla.org/' },
] as const

export type BrowserPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  readTextFile: (path: string) => Promise<{ path: string; content: string }>
  openPath: (path: string) => Promise<void>
}

function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path)
}

function looksLikePath(value: string): boolean {
  return value.startsWith('/')
    || value.startsWith('.')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.endsWith('.html')
    || value.endsWith('.htm')
}

/** URL-bar browser with remote iframe + local HTML srcdoc preview. */
export function BrowserPanel({ useStore, actions, readTextFile, openPath }: BrowserPanelProps) {
  const url = useStore(s => s.browserUrl)
  const input = useStore(s => s.browserInput)
  const [localHtml, setLocalHtml] = useState<string | null>(null)
  const [localPath, setLocalPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const goRemote = useCallback((next?: string) => {
    setLocalHtml(null)
    setLocalPath(null)
    setError(null)
    actions.navigateBrowser(next ?? input)
  }, [actions, input])

  const openLocal = useCallback(async (path: string) => {
    const trimmed = path.trim()
    if (trimmed === '') return
    setBusy(true)
    setError(null)
    try {
      if (!isHtmlPath(trimmed)) {
        await openPath(trimmed)
        setError(`Opened ${trimmed} in the OS default app (not HTML).`)
        return
      }
      const file = await readTextFile(trimmed)
      setLocalHtml(file.content)
      setLocalPath(file.path)
      actions.setBrowserInput(file.path)
      actions.navigateBrowser(`local://${file.path}`)
    } catch (err: unknown) {
      setLocalHtml(null)
      setLocalPath(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [actions, openPath, readTextFile])

  const go = useCallback((next?: string) => {
    const target = (next ?? input).trim()
    if (target === '') return
    if (looksLikePath(target) && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(target)) {
      void openLocal(target)
      return
    }
    goRemote(target)
  }, [goRemote, input, openLocal])

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    go()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      go()
    }
  }

  const showingLocal = localHtml !== null

  return (
    <div className={css.root}>
      <form className={css.toolbar} onSubmit={onSubmit}>
        <input
          className={css.url}
          value={input}
          spellCheck={false}
          aria-label="Browser URL"
          placeholder="https://… or C:\\path\\file.html"
          onChange={(e) => { actions.setBrowserInput(e.target.value) }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className={css.btn} disabled={busy}>Go</button>
        <button
          type="button"
          className={css.btn}
          disabled={busy}
          onClick={() => {
            if (showingLocal && localPath !== null) void openLocal(localPath)
            else go(url === 'about:blank' ? input : url)
          }}
        >
          Reload
        </button>
        {showingLocal && localPath !== null && (
          <button
            type="button"
            className={css.btn}
            onClick={() => { void openPath(localPath) }}
          >
            OS open
          </button>
        )}
      </form>
      <div className={css.toolbar}>
        {BOOKMARKS.map(mark => (
          <button
            key={mark.url}
            type="button"
            className={css.btn}
            onClick={() => { goRemote(mark.url) }}
          >
            {mark.label}
          </button>
        ))}
        <button
          type="button"
          className={css.btn}
          onClick={() => {
            const path = window.prompt('Local HTML path')
            if (path !== null && path.trim() !== '') void openLocal(path.trim())
          }}
        >
          Open HTML…
        </button>
      </div>
      {error !== null && <p className={css.hint} role="alert">{error}</p>}
      {showingLocal
        ? (
          <iframe
            className={css.frame}
            title={localPath ?? 'Local HTML'}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            srcDoc={localHtml}
          />
        )
        : (
          <iframe
            className={css.frame}
            title="Browser"
            src={url}
            sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          />
        )}
      <p className={css.hint}>
        {showingLocal
          ? `Local preview: ${localPath}`
          : 'Remote sites may block iframe embedding. Prefer Open HTML… for workspace pages.'}
      </p>
    </div>
  )
}
