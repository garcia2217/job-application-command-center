import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <>
      {/* PageHeader: title + subtitle line, mb-6 */}
      <div aria-hidden="true" className="mb-6 flex flex-col gap-2">
        <span className="block h-8 w-1/3 rounded-sm bg-surface-sunken" />
        <span className="block h-4 w-1/2 rounded-sm bg-surface-sunken" />
      </div>
      {/* StatusFilter chip row */}
      <div aria-hidden="true" className="mb-3 flex gap-2 overflow-hidden pb-2">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="block h-9 w-20 flex-none rounded-full bg-surface-sunken" />
        ))}
      </div>
      <Skeleton rows={8} />
    </>
  )
}
