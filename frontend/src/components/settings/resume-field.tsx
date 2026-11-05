'use client'

import { useState } from 'react'
import { cx } from '@/components/ui/cx'
import { Field } from '@/components/ui/field'
import { isOverResumeLimit, normalizeLineBreaks, resumeCounter } from '@/lib/settings'

type ResumeFieldProps = {
  defaultValue: string
  errors?: string[]
  /** "Last saved 5 Nov, 14:02", formatted on the server in the account's zone */
  lastSaved: string | null
}

const COUNTER_ID = 'resume_tex-counter'

// Uncontrolled textarea; the count follows input. The parent remounts this after
// each save (key), so the count restarts from the new defaultValue.
export function ResumeField({ defaultValue, errors, lastSaved }: ResumeFieldProps) {
  const [text, setText] = useState(() => normalizeLineBreaks(defaultValue))
  const over = isOverResumeLimit(text)

  return (
    <div className="flex flex-col gap-1">
      <Field
        as="textarea"
        label="Resume (LaTeX)"
        name="resume_tex"
        rows={16}
        spellCheck={false}
        className="font-mono text-meta"
        defaultValue={defaultValue}
        onChange={(event) => setText(event.target.value)}
        aria-describedby={COUNTER_ID}
        errors={errors}
        hint="Paste your LaTeX (.tex) source. Saving an empty box removes your resume."
      />
      {/* over the limit the counter turns danger, but submit stays allowed so the server's message shows */}
      <p
        id={COUNTER_ID}
        aria-live="polite"
        className={cx('text-meta tabular-nums', over ? 'font-medium text-danger' : 'text-text-muted')}
      >
        {resumeCounter(text)}
      </p>
      {lastSaved && <p className="text-meta text-text-faint">{lastSaved}</p>}
    </div>
  )
}
