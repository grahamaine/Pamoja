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

describe("release", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.pamoja as Program<Pamoja>;
  const customer = (provider.wallet as anchor.Wallet).payer;

  const providerWallet = anchor.web3.Keypair.generate();
  const attestor = anchor.web3.Keypair.generate();
  const impostor = anchor.web3.Keypair.generate();

  const AMOUNT = 5_000_000;
  const jobId = new BN(2); // fund_job.ts uses 1

  let mint: anchor.web3.PublicKey;
  let customerToken: anchor.web3.PublicKey;
  let providerToken: anchor.web3.PublicKey;
  let job: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;

  const releaseAccounts = (signer: anchor.web3.PublicKey, jobAddr = job) => ({
    attestor: signer,
    job: jobAddr,
    customer: customer.publicKey,
    mint,
    providerTokenAccount: providerToken,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  before(async () => {
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    customerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey)).address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, 10_000_000);
    providerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, providerWallet.publicKey)).address;

    [job] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [vault] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], program.programId);

    const deadline = new BN(Math.floor(Date.now() / 1000) + 3600);
    await program.methods
      .createJob(jobId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, deadline)
      .rpc();
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  });

  it("rejects anyone who is not the attestor", async () => {
    let message = "";
    try {
      await program.methods.release().accountsPartial(releaseAccounts(impostor.publicKey)).signers([impostor]).rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /NotAttestor|HasOne|2001/i);
    const jobAccount = await program.account.job.fetch(job);
    assert.deepEqual(jobAccount.status, { funded: {} }); // nothing moved
  });

  it("pays the provider when the attestor signs, even if someone sent extra tokens to the vault", async () => {
    // Anyone can send tokens to the vault. That must not stop the vault from being closed.
    const STRAY = 1_000;
    await mintTo(provider.connection, customer, mint, vault, customer, STRAY);

    await program.methods.release().accountsPartial(releaseAccounts(attestor.publicKey)).signers([attestor]).rpc();

    const providerAccount = await getAccount(provider.connection, providerToken);
    assert.equal(Number(providerAccount.amount), AMOUNT + STRAY); // the whole vault is paid out
    assert.isNull(await provider.connection.getAccountInfo(vault), "vault is closed and its rent returned");
    const jobAccount = await program.account.job.fetch(job);
    assert.deepEqual(jobAccount.status, { released: {} });
  });

  it("rejects a second release", async () => {
    const paidOut = Number((await getAccount(provider.connection, providerToken)).amount);
    let message = "";
    try {
      await program.methods.release().accountsPartial(releaseAccounts(attestor.publicKey)).signers([attestor]).rpc();
    } catch (e) {
      message = String(e);
    }
    // The first call closed the vault, so the second fails before it even reaches the status check.
    assert.match(message, /AccountNotInitialized|WrongStatus/);
    const after = await getAccount(provider.connection, providerToken);
    assert.equal(Number(after.amount), paidOut, "no second payout");
  });

  it("rejects a release after the deadline, so it can never race a refund", async () => {
    const lateId = new BN(8);
    const [lateJob] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), lateId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    const [lateVault] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), lateJob.toBuffer()], program.programId);
    await program.methods
      .createJob(lateId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(Math.floor(Date.now() / 1000) + 4))
      .rpc();
    await program.methods
      .fundJob()
      .accountsPartial({ job: lateJob, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    await new Promise((r) => setTimeout(r, 7000)); // let the deadline pass

    let message = "";
    try {
      await program.methods
        .release()
        .accountsPartial({ ...releaseAccounts(attestor.publicKey, lateJob), vault: lateVault })
        .signers([attestor])
        .rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /DeadlinePassed/);
    const jobAccount = await program.account.job.fetch(lateJob);
    assert.deepEqual(jobAccount.status, { funded: {} }); // still there for the customer to refund
  });
});
