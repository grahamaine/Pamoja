// Client for the confirmation service (api/confirm/*).

// Must match issueMessage() in api/_lib/confirm.ts: the customer signs this to prove they own the job.
export const issueMessage = (job: string) => `Pamoja: send my confirmation code for job ${job}`

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`)
  return data as T
}

export const getServiceStatus = () =>
  call<{ ready: boolean; attestor: string | null; treasury?: string | null; fiatReady?: boolean }>('/api/confirm/status')

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

export async function requestCode(job: string, phone: string, signMessage: (m: Uint8Array) => Promise<Uint8Array>) {
  const signature = base64(await signMessage(new TextEncoder().encode(issueMessage(job))))
  return call<{ sent: boolean; resendsLeft: number }>('/api/confirm/issue', { method: 'POST', body: JSON.stringify({ job, phone, signature }) })
}

export const submitCode = (job: string, code: string) =>
  call<{ released: boolean; signature: string }>('/api/confirm/release', { method: 'POST', body: JSON.stringify({ job, code }) })

/** After the provider marks a job delivered: texts a mobile money customer that their dispute window has started. */
export const notifyDelivered = (job: string) =>
  call<{ notified: boolean }>('/api/escrow/delivered', { method: 'POST', body: JSON.stringify({ job }) })
