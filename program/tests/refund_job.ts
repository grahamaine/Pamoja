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

describe("refund", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.pamoja as Program<Pamoja>;
  const customer = (provider.wallet as anchor.Wallet).payer;

  const providerWallet = anchor.web3.Keypair.generate();
  const attestor = anchor.web3.Keypair.generate();
  const impostor = anchor.web3.Keypair.generate();

  const AMOUNT = 5_000_000;
  const START = 10_000_000;
  const jobId = new BN(6);

  let mint: anchor.web3.PublicKey;
  let customerToken: anchor.web3.PublicKey;
  let job: anchor.web3.PublicKey;
  let vault: anchor.web3.PublicKey;

  const refundAccounts = (signer?: anchor.web3.PublicKey) => ({
    ...(signer ? { customer: signer } : {}),
    job,
    mint,
    customerTokenAccount: customerToken,
    tokenProgram: TOKEN_PROGRAM_ID,
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  before(async () => {
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    customerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey)).address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, START);

    [job] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), jobId.toArrayLike(Buffer, "le", 8)],
      program.programId
    );
    [vault] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("vault"), job.toBuffer()], program.programId);

    // a deadline just a few seconds away, so the test can wait for it to pass
    const deadline = new BN(Math.floor(Date.now() / 1000) + 5);
    await program.methods
      .createJob(jobId, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, deadline)
      .rpc();
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  });

  it("rejects a refund before the deadline", async () => {
    let message = "";
    try {
      await program.methods.refund().accountsPartial(refundAccounts()).rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /TooEarly|deadline/i);
  });

  it("rejects anyone who is not the customer", async () => {
    let message = "";
    try {
      await program.methods.refund().accountsPartial(refundAccounts(impostor.publicKey)).signers([impostor]).rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /NotCustomer|HasOne|2001/i);
  });

  it("returns the money to the customer after the deadline", async () => {
    await sleep(8000); // let the deadline pass

    await program.methods.refund().accountsPartial(refundAccounts()).rpc();

    const customerAccount = await getAccount(provider.connection, customerToken);
    assert.equal(Number(customerAccount.amount), START); // all of it is back
    assert.isNull(await provider.connection.getAccountInfo(vault), "vault is closed and its rent returned");
    const jobAccount = await program.account.job.fetch(job);
    assert.deepEqual(jobAccount.status, { refunded: {} });
  });

  it("rejects a second refund", async () => {
    const paidOut = Number((await getAccount(provider.connection, customerToken)).amount);
    let message = "";
    try {
      await program.methods.refund().accountsPartial(refundAccounts()).rpc();
    } catch (e) {
      message = String(e);
    }
    // The first call closed the vault, so the second fails before it even reaches the status check.
    assert.match(message, /AccountNotInitialized|WrongStatus/);
    const after = await getAccount(provider.connection, customerToken);
    assert.equal(Number(after.amount), paidOut, "no second payout");
  });
});
