// End-to-end check of the SMS confirmation service against a local validator.
//   solana-test-validator --reset --bpf-program 9dLzUWtKppSVHsBBAAea7nqhWUy2pzY3E19PrnGdP2Q4 ../program/target/deploy/pamoja.so
//   npx tsx scripts/e2e-confirm.mts
// Uses an in-memory store and a fake SMS sender, so it needs no Upstash or Africa's Talking account.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@anchor-lang/core'
import BN from 'bn.js'
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, getAssociatedTokenAddressSync, mintTo, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import nacl from 'tweetnacl'
import { issueCode, issueMessage, releaseWithCode, type Deps } from '../api/_lib/confirm.ts'
import { MemoryStore } from '../api/_lib/services.ts'
import { IDL } from '../api/_lib/idl.ts'

const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1 }
const fails = async (p: Promise<unknown>, re: RegExp, m: string) => { try { await p; ok(false, m + ' (did not fail)') } catch (e) { ok(re.test(String((e as Error).message)), `${m}: "${(e as Error).message}"`) } }

const connection = new Connection('http://127.0.0.1:8899', 'confirmed')
const air = async (k: PublicKey, sol: number) => connection.confirmTransaction(await connection.requestAirdrop(k, sol * LAMPORTS_PER_SOL), 'confirmed')
const customer = Keypair.generate(), providerKp = Keypair.generate(), attestor = Keypair.generate()
await air(customer.publicKey, 5)
const program = new Program(IDL, new AnchorProvider(connection, new Wallet(customer), { commitment: 'confirmed' })) as any

let sent = ''
const deps: Deps = { connection, attestor, store: new MemoryStore(), sms: { send: async (_to, text) => { sent = text } }, secret: 'test-secret' }

const mint = await createMint(connection, customer, customer.publicKey, null, 6)
const custAta = (await getOrCreateAssociatedTokenAccount(connection, customer, mint, customer.publicKey)).address
await mintTo(connection, customer, mint, custAta, customer, 20_000_000)

async function newJob(id: number, secs: number) {
  const jobId = new BN(id)
  const [job] = PublicKey.findProgramAddressSync([Buffer.from('job'), customer.publicKey.toBuffer(), jobId.toArrayLike(Buffer, 'le', 8)], program.programId)
  await program.methods.createJob(jobId, providerKp.publicKey, mint, new BN(5_000_000), 'HAIR', attestor.publicKey, new BN(Math.floor(Date.now() / 1000) + secs)).rpc()
  await program.methods.fundJob().accountsPartial({ job, mint, customerTokenAccount: custAta, tokenProgram: TOKEN_PROGRAM_ID }).rpc()
  return job.toBase58()
}
const sign = (job: string) => Buffer.from(nacl.sign.detached(new TextEncoder().encode(issueMessage(job)), customer.secretKey)).toString('base64')

// 1. attestor has no SOL: correct code must be refused cleanly and the try handed back
const job = await newJob(1, 3600)
await issueCode(deps, { job, phone: '0772123456', signature: sign(job) })
const code = sent.match(/PMJ-HAIR-(\d{6})/)![1]
ok(!!code, `SMS text built: "${sent}"`)
await fails(releaseWithCode(deps, { job, code }), /out of network fees/, 'empty attestor wallet → 503')
ok((await deps.store.get(`tries:${job}`)) === null, 'try handed back after the 503')

// 2. wrong code is counted, right code releases (provider has NO token account yet)
await air(attestor.publicKey, 1)
await fails(releaseWithCode(deps, { job, code: code === '000000' ? '111111' : '000000' }), /Wrong code\. 4 tries left/, 'wrong code counted')
const r = await releaseWithCode(deps, { job, code: `PMJ-HAIR-${code}` })
ok(r.released, 'right code releases')
const provAta = getAssociatedTokenAddressSync(mint, providerKp.publicKey)
ok(Number((await getAccount(connection, provAta)).amount) === 5_000_000, 'provider paid, token account created on the fly')
const [vault] = PublicKey.findProgramAddressSync([Buffer.from('vault'), new PublicKey(job).toBuffer()], program.programId)
ok((await connection.getAccountInfo(vault)) === null, 'vault closed')
await fails(releaseWithCode(deps, { job, code }), /already finished/, 'second release refused')

// 3. after the deadline the service refuses before touching codes
const late = await newJob(2, 3)
await new Promise((res) => setTimeout(res, 5000))
await fails(issueCode(deps, { job: late, phone: '0772123456', signature: sign(late) }), /deadline .* has passed/, 'no code sent after deadline')
await fails(releaseWithCode(deps, { job: late, code: '123456' }), /deadline .* has passed/, 'no release after deadline')

// 4. someone else can't request the customer's code
const j3 = await newJob(3, 3600)
const bad = Buffer.from(nacl.sign.detached(new TextEncoder().encode(issueMessage(j3)), providerKp.secretKey)).toString('base64')
await fails(issueCode(deps, { job: j3, phone: '0772123456', signature: bad }), /Only the customer/, 'non-customer cannot get the code')
