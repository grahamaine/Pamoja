# Pamoja escrow: build spec

A `Job` is one booking for a service or goods order. Money moves only through the program.

```
Created --fund_job--> Funded --release (attestor signs, up to the deadline)------------------> Released
   |                     |  \                                                                  ^   |
 cancel                  |   mark_delivered (provider, up to the deadline)                     |  close_job
   v                     |        v                                                             |
Cancelled                |   Delivered --claim (provider, after the dispute window)-------------+
   |                     |        |  \--release (attestor: the customer's code)----------------+
 close_job               |     dispute (customer, within the window)                           |
                         |        v                                                             |
                         |   Disputed --release (attestor rules for the provider)--------------+
                         |        \--resolve_refund (attestor rules for the customer)--+
                         v                                                             v
                  refund (customer, after the deadline) ----------------------------> Refunded --close_job-->
```

## The deadline splits time in two

| | up to the deadline | after the deadline |
|---|---|---|
| `fund_job` | allowed | `DeadlinePassed` |
| `release` | allowed (attestor) | `DeadlinePassed` |
| `refund` | `TooEarly` | allowed (customer) |

The windows never overlap, so a release and a refund can never race for the same money.

| | up to the deadline | after the deadline |
|---|---|---|
| `mark_delivered` | allowed (provider) | `DeadlinePassed` |

## Delivered and the dispute window

Once the provider marks a job **Delivered**, the refund path is closed and a second clock starts:
`dispute_window` seconds, chosen when the job is created (1 minute to 7 days; the app offers 48 hours,
24 hours, 1 hour, or 2 minutes for demos).

| | within the window | after the window |
|---|---|---|
| `dispute` | allowed (customer) | `DisputeWindowClosed` |
| `claim` | `DisputeWindowOpen` | allowed (provider) |
| `release` | allowed (attestor) | allowed (attestor) |

Dispute and claim never overlap either. A disputed job stays locked until the attestor decides: `release`
pays the provider, `resolve_refund` pays the customer back. So a customer can no longer withhold the
code and wait out the deadline: once the work is marked done, they must either hand over the code or
raise a dispute that Pamoja reviews.

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
| `create_job` | customer | Creates the `Job` PDA (`["job", customer, job_id]`). Checks amount > 0, reference format, deadline in the future, dispute window between 1 minute and 7 days. |
| `fund_job` | customer | Creates the vault (`["vault", job]`, owned by the job PDA) and moves `amount` into it. Only before the deadline. |
| `release` | attestor | Pays the **whole** vault balance to the provider, closes the vault, sends its rent to the customer. A funded job only up to the deadline; a delivered or disputed job at any time. |
| `mark_delivered` | provider | Funded → Delivered, records `delivered_at`. Only up to the deadline. Closes the refund path. |
| `dispute` | customer | Delivered → Disputed, only within the dispute window. |
| `claim` | provider | Pays the vault to the provider once the dispute window has passed with no dispute. |
| `resolve_refund` | attestor | Disputed → Refunded: pays the vault back to the customer. |
| `cancel` | customer | Only while `Created` (nothing to give back). |
| `refund` | customer | Pays the whole vault back to the customer and closes it. Only after the deadline. |
| `close_job` | customer | Deletes a `Released`, `Cancelled` or `Refunded` job and returns its rent. Separate from the others so the job stays on-chain as a receipt until the customer chooses. |

Release and refund pay out the vault's whole balance, not `job.amount`. Anyone can send tokens to a
vault, and a token account with a balance cannot be closed, so paying out everything means a stray
deposit can never block the money from moving.

Constraint failures return named errors: `NotAttestor`, `NotCustomer`, `NotProvider`, `WrongMint`, `WrongStatus`,
`TooEarly`, `DeadlinePassed`, `JobNotFinished`, `InvalidDisputeWindow`, `DisputeWindowOpen`, `DisputeWindowClosed`. Both classic SPL Token and Token-2022 mints work.

## What the provider should check

The customer chooses the token and the attestor when creating a job. Neither choice lets anyone take
money from the provider, but either could leave them unpaid: a look-alike token, or an attestor the
customer controls. The dashboard therefore shows providers a badge on every open job: **Verified**
when it is in USDC with the Pamoja confirmation service, a warning otherwise. Pinning both on-chain
(a config account) is possible later; it is not done yet because demo mode relies on customers
confirming their own jobs while the SMS service is switched off.

## Account layout

`Job` gained two fields at the end, `dispute_window` and `delivered_at` (190 bytes in all, up from 174),
and `JobStatus` gained `Delivered` and `Disputed` after the existing variants. Jobs created by the
earlier program cannot be read with the new layout; the app lists only 190-byte accounts, so those old
devnet test jobs simply disappear from the dashboard (their rent, about 0.002 SOL each, stays locked).

## Known limit: a dispute needs a human

A disputed job waits for the attestor (the Pamoja team) to decide. There is no on-chain timeout for an
undecided dispute yet, and the decision itself is trusted, the same trust the SMS code already needs.

## Tests (`program/tests/`)

26 tests, run with `anchor test --validator legacy`: the happy path of each instruction, wrong
signers, double funding, double release and refund, funding and releasing after the deadline,
refunding before it, a stray deposit in the vault, closing open vs finished jobs, and the delivered
step: dispute window bounds, only the provider marks delivered, no delivery after the deadline, no
refund once delivered, dispute only by the customer and only in the window, claim only after it,
and the attestor's two rulings.

The server side has end-to-end checks against a local validator: `frontend/scripts/e2e-confirm.mts`
(SMS code release) and `frontend/scripts/e2e-fiat.mts` (mobile money funding, disputes and refunds).
See the comment at the top of each file.
