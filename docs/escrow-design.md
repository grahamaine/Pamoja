# Pamoja escrow: build spec

A `Job` is one booking for a service or goods order. Money moves only through the program.

```
Created --fund_job--> Funded --release (attestor signs, up to the deadline)--> Released
   |                     |                                                         |
 cancel              refund (customer, after the deadline)                      close_job
   v                     v                                                         v
Cancelled             Refunded --close_job-->  (job deleted, rent back to the customer)
   |
 close_job
```

## The deadline splits time in two

| | up to the deadline | after the deadline |
|---|---|---|
| `fund_job` | allowed | `DeadlinePassed` |
| `release` | allowed (attestor) | `DeadlinePassed` |
| `refund` | `TooEarly` | allowed (customer) |

The windows never overlap, so a release and a refund can never race for the same money.

## Confirmation: reference + 6-digit code, checked off-chain

The customer receives an SMS/WhatsApp such as **`PMJ-HAIR-483920`**:

- `HAIR` = public **reference** (service/goods type), stored on the `Job` and visible to all.
- `483920` = secret 6-digit code, known only to the customer and the confirmation service.

Why not hash the code on-chain? A 6-digit code has only 1,000,000 values, so a public hash can be
reversed instantly and a provider could release funds without the customer. Instead:

1. Provider enters the code in the app.
2. The confirmation service (the **attestor**) checks it against what it sent (max ~5 tries).
3. On a match the attestor signs the `release` transaction. The program only checks
   `attestor == job.attestor`.
4. Fallback: the customer can confirm directly with a wallet signature (no trust in the service).

Trade-off: trust in the attestor for code-based confirmation. State this openly in the pitch.

## References (fixed list, 2-8 uppercase letters/digits on-chain)

Services: `HAIR` beauty and barber, `REPR` repairs and fundis, `CLEN` cleaning, `BUIL` construction,
`REAL` real estate and property, `PROF` professional services (accounting, legal, IT, recruitment, BPO),
`DIGI` digital and software, `TELE` telecom and internet, `MOMO` mobile money and banking services,
`TOUR` tours and safaris, `STAY` hotels and lodges, `EVNT` events, `HLTH` health and wellness, `EDUC` tutoring and training.

Orders and deliveries: `FOOD` food and restaurants, `GROC` groceries and produce, `ELEC` electronics and fashion,
`SHOP` shops and retail, `RIDE` boda and cab rides, `DLVR` courier and freight, `UTIL` utilities and bills,
`PHAR` pharmacy and tele-health, `GOOD` other goods.

## Instructions (`programs/pamoja/src/instructions/`)

| Instruction | Signer | Does |
|---|---|---|
| `create_job` | customer | Creates the `Job` PDA (`["job", customer, job_id]`). Checks amount > 0, reference format, deadline in the future. |
| `fund_job` | customer | Creates the vault (`["vault", job]`, owned by the job PDA) and moves `amount` into it. Only before the deadline. |
| `release` | attestor | Pays the **whole** vault balance to the provider, closes the vault, sends its rent to the customer. Only up to the deadline. |
| `cancel` | customer | Only while `Created` (nothing to give back). |
| `refund` | customer | Pays the whole vault back to the customer and closes it. Only after the deadline. |
| `close_job` | customer | Deletes a `Released`, `Cancelled` or `Refunded` job and returns its rent. Separate from the others so the job stays on-chain as a receipt until the customer chooses. |

Release and refund pay out the vault's whole balance, not `job.amount`. Anyone can send tokens to a
vault, and a token account with a balance cannot be closed, so paying out everything means a stray
deposit can never block the money from moving.

Constraint failures return named errors: `NotAttestor`, `NotCustomer`, `WrongMint`, `WrongStatus`,
`TooEarly`, `DeadlinePassed`, `JobNotFinished`. Both classic SPL Token and Token-2022 mints work.

## What the provider should check

The customer chooses the token and the attestor when creating a job. Neither choice lets anyone take
money from the provider, but either could leave them unpaid: a look-alike token, or an attestor the
customer controls. The dashboard therefore shows providers a badge on every open job: **Verified**
when it is in USDC with the Pamoja confirmation service, a warning otherwise. Pinning both on-chain
(a config account) is possible later; it is not done yet because demo mode relies on customers
confirming their own jobs while the SMS service is switched off.

## Known limit: the customer can withhold the code

If the customer gets the service but never hands over the code, they can wait for the deadline and
refund. The deadline rule stops the two sides racing, but it does not protect the provider from a
dishonest customer. Planned: a provider "delivered" step that starts a dispute window, after which
the money releases unless the customer disputes.

## Tests (`program/tests/`)

17 tests, run with `anchor test --validator legacy`: the happy path of each instruction, wrong
signers, double funding, double release and refund, funding and releasing after the deadline,
refunding before it, a stray deposit in the vault, and closing open vs finished jobs.

The confirmation service has its own end-to-end check against a local validator:
`frontend/scripts/e2e-confirm.mts` (see the comment at the top of the file).
