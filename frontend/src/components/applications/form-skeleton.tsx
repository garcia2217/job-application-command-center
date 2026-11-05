import { Skeleton } from '@/components/ui/skeleton'

/** loading.tsx for the add/edit form: the page header, then the form panel. */
export function FormSkeleton() {
  return (
    <div className="max-w-form">
      <div aria-hidden="true" className="mb-6 flex flex-col gap-2">
        <span className="block h-8 w-1/2 rounded-sm bg-surface-sunken" />
      </div>
      <Skeleton rows={5} variant="block" />
    </div>
  )
}
