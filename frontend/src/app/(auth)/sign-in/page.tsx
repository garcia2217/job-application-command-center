import { SignInForm } from '@/components/auth/sign-in-form'
import { Panel } from '@/components/ui/panel'

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-form">
        <Panel padded>
          <p className="mb-1 text-section font-semibold text-text-muted">Command Center</p>
          <h1 className="mb-6 text-title-sm desk:text-title">Sign in</h1>
          <SignInForm />
        </Panel>
      </div>
    </main>
  )
}
