# Pay from any chain (Aurora Intents)

Pamoja's customers do not all hold USDC on Solana. Many hold USDT on Tron or BNB Chain, ETH on Base,
or bitcoin, often on an exchange. **Pay → Any chain** lets them pay with any of those, and exactly
the amount they choose arrives as USDC in their Solana wallet, ready to lock in escrow.

It uses the **Aurora Intents Swap API**, built on the NEAR Intents solver network.

## The flow

1. The customer picks a chain and token (Tron USDT is listed first), the USDC amount to receive, their
   Solana wallet (pre-filled when connected) and a refund address on the chain they pay from.
2. **See price** asks Aurora for a *dry* `EXACT_OUTPUT` quote: "exactly N USDC on Solana, how much
   USDT/ETH/BTC is that?" Nothing is reserved yet.
3. **Get deposit address** asks for the live quote. Pamoja shows the deposit address as a QR code with
   copy buttons, the exact amount, and how long the address stays valid. The customer can pay from
   any wallet or straight from an exchange withdrawal; no bridge or Solana gas is needed.
4. Pamoja polls the swap status (payment seen, converting, delivered) and links the Solana
   transaction on Solscan when the USDC arrives. If the payment is too small, late or fails, Aurora
   refunds it to the refund address.
5. **Lock it in escrow** takes the customer to the USDC escrow checkout.

The live quote, including Aurora's signature over it, is kept in the browser so a refresh does not
lose a payment in flight, and the signed quote is available if anything has to be disputed.

## How the key is protected

The browser never sees the Aurora API key. It calls three serverless routes:

| Route | Does |
|---|---|
| `GET /api/intents/tokens` | Tokens a customer can pay with (hides USDC-on-Solana itself and unpriced tokens) |
| `POST /api/intents/quote` | Dry or live quote |
| `GET /api/intents/status?depositAddress=…` | Swap progress and the Solana transaction |

The quote route only ever asks for one kind of quote: `EXACT_OUTPUT`, destination **USDC on
Solana**, recipient a **valid Solana address**, 1 to 1,000 USDC, refund address checked for the
origin chain (0x… for EVM chains, T… for Tron, bc1/1/3 for Bitcoin). So the key cannot be used to send
funds anywhere else. It also rejects a quote that would deliver less USDC than requested (allowing
up to 1% for Aurora's withdrawal fee), and passes Aurora's own error messages through with the key
stripped out.

Code: `frontend/api/_lib/aurora.ts` (logic), `frontend/api/intents/*` (routes),
`frontend/src/ui/AnyChainPay.tsx` (screen). Checks: `npx tsx scripts/test-aurora.mts` in `frontend/`
(10 tests against responses shaped like the documented API).

## Switching it on

1. Sign in at https://studio.aurora.dev and create an API key.
2. In Vercel, add `AURORA_API_KEY` to the `pamoja-solana` project (Production and Preview) and
   redeploy. Until then the Any chain tab says it is not switched on yet.

## Limits, stated plainly

- **Mainnet only.** NEAR Intents settles with real solver liquidity, so payments use real funds and
  the USDC arrives on Solana mainnet. Pamoja's escrow program is on devnet during the hackathon, so
  locking a job still uses test USDC. On mainnet the two steps join up with no code change: the
  escrow checkout reads the USDC mint from `VITE_STABLECOIN_MINT`.
- Aurora and network fees apply, and each route has a minimum amount set by solver liquidity; Aurora's
  message is shown if a quote is too small.
- Payment tracking is per browser. A shared server-side record is the natural next step.
