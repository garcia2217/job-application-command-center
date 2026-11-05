import { Skeleton } from '@/components/ui/skeleton'

/** loading.tsx for /applications/[id] (and its edit route): header block, then main + rail. */
export function DetailSkeleton() {
  return (
    <>
      <div aria-hidden="true" className="mb-6 flex flex-col gap-2">
        <span className="block h-8 w-1/2 rounded-sm bg-surface-sunken" />
        <span className="block h-4 w-1/3 rounded-sm bg-surface-sunken" />
      </div>
      <div className="grid items-start gap-8 desk:grid-cols-[minmax(0,1fr)_var(--spacing-rail)] wide:grid-cols-[minmax(0,1fr)_var(--spacing-rail-wide)]">
        <Skeleton rows={4} />
        <Skeleton rows={3} variant="block" />
      </div>
    </>
  )
}
