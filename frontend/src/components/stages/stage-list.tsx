'use client'

import { startTransition, useOptimistic, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { deleteStage, moveStage, updateStage } from '@/actions/stages'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Panel } from '@/components/ui/panel'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { swap, type Direction, type StageView } from '@/lib/stages'
import { StageForm } from './stage-form'

type StageListProps = {
  appId: number
  /** in position order, formatted in the account's zone (stageViews) */
  stages: StageView[]
  timezone: string
}

type Move = { id: number; direction: Direction }

export function StageList({ appId, stages, timezone }: StageListProps) {
  // AC-03.4: the reorder shows at once; the revalidated server order replaces it
  const [ordered, applyMove] = useOptimistic(stages, (current: StageView[], move: Move) =>
    swap(current, move.id, move.direction),
  )
  const [editing, setEditing] = useState<number | null>(null)

  function move(id: number, direction: Direction) {
    startTransition(async () => {
      applyMove({ id, direction })
      await moveStage(appId, id, direction)
    })
  }

  if (ordered.length === 0) {
    return (
      <Panel>
        <EmptyState title="No interview stages yet." />
      </Panel>
    )
  }

  return (
    <Panel>
      <ol className="divide-y divide-border">
        {ordered.map((stage, index) => (
          <li key={stage.id} className="px-4 py-3">
            {editing === stage.id ? (
              <StageForm
                mode="update"
                action={updateStage.bind(null, appId, stage.id)}
                timezone={timezone}
                idPrefix={`stage-${stage.id}-`}
                initial={stage.values}
                onDone={() => setEditing(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 desk:flex-row desk:items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-section font-medium break-words">{stage.name}</p>
                  <p className="mt-0.5 text-meta text-text-muted tabular-nums">{stage.meta}</p>
                  {stage.notes && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-body text-text-muted">{stage.notes}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={index === 0}
                    aria-label={`Move ${stage.name} up`}
                    onClick={() => move(stage.id, 'up')}
                  >
                    Move up
                  </Button>
                  <Button
                    size="sm"
                    disabled={index === ordered.length - 1}
                    aria-label={`Move ${stage.name} down`}
                    onClick={() => move(stage.id, 'down')}
                  >
                    Move down
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(stage.id)}>
                    Edit<VisuallyHidden> {stage.name}</VisuallyHidden>
                  </Button>
                  <form action={deleteStage.bind(null, appId, stage.id)}>
                    <DeleteStageButton name={stage.name} />
                  </form>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}

/** Not confirmed (DESIGN_GUIDE §6): only application and company deletes get a dialog. */
function DeleteStageButton({ name }: { name: string }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="ghost" size="sm" pending={pending}>
      Delete<VisuallyHidden> {name}</VisuallyHidden>
    </Button>
  )
}
