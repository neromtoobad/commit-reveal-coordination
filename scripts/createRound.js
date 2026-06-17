// Create a coordination round.
// Usage: node scripts/createRound.js <commitDuration s> <revealDuration s> <roundType 0|1|2> [metadata]
//   roundType: 0 = SEALED_BID, 1 = BLIND_VOTE, 2 = PRIVATE_PREDICTION
import { ethers } from 'ethers';
import { getSigner, getContract, txLink } from './lib.js';

const TYPES = ['SEALED_BID', 'BLIND_VOTE', 'PRIVATE_PREDICTION'];

function toMetadata(arg) {
  if (!arg) return ethers.ZeroHash;
  if (/^0x[0-9a-fA-F]{64}$/.test(arg)) return arg;          // already bytes32
  if (arg.length <= 31) return ethers.encodeBytes32String(arg); // short readable tag
  return ethers.id(arg);                                     // hash longer tags
}

try {
  const [commitDuration, revealDuration, roundTypeArg, metadataArg] = process.argv.slice(2);
  if (commitDuration === undefined || revealDuration === undefined || roundTypeArg === undefined) {
    console.error('Usage: node scripts/createRound.js <commitDuration s> <revealDuration s> <roundType 0|1|2> [metadata]');
    process.exit(1);
  }
  const roundType = Number(roundTypeArg);
  if (![0, 1, 2].includes(roundType)) {
    console.error('roundType must be 0 (SEALED_BID), 1 (BLIND_VOTE), or 2 (PRIVATE_PREDICTION)');
    process.exit(1);
  }

  const contract = getContract(getSigner());
  const metadata = toMetadata(metadataArg);

  console.log(`Creating ${TYPES[roundType]} round: commit=${commitDuration}s reveal=${revealDuration}s metadata=${metadata}`);
  const tx = await contract.createRound(BigInt(commitDuration), BigInt(revealDuration), roundType, metadata);
  console.log('tx:', txLink(tx.hash));
  const receipt = await tx.wait();

  let roundId;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === 'RoundCreated') { roundId = parsed.args.roundId; break; }
    } catch { /* not our event */ }
  }

  const r = await contract.getRound(roundId);
  console.log('');
  console.log(`Round created. roundId = ${roundId}`);
  console.log(`  commit closes:  ${new Date(Number(r.commitDeadline) * 1000).toISOString()}`);
  console.log(`  reveal closes:  ${new Date(Number(r.revealDeadline) * 1000).toISOString()}`);
  console.log(`Next: node scripts/commit.js ${roundId} <value>`);
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
