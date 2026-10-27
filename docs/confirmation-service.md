# Confirmation service (SMS code → release)

The escrow pays a provider only when the job's **attestor** signs `release`. The confirmation service is
that attestor. It texts the customer a 6-digit code and signs the release only when the provider enters the
right code.

```
customer ── signs a message ──► POST /api/confirm/issue ──► SMS "Pamoja code: PMJ-HAIR-483920 …"
provider ── enters the code ──► POST /api/confirm/release ──► service signs `release` ──► provider is paid
```

## Why the check is off-chain
A 6-digit code has only 1,000,000 values. If its hash were stored on-chain, anyone could recover the code in
a fraction of a second and take the money. So the code is only ever known to the customer and the server,
and the program just checks that the attestor signed.

## Safeguards

Checked end to end against a local validator by `frontend/scripts/e2e-confirm.mts`.

- Only the **customer** can ask for a code: they sign `Pamoja: send my confirmation code for job <address>`
  with their wallet, and the server checks it against the job's customer.
- The job must be **funded** and name this service as its attestor.
- A code can be re-sent **3 times** per job. A new code resets the guess counter.
- **5 wrong guesses** lock the code until the customer requests a new one.
- Guesses are counted *before* they are checked, so parallel requests cannot dodge the limit.
- The stored value is `sha256(secret : job : code)`. The plain code is never saved or logged.
- No code is sent or accepted **after the job's deadline**, matching the program's rule.
- Before signing, the service checks its own wallet has at least **0.01 SOL** (it pays the fee and,
  if the provider has no token account yet, about 0.002 SOL to create one). If not, it answers 503
  and gives the provider's try back. `GET /api/confirm/status` shows the balance as `attestorSol`.
- If the provider never gets the code, the customer can still use **refund** after the deadline.

## Turning it on (you need three accounts)
Until all of these exist, `GET /api/confirm/status` returns `ready: false` and the website stays in demo
mode (the customer confirms their own job), so no job is ever tied to a service that is switched off.

1. **Attestor key.** In WSL: `solana-keygen new --no-bip39-passphrase -o attestor.json`.
   Fund its address with devnet SOL (it pays fees and the provider's token-account rent). Keep the file private.
2. **Upstash Redis** (free): create a database at <https://upstash.com> and copy the REST URL and token.
3. **Africa's Talking** (SMS): sign up at <https://africastalking.com>. Use the sandbox while testing.
   Production sending to Ugandan numbers needs their approval and usually a registered sender ID.
4. Add these in Vercel → Project → Settings → Environment Variables (Production), then redeploy:

| Variable | Value |
|---|---|
| `ATTESTOR_SECRET_KEY` | the **contents** of `attestor.json` (the JSON array of numbers) |
| `CODE_SECRET` | a long random string, e.g. from `openssl rand -hex 32` |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | from Upstash |
| `AT_USERNAME`, `AT_API_KEY` | from Africa's Talking (`sandbox` is the username in sandbox) |
| `AT_ENV` | `sandbox` while testing, `production` when live |
| `AT_SENDER_ID` | optional, your approved sender name |
| `SOLANA_RPC_URL` | optional, a faster devnet RPC |

Never commit these, and never prefix them with `VITE_`.

## Check it is on
Open `https://pamoja-solana.vercel.app/api/confirm/status`. You should see `{"ready":true,"attestor":"<public key>"}`.
New jobs created from the Pay tab then use that key as their confirmer.

## Honest limits
- You must trust the service to check codes honestly. A customer-signed confirmation (no code, no trust) is a
  planned fallback.
- Jobs created in demo mode keep their demo confirmer; only new jobs use the service.
- Add rate limiting by IP/phone before real use, and monitor SMS cost.
- If the interface file changes, run `node scripts/sync-idl.mjs` in `frontend/` to refresh `api/_lib/idl.ts`.
- Africa's Talking sandbox does not deliver to real phones; use their simulator to read the message.
