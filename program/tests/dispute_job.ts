import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { assert } from "chai";
import {
  createMint,
  getAccount,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Pamoja } from "../target/types/pamoja";

// The provider "delivered" step and the dispute window (roadmap item 4).
//   Funded --mark_delivered--> Delivered --(window passes)--> claim  -> Released
//                                        --dispute-------->  Disputed -> release (provider) | resolve_refund (customer)
// Once delivered, refund is closed, so a customer cannot withhold the code and wait out the deadline.
describe("delivered and dispute window", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.pamoja as Program<Pamoja>;
  const customer = (provider.wallet as anchor.Wallet).payer;

  const providerWallet = anchor.web3.Keypair.generate();
  const attestor = anchor.web3.Keypair.generate();
  const impostor = anchor.web3.Keypair.generate();

  const AMOUNT = 1_000_000;
  const WINDOW = 60; // the shortest window the program allows
  const now = () => Math.floor(Date.now() / 1000);
  const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

  let mint: anchor.web3.PublicKey;
  let customerToken: anchor.web3.PublicKey;
  let providerToken: anchor.web3.PublicKey;

  const jobPda = (id: BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];
  const vaultPda = (job: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], program.programId)[0];

  async function fundedJob(id: number, deadlineIn: number, window = WINDOW) {
    const jobId = new BN(id);
    const job = jobPda(jobId);
    await program.methods
      .createJob(jobId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(now() + deadlineIn), new BN(window))
      .rpc();
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    return job;
  }

  const markDelivered = (job: anchor.web3.PublicKey, signer = providerWallet) =>
    program.methods.markDelivered().accountsPartial({ provider: signer.publicKey, job }).signers([signer]).rpc();

  const claim = (job: anchor.web3.PublicKey, signer = providerWallet) =>
    program.methods
      .claim()
      .accountsPartial({
        provider: signer.publicKey,
        job,
        customer: customer.publicKey,
        mint,
        providerTokenAccount: providerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([signer])
      .rpc();

  const errorOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return String(e);
    }
    return "";
  };
  const statusOf = async (job: anchor.web3.PublicKey) => (await program.account.job.fetch(job)).status;
  const balance = async (a: anchor.web3.PublicKey) => Number((await getAccount(provider.connection, a)).amount);

  // Job 26 waits out its whole dispute window, so it starts first and the other tests run meanwhile.
  let claimJob: anchor.web3.PublicKey;
  let claimDeliveredAt = 0;

  before(async () => {
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    customerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey)).address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, 20_000_000);
    providerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, providerWallet.publicKey)).address;

    claimJob = await fundedJob(26, 3600);
    await markDelivered(claimJob);
    claimDeliveredAt = (await program.account.job.fetch(claimJob)).deliveredAt.toNumber();
  });

  it("rejects a dispute window outside 1 minute to 7 days", async () => {
    for (const [id, window] of [[20, WINDOW - 1], [21, 7 * 24 * 3600 + 1]]) {
      const message = await errorOf(
        program.methods
          .createJob(new BN(id), providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(now() + 3600), new BN(window))
          .rpc()
      );
      assert.match(message, /InvalidDisputeWindow/);
    }
  });

  it("records the delivery time and window on the job", async () => {
    const j = await program.account.job.fetch(claimJob);
    assert.deepEqual(j.status, { delivered: {} });
    assert.equal(j.disputeWindow.toNumber(), WINDOW);
    assert.approximately(j.deliveredAt.toNumber(), now(), 30);
  });

  it("only lets the provider mark a job delivered", async () => {
    const job = await fundedJob(22, 3600);
    assert.match(await errorOf(markDelivered(job, impostor)), /NotProvider|HasOne|2001/i);
    assert.deepEqual(await statusOf(job), { funded: {} });
  });

  it("does not let the provider mark delivered after the deadline", async () => {
    const job = await fundedJob(23, 3);
    await sleep(5);
    assert.match(await errorOf(markDelivered(job)), /DeadlinePassed/);
    assert.deepEqual(await statusOf(job), { funded: {} }); // the refund path is still open
  });

  it("closes the refund path once delivered, even after the deadline", async () => {
    const job = await fundedJob(24, 4);
    await markDelivered(job);
    await sleep(6); // deadline passes
    const message = await errorOf(
      program.methods
        .refund()
        .accountsPartial({ customer: customer.publicKey, job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc()
    );
    assert.match(message, /WrongStatus/);

    // The customer's code still pays the provider: the attestor can release a delivered job.
    const before = await balance(providerToken);
    await program.methods
      .release()
      .accountsPartial({ attestor: attestor.publicKey, job, customer: customer.publicKey, mint, providerTokenAccount: providerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([attestor])
      .rpc();
    assert.equal(await balance(providerToken), before + AMOUNT);
    assert.deepEqual(await statusOf(job), { released: {} });
  });

  it("lets only the customer dispute, and then only the attestor can decide", async () => {
    const job = await fundedJob(25, 3600);
    await markDelivered(job);

    // Before the window ends the provider cannot claim.
    assert.match(await errorOf(claim(job)), /DisputeWindowOpen/);

    // Someone other than the customer cannot dispute.
    const forged = await errorOf(program.methods.dispute().accountsPartial({ customer: impostor.publicKey, job }).signers([impostor]).rpc());
    assert.match(forged, /NotCustomer|ConstraintSeeds|HasOne|2001|2006/i);

    await program.methods.dispute().accountsPartial({ customer: customer.publicKey, job }).rpc();
    assert.deepEqual(await statusOf(job), { disputed: {} });

    // A disputed job cannot be claimed, refunded by the customer, or disputed twice.
    assert.match(await errorOf(claim(job)), /WrongStatus/);
    assert.match(await errorOf(program.methods.dispute().accountsPartial({ customer: customer.publicKey, job }).rpc()), /WrongStatus/);

    const resolveAccounts = (signer: anchor.web3.PublicKey) => ({
      attestor: signer,
      job,
      customer: customer.publicKey,
      mint,
      customerTokenAccount: customerToken,
      tokenProgram: TOKEN_PROGRAM_ID,
    });
    assert.match(
      await errorOf(program.methods.resolveRefund().accountsPartial(resolveAccounts(impostor.publicKey)).signers([impostor]).rpc()),
      /NotAttestor|HasOne|2001/i
    );

    const before = await balance(customerToken);
    await program.methods.resolveRefund().accountsPartial(resolveAccounts(attestor.publicKey)).signers([attestor]).rpc();
    assert.equal(await balance(customerToken), before + AMOUNT);
    assert.deepEqual(await statusOf(job), { refunded: {} });
    assert.isNull(await provider.connection.getAccountInfo(vaultPda(job)), "vault closed");
  });

  it("lets the attestor rule for the provider on a disputed job", async () => {
    const job = await fundedJob(27, 3600);
    await markDelivered(job);
    await program.methods.dispute().accountsPartial({ customer: customer.publicKey, job }).rpc();
    const before = await balance(providerToken);
    await program.methods
      .release()
      .accountsPartial({ attestor: attestor.publicKey, job, customer: customer.publicKey, mint, providerTokenAccount: providerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .signers([attestor])
      .rpc();
    assert.equal(await balance(providerToken), before + AMOUNT);
    assert.deepEqual(await statusOf(job), { released: {} });
  });

  it("does not allow resolve_refund on a job that is not disputed", async () => {
    const job = await fundedJob(28, 3600);
    const message = await errorOf(
      program.methods
        .resolveRefund()
        .accountsPartial({ attestor: attestor.publicKey, job, customer: customer.publicKey, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
        .signers([attestor])
        .rpc()
    );
    assert.match(message, /WrongStatus/);
  });

  it("pays the provider by claim when the window passes with no dispute", async () => {
    const wait = claimDeliveredAt + WINDOW + 3 - now();
    if (wait > 0) await sleep(wait);

    // Too late to dispute now.
    assert.match(
      await errorOf(program.methods.dispute().accountsPartial({ customer: customer.publicKey, job: claimJob }).rpc()),
      /DisputeWindowClosed/
    );
    assert.match(await errorOf(claim(claimJob, impostor)), /NotProvider|HasOne|2001|ConstraintTokenOwner|2015/i);

    const before = await balance(providerToken);
    await claim(claimJob);
    assert.equal(await balance(providerToken), before + AMOUNT);
    assert.deepEqual(await statusOf(claimJob), { released: {} });
    assert.isNull(await provider.connection.getAccountInfo(vaultPda(claimJob)), "vault closed");

    // A released job is final, so the customer can close it and get the rent back.
    await program.methods.closeJob().accountsPartial({ customer: customer.publicKey, job: claimJob }).rpc();
    assert.isNull(await provider.connection.getAccountInfo(claimJob));
  });
});
