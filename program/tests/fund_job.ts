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

describe("fund_job", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.pamoja as Program<Pamoja>;
  const customer = (provider.wallet as anchor.Wallet).payer;

  const providerWallet = anchor.web3.Keypair.generate(); // the service provider
  const attestor = anchor.web3.Keypair.generate(); // the confirmation service

  const AMOUNT = 5_000_000; // 5 tokens with 6 decimals
  const jobId = new BN(1);

  let mint: anchor.web3.PublicKey;
  let customerToken: anchor.web3.PublicKey;
  let job: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;

  before(async () => {
    // a test stablecoin with 6 decimals, and 10 of it for the customer
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    const ata = await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey);
    customerToken = ata.address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, 10_000_000);

    [job] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [vault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), job.toBuffer()],
      program.programId
    );

    const deadline = new BN(Math.floor(Date.now() / 1000) + 3600);
    await program.methods
      .createJob(jobId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, deadline)
      .rpc();
  });

  it("locks the customer's tokens in the vault and marks the job Funded", async () => {
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const vaultAccount = await getAccount(provider.connection, vault);
    assert.equal(Number(vaultAccount.amount), AMOUNT);

    const customerAccount = await getAccount(provider.connection, customerToken);
    assert.equal(Number(customerAccount.amount), 10_000_000 - AMOUNT);

    const jobAccount = await program.account.job.fetch(job);
    assert.deepEqual(jobAccount.status, { funded: {} });
  });

  it("rejects funding the same job twice", async () => {
    let message = "";
    try {
      await program.methods
        .fundJob()
        .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
    } catch (e) {
      message = String(e);
    }
    // the vault already exists, so the account cannot be created a second time
    assert.match(message, /already in use|WrongStatus/);
  });

  it("rejects funding after the deadline", async () => {
    const lateId = new BN(9);
    const [lateJob] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), lateId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    await program.methods
      .createJob(lateId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(Math.floor(Date.now() / 1000) + 3))
      .rpc();
    await new Promise((r) => setTimeout(r, 6000));

    let message = "";
    try {
      await program.methods
        .fundJob()
        .accountsPartial({ job: lateJob, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /DeadlinePassed/);
  });
});