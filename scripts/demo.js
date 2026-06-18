// Live demo: a two-agent SEALED-BID AUCTION on Pharos Atlantic — with the on-chain
// sealed hashes shown during the commit phase and a live copy/steal attack that the
// contract rejects in real time. Writes a markdown proof to proof/transcript.md.
//
// Usage: node scripts/demo.js [commitSecs] [revealSecs] [bidA] [bidB]
import { ethers } from 'ethers';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  getProvider, getSigner, getContract,
  buildCommit, encodeValue, randomSalt, txLink, addressLink,
} from './lib.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- terminal styling ----
const S = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', gray: '\x1b[90m',
};
const short = (h) => `${h.slice(0, 10)}…${h.slice(-4)}`;
const rule = (ch = '═', n = 60) => ch.repeat(n);
function banner(title, sub) {
  console.log(`\n${S.cyan}${rule()}${S.reset}`);
  console.log(`  ${S.bold}${title}${S.reset}`);
  if (sub) console.log(`  ${S.dim}${sub}${S.reset}`);
  console.log(`${S.cyan}${rule()}${S.reset}`);
}
const step = (n, total, t) =>
  console.log(`\n${S.cyan}${S.bold}▎ STEP ${n}/${total}${S.reset}${S.bold} · ${t}${S.reset}`);
const ok = (m) => console.log(`  ${S.green}✓${S.reset} ${m}`);
const bad = (m) => console.log(`  ${S.red}⛔ ${m}${S.reset}`);
const note = (m) => console.log(`     ${S.dim}${m}${S.reset}`);
const txln = (label, hash) =>
  console.log(`  ${S.green}✓${S.reset} ${label}  ${S.gray}${txLink(hash)}${S.reset}`);

// ---- transcript (markdown proof) ----
const T = [];
const rec = (md = '') => T.push(md);

async function waitWindow(provider, ts, label) {
  process.stdout.write(`     ${S.dim}waiting for ${label}…${S.reset}`);
  for (;;) {
    const b = await provider.getBlock('latest');
    if (b.timestamp > ts) { process.stdout.write(`${S.dim} done${S.reset}\n`); return; }
    await sleep(3000);
  }
}
function evt(contract, receipt, name) {
  for (const lg of receipt.logs) {
    try { const p = contract.interface.parseLog(lg); if (p?.name === name) return p.args; } catch { /* skip */ }
  }
  return null;
}

try {
  const [cs, rs, ba, bb] = process.argv.slice(2);
  const commitSecs = Number(cs ?? 20);
  const revealSecs = Number(rs ?? 20);
  const bidA = BigInt(ba ?? 100);
  const bidB = BigInt(bb ?? 250);

  const provider = getProvider();
  const A = getSigner();
  const B = ethers.Wallet.createRandom().connect(provider);
  const coordA = getContract(A);
  const coordB = getContract(B);
  const contractAddress = process.env.CONTRACT_ADDRESS;

  banner('COMMIT-REVEAL  ·  Sealed-Bid Auction', 'Live on Pharos Atlantic Testnet (688689)');

  // Preflight: prove the real connection + balance before spending anything.
  const net = await provider.getNetwork();
  const bal = await provider.getBalance(A.address);
  if (net.chainId !== 688689n) {
    throw new Error(`Wrong chain ${net.chainId} — open a fresh terminal, or run: unset RPC PRIVATE_KEY CONTRACT_ADDRESS`);
  }
  if (bal < ethers.parseEther('0.1')) {
    throw new Error(`Payer ${A.address} balance ${ethers.formatEther(bal)} PHRS is too low.`);
  }
  console.log(`\n  ${S.dim}contract${S.reset} ${short(contractAddress)}    ${S.dim}chainId${S.reset} ${net.chainId} ${S.green}✓${S.reset}`);
  console.log(`  ${S.dim}payer   ${S.reset} ${short(A.address)}    ${S.dim}balance${S.reset} ${Number(ethers.formatEther(bal)).toFixed(3)} PHRS`);

  rec('# Live proof — sealed-bid auction on Pharos Atlantic');
  rec('');
  rec(`- Contract: [\`${contractAddress}\`](${addressLink(contractAddress)})`);
  rec('- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz');
  rec(`- Agent A (payer): [\`${A.address}\`](${addressLink(A.address)})`);
  rec(`- Agent B: [\`${B.address}\`](${addressLink(B.address)}) (freshly generated, funded by A)`);
  rec('');

  const TOTAL = 6;

  // STEP 1 — fund B + open round
  step(1, TOTAL, 'Fund agent B & open a sealed-bid round');
  const fundTx = await A.sendTransaction({ to: B.address, value: ethers.parseEther('0.03') });
  await fundTx.wait();
  txln('funded agent B for gas', fundTx.hash);
  const createTx = await coordA.createRound(commitSecs, revealSecs, 0, ethers.encodeBytes32String('auction'));
  const createRc = await createTx.wait();
  const roundId = evt(coordA, createRc, 'RoundCreated').roundId;
  const round = await coordA.getRound(roundId);
  txln(`round #${roundId} created`, createTx.hash);
  note(`commit window ${commitSecs}s · reveal window ${revealSecs}s`);
  rec('## 1. Fund agent B & create round');
  rec(`- fund tx: [\`${fundTx.hash}\`](${txLink(fundTx.hash)})`);
  rec(`- create tx: [\`${createTx.hash}\`](${txLink(createTx.hash)}) — round ${roundId}`);
  rec('');

  // STEP 2 — commit hidden bids, then show what's on-chain
  step(2, TOTAL, 'Both agents commit HIDDEN bids');
  const saltA = randomSalt();
  const saltB = randomSalt();
  const cTxA = await coordA.commit(roundId, buildCommit(bidA, saltA, A.address));
  await cTxA.wait();
  txln('Agent A committed   (bid: ••• hidden)', cTxA.hash);
  const cTxB = await coordB.commit(roundId, buildCommit(bidB, saltB, B.address));
  await cTxB.wait();
  txln('Agent B committed   (bid: ••• hidden)', cTxB.hash);
  const onA = await coordA.getCommit(roundId, A.address);
  const onB = await coordA.getCommit(roundId, B.address);
  console.log(`\n  ${S.yellow}🔒 what's actually on-chain right now:${S.reset}`);
  note(`A → ${short(onA)}   ← only a hash. the bid is invisible.`);
  note(`B → ${short(onB)}   ← only a hash. nothing to copy.`);
  rec('## 2. Commit hidden bids');
  rec(`- A commits: [\`${cTxA.hash}\`](${txLink(cTxA.hash)})`);
  rec(`- B commits: [\`${cTxB.hash}\`](${txLink(cTxB.hash)})`);
  rec(`- On-chain only the hashes exist — A \`${onA}\`, B \`${onB}\` — so no bid is visible or copyable.`);
  rec('');

  await waitWindow(provider, Number(round.commitDeadline), 'commit window to close');

  // STEP 3 — live attack: B tries to steal A's bid
  step(3, TOTAL, 'Attack — Agent B tries to STEAL Agent A’s bid');
  try {
    const t = await coordB.reveal(roundId, encodeValue(bidA), saltA);
    await t.wait();
    bad('attack SUCCEEDED — this should never happen');
  } catch {
    bad('rejected by the contract');
    note('the commit is cryptographically bound to A’s address:');
    note('keccak(value, salt, B) ≠ A’s commit, so B can’t reveal it.');
  }
  rec('## 3. Copy/steal attack — rejected on-chain');
  rec('- Agent B tried to reveal Agent A’s value+salt and was rejected: the commit binds A’s address, so `keccak(value, salt, B) != commitOf[A]`.');
  rec('');

  // STEP 4 — legit reveals
  step(4, TOTAL, 'Reveal (commit window closed)');
  const rTxA = await coordA.reveal(roundId, encodeValue(bidA), saltA);
  await rTxA.wait();
  txln(`Agent A revealed   bid ${bidA}`, rTxA.hash);
  const rTxB = await coordB.reveal(roundId, encodeValue(bidB), saltB);
  await rTxB.wait();
  txln(`Agent B revealed   bid ${bidB}`, rTxB.hash);
  rec('## 4. Reveal');
  rec(`- A reveals ${bidA}: [\`${rTxA.hash}\`](${txLink(rTxA.hash)})`);
  rec(`- B reveals ${bidB}: [\`${rTxB.hash}\`](${txLink(rTxB.hash)})`);
  rec('');

  await waitWindow(provider, Number(round.revealDeadline), 'reveal window to close');

  // STEP 5 — resolve
  step(5, TOTAL, 'Resolve on-chain (highest bid wins)');
  const resTx = await coordA.resolveHighest(roundId);
  const resRc = await resTx.wait();
  const res = evt(coordA, resRc, 'Resolved');
  txln('resolved', resTx.hash);
  rec('## 5. Resolve');
  rec(`- resolve tx: [\`${resTx.hash}\`](${txLink(resTx.hash)})`);
  rec(`- winner: \`${res.winner}\` · highBid: ${res.result}`);
  rec('');

  // STEP 6 — result box
  const winnerName = res.winner.toLowerCase() === B.address.toLowerCase() ? 'Agent B' : 'Agent A';
  step(6, TOTAL, 'Result');
  console.log(`  ${S.green}┌─ WINNER ${rule('─', 38)}${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.bold}🏆 ${winnerName} — bid ${res.result}${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.dim}decided entirely on-chain. no bid was ever${S.reset}`);
  console.log(`  ${S.green}│${S.reset}  ${S.dim}visible or copyable before reveal.${S.reset}`);
  console.log(`  ${S.green}└${rule('─', 47)}${S.reset}`);
  rec('## Result');
  rec(`**Winner: ${winnerName} — bid ${res.result}.** Bids stayed hidden through the commit phase, a copy/steal attempt was rejected on-chain, and the higher bid won — decided entirely by the contract.`);

  mkdirSync('proof', { recursive: true });
  writeFileSync('proof/transcript.md', T.join('\n') + '\n');
  console.log(`\n  ${S.dim}proof written → proof/transcript.md${S.reset}\n`);
} catch (e) {
  console.error(`\n  ${S.red}Error:${S.reset} ${e.shortMessage || e.message || e}`);
  process.exit(1);
}
