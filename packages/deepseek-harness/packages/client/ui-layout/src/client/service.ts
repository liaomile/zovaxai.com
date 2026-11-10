/**
 * LayoutController: the cross-plugin panel-action face behind ctx.layout.
 * Panel geometry itself lives in the root entry's layout store (stores.ts);
 * the current-session selection lives with the runtime sessions service, and
 * the per-session active view dissolved into ui-conversation's session store
 * (its only consumer). What remains here is the contract other plugins'
 * apply worlds reach for panel transitions (sidebar toggle from ui-sidebar,
 * details open/close from ui-conversation) — writes stay inside the store's
 * declared action set, delivered as the registration's bound actions.
 */
import type { BoundActions } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  createLayoutStore, EditorDiffHunk, EditorPane, SidebarView, WorkbenchTabKind,
} from './stores.ts'

/** The layout store's bound action set (framework-baked, draft params peeled). */
export type PanelActions = BoundActions<ReturnType<typeof createLayoutStore>>

/**
 * The outward layout face (`ctx.layout`): the panel transitions other
 * plugins may trigger — and exactly what a test fake must supply. The
 * attachPanels wiring hook stays on the concrete class (root-entry assembly
 * only).
 */
export interface ILayout {
  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void
  /** Open the details panel (no-op when already open). */
  openDetails(): void
  /** Close the details panel. */
  closeDetails(): void
  /** Switch the left activity view (sessions list vs Files tree). */
  setSidebarView(view: SidebarView): void
  /** Mark the workbench as loading a path (Files panel then fills content). */
  beginOpenEditor(path: string): void
  /** Commit a successful text-file load into the workbench. */
  setEditorLoaded(path: string, content: string, truncated: boolean): void
  /** Surface a workbench load/save failure. */
  setEditorError(path: string, message: string): void
  /** Update the draft buffer (marks dirty). */
  setEditorDraft(content: string): void
  /** Attach applied Edit/Write hunks for the right-side change preview. */
  setEditorDiffs(diffs: EditorDiffHunk[] | null): void
  /** Switch the preview body between diff, final result, or both. */
  setEditorPane(pane: EditorPane): void
  /** Clear the dirty flag after a successful save. */
  markEditorSaved(): void
  /** Close the workbench buffer. */
  clearEditor(): void
  /** Open or focus a Cursor-aligned right workbench tab. */
  openWorkbenchTab(kind: WorkbenchTabKind): void
  /** Close one workbench tab. */
  closeWorkbenchTab(kind: WorkbenchTabKind): void
  /** Append a line to an agent's read-only PTY (Cursor Agents list). */
  appendAgentPty(sessionId: string, line: string, title?: string, cwd?: string): void
}

/** Cross-plugin panel-action face (ctx.layout). */
export class LayoutController implements ILayout {
  #panels: PanelActions | undefined

  /**
   * Adopt the root entry's bound store actions. Called from the root
   * registration's inject hook (a sanctioned assembly side effect), so the
   * face is live from the entry's first render; on entry re-register the
   * fresh actions overwrite the stale set.
   * @param actions - bound actions of the entry's layout store instance.
   */
  attachPanels(actions: PanelActions): void {
    this.#panels = actions
  }

  /** Toggle the sidebar panel (closed ⟷ contract default width). */
  toggleSidebar(): void {
    this.#require().toggleSidebar()
  }

  /** Open the details panel (no-op when already open). */
  openDetails(): void {
    this.#require().openDetails()
  }

  /** Close the details panel. */
  closeDetails(): void {
    this.#require().closeDetails()
  }

  /** Switch the left activity view. */
  setSidebarView(view: SidebarView): void {
    this.#require().setSidebarView(view)
  }

  /** Mark the workbench as loading a path and reveal the right preview column. */
  beginOpenEditor(path: string): void {
    const panels = this.#require()
    panels.beginOpenEditor(path)
    panels.openDetails()
  }

  /** Commit a successful text-file load. */
  setEditorLoaded(path: string, content: string, truncated: boolean): void {
    this.#require().setEditorLoaded(path, content, truncated)
  }

  /** Surface a workbench failure. */
  setEditorError(path: string, message: string): void {
    this.#require().setEditorError(path, message)
  }

  /** Update the draft buffer. */
  setEditorDraft(content: string): void {
    this.#require().setEditorDraft(content)
  }

  /** Attach applied Edit/Write hunks for the right-side change preview. */
  setEditorDiffs(diffs: EditorDiffHunk[] | null): void {
    this.#require().setEditorDiffs(diffs)
  }

  /** Switch the preview body between diff, final result, or both. */
  setEditorPane(pane: EditorPane): void {
    this.#require().setEditorPane(pane)
  }

  /** Clear the dirty flag after save. */
  markEditorSaved(): void {
    this.#require().markEditorSaved()
  }

  /** Close the file tab (and the column when no other tabs remain). */
  clearEditor(): void {
    this.#require().clearEditor()
  }

  /** Open or focus a Cursor-aligned right workbench tab. */
  openWorkbenchTab(kind: WorkbenchTabKind): void {
    this.#require().openWorkbenchTab(kind)
  }

  /** Close one workbench tab. */
  closeWorkbenchTab(kind: WorkbenchTabKind): void {
    this.#require().closeWorkbenchTab(kind)
  }

  appendAgentPty(sessionId: string, line: string, title?: string, cwd?: string): void {
    this.#require().appendAgentPty(sessionId, line, title, cwd)
  }

  #require(): PanelActions {
    // Callers are UI gestures, which cannot fire before the root entry
    // rendered (the inject hook runs in its first render) — reaching this
    // unwired is a boot-order bug, not a race to tolerate.
    if (this.#panels === undefined) throw new Error('layout: panel actions not wired (root entry not mounted)')
    return this.#panels
  }
}
