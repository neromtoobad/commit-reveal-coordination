// Resolve a SEALED_BID round on-chain: pick the highest revealed uint256 bid.
// Usage: node scripts/resolveHighest.js <roundId>
// Only valid after the reveal window closes; callable once.
import { getSigner, getContract, txLink, addressLink } from './lib.js';

try {
  const [roundIdArg] = process.argv.slice(2);
  if (roundIdArg === undefined) {
    console.error('Usage: node scripts/resolveHighest.js <roundId>');
    process.exit(1);
  }

  const contract = getContract(getSigner());

  console.log(`Resolving highest bid for round ${roundIdArg}...`);
  const tx = await contract.resolveHighest(BigInt(roundIdArg));
  console.log('tx:', txLink(tx.hash));
  const receipt = await tx.wait();

  let winner, result;
  for (const log of receipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === 'Resolved') { winner = parsed.args.winner; result = parsed.args.result; break; }
    } catch { /* not our event */ }
  }

  console.log('');
  console.log(`Resolved. winner = ${winner}  highBid = ${result}`);
  if (winner) console.log('winner:', addressLink(winner));
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
