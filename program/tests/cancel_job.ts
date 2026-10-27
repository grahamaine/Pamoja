import * as anchor from "@anchor-lang/core";
import { BN, Program } from "@anchor-lang/core";
import { assert } from "chai";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Pamoja } from "../target/types/pamoja";

describe("cancel", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.pamoja as Program<Pamoja>;
  const customer = (provider.wallet as anchor.Wallet).payer;

  const providerWallet = anchor.web3.Keypair.generate();
  const attestor = anchor.web3.Keypair.generate();
  const impostor = anchor.web3.Keypair.generate();

  const AMOUNT = 5_000_000;
  let mint: anchor.web3.PublicKey;
  let customerToken: anchor.web3.PublicKey;

  const jobAddress = (id: BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const createJob = (id: BN) =>
    program.methods
      .createJob(id, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(Math.floor(Date.now() / 1000) + 3600))
      .rpc();

  before(async () => {
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    customerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey)).address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, 10_000_000);
  });

  it("lets the customer cancel an unfunded job, and then it cannot be funded", async () => {
    const id = new BN(3);
    const job = jobAddress(id);
    await createJob(id);

    await program.methods.cancel().accountsPartial({ job }).rpc();
    const jobAccount = await program.account.job.fetch(job);
    assert.deepEqual(jobAccount.status, { cancelled: {} });

    let message = "";
    try {
      await program.methods
        .fundJob()
        .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /WrongStatus|right status/i);
  });

  it("rejects anyone who is not the customer", async () => {
    const id = new BN(4);
    const job = jobAddress(id);
    await createJob(id);

    let message = "";
    try {
      await program.methods.cancel().accountsPartial({ customer: impostor.publicKey, job }).signers([impostor]).rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /NotCustomer|HasOne|2001/i);
  });

  it("rejects cancelling a job that is already funded", async () => {
    const id = new BN(5);
    const job = jobAddress(id);
    await createJob(id);
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    let message = "";
    try {
      await program.methods.cancel().accountsPartial({ job }).rpc();
    } catch (e) {
      message = String(e);
    }
    assert.match(message, /WrongStatus|right status/i);
  });
});
