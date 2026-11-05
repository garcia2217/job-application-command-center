import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { api, ApiError } from '@/lib/api'

/** Async: the Applications badge (Needs follow-up count), streamed into SideNav as a slot. */
export async function QuietBadge() {
  let count: number
  try {
    count = (await api.applications.quiet()).length
  } catch (error) {
    // partial failure: hide the badge rather than take down the shell
    if (!(error instanceof ApiError)) throw error
    return null
  }
  if (count === 0) return null
  return (
    <span className="ml-auto rounded-full bg-warn-soft px-2 py-px text-label tabular-nums text-warn">
      {count}
      <VisuallyHidden> need follow-up</VisuallyHidden>
    </span>
  )
}
