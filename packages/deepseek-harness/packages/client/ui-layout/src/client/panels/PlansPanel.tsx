import { useEffect, useMemo, useState } from 'react'
import type { BoundActions, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createLayoutStore, WorkbenchPlan } from '../stores.ts'
import css from './panels.module.css'

type Store = ReturnType<typeof createLayoutStore>
type Actions = BoundActions<Store>

const STORAGE_KEY = 'nova.workbench.plans.v1'

export type PlansPanelProps = {
  useStore: PropsStore<Store>['useStore']
  actions: Actions
}

function newId(): string {
  return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

type ChecklistItem = { id: string; text: string; done: boolean }

function parseChecklist(body: string): ChecklistItem[] {
  const lines = body.split('\n')
  const items: ChecklistItem[] = []
  for (const [index, line] of lines.entries()) {
    const match = /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/.exec(line)
      ?? /^\s*[-*]\s+(.+)$/.exec(line)
    if (match === null) continue
    if (match.length === 3) {
      items.push({
        id: `c-${index}`,
        text: match[2]!.trim(),
        done: match[1]!.toLowerCase() === 'x',
      })
    } else {
      items.push({ id: `c-${index}`, text: match[1]!.trim(), done: false })
    }
  }
  return items
}

function serializeChecklist(items: ChecklistItem[], trailing: string): string {
  const lines = items.map(item => `- [${item.done ? 'x' : ' '}] ${item.text}`)
  const notes = trailing.trim()
  return notes === '' ? lines.join('\n') : `${lines.join('\n')}\n\n${notes}`
}

function splitNotes(body: string): string {
  const lines = body.split('\n')
  const kept: string[] = []
  for (const line of lines) {
    if (/^\s*[-*]\s*(\[[ xX]\]\s*)?.+$/.test(line)) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

function loadStoredPlans(): WorkbenchPlan[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return null
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item): item is WorkbenchPlan =>
      item !== null
      && typeof item === 'object'
      && typeof (item as WorkbenchPlan).id === 'string'
      && typeof (item as WorkbenchPlan).title === 'string'
      && typeof (item as WorkbenchPlan).body === 'string'
      && typeof (item as WorkbenchPlan).done === 'boolean')
  } catch {
    return null
  }
}

/** Plans list / editor with localStorage persistence + checklist toggles. */
export function PlansPanel({ useStore, actions }: PlansPanelProps) {
  const plans = useStore(s => s.plans)
  const view = useStore(s => s.plansView)
  const activeId = useStore(s => s.activePlanId)
  const active = useMemo(
    () => plans.find(plan => plan.id === activeId) ?? null,
    [activeId, plans],
  )
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('- [ ] step one\n- [ ] step two')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (hydrated) return
    const stored = loadStoredPlans()
    if (stored !== null && stored.length > 0 && plans.length === 0) {
      actions.hydratePlans(stored)
    }
    setHydrated(true)
  }, [actions, hydrated, plans.length])

  useEffect(() => {
    if (!hydrated) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plans))
    } catch {
      /* ignore quota / private mode */
    }
  }, [hydrated, plans])

  if (view === 'new') {
    return (
      <div className={css.root}>
        <div className={css.toolbar}>
          <strong className={css.title}>New plan</strong>
          <button type="button" className={css.btn} onClick={() => { actions.setPlansView('list') }}>Back</button>
        </div>
        <input
          className={css.url}
          value={title}
          placeholder="Plan title"
          aria-label="Plan title"
          onChange={(e) => { setTitle(e.target.value) }}
        />
        <textarea
          className={css.editor}
          value={body}
          placeholder={'- [ ] step one\n- [ ] step two'}
          aria-label="Plan body"
          onChange={(e) => { setBody(e.target.value) }}
        />
        <div className={css.toolbar}>
          <button
            type="button"
            className={css.btnPrimary}
            onClick={() => {
              const plan: WorkbenchPlan = {
                id: newId(),
                title: title.trim() || 'Untitled plan',
                body,
                done: false,
              }
              actions.addPlan(plan)
              setTitle('')
              setBody('- [ ] step one\n- [ ] step two')
            }}
          >
            Create
          </button>
        </div>
      </div>
    )
  }

  if (view === 'detail' && active !== null) {
    const checklist = parseChecklist(active.body)
    const notes = splitNotes(active.body)
    return (
      <div className={css.root}>
        <div className={css.toolbar}>
          <button type="button" className={css.btn} onClick={() => { actions.setPlansView('list') }}>All plans</button>
          <button
            type="button"
            className={css.btn}
            onClick={() => {
              actions.updatePlan({ ...active, done: !active.done })
            }}
          >
            {active.done ? 'Mark open' : 'Mark done'}
          </button>
          <button
            type="button"
            className={css.btn}
            onClick={() => { actions.removePlan(active.id) }}
          >
            Delete
          </button>
        </div>
        <input
          className={css.url}
          value={active.title}
          aria-label="Plan title"
          onChange={(e) => { actions.updatePlan({ ...active, title: e.target.value }) }}
        />
        {checklist.length > 0 && (
          <ul className={css.planList}>
            {checklist.map((item, index) => (
              <li key={item.id}>
                <label className={css.checkRow}>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => {
                      const next = checklist.map((row, i) =>
                        i === index ? { ...row, done: !row.done } : row)
                      actions.updatePlan({
                        ...active,
                        body: serializeChecklist(next, notes),
                        done: next.every(row => row.done),
                      })
                    }}
                  />
                  <span className={item.done ? css.planDone : undefined}>{item.text}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <textarea
          className={css.editor}
          value={active.body}
          aria-label="Plan body"
          onChange={(e) => { actions.updatePlan({ ...active, body: e.target.value }) }}
        />
        <p className={css.hint}>Use `- [ ] task` lines for checklist items. Plans persist in this browser.</p>
      </div>
    )
  }

  return (
    <div className={css.root}>
      <div className={css.toolbar}>
        <strong className={css.title}>Plans</strong>
        <button type="button" className={css.btnPrimary} onClick={() => { actions.setPlansView('new') }}>
          New plan
        </button>
      </div>
      {plans.length === 0 ? (
        <p className={css.hint}>No plans yet. Create one to track implementation steps.</p>
      ) : (
        <ul className={css.planList}>
          {plans.map(plan => (
            <li key={plan.id}>
              <button
                type="button"
                className={css.planItem}
                onClick={() => { actions.setActivePlanId(plan.id) }}
              >
                <span className={plan.done ? css.planDone : undefined}>{plan.title}</span>
                <span className={css.planMeta}>
                  {plan.done ? 'done' : `${parseChecklist(plan.body).filter(i => !i.done).length} open`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
