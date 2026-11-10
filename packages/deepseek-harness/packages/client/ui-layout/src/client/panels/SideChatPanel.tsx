import { useCallback, useState } from 'react'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

export type SideChatPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
  /** Send text into the current Agent session. */
  promptCurrentSession: (text: string) => Promise<void>
  /** Optional: fork / start a blank session for a dedicated side chat. */
  startSideSession?: (() => Promise<void>) | undefined
}

/** Side chat that routes prompts into the live Agent session. */
export function SideChatPanel({
  useStore, actions, promptCurrentSession, startSideSession,
}: SideChatPanelProps) {
  const draft = useStore(s => s.sideChatDraft)
  const log = useStore(s => s.sideChatLog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = useCallback(async () => {
    const text = draft.trim()
    if (text === '' || busy) return
    actions.appendSideChat({ role: 'user', text })
    actions.setSideChatDraft('')
    setBusy(true)
    setError(null)
    try {
      await promptCurrentSession(text)
      actions.appendSideChat({
        role: 'assistant',
        text: 'Sent to the main Agent session. Watch the center conversation for the reply.',
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      actions.appendSideChat({
        role: 'assistant',
        text: `Could not send: ${message}`,
      })
    } finally {
      setBusy(false)
    }
  }, [actions, busy, draft, promptCurrentSession])

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <strong className={css.title}>Side Chat</strong>
        <button type="button" className={css.btn} onClick={() => { actions.clearSideChat() }}>Clear</button>
        {startSideSession !== undefined && (
          <button
            type="button"
            className={css.btn}
            onClick={() => { void startSideSession() }}
          >
            New session
          </button>
        )}
      </div>
      <div className={css.chatLog}>
        {log.length === 0 && (
          <p className={css.hint}>
            Notes here are sent into the current Agent session (same as the center composer).
          </p>
        )}
        {log.map((message, index) => (
          <div
            key={`${message.role}:${index}:${message.text.slice(0, 16)}`}
            className={message.role === 'user' ? css.chatUser : css.chatAssistant}
          >
            {message.text}
          </div>
        ))}
      </div>
      {error !== null && <p className={css.hint} role="alert">{error}</p>}
      <form
        className={css.toolbar}
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <input
          className={css.url}
          value={draft}
          aria-label="Side chat message"
          placeholder="Ask the Agent…"
          disabled={busy}
          onChange={(e) => { actions.setSideChatDraft(e.target.value) }}
        />
        <button type="submit" className={css.btnPrimary} disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
