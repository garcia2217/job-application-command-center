import { createStage } from '@/actions/stages'
import { Panel } from '@/components/ui/panel'
import { SectionHead } from '@/components/ui/section-head'
import { stageViews } from '@/lib/stages'
import type { StageResponse } from '@/lib/types'
import { StageForm } from './stage-form'
import { StageList } from './stage-list'

type InterviewStagesProps = {
  appId: number
  stages: StageResponse[]
  timezone: string
}

/** Main column: the ordered stages, then the add form (F-03). */
export function InterviewStages({ appId, stages, timezone }: InterviewStagesProps) {
  return (
    <section aria-labelledby="stages-h">
      <SectionHead id="stages-h" title="Interview stages" count={stages.length} />
      <StageList appId={appId} stages={stageViews(stages, timezone)} timezone={timezone} />
      <div className="mt-4">
        <Panel padded>
          <StageForm mode="create" action={createStage.bind(null, appId)} timezone={timezone} idPrefix="stage-new-" />
        </Panel>
      </div>
    </section>
  )
}
