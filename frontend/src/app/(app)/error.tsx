'use client'

import { useEffect } from 'react'
import { ErrorNotice } from '@/components/shell/error-notice'

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // logged, never rendered (NFR-07)
    console.error(error)
  }, [error])

  return <ErrorNotice retry={retry} />
}
