/**
 * Sidebar shell: activity rail (Files / Chat) + column content. Collapse is a
 * slide plus crossfade (see prior module doc). The browsing region between
 * the New Session button and the foot is either the Files tree or the
 * `sidebar.workspaces` registrant; the foot holds settings + footer actions.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  BrandWordmark, FishLogo,
  IconFolderOpenOutline16, IconNewChatOutline16, IconPanelLeftOutline16,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarRootComponentProps } from './contract/slots.ts'
import { FilesExplorer } from './FilesExplorer.tsx'
import css from './SidebarRoot.module.css'

/** Wide-content unmount delay; matches the 150ms wide-content fade-out. */
const COLLAPSE_SETTLE_MS = 150

/**
 * How long the column's scrollbars stay drawn after the pointer leaves it.
 */
const SCROLLBAR_LINGER_MS = 2000

/**
 * Render the sidebar column shell.
 * @param props - composed slot props (runtime share + injected callbacks, contract/slots.ts).
 * @returns the sidebar element tree.
 */
export function SidebarRoot({
  collapsed,
  width,
  sidebarView,
  startSession,
  toggleSidebar,
  setSidebarView,
  listDirectory,
  readTextFile,
  beginOpenEditor,
  setEditorLoaded,
  setEditorError,
  workspaceRootPath,
  t,
  renderSlot,
}: SidebarRootComponentProps) {
  const [settled, setSettled] = useState(collapsed)
  useEffect(() => {
    if (!collapsed) { setSettled(false); return }
    const timer = window.setTimeout(() => { setSettled(true) }, COLLAPSE_SETTLE_MS)
    return () => { window.clearTimeout(timer) }
  }, [collapsed])
  const wide = !collapsed || !settled

  const lastWideWidth = useRef(width)
  if (!collapsed) lastWideWidth.current = width

  const everWide = useRef(!collapsed)
  if (!collapsed) everWide.current = true

  const column = useRef<HTMLDivElement>(null)
  const [pointerInside, setPointerInside] = useState(false)
  const lingerTimer = useRef<number | undefined>(undefined)
  const armLinger = (): void => {
    if (lingerTimer.current !== undefined) return
    lingerTimer.current = window.setTimeout(() => {
      lingerTimer.current = undefined
      setPointerInside(false)
    }, SCROLLBAR_LINGER_MS)
  }
  const cancelLinger = (): void => {
    window.clearTimeout(lingerTimer.current)
    lingerTimer.current = undefined
  }
  useEffect(() => {
    if (!pointerInside) return
    const onMove = (event: PointerEvent): void => {
      const rect = column.current?.getBoundingClientRect()
      /* v8 ignore next -- the listener only exists while the column is mounted and revealed. */
      if (rect === undefined) return
      const inside = event.clientX >= rect.left && event.clientX < rect.right
        && event.clientY >= rect.top && event.clientY < rect.bottom
      if (inside) cancelLinger()
      else armLinger()
    }
    document.addEventListener('pointermove', onMove)
    return () => {
      document.removeEventListener('pointermove', onMove)
      cancelLinger()
    }
  }, [pointerInside])

  const selectView = (view: 'sessions' | 'files'): void => {
    setSidebarView(view)
    if (collapsed) toggleSidebar()
  }

  return (
    <div
      ref={column}
      className={clsx(
        css.root, !wide && css.collapsed, !wide && everWide.current && css.railIn,
        collapsed && wide && css.fading, !pointerInside && css.quietBars,
      )}
      style={wide ? { width: collapsed ? lastWideWidth.current : width } : undefined}
      onPointerEnter={() => {
        cancelLinger()
        setPointerInside(true)
      }}
      onPointerLeave={() => { armLinger() }}
    >
      <div className={css.shellRow}>
        <div className={css.activity} role="toolbar" aria-label="Activity">
          <Tooltip label={t('activity.files')} delayMs={400}>
            <button
              type="button"
              className={clsx(css.activityButton, sidebarView === 'files' && css.activityActive)}
              aria-label={t('activity.files')}
              aria-pressed={sidebarView === 'files'}
              onClick={() => { selectView('files') }}
            >
              <IconFolderOpenOutline16 size={wide ? 16 : 18} />
            </button>
          </Tooltip>
          <Tooltip label={t('activity.chat')} delayMs={400}>
            <button
              type="button"
              className={clsx(css.activityButton, sidebarView === 'sessions' && css.activityActive)}
              aria-label={t('activity.chat')}
              aria-pressed={sidebarView === 'sessions'}
              onClick={() => { selectView('sessions') }}
            >
              <IconNewChatOutline16 size={wide ? 16 : 18} />
            </button>
          </Tooltip>
        </div>

        <div className={css.mainColumn}>
          <div className={css.logoRow}>
            {wide && (
              <button
                type="button"
                className={clsx(css.brand, css.wide)}
                aria-label={t('session.new.label')}
                onClick={() => { startSession() }}
              >
                <BrandWordmark />
              </button>
            )}
            <Tooltip label={collapsed ? t('toggle.open') : t('toggle.collapse')} delayMs={500}>
              <button
                type="button"
                className={clsx(css.iconButton, css.toggle)}
                aria-label={collapsed ? t('toggle.open') : t('toggle.collapse')}
                onClick={() => { toggleSidebar() }}
              >
                {!wide && <FishLogo className={css.railFish} size={24} />}
                <IconPanelLeftOutline16 className={css.panelIcon} size={wide ? 16 : 18} />
              </button>
            </Tooltip>
          </div>

          {sidebarView === 'sessions' && (
            <Tooltip label={t('session.new.label')} delayMs={500} disabled={wide}>
              <button
                type="button"
                className={css.newSession}
                aria-label={t('session.new.label')}
                onClick={() => { startSession() }}
              >
                <IconNewChatOutline16 size={wide ? 14 : 18} />
                {wide && <span className={clsx(css.newSessionLabel, css.wide)}>{t('session.new')}</span>}
              </button>
            </Tooltip>
          )}

          <div className={css.regionArea}>
            {sidebarView === 'files' ? (
              <FilesExplorer
                wide={wide}
                listDirectory={listDirectory}
                readTextFile={readTextFile}
                beginOpenEditor={beginOpenEditor}
                setEditorLoaded={setEditorLoaded}
                setEditorError={setEditorError}
                rootPath={workspaceRootPath}
                t={t}
              />
            ) : (
              renderSlot('sidebar.workspaces', {
                wide,
                expandSidebar: () => { if (collapsed) toggleSidebar() },
              })
            )}
          </div>

          <div className={css.footArea}>
            <div className={css.footerActions}>
              {renderSlot('sidebar.footer.action', { wide })}
            </div>
            <div className={css.settingsArea}>
              {renderSlot('sidebar.settings', { wide })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
