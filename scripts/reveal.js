// Reveal a previously committed value.
// Usage: node scripts/reveal.js <roundId>
// Reads the value+salt saved by commit.js, abi-encodes the value, and reveals.
import { readFileSync, existsSync } from 'node:fs';
import { getSigner, getContract, encodeValue, txLink } from './lib.js';

const STORE = '.commits.json';

try {
  const [roundIdArg] = process.argv.slice(2);
  if (roundIdArg === undefined) {
    console.error('Usage: node scripts/reveal.js <roundId>');
    process.exit(1);
  }

  const signer = getSigner();
  const agent = await signer.getAddress();
  const contract = getContract(signer);

  if (!existsSync(STORE)) {
    throw new Error(`No ${STORE} found — commit on this machine first so the salt is saved.`);
  }
  const store = JSON.parse(readFileSync(STORE));
  const key = `${agent.toLowerCase()}:${roundIdArg}`;
  const entry = store[key];
  if (!entry) {
    throw new Error(`No saved commit for ${key} in ${STORE}. Did you commit with this wallet to this round?`);
  }

  const encoded = encodeValue(BigInt(entry.value));
  console.log(`Revealing value=${entry.value} for round ${roundIdArg} as ${agent}`);
  const tx = await contract.reveal(BigInt(roundIdArg), encoded, entry.salt);
  console.log('tx:', txLink(tx.hash));
  await tx.wait();

  console.log('');
  console.log('Revealed. For a SEALED_BID round, resolve after the reveal window:');
  console.log(`  node scripts/resolveHighest.js ${roundIdArg}`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
