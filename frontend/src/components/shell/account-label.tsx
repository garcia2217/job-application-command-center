import { api } from '@/lib/api'

/** Async: streams into the top bar so the shell doesn't wait on the API. */
export async function AccountLabel() {
  const me = await api.auth.me()
  return <span className="font-normal text-text-faint">· {me.is_demo ? 'demo account' : me.email}</span>
}
