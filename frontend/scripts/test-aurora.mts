// Unit checks for api/_lib/aurora.ts against mocked Aurora responses (shapes from the 1Click OpenAPI spec).
//   npx tsx scripts/test-aurora.mts
import assert from 'node:assert/strict'
import { quote, status, payableTokens, usdcUnits, refundAddress, resetTokenCache, type Fetcher } from '../api/_lib/aurora.ts'

process.env.AURORA_API_KEY = 'test-key-123'
const USDC_SOL = 'nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near'
const USDT_TRON = 'nep141:tron-d28a265909efecdcee7c5028585214ea0b96f015.omft.near'
const ETH_BASE = 'nep141:base.omft.near'
const TOKENS = [
  { assetId: USDC_SOL, decimals: 6, blockchain: 'sol', symbol: 'USDC', price: 1, contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  { assetId: USDT_TRON, decimals: 6, blockchain: 'tron', symbol: 'USDT', price: 1, contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
  { assetId: ETH_BASE, decimals: 18, blockchain: 'base', symbol: 'ETH', price: 2500, contractAddress: null },
  { assetId: 'nep141:dead.near', decimals: 18, blockchain: 'near', symbol: 'DEAD', contractAddress: null }, // no price
]
const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'

let last: { url: string; body?: any } = { url: '' }
const mock = (reply: (url: string, body: any) => [number, unknown]): Fetcher =>
  (async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : undefined
    last = { url: String(url), body }
    const [code, data] = reply(String(url), body)
    return new Response(JSON.stringify(data), { status: code })
  }) as Fetcher

const ok = (name: string, fn: () => Promise<void> | void) =>
  Promise.resolve().then(fn).then(() => console.log('PASS ', name), (e) => { console.log('FAIL ', name, '-', e.message); process.exitCode = 1 })

const aurora = mock((url, body) => {
  if (url.includes('/tokens/')) return [200, TOKENS]
  if (url.includes('/quote/')) {
    return [200, {
      correlationId: 'c-1', timestamp: '2026-11-03T10:00:00Z', signature: 'sig',
      quoteRequest: body,
      quote: {
        ...(body.dry ? {} : { depositAddress: 'TXdepositAddrXXXXXXXXXXXXXXXXXXXXX', deadline: body.deadline, timeWhenInactive: body.deadline }),
        amountIn: '25300000', amountInFormatted: '25.3', amountInUsd: '25.30', minAmountIn: '25050000',
        amountOut: body.amount, amountOutFormatted: String(Number(body.amount) / 1e6), amountOutUsd: '25', minAmountOut: body.amount, timeEstimate: 45,
      },
    }]
  }
  if (url.includes('/status/')) {
    return [200, { status: 'SUCCESS', updatedAt: '2026-11-03T10:02:00Z', swapDetails: { amountOutFormatted: '25', amountInFormatted: '25.3',
      destinationChainTxHashes: [{ hash: '5solTx', explorerUrl: 'https://solscan.io/tx/5solTx' }], originChainTxHashes: [{ hash: 'abc', explorerUrl: '' }] } }]
  }
  return [404, { message: 'nope' }]
})

await ok('amount parsing', () => {
  assert.equal(usdcUnits('25'), 25_000_000n)
  assert.equal(usdcUnits('12.5'), 12_500_000n)
  assert.equal(usdcUnits('1.000001'), 1_000_001n)
  for (const bad of ['0.5', '1001', '1.1234567', '-3', 'abc', '']) assert.throws(() => usdcUnits(bad), /USDC|between/)
})

await ok('refund address checks per chain', () => {
  assert.equal(refundAddress('base', '0x2527D02599Ba641c19FEa793cD0F167589a0f10D'), '0x2527D02599Ba641c19FEa793cD0F167589a0f10D')
  assert.throws(() => refundAddress('base', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'), /Base address/)
  refundAddress('tron', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')
  assert.throws(() => refundAddress('tron', '0x2527D02599Ba641c19FEa793cD0F167589a0f10D'), /Tron address/)
  refundAddress('btc', 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')
  assert.throws(() => refundAddress('btc', 'hello world'), /Bitcoin/)
})

await ok('token list hides USDC-on-Solana and unpriced tokens', async () => {
  resetTokenCache()
  const r = await payableTokens(aurora)
  assert.equal(r.destination.assetId, USDC_SOL)
  assert.deepEqual(r.tokens.map((t) => t.symbol).sort(), ['ETH', 'USDT'])
  assert.equal(r.tokens.find((t) => t.symbol === 'USDT')!.chain, 'Tron')
})

await ok('dry quote: EXACT_OUTPUT USDC to the Solana wallet, no deposit address', async () => {
  const q = await quote({ originAsset: USDT_TRON, amount: '25', recipient: WALLET, refundTo: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', dry: true }, aurora)
  assert.match(last.url, /\/api\/quote\/test-key-123$/)
  assert.equal(last.body.swapType, 'EXACT_OUTPUT')
  assert.equal(last.body.destinationAsset, USDC_SOL)
  assert.equal(last.body.amount, '25000000')
  assert.equal(last.body.recipient, WALLET)
  assert.equal(last.body.recipientType, 'DESTINATION_CHAIN')
  assert.equal(last.body.refundType, 'ORIGIN_CHAIN')
  assert.equal(last.body.dry, true)
  assert.equal(q.depositAddress, null)
  assert.equal(q.amountIn, '25.3')
  assert.equal(q.origin.chain, 'Tron')
})

await ok('live quote returns the deposit address and the signed quote record', async () => {
  const q = await quote({ originAsset: USDT_TRON, amount: '25', recipient: WALLET, refundTo: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', dry: false }, aurora)
  assert.equal(last.body.dry, false)
  assert.ok(q.depositAddress)
  assert.equal(q.signature, 'sig')
  const mins = (Date.parse(last.body.deadline) - Date.now()) / 60_000
  assert.ok(mins > 29 && mins <= 30, 'fast chains get a 30 min deadline')
})

await ok('rejects quotes the key must not be used for', async () => {
  const base = { originAsset: USDT_TRON, amount: '25', recipient: WALLET, refundTo: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', dry: true }
  await assert.rejects(quote({ ...base, recipient: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D' }, aurora), /Solana wallet address/)
  await assert.rejects(quote({ ...base, originAsset: USDC_SOL }, aurora), /already USDC on Solana/)
  await assert.rejects(quote({ ...base, originAsset: 'nep141:unknown' }, aurora), /Pick a token/)
  await assert.rejects(quote({ ...base, amount: '5000' }, aurora), /between/)
})

await ok('rejects a quote that would deliver too little USDC', async () => {
  const short = mock((url, body) => url.includes('/tokens/') ? [200, TOKENS] : [200, { correlationId: 'c', timestamp: 't', signature: 's', quote: {
    depositAddress: 'TXdepositAddrXXXXXXXXXXXXXXXXXXXXX', amountIn: '1', amountInFormatted: '1', amountInUsd: '1', minAmountIn: '1',
    amountOut: String(BigInt(body.amount) / 2n), amountOutFormatted: '12.5', amountOutUsd: '12.5', minAmountOut: '1', timeEstimate: 1 } }])
  await assert.rejects(quote({ originAsset: USDT_TRON, amount: '25', recipient: WALLET, refundTo: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', dry: false }, short), /less USDC/)
})

await ok('Aurora 4xx message is passed on without the API key', async () => {
  const angry = mock((url) => url.includes('/tokens/') ? [200, TOKENS] : [400, { message: 'Amount is too low for bridge, try at least 2 (key test-key-123)' }])
  await assert.rejects(quote({ originAsset: ETH_BASE, amount: '1', recipient: WALLET, refundTo: '0x2527D02599Ba641c19FEa793cD0F167589a0f10D', dry: true }, angry), (e: any) => {
    assert.match(e.message, /too low/)
    assert.doesNotMatch(e.message, /test-key-123/)
    return true
  })
})

await ok('status maps the Solana transaction', async () => {
  const s = await status('TXdepositAddrXXXXXXXXXXXXXXXXXXXXX', aurora)
  assert.match(last.url, /\/api\/status\/test-key-123\?depositAddress=TXdeposit/)
  assert.equal(s.status, 'SUCCESS')
  assert.deepEqual(s.solanaTxs, [{ hash: '5solTx', url: 'https://solscan.io/tx/5solTx' }])
  await assert.rejects(status('../../etc', aurora), /Invalid deposit address/)
})

await ok('no key configured -> clear 503', async () => {
  delete process.env.AURORA_API_KEY
  resetTokenCache()
  await assert.rejects(payableTokens(aurora), (e: any) => e.status === 503 && /not switched on/.test(e.message))
})
