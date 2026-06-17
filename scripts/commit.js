// Submit a sealed commitment for a round.
// Usage: node scripts/commit.js <roundId> <value uint256>
// Generates a random salt, computes the sender-bound commit hash, sends the tx,
// and saves {roundId, value, salt} to .commits.json so reveal.js can find it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getSigner, getContract, buildCommit, randomSalt, txLink } from './lib.js';

const STORE = '.commits.json';

try {
  const [roundIdArg, valueArg] = process.argv.slice(2);
  if (roundIdArg === undefined || valueArg === undefined) {
    console.error('Usage: node scripts/commit.js <roundId> <value uint256>');
    process.exit(1);
  }

  const signer = getSigner();
  const agent = await signer.getAddress();
  const contract = getContract(signer);

  const value = BigInt(valueArg);
  const salt = randomSalt();
  const commitHash = buildCommit(value, salt, agent);

  console.log(`Committing value=${value} for round ${roundIdArg} as ${agent}`);
  console.log(`  commitHash: ${commitHash}`);
  const tx = await contract.commit(BigInt(roundIdArg), commitHash);
  console.log('tx:', txLink(tx.hash));
  await tx.wait();

  const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE)) : {};
  const key = `${agent.toLowerCase()}:${roundIdArg}`;
  store[key] = { roundId: roundIdArg, agent, value: value.toString(), salt, commitHash };
  writeFileSync(STORE, JSON.stringify(store, null, 2) + '\n');

  console.log('');
  console.log(`Committed. Salt saved to ${STORE} (key: ${key}). Keep it private until reveal.`);
  console.log(`Next (after the commit window closes): node scripts/reveal.js ${roundIdArg}`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
