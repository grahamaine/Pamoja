// End-to-end check of mobile money → escrow and the dispute flow, against a local validator.
//   solana-test-validator --reset --bpf-program 9dLzUWtKppSVHsBBAAea7nqhWUy2pzY3E19PrnGdP2Q4 ../program/target/deploy/pamoja.so
//   npx tsx scripts/e2e-fiat.mts
// The payment itself is not called: this starts where MTN/Airtel/Pesapal has reported SUCCESSFUL.
// Uses an in-memory store and a fake SMS sender.
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js'
import { AnchorProvider, Program, Wallet } from '@anchor-lang/core'
import { createMint, getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token'
import { releaseWithCode } from '../api/_lib/confirm.ts'
import { fiatDispute, fiatRefund, fundOrder, jobInfo, notifyDelivered, prepareOrder, resolveDispute, saveOrder, type FiatDeps } from '../api/_lib/fiat.ts'
import { MemoryStore } from '../api/_lib/services.ts'
import { IDL } from '../api/_lib/idl.ts'

const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1 }
const fails = async (p: Promise<unknown>, re: RegExp, m: string) => { try { await p; ok(false, m + ' (did not fail)') } catch (e) { ok(re.test(String((e as Error).message)), `${m}: "${(e as Error).message}"`) } }

const connection = new Connection('http://127.0.0.1:8899', 'confirmed')
const air = async (k: PublicKey, sol: number) => connection.confirmTransaction(await connection.requestAirdrop(k, sol * LAMPORTS_PER_SOL), 'confirmed')
const treasury = Keypair.generate(), attestor = Keypair.generate(), providerKp = Keypair.generate()
await Promise.all([air(treasury.publicKey, 5), air(attestor.publicKey, 1), air(providerKp.publicKey, 1)])

// a local stand-in for USDC, held by the treasury
const mint = await createMint(connection, treasury, treasury.publicKey, null, 6)
const treasuryAta = (await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey)).address

const sms: { to: string; text: string }[] = []
const d: FiatDeps = {
  connection, attestor, treasury, mint,
  store: new MemoryStore(),
  sms: { send: async (to, text) => { sms.push({ to, text }) } },
  secret: 'test-secret',
  ugxPerUsdc: 3700,
  appUrl: 'https://pamoja.test',
  adminToken: 'admin-secret',
}
const lastCode = () => sms.at(-1)!.text.match(/PMJ-[A-Z0-9]+-(\d{6})/)![1]
const providerProgram = new Program(IDL, new AnchorProvider(connection, new Wallet(providerKp), { commitment: 'confirmed' })) as any
const order = (amount: number) => ({ provider: providerKp.publicKey.toBase58(), reference: 'HAIR', amount, phone: '0772123456', deadlineHours: 24, disputeWindow: 60 })

// 0. no USDC in the treasury: refuse before any money is taken
await fails(prepareOrder(d, order(37_000)), /temporarily unavailable/, 'empty treasury refuses the order up front')
await mintTo(connection, treasury, mint, treasuryAta, treasury, 100_000_000) // 100 "USDC"
await fails(prepareOrder(d, { ...order(37_000), provider: 'nope' }), /wallet address/, 'bad provider address refused')

// 1. payment succeeded → treasury creates and funds the job, customer gets the code by SMS
const o1 = await prepareOrder(d, order(37_000)) // 37,000 UGX at 3,700 = 10 USDC
ok(o1.usdc === '10000000', `37,000 UGX converts to 10 USDC (${o1.usdc} base units)`)
await saveOrder(d, 'mtn', 'pay-1', o1)
ok((await fundOrder(d, 'mtn', 'unknown-payment')).escrow === 'none', 'a payment with no order is left alone')
const f1 = await fundOrder(d, 'mtn', 'pay-1')
ok(f1.escrow === 'locked' && !!f1.job, `job funded from the treasury: ${f1.job}`)
const job1 = f1.job!
ok(sms.length === 1 && sms[0].to === '+256772123456' && /Manage or dispute: https:\/\/pamoja\.test\/\?job=/.test(sms[0].text), `code texted with a manage link: "${sms[0].text}"`)
const again = await fundOrder(d, 'mtn', 'pay-1')
ok(again.escrow === 'locked' && again.job === job1 && sms.length === 1, 'repeat status checks do not fund twice or re-send the code')
const info1 = await jobInfo(d, job1)
ok(info1.status === 'funded' && info1.paidByMobileMoney && info1.amount === '10.00', `job info: ${JSON.stringify(info1)}`)
await fails(fiatRefund(d, { job: job1, code: lastCode() }), /only after the deadline/, 'no refund before the deadline')
const code1 = lastCode()

// 2. provider marks delivered → customer is texted once
await providerProgram.methods.markDelivered().accountsPartial({ provider: providerKp.publicKey, job: new PublicKey(job1) }).rpc()
ok((await notifyDelivered(d, { job: job1 })).notified && /marked your HAIR job as done/.test(sms.at(-1)!.text), `customer told about the delivery: "${sms.at(-1)!.text}"`)
ok(!(await notifyDelivered(d, { job: job1 })).notified, 'delivery text sent only once')

// 3. customer disputes with their code
await fails(fiatDispute(d, { job: job1, code: code1 === '000000' ? '111111' : '000000' }), /Wrong code/, 'dispute needs the right code')
const disp = await fiatDispute(d, { job: job1, code: code1 })
ok(disp.disputed && (await jobInfo(d, job1)).status === 'disputed', 'dispute recorded on-chain')

// 4. Pamoja decides for the customer → money back to the treasury, refund owed to the phone
await fails(resolveDispute(d, { job: job1, outcome: 'customer', token: 'wrong' }), /Not allowed/, 'resolve needs the admin token')
const before = Number((await getAccount(connection, treasuryAta)).amount)
const res = await resolveDispute(d, { job: job1, outcome: 'customer', token: 'admin-secret' })
ok(res.outcome === 'customer', 'dispute decided for the customer')
ok(Number((await getAccount(connection, treasuryAta)).amount) === before + 10_000_000, 'USDC back in the treasury')
const owed = JSON.parse((await d.store.get(`refund-owed:${job1}`))!)
ok(owed.phone === '256772123456' && owed.amountUgx === 37_000 && owed.method === 'mtn', `refund owed recorded: ${JSON.stringify(owed)}`)

// 5. a second booking: provider marks delivered, customer hands over the code → provider paid
await saveOrder(d, 'airtel', 'pay-2', await prepareOrder(d, order(18_500)))
const job2 = (await fundOrder(d, 'airtel', 'pay-2')).job!
const code2 = lastCode()
await providerProgram.methods.markDelivered().accountsPartial({ provider: providerKp.publicKey, job: new PublicKey(job2) }).rpc()
const rel = await releaseWithCode(d, { job: job2, code: code2 })
ok(rel.released, 'code still releases a delivered job')
const provAta = getAssociatedTokenAddressSync(mint, providerKp.publicKey)
ok(Number((await getAccount(connection, provAta)).amount) === 5_000_000, 'provider received 5 USDC for 18,500 UGX')

// 6. a third booking: disputed, then decided for the provider
await saveOrder(d, 'pesapal', 'pay-3', await prepareOrder(d, order(3_700)))
const job3 = (await fundOrder(d, 'pesapal', 'pay-3')).job!
await providerProgram.methods.markDelivered().accountsPartial({ provider: providerKp.publicKey, job: new PublicKey(job3) }).rpc()
await fiatDispute(d, { job: job3, code: lastCode() })
const res3 = await resolveDispute(d, { job: job3, outcome: 'provider', token: 'admin-secret' })
ok(res3.outcome === 'provider' && Number((await getAccount(connection, provAta)).amount) === 6_000_000, 'ruling for the provider pays them')
await fails(resolveDispute(d, { job: job3, outcome: 'provider', token: 'admin-secret' }), /not disputed/, 'a decided job cannot be decided again')

// 7. no delivery by the deadline → the customer reclaims with their code (deadline shortened for the test)
const o4 = { ...(await prepareOrder(d, order(3_700))), deadlineHours: 4 / 3600 }
await saveOrder(d, 'mtn', 'pay-4', o4)
const job4 = (await fundOrder(d, 'mtn', 'pay-4')).job!
const code4 = lastCode()
await new Promise((r) => setTimeout(r, 6000))
await fails(providerProgram.methods.markDelivered().accountsPartial({ provider: providerKp.publicKey, job: new PublicKey(job4) }).rpc(), /DeadlinePassed/, 'provider cannot mark delivered after the deadline')
const t0 = Number((await getAccount(connection, treasuryAta)).amount)
const ref4 = await fiatRefund(d, { job: job4, code: code4 })
ok(ref4.refunded && Number((await getAccount(connection, treasuryAta)).amount) === t0 + 1_000_000, 'refund after the deadline returns the USDC to the treasury')
ok(!!(await d.store.get(`refund-owed:${job4}`)) && /refunded to this number/.test(sms.at(-1)!.text), 'refund owed recorded and the customer told')
