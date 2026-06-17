// End-to-end live demo: a two-agent sealed-bid auction on Pharos Atlantic.
// Agent A = the wallet in .env. Agent B = a fresh wallet funded by A.
// Runs create -> both commit -> both reveal -> resolveHighest, and writes
// proof/transcript.md with every tx hash + explorer link.
//
// Usage: node scripts/demo.js [commitSecs] [revealSecs] [bidA] [bidB]
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  getProvider, getSigner, getContract,
  buildCommit, encodeValue, randomSalt, txLink, addressLink, EXPLORER,
} from './lib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
function log(s = '') { console.log(s); lines.push(s); }

async function waitForTimestamp(provider, ts, label) {
  log(`  ...waiting for ${label} (chain ts > ${ts})`);
  for (;;) {
    const block = await provider.getBlock('latest');
    if (block.timestamp > ts) return;
    await sleep(3000);
  }
}

function parseEvent(contract, receipt, name) {
  for (const lg of receipt.logs) {
    try {
      const p = contract.interface.parseLog(lg);
      if (p?.name === name) return p.args;
    } catch { /* not ours */ }
  }
  return null;
}

try {
  const [commitSecsArg, revealSecsArg, bidAArg, bidBArg] = process.argv.slice(2);
  const commitSecs = Number(commitSecsArg ?? 45);
  const revealSecs = Number(revealSecsArg ?? 45);
  const bidA = BigInt(bidAArg ?? 100);
  const bidB = BigInt(bidBArg ?? 250);

  const provider = getProvider();
  const agentA = getSigner();
  const agentB = ethers.Wallet.createRandom().connect(provider);
  const coordA = getContract(agentA);
  const coordB = getContract(agentB);

  const started = new Date().toISOString();
  log('# Live proof — sealed-bid auction on Pharos Atlantic');
  log('');
  log(`- Contract: [\`${process.env.CONTRACT_ADDRESS}\`](${addressLink(process.env.CONTRACT_ADDRESS)})`);
  log(`- Chain: Pharos Atlantic Testnet (688689) · Explorer: ${EXPLORER}`);
  log(`- Run started: ${started}`);
  log(`- Agent A: [\`${agentA.address}\`](${addressLink(agentA.address)})`);
  log(`- Agent B: [\`${agentB.address}\`](${addressLink(agentB.address)}) (freshly generated, funded by A)`);
  log('');

  // 1. Fund agent B for gas.
  log('## 1. Fund agent B');
  const fundTx = await agentA.sendTransaction({ to: agentB.address, value: ethers.parseEther('0.05') });
  log(`- fund tx: [\`${fundTx.hash}\`](${txLink(fundTx.hash)})`);
  await fundTx.wait();
  log('');

  // 2. Create a sealed-bid round.
  log('## 2. Create round (SEALED_BID)');
  const createTx = await coordA.createRound(commitSecs, revealSecs, 0, ethers.encodeBytes32String('demo-auction'));
  log(`- create tx: [\`${createTx.hash}\`](${txLink(createTx.hash)})`);
  const createRc = await createTx.wait();
  const roundId = parseEvent(coordA, createRc, 'RoundCreated').roundId;
  const round = await coordA.getRound(roundId);
  const commitDeadline = Number(round.commitDeadline);
  const revealDeadline = Number(round.revealDeadline);
  log(`- roundId: ${roundId}`);
  log(`- commit closes: ${new Date(commitDeadline * 1000).toISOString()}`);
  log(`- reveal closes: ${new Date(revealDeadline * 1000).toISOString()}`);
  log('');

  // 3. Both agents commit hidden bids.
  log('## 3. Commit hidden bids');
  const saltA = randomSalt();
  const saltB = randomSalt();
  const commitTxA = await coordA.commit(roundId, buildCommit(bidA, saltA, agentA.address));
  log(`- A commits (bid hidden): [\`${commitTxA.hash}\`](${txLink(commitTxA.hash)})`);
  await commitTxA.wait();
  const commitTxB = await coordB.commit(roundId, buildCommit(bidB, saltB, agentB.address));
  log(`- B commits (bid hidden): [\`${commitTxB.hash}\`](${txLink(commitTxB.hash)})`);
  await commitTxB.wait();
  log('- On-chain, both bids are just hashes right now — neither agent can see the other\'s bid.');
  log('');

  // 4. Wait out the commit window, then reveal.
  log('## 4. Reveal');
  await waitForTimestamp(provider, commitDeadline, 'commit window to close');
  const revealTxA = await coordA.reveal(roundId, encodeValue(bidA), saltA);
  log(`- A reveals ${bidA}: [\`${revealTxA.hash}\`](${txLink(revealTxA.hash)})`);
  await revealTxA.wait();
  const revealTxB = await coordB.reveal(roundId, encodeValue(bidB), saltB);
  log(`- B reveals ${bidB}: [\`${revealTxB.hash}\`](${txLink(revealTxB.hash)})`);
  await revealTxB.wait();
  log('');

  // 5. Wait out the reveal window, then resolve on-chain.
  log('## 5. Resolve (highest bid wins, decided on-chain)');
  await waitForTimestamp(provider, revealDeadline, 'reveal window to close');
  const resolveTx = await coordA.resolveHighest(roundId);
  log(`- resolve tx: [\`${resolveTx.hash}\`](${txLink(resolveTx.hash)})`);
  const resolveRc = await resolveTx.wait();
  const resolved = parseEvent(coordA, resolveRc, 'Resolved');
  log(`- **winner: [\`${resolved.winner}\`](${addressLink(resolved.winner)})  highBid: ${resolved.result}**`);
  const expectedWinner = bidB > bidA ? agentB.address : agentA.address;
  log(`- expected winner: \`${expectedWinner}\` -> ${resolved.winner.toLowerCase() === expectedWinner.toLowerCase() ? 'MATCH ✅' : 'MISMATCH ❌'}`);
  log('');

  log('## Result');
  log('A complete sealed-bid auction ran end-to-end on-chain: bids stayed hidden through the commit phase, the contract enforced reveal integrity, and the higher bid won — all without any agent able to copy or front-run the other.');

  mkdirSync('proof', { recursive: true });
  writeFileSync('proof/transcript.md', lines.join('\n') + '\n');
  console.log('\nWrote proof/transcript.md');
} catch (e) {
  console.error('Error:', e.shortMessage || e.message || e);
  process.exit(1);
}
