# Wallets and payments

## Wallet connection (Solana)

`frontend/src/wallets.ts` registers **Phantom**, **Solflare** and **WalletConnect**.

- Phantom / Solflare work with the browser extension, or inside the wallet app's own browser on a phone.
- **WalletConnect** shows a QR code (or opens the wallet app on mobile). It needs a free project ID:
  1. Create a project at <https://cloud.reown.com> and copy the **Project ID**.
  2. Add it as `VITE_WALLETCONNECT_PROJECT_ID` (local `frontend/.env.local`, and in Vercel project settings).
  3. Add your site URL (`https://pamoja-solana.vercel.app`) to the project's allowed domains.
- Without the ID, WalletConnect is hidden and a console warning appears.

## Mobile money and card payments

Serverless functions in `frontend/api/pay/` talk to each provider. **Credentials only ever live in
server environment variables** (no `VITE_` prefix, never committed). See `frontend/.env.example`.

| Provider | Endpoint | Provider docs |
|---|---|---|
| MTN MoMo Uganda | `POST /api/pay/mtn`, `GET /api/pay/mtn?ref=` | <https://momodeveloper.mtn.com> |
| Airtel Money Uganda | `POST /api/pay/airtel`, `GET /api/pay/airtel?id=` | <https://developers.airtel.africa> |
| Pesapal (card, bank, mobile money) | `POST /api/pay/pesapal`, `GET /api/pay/pesapal?tracking=` | <https://developer.pesapal.com> |

### Getting credentials (you must do these; they need your business details)

- **MTN:** sign up at the MoMo developer portal, subscribe to **Collections**, create an API user and
  key in the sandbox, set `MTN_*`. Sandbox only accepts currency `EUR`; production uses `UGX` and
  `MTN_TARGET_ENV=mtnuganda` after MTN approves your business.
- **Airtel:** register at the Airtel developer portal for UAT credentials (`AIRTEL_CLIENT_ID/SECRET`).
  Production access needs Airtel business onboarding. Check that `AIRTEL_PAYMENT_PATH` matches the
  version shown in your Airtel dashboard.
- **Pesapal:** get a consumer key/secret from the demo environment, set `PESAPAL_*` and
  `PUBLIC_APP_URL`, then register the notification URL once:
  `POST /api/pay/pesapal?action=register-ipn` and store the returned `ipn_id` as `PESAPAL_IPN_ID`.

### Status

| Provider | State |
|---|---|
| MTN MoMo | Connected to the sandbox. Sign-in and payment-status lookups verified on the live site. |
| Pesapal (card, bank) | Connected to the sandbox, payment-notification URL registered. Sign-in and status lookups verified on the live site. |
| Airtel Money | Built; waiting for UAT (sandbox) credentials from the Airtel developer portal. |

The MTN sandbox approves every payment on its own (no prompt reaches a real phone) and only accepts EUR.
Pesapal answers its payment notifications (IPN) with the acknowledgement it expects, so it does not retry.

## Important limits of the current design

- The widget uses a demo job reference and an amount typed by the user. In production the amount and
  job must come from the on-chain `Job`, never from the browser.
- Collecting UGX through mobile money does not by itself move USDC into the escrow vault. A server
  step (treasury wallet funding `fund_job` after a confirmed payment) is still to be built, along with
  webhook verification and idempotency so a payment is credited only once.
- Add rate limiting before going live, and keep payment secrets out of logs.

## Sandbox setup and testing

### MTN MoMo (sandbox)
1. Create an account at <https://momodeveloper.mtn.com>, subscribe to **Collections**, and copy the **Primary key**.
2. On your own machine, from `frontend/`:
   ```powershell
   # PowerShell
   $env:MTN_SUBSCRIPTION_KEY = "<primary key>"; node scripts/mtn-sandbox-setup.mjs
   ```
   ```bash
   # Git Bash / macOS / Linux
   MTN_SUBSCRIPTION_KEY="<primary key>" node scripts/mtn-sandbox-setup.mjs
   ```
   A `401` means the key is not an active **Collections** subscription key.
   It creates a sandbox API user and API key and prints them once.
3. Add to Vercel (production, mark sensitive): `MTN_SUBSCRIPTION_KEY`, `MTN_API_USER`, `MTN_API_KEY`,
   `MTN_BASE_URL=https://sandbox.momodeveloper.mtn.com`, `MTN_TARGET_ENV=sandbox`, `MTN_CURRENCY=EUR`.
4. Redeploy, then `node scripts/check-payments.mjs mtn`.

Production (`mtnuganda`, UGX) needs MTN Uganda to approve your business; the sandbox keys do not carry over.

### Airtel Money (UAT)
1. Register at <https://developers.airtel.africa>, create an app, and take its UAT **client id** and **client secret**.
2. Add `AIRTEL_BASE_URL=https://openapiuat.airtel.africa`, `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`.
3. The default collection path is `/merchant/v1/payments/`. Only set `AIRTEL_PAYMENT_PATH=/merchant/v2/payments/`
   if your app has message signing enabled.
4. Redeploy, then `node scripts/check-payments.mjs airtel`.

### Pesapal (sandbox)
1. Take the demo consumer key and secret from <https://developer.pesapal.com>.
2. Add to Vercel (production, mark sensitive): `PESAPAL_BASE_URL=https://cybqa.pesapal.com/pesapalv3`,
   `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, and `PUBLIC_APP_URL=https://pamoja-solana.vercel.app`.
3. Redeploy, then register the payment-notification URL once:
   ```bash
   curl -X POST "https://pamoja-solana.vercel.app/api/pay/pesapal?action=register-ipn"
   ```
   Store the returned `ipn_id` as `PESAPAL_IPN_ID` and redeploy again.
4. Pay → Card / Bank opens Pesapal's sandbox checkout; use a test card from Pesapal's sandbox docs.

### Reading the check script
`500 Server is missing …` = not configured. `502` = the provider rejected the call; read the Vercel function logs
for the provider's reason. `400` = our own input check (for example a phone number that is not Ugandan).
