# How Pamoja works

1. **Book.** A customer picks a service or goods order (reference such as `HAIR`, `FOOD`, `RIDE`).
2. **Lock.** The payment goes into a vault owned by the Solana program, not by either side.
3. **Serve.** The provider does the job or delivers the order.
4. **Confirm.** The customer receives an SMS like `PMJ-HAIR-483920` and shares it with the provider.
   The confirmation service checks it and signs the release; the program pays the provider.
5. **Delivered.** If the customer does not hand over the code, the provider marks the job delivered.
   The customer then has a set time (48 hours by default) to dispute. No dispute: the provider claims
   the payment. Dispute: the Pamoja team reviews it and either pays the provider or refunds the customer.
6. **Safety nets.** Every job has a deadline. Until it, the provider can be paid or mark the job
   delivered; after it, if nothing was delivered, only the customer can take the money back. Before
   paying in, the customer can simply cancel.

Payment options: crypto (USDC from a wallet), any chain (Aurora Intents), mobile money (MTN, Airtel)
and card or bank (Pesapal). Mobile money and card payments need no wallet: once the payment provider
confirms the payment, the Pamoja treasury locks the same value in USDC in the escrow, and the customer
uses their SMS code to confirm, dispute or reclaim. See [payments.md](payments.md).

Technical spec: [escrow-design.md](escrow-design.md). Deployment: [deployment.md](deployment.md).
