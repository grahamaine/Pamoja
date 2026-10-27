# How Pamoja works

1. **Book.** A customer picks a service or goods order (reference such as `HAIR`, `FOOD`, `RIDE`).
2. **Lock.** The payment goes into a vault owned by the Solana program, not by either side.
3. **Serve.** The provider does the job or delivers the order.
4. **Confirm.** The customer receives an SMS like `PMJ-HAIR-483920` and shares it with the provider.
   The confirmation service checks it and signs the release; the program pays the provider.
5. **Safety nets.** Every job has a deadline. Until it, the provider can be paid; after it, only the
   customer can take the money back. Before paying in, the customer can simply cancel.

Payment options (planned): crypto (USDC), mobile money and bank transfer. Mobile money and bank
payments are collected by a payment partner, which then funds the escrow in stablecoins.

Technical spec: [escrow-design.md](escrow-design.md). Deployment: [deployment.md](deployment.md).
