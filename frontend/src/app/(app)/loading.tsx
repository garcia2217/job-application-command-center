import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <>
      {/* PageHeader height: title + subtitle line, mb-6 */}
      <div aria-hidden="true" className="mb-6 flex flex-col gap-2">
        <span className="block h-8 w-1/3 rounded-sm bg-surface-sunken" />
        <span className="block h-4 w-1/2 rounded-sm bg-surface-sunken" />
      </div>
      <Skeleton rows={5} />
    </>
  )
}
