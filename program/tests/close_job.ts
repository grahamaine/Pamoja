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

describe("close_job", () => {
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
  let providerToken: anchor.web3.PublicKey;

  const jobAddress = (id: BN) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("job"), customer.publicKey.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
      program.programId
    )[0];

  const createJob = (id: BN) =>
    program.methods
      .createJob(id, providerWallet.publicKey, mint, new BN(AMOUNT), "HAIR", attestor.publicKey, new BN(Math.floor(Date.now() / 1000) + 3600))
      .rpc();

  const errorOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return String(e);
    }
    return "";
  };

  before(async () => {
    mint = await createMint(provider.connection, customer, customer.publicKey, null, 6);
    customerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, customer.publicKey)).address;
    await mintTo(provider.connection, customer, mint, customerToken, customer, 10_000_000);
    providerToken = (await getOrCreateAssociatedTokenAccount(provider.connection, customer, mint, providerWallet.publicKey)).address;
  });

  it("refuses to close a job that is still open", async () => {
    const id = new BN(7);
    const job = jobAddress(id);
    await createJob(id);
    const message = await errorOf(program.methods.closeJob().accountsPartial({ job }).rpc());
    assert.match(message, /JobNotFinished/);
  });

  it("closes a cancelled job and returns its rent to the customer", async () => {
    const job = jobAddress(new BN(7));
    await program.methods.cancel().accountsPartial({ job }).rpc();

    const rent = (await provider.connection.getAccountInfo(job))!.lamports;
    const before = await provider.connection.getBalance(customer.publicKey);
    await program.methods.closeJob().accountsPartial({ job }).rpc();
    const after = await provider.connection.getBalance(customer.publicKey);

    assert.isNull(await provider.connection.getAccountInfo(job));
    assert.isAbove(after - before, rent - 10_000); // rent back, minus the transaction fee
  });

  it("closes a released job, but only for the customer", async () => {
    const id = new BN(10);
    const job = jobAddress(id);
    await createJob(id);
    await program.methods
      .fundJob()
      .accountsPartial({ job, mint, customerTokenAccount: customerToken, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
    await program.methods
      .release()
      .accountsPartial({
        attestor: attestor.publicKey,
        job,
        customer: customer.publicKey,
        mint,
        providerTokenAccount: providerToken,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([attestor])
      .rpc();

    const message = await errorOf(
      program.methods.closeJob().accountsPartial({ customer: impostor.publicKey, job }).signers([impostor]).rpc()
    );
    assert.match(message, /NotCustomer|HasOne|2001/i);

    await program.methods.closeJob().accountsPartial({ job }).rpc();
    assert.isNull(await provider.connection.getAccountInfo(job));
  });
});
