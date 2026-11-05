import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'

// Client-agnostic (no hooks): usable from Server and Client Components alike.

type Common = {
  label: ReactNode
  name: string
  errors?: string[]
  hint?: ReactNode
  /** for forms rendered more than once on a page (stage edit + add): keeps ids unique */
  idPrefix?: string
}

type InputFieldProps = Common & { as?: 'input' } & Omit<ComponentProps<'input'>, 'name' | 'id'>
type TextareaFieldProps = Common & { as: 'textarea' } & Omit<ComponentProps<'textarea'>, 'name' | 'id'>
type SelectFieldProps = Common & { as: 'select' } & Omit<ComponentProps<'select'>, 'name' | 'id'>

export type FieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps

const CONTROL = 'block w-full min-h-10 rounded-sm border bg-surface px-3 text-body text-text'

function withoutAs<T extends { as?: unknown }>(props: T): Omit<T, 'as'> {
  const copy = { ...props }
  delete copy.as
  return copy
}

/** `company.name` → `company-name`: the backend's dotted field names aren't valid in CSS selectors. */
export function fieldId(name: string): string {
  return name.replace(/\./g, '-')
}

export function Field(props: FieldProps) {
  const { label, name, errors, hint, idPrefix = '', ...control } = props
  const id = `${idPrefix}${fieldId(name)}`
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const invalid = Boolean(errors?.length)
  const describedBy =
    [control['aria-describedby'], invalid && errorId, hint && hintId].filter(Boolean).join(' ') || undefined
  const shared = {
    id,
    name,
    'aria-invalid': invalid || undefined,
    'aria-describedby': describedBy,
  }
  const classes = (extra: string | undefined, own: string) =>
    cx(CONTROL, own, invalid ? 'border-danger' : 'border-border-strong', extra)

  let element: ReactNode
  if (control.as === 'textarea') {
    const rest = withoutAs(control)
    element = <textarea {...rest} {...shared} className={classes(rest.className, 'py-2')} />
  } else if (control.as === 'select') {
    const rest = withoutAs(control)
    element = <select {...rest} {...shared} className={classes(rest.className, '')} />
  } else {
    const rest = withoutAs(control)
    element = <input {...rest} {...shared} className={classes(rest.className, '')} />
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-body font-medium text-text">
        {label}
      </label>
      {element}
      {invalid && (
        <div id={errorId}>
          {errors!.map((error, index) => (
            <p key={`${index}-${error}`} className="mt-1 text-meta text-danger">
              {error}
            </p>
          ))}
        </div>
      )}
      {hint && (
        <p id={hintId} className="mt-1 text-meta text-text-faint">
          {hint}
        </p>
      )}
    </div>
  )
}
