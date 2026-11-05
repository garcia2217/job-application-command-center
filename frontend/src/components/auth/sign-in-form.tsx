'use client'

import { useActionState } from 'react'
import { signIn } from '@/actions/auth'
import type { FormState } from '@/actions/form-state'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { InlineAlert } from '@/components/ui/inline-alert'

const initialState: FormState = {}

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState)

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        required
        defaultValue={state.values?.email}
        errors={state.errors?.email}
      />
      {/* never repopulated after a failed attempt */}
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        errors={state.errors?.password}
      />
      {state.message && (
        <InlineAlert tone="danger" role="alert">
          {state.message}
        </InlineAlert>
      )}
      <div>
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? 'Signing in…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
