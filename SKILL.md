---
name: commit-reveal-coordination
description: Sealed commit-reveal coordination for on-chain agents on Pharos. Use this skill whenever an agent must submit a hidden value now and reveal it later — sealed-bid auctions, blind voting, private predictions, or MEV-resistant ordering between agents. Trigger on "sealed bid", "blind vote", "private prediction", "commit-reveal", "hidden commitment", "front-run resistant", "sealed auction", or any multi-agent coordination where revealing a choice early would let others copy or front-run it.
---

# Commit-Reveal Coordination (Pharos)

A sealed-coordination primitive for on-chain agents. An agent submits a **hidden
commitment** now and **reveals** the value later; the on-chain contract enforces
that the reveal matches the commit. Because the commitment binds the sender's
address, no other agent can copy it or front-run the choice. This is the
coordination layer that sealed-bid auctions, blind votes, and private predictions
are built on.

This skill is a **coordination layer other agents call** — not an execution skill.
It does not move funds, swap, or deploy tokens; the `pharos-skill-engine` owns that.

## When to use

- Sealed-bid auctions between agents (highest hidden bid wins).
- Blind voting (votes stay hidden until everyone has committed).
- Private predictions / commit-then-prove games.
- MEV-resistant ordering — any time revealing a choice early lets others copy or
  front-run it.

## When NOT to use

- Plain transfers, swaps, balance checks, ERC-20, batch sends, contract deploys —
  use `pharos-skill-engine`.
- Coordination where everything is already public and front-running is a non-issue.

## Capability Index

Pharos Skill Engine format — map a user intent to its on-chain operation. Full `cast`/`forge` command templates (parameters, output parsing, error handling) are in [`references/commit-reveal.md`](references/commit-reveal.md).

| User Need | Capability | Detailed Instructions |
|---|---|---|
| Open a sealed-bid auction / blind vote / private prediction round | `cast send createRound()` | → [references/commit-reveal.md](references/commit-reveal.md#open-a-round) |
| Commit a hidden bid / vote / prediction | `cast send commit()` (sender-bound hash) | → [references/commit-reveal.md](references/commit-reveal.md#commit-a-hidden-value) |
| Reveal my committed value | `cast send reveal()` | → [references/commit-reveal.md](references/commit-reveal.md#reveal) |
| Pick the highest sealed bid on-chain | `cast send resolveHighest()` | → [references/commit-reveal.md](references/commit-reveal.md#resolve-highest-bid-sealed_bid) |
| Inspect a round / commits / reveals | `cast call` views | → [references/commit-reveal.md](references/commit-reveal.md#views-free--no-gas) |

> Same verified contract (`0x0d609dA43455afFCaB082393233AC10f61e875DF`), two interfaces: drive it with `cast`/`forge` (above, Pharos Skill Engine style) **or** the ethers `scripts/` (below).

## How it works

1. **Create a round** with a commit window and a reveal window.
2. During the commit window, each agent submits `commitHash` — a hash of their
   secret value, a random salt, and their own address.
3. After the commit window closes, agents **reveal** their `value + salt`. The
   contract recomputes the hash and rejects any reveal that doesn't match.
4. After the reveal window closes, resolve: for sealed bids the contract picks the
   highest revealed bid on-chain (`resolveHighest`); for votes/predictions, read
   the reveals via views and tally however you like.

### The commit hash (the critical detail)

```
commitHash = keccak256(abi.encodePacked(value, salt, agentAddress))
```

- `value` — the committed bytes, `abi.encode(uint256)` for a numeric bid/vote.
- `salt` — 32 random bytes kept secret until reveal.
- `agentAddress` — the committing wallet. **Binding it is what stops one agent
  copying another's commit or replaying it.** The helper `buildCommit()` in
  `scripts/lib.js` computes this identically to the contract — always use it.

## Prerequisites

- **Node 18+**, then from the skill directory: `npm install` (pulls `ethers` v6 + `dotenv`).
- A `.env` file (copy `.env.example`) with:
  - `RPC` — a Pharos Testnet RPC URL. **Use a ZAN keyed endpoint**
    `https://api.zan.top/node/v1/pharos/atlantic/<KEY>` (free key at https://zan.top
    → Node Service). The bare `https://testnet.dplabs-internal.com` presents a
    `*.zan.top` cert and is rejected by `ethers`/`forge`/`cast`. See `references/network.md`.
  - `PRIVATE_KEY` — the agent wallet key (testnet only; never commit it).
  - `CONTRACT_ADDRESS` — the deployed coordinator (see below).
- A funded wallet — claim PHRS at https://testnet.pharosnetwork.xyz (requires
  binding an X account once). Deploys and txs cost gas.

## Deployed contract (Pharos Atlantic Testnet)

- **Address:** `0x0d609dA43455afFCaB082393233AC10f61e875DF`
- **Explorer:** https://atlantic.pharosscan.xyz/address/0x0d609dA43455afFCaB082393233AC10f61e875DF
- **Chain ID:** 688689 · **Token:** PHRS

Set `CONTRACT_ADDRESS=0x0d609dA43455afFCaB082393233AC10f61e875DF` in `.env` to use the shared deployment,
or deploy your own from `contracts/`.

## Agent workflow

All commands run from the skill directory with `.env` present.

```bash
# 1. Create a round.  args: commitDuration(s) revealDuration(s) roundType(0|1|2) [metadata]
#    roundType: 0 = SEALED_BID, 1 = BLIND_VOTE, 2 = PRIVATE_PREDICTION
node scripts/createRound.js 120 120 0 auction-7      # prints roundId

# 2. Commit a hidden value (saves the salt to .commits.json for you).
node scripts/commit.js <roundId> 250

# 3. Wait for the commit window to close, then reveal.
node scripts/reveal.js <roundId>

# 4. Inspect a round any time (struct, participants, reveal status).
node scripts/query.js <roundId>

# 5. For SEALED_BID, after the reveal window closes, resolve on-chain.
node scripts/resolveHighest.js <roundId>
```

`commit.js` saves `{roundId, value, salt}` to a local, gitignored `.commits.json`
keyed by `wallet:roundId`, so `reveal.js` can reconstruct the exact preimage. If
you commit on one machine, reveal on the same machine (or carry the salt yourself).

## Worked example — a sealed-bid auction

Two agents bid; the higher hidden bid wins, decided entirely on-chain.

```bash
# Creator opens a 2-min commit / 2-min reveal sealed-bid round.
node scripts/createRound.js 120 120 0 art-auction
# -> roundId = 0

# Agent A (PRIVATE_KEY=A) commits 100; Agent B (PRIVATE_KEY=B) commits 250.
node scripts/commit.js 0 100      # as A
node scripts/commit.js 0 250      # as B

# After the commit window closes, both reveal.
node scripts/reveal.js 0          # as A
node scripts/reveal.js 0          # as B

# After the reveal window closes, anyone resolves it.
node scripts/resolveHighest.js 0
# -> winner = B,  highBid = 250
```

If B had instead copied A's commit hash verbatim, B could never reveal it — the
hash binds A's address, so `keccak(value, salt, B) != commitHash`. That property
is covered by `test_CommitCopyAttack_Fails` in the contract test suite.

## Round-type semantics

- **SEALED_BID (0)** — values are `uint256` bids; `resolveHighest` finalizes the
  winner on-chain.
- **BLIND_VOTE (1)** — values are vote options; the contract stores reveals, the
  calling agent tallies them via `getReveal` / `participants`.
- **PRIVATE_PREDICTION (2)** — values are predictions; reveals are stored for the
  caller to score against an outcome.

## References

- `references/network.md` — Pharos Atlantic Testnet params, RPC guidance, deployed address.
- `references/contract.md` — every function, its args, what it reverts on, events.
- `references/abi.json` — the contract ABI used by the scripts.
