// Copies the program interface from the Anchor build into the website and the serverless functions.
//   cd program && anchor build      (writes target/idl/pamoja.json and target/types/pamoja.ts)
//   cd ../frontend && node scripts/sync-idl.mjs
// If the program has not been built here, the IDL already in src/idl is used as-is.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'

const built = new URL('../../program/target/idl/pamoja.json', import.meta.url)
const builtTypes = new URL('../../program/target/types/pamoja.ts', import.meta.url)
const src = new URL('../src/idl/pamoja.json', import.meta.url)

if (existsSync(built)) {
  copyFileSync(built, src)
  if (existsSync(builtTypes)) copyFileSync(builtTypes, new URL('../src/idl/pamoja.ts', import.meta.url))
  console.log('src/idl updated from program/target')
}

const idl = JSON.parse(readFileSync(src, 'utf8'))
writeFileSync(
  new URL('../api/_lib/idl.ts', import.meta.url),
  `// Generated from src/idl/pamoja.json. Re-generate after changing the program:\n//   node scripts/sync-idl.mjs\n/* eslint-disable */\nexport const IDL: any = ${JSON.stringify(idl, null, 2)}\n`,
)
console.log(`api/_lib/idl.ts written (${idl.instructions.length} instructions)`)
