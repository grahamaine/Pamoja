<p align="center"><img src="brand/banner-1500x500.png" alt="Pamoja — Services & Suppliers, East Africa, built on Solana" width="100%"></p>

# Pamoja

**Pay when the service is done.** Pamoja is a Solana escrow app for local businesses in East Africa: salons, repairs, rides, food, shops and suppliers. A customer locks a payment, the provider does the job, and the money is released when the customer confirms with a short code.

**Live demo:** https://pamoja-solana.vercel.app (Solana devnet)

> Status: prototype for the Encode Club Solana Hackathon 2026. The escrow program is complete (`create_job`, `fund_job`, `release`, `cancel`, `refund`, `close_job`) with 17 passing tests, and the dashboard and crypto checkout use real devnet jobs. The SMS confirmation service is built and tested end to end, and switches on once its Upstash and Africa's Talking accounts are set up; until then the site runs in demo mode, where customers confirm their own jobs. Mobile money and card routes are written but not yet sandbox-tested.

## How it works

1. **Lock.** The customer's payment goes into a vault owned by the Solana program.
2. **Serve.** The provider does the job or delivers the order.
3. **Confirm.** The customer gets an SMS like `PMJ-HAIR-483920` (a service reference plus a 6-digit code). A confirmation service checks it and signs the release.
4. **Deadline.** Up to the job's deadline the provider can be paid; after it, only the customer can take the money back. The two never overlap. Before paying in, the customer can cancel.
5. **Clean up.** Finished jobs can be closed to return their rent to the customer.

More detail: [docs/how-it-works.md](docs/how-it-works.md).

## What is in the app

- Services and store categories (beauty, repairs, cleaning, construction, rides, food, delivery, shops and more), each with a job reference code.
- Business dashboard with live jobs from devnet (escrow balance, payouts, provider levels, embeddable "Pay with Pamoja" button). Providers see whether each job is in real USDC and confirmed by the Pamoja service before they start work.
- Wallet connection: Phantom, Solflare and WalletConnect.
- Payment routes for MTN MoMo, Airtel Money and Pesapal (card, bank, mobile money), plus a crypto option.
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
program/           Anchor program `pamoja` (Job account, six instructions, tests)
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
anchor test --validator legacy     # 17 tests on a local validator
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
3. ✅ Confirmation service built and tested end to end (SMS code, wallet-signed request, attempt limits, deadline and fee-balance checks). Needs Upstash and Africa's Talking accounts to switch on.
4. Provider "delivered" step with a dispute window, so a customer cannot withhold the code and wait out the deadline.
5. Server step that funds the escrow after a confirmed mobile money or card payment.
6. Sandbox testing of MTN, Airtel and Pesapal, then production onboarding.

## Honest limits

- A customer who receives the service can refuse to share the code and refund after the deadline. The deadline rule prevents release and refund from racing, but there is no dispute process yet (roadmap item 4).
- The customer chooses the token and the confirmer for each job. That cannot take money from a provider, but it can leave them unpaid, so the dashboard tells providers when a job is not in USDC or not confirmed by the Pamoja service.

- Confirmation by SMS code relies on a trusted confirmation service, because a 6-digit code cannot be safely verified on-chain. A wallet-signed confirmation is planned as a fallback.
- The payment routes were written from the providers' public documentation and have not yet been run against live sandbox credentials.
