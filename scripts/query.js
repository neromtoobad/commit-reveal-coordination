// Inspect a round: struct fields, participant list, and each agent's reveal status.
// Usage: node scripts/query.js <roundId>
import { ethers } from 'ethers';
import { getContract } from './lib.js';

const TYPES = ['SEALED_BID', 'BLIND_VOTE', 'PRIVATE_PREDICTION'];

function decodeUint(value) {
  try {
    return ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], value)[0].toString();
  } catch {
    return null;
  }
}

try {
  const [roundIdArg] = process.argv.slice(2);
  if (roundIdArg === undefined) {
    console.error('Usage: node scripts/query.js <roundId>');
    process.exit(1);
  }

  const contract = getContract(); // read-only via provider
  const roundId = BigInt(roundIdArg);
  const r = await contract.getRound(roundId);

  console.log(`Round ${roundIdArg}`);
  console.log(`  creator:          ${r.creator}`);
  console.log(`  type:             ${TYPES[Number(r.roundType)]}`);
  console.log(`  commitDeadline:   ${new Date(Number(r.commitDeadline) * 1000).toISOString()}`);
  console.log(`  revealDeadline:   ${new Date(Number(r.revealDeadline) * 1000).toISOString()}`);
  console.log(`  resolved:         ${r.resolved}`);
  console.log(`  participantCount: ${r.participantCount}`);
  console.log(`  metadata:         ${r.metadata}`);

  const ps = await contract.participants(roundId);
  console.log(`Participants (${ps.length}):`);
  for (const p of ps) {
    const [value, revealed] = await contract.getReveal(roundId, p);
    if (revealed) {
      const asUint = decodeUint(value);
      console.log(`  ${p}  revealed=true  value=${value}${asUint !== null ? ` (uint256 ${asUint})` : ''}`);
    } else {
      console.log(`  ${p}  revealed=false (still hidden)`);
    }
  }
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
