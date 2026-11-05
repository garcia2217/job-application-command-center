import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'destructive-filled'
export type ButtonSize = 'md' | 'sm'

const BASE =
  'inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border font-medium no-underline disabled:cursor-not-allowed disabled:opacity-50'

const SIZE: Record<ButtonSize, string> = {
  md: 'min-h-10 px-4 text-body',
  sm: 'min-h-8 px-3 text-meta',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent text-on-accent hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border-border-strong bg-surface text-text hover:bg-surface-sunken',
  ghost: 'border-transparent bg-transparent text-text-muted hover:bg-surface-sunken hover:text-text',
  destructive: 'border-danger bg-surface text-danger hover:bg-danger-soft',
  // confirmation dialogs only
  'destructive-filled': 'border-danger bg-danger text-on-accent hover:opacity-90',
}

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cx(BASE, SIZE[size], VARIANT[variant], className)
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3.5 flex-none animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  )
}

type ButtonProps = ComponentProps<'button'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** in-flight action: inline spinner, aria-busy, disabled; the label stays */
  pending?: boolean
  children: ReactNode
}

export function Button({
  variant = 'secondary',
  size = 'md',
  pending = false,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {pending && <Spinner />}
      {children}
    </button>
  )
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function ButtonLink({ variant = 'secondary', size = 'md', className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />
}
