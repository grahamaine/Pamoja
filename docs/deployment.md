# Deployment

## Frontend (Vercel)

The app is a Vite + React site in `frontend/`. `frontend/vercel.json` sets the build and a
single-page-app rewrite.

**Dashboard:** import the GitHub repo, set **Root Directory** to `frontend`, framework **Vite**.

**CLI:**
```powershell
cd frontend
vercel link --yes --project pamoja-solana
vercel deploy --prod
```

Environment variables are listed in `frontend/.env.example`.

## Program (Solana devnet)

Run from WSL, where Solana and Anchor are installed:
```bash
cd program
solana airdrop 2 --url devnet   # if the wallet needs devnet SOL (the public faucet is rate limited; try faucet.solana.com)
anchor build
anchor program deploy --provider.cluster devnet
cd ../frontend && npm run sync-idl   # copies the new IDL into src/idl and api/_lib
```
After deploying, redeploy the frontend so it ships the latest interface file. Deploy the program and
the frontend together: the site and the confirmation service call the instructions with the account
lists they were built for.

**Upgrading from the old `counter_program` build.** The crate is now called `pamoja`, so Anchor looks
for `target/deploy/pamoja-keypair.json`. Copy your existing key before the first build, or Anchor
generates a new one and the program ID changes:
```bash
cp target/deploy/counter_program-keypair.json target/deploy/pamoja-keypair.json
anchor keys list   # must print 9dLzUWtKppSVHsBBAAea7nqhWUy2pzY3E19PrnGdP2Q4
```
Existing jobs keep working after the upgrade: the `Job` account layout is unchanged. Vaults of jobs
released or refunded before the upgrade stay open (empty); that only affects devnet test rent.

`Anchor.toml` is set to `localnet` so tests run on a free local validator:
```bash
anchor test --validator legacy
```
(Anchor 1.x defaults to Surfpool; `--validator legacy` uses the standard Solana test validator.)

A deploy needs about 1.3 SOL for rent plus fees. If it fails with "Blockhash expired", retry with
`solana program deploy target/deploy/pamoja.so --program-id target/deploy/pamoja-keypair.json --url devnet --with-compute-unit-price 1000 --max-sign-attempts 20`,
and list or close leftover buffers with `solana program show --buffers --url devnet`.

The confirmation service's wallet (`ATTESTOR_SECRET_KEY`) pays release fees. Keep at least 0.01 SOL
in it; check `GET /api/confirm/status` for `attestorSol`.

Never commit keypairs. `.gitignore` already excludes `*-keypair.json`, `target/` and `.env*`.
