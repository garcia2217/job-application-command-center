'use client'

import { useEffect } from 'react'
import { ErrorNotice } from '@/components/shell/error-notice'

// Catches what (app)/error.tsx can't: failures in (app)/layout.tsx (the shell's
// account label and badge). Renders without the shell, so it centres itself.
export default function RootError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // logged, never rendered (NFR-07)
    console.error(error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-form">
        <ErrorNotice retry={retry} />
      </div>
    </main>
  )
}
