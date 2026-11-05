'use client'

import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react'

type DialogProps = {
  open: boolean
  onClose: () => void
  /** id of the heading inside the dialog */
  labelledBy: string
  children: ReactNode
}

// Native modal <dialog>: showModal() traps focus and makes the page inert, so no custom focus trap.
export function Dialog({ open, onClose, labelledBy, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    // Escape: let the parent own the open state instead of closing natively
    event.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={handleCancel}
      onClose={() => open && onClose()}
      className="m-auto w-[calc(100%-(--spacing(8)))] max-w-form rounded-lg border border-border bg-surface p-6 text-text shadow-panel dark:shadow-panel-dark backdrop:bg-black/40"
    >
      {children}
    </dialog>
  )
}
