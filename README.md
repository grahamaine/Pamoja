<p align="center"><img src="brand/banner-1500x500.png" alt="Pamoja — Services & Suppliers, East Africa, built on Solana" width="100%"></p>

# Pamoja

**Pay when the service is done.** Pamoja is a Solana escrow app for local businesses in East Africa: salons, repairs, rides, food, shops and suppliers. A customer locks a payment, the provider does the job, and the money is released when the customer confirms with a short code.

**Live demo:** https://pamoja-solana.vercel.app (Solana devnet)

> Status: prototype for the Encode Club Solana Hackathon 2026. The escrow program is complete (`create_job`, `fund_job`, `release`, `cancel`, `refund`, `close_job`, plus the delivered step: `mark_delivered`, `dispute`, `claim`, `resolve_refund`) with 26 passing tests, and the dashboard and crypto checkout use real devnet jobs. The SMS confirmation service is live: customers get a code by text message on any phone, and the provider enters it to release payment. Mobile money and card payments fund the escrow through the Pamoja treasury, so customers need no wallet. Pay from any chain (Aurora Intents) is live on mainnet. MTN MoMo and Pesapal (card and bank) are connected to their sandboxes; Airtel Money is waiting for its sandbox keys.

## Hackathon submission

- **Tracks:** Best Consumer App on Solana, and the Aurora Intents bounty.
- **Live demo:** https://pamoja-solana.vercel.app (escrow on Solana devnet; Pay from any chain on mainnet).
- **Demo video:** [add link]
- **Slides:** [add link]

## How it works

1. **Lock.** The customer's payment goes into a vault owned by the Solana program.
2. **Serve.** The provider does the job or delivers the order.
3. **Confirm.** The customer gets an SMS like `PMJ-HAIR-483920` (a service reference plus a 6-digit code). A confirmation service checks it and signs the release.
4. **Delivered.** If the code does not come, the provider marks the job delivered. The customer then has a dispute window (48 hours by default): no dispute and the provider claims the payment; a dispute and Pamoja decides.
5. **Deadline.** Up to the job's deadline the provider can be paid or mark the job delivered; after it, if nothing was delivered, only the customer can take the money back. The windows never overlap. Before paying in, the customer can cancel.
6. **Clean up.** Finished jobs can be closed to return their rent to the customer.

More detail: [docs/how-it-works.md](docs/how-it-works.md).

## What is in the app

- Services and store categories (beauty, repairs, cleaning, construction, rides, food, delivery, shops and more), each with a job reference code.
- **Pay from any chain (Aurora Intents).** Customers pay with USDT on Tron, ETH on Base, BTC and 100+ other tokens on 30+ chains, from a wallet or an exchange; exactly the chosen amount arrives as USDC in their Solana wallet, ready to lock in escrow. Built on the Aurora Intents Swap API (NEAR Intents). See [docs/aurora-intents.md](docs/aurora-intents.md).
- Business dashboard with live jobs from devnet (escrow balance, payouts, provider levels, embeddable "Pay with Pamoja" button). Providers see whether each job is in real USDC and confirmed by the Pamoja service before they start work.
- Wallet connection: Phantom, Solflare and WalletConnect.
- Mobile money and card that fund the escrow: once MTN, Airtel or Pesapal confirms the payment, the Pamoja treasury locks the same value in USDC on-chain and the customer gets the SMS code. No wallet needed; a booking page lets them dispute or reclaim with the code. MTN MoMo and Pesapal (card, bank) are connected to their sandboxes; Airtel Money is built and waiting for sandbox keys. See [docs/payments.md](docs/payments.md).
- Delivered step and dispute window: providers mark work done and get paid automatically if the customer does not dispute in time.
- Supported-chains logo slideshow, mobile-first layout, Oswald typography.

## Tech

| Part | Stack |
|---|---|
| On-chain program | Rust, Anchor 1.x, Solana devnet |
| Frontend | React, TypeScript, Vite, Solana wallet-adapter, Lucide icons |
| Serverless API | Vercel functions in `frontend/api/` |
| Hosting | Vercel |

## Repository layout

```
program/           Anchor program `pamoja` (Job account, ten instructions, tests)
frontend/          Vite + React app and the /api payment routes
brand/             Logo, thumbnail and banner
docs/              Specs and guides
```

## Run it locally

```bash
# Frontend
cd frontend
npm install
cp .env.example .env.local      # fill in what you need (see docs/payments.md)
npm run dev
```

```bash
# Program (use WSL on Windows; Solana and Anchor are installed there)
cd program
anchor build
anchor test --validator legacy     # 26 tests on a local validator
```

Environment variables are listed in [`frontend/.env.example`](frontend/.env.example). Never commit real keys: payment credentials belong in server-side environment variables only.

## Docs

- [How it works](docs/how-it-works.md)
- [Escrow build spec](docs/escrow-design.md)
- [Deployment](docs/deployment.md)
- [Wallets and payments (WalletConnect, MTN, Airtel, Pesapal)](docs/payments.md)
- [Confirmation service (SMS code to release)](docs/confirmation-service.md)

## Roadmap

1. ✅ Escrow program: `create_job`, `fund_job`, `release`, `cancel`, `refund`, `close_job`, with non-overlapping deadline windows and 17 tests.
2. ✅ Dashboard and crypto checkout connected to real on-chain jobs, with a provider-side trust badge.
3. ✅ Confirmation service live: SMS code by Africa's Talking, wallet-signed request, attempt limits, deadline and fee-balance checks, tested end to end.
4. ✅ Provider "delivered" step with a dispute window, so a customer cannot withhold the code and wait out the deadline.
5. ✅ Server step that funds the escrow after a confirmed mobile money or card payment (Pamoja treasury, no wallet needed).
6. ✅ Pay from any chain with Aurora Intents, live on mainnet.
7. ✅ MTN MoMo and Pesapal connected to their sandboxes. Next: Airtel sandbox, then production onboarding with each provider.

## Honest limits

- Disputes are decided by the Pamoja team, the same trusted service that checks SMS codes. An undecided dispute has no on-chain timeout yet.
- Pay from any chain uses real funds on Solana mainnet (NEAR Intents has no testnet liquidity), while the escrow runs on devnet for the hackathon. The two steps join up once the program is on mainnet.
- The customer chooses the token and the confirmer for each job. That cannot take money from a provider, but it can leave them unpaid, so the dashboard tells providers when a job is not in USDC or not confirmed by the Pamoja service.
- Confirmation by SMS code relies on a trusted confirmation service, because a 6-digit code cannot be safely verified on-chain. A wallet-signed confirmation is planned as a fallback.
- Mobile money and card payments run in the providers' sandboxes (MTN's sandbox approves payments automatically and uses EUR). They fund the escrow at a fixed UGX/USDC rate, and refunds to mobile money are recorded and paid back by hand for now.
