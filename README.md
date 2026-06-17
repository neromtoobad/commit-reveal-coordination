# commit-reveal-coordination

**A sealed commit-reveal coordination skill for Pharos AI agents.** Submit a hidden
value now, reveal it later, and let an on-chain contract prove they match — the
coordination layer for sealed-bid auctions, blind votes, and private predictions
between agents.

- **Skill:** installable via `npx skills add <repo-url>` (loads in Claude Code / Codex / OpenClaw)
- **Contract:** [`0x0d609dA43455afFCaB082393233AC10f61e875DF`](https://atlantic.pharosscan.xyz/address/0x0d609dA43455afFCaB082393233AC10f61e875DF) on Pharos Atlantic Testnet (chainId `688689`)

## The problem

When agents bid, vote, or predict against each other, doing it in the open is
exploitable: anyone can read a pending choice and **copy it or front-run it**.
Commit-reveal fixes this — each agent first publishes only a *hash* of their value,
and only later reveals the value itself. The contract enforces that the reveal
matches the commit, and because the hash binds the committer's address, **no agent
can copy another's commitment**.

## What it is

An installable Pharos skill (`SKILL.md` + `references/` + `scripts/`) backed by a
Solidity contract, `CommitRevealCoordinator`. It is a **coordination primitive other
agents call** — not an execution skill. Balance/send/swap/deploy belong to
`pharos-skill-engine`; this is the sealed-coordination layer on top.

One flow serves three round types: `SEALED_BID`, `BLIND_VOTE`, `PRIVATE_PREDICTION`.
Sealed bids resolve fully on-chain via `resolveHighest`; votes and predictions store
reveals for the calling agent to tally.

### The commit hash (the one detail that matters)

```
commitHash = keccak256(abi.encodePacked(value, salt, msg.sender))
```

Binding `msg.sender` is what stops commit-copying and cross-agent replay. The JS
helper `buildCommit()` computes this identically to the contract (verified
byte-for-byte against `cast`).

## Install & use

```bash
npx skills add <repo-url>          # installs into ~/.claude/skills/
cd ~/.claude/skills/commit-reveal-coordination
npm install                        # ethers v6 + dotenv
cp .env.example .env               # then set RPC (ZAN key) + PRIVATE_KEY
```

`.env` needs:
- `RPC` — a ZAN Atlantic endpoint `https://api.zan.top/node/v1/pharos/atlantic/<KEY>` (free at [zan.top](https://zan.top))
- `PRIVATE_KEY` — your agent wallet (fund it at [testnet.pharosnetwork.xyz](https://testnet.pharosnetwork.xyz))
- `CONTRACT_ADDRESS` — `0x0d609dA43455afFCaB082393233AC10f61e875DF` (or deploy your own)

```bash
node scripts/createRound.js 120 120 0 my-auction   # commit 120s, reveal 120s, SEALED_BID
node scripts/commit.js <roundId> 250               # commit a hidden bid (salt saved locally)
node scripts/reveal.js <roundId>                   # after commit window closes
node scripts/resolveHighest.js <roundId>           # after reveal window closes
node scripts/query.js <roundId>                    # inspect at any point
```

Run the whole thing end-to-end (funds a second agent automatically):

```bash
node scripts/demo.js 45 45 100 250
```

## Live proof

A complete two-agent sealed-bid auction, run on Pharos Atlantic (full log:
[`proof/transcript.md`](proof/transcript.md)):

| Step | Transaction |
|---|---|
| Deploy | [`0x9eda…9b01`](https://atlantic.pharosscan.xyz/tx/0x9edab92bf2daeeee61eb415ad5a106ba7a724a90458f92956cb22fdc82c49b01) |
| Create round | [`0xc7ba…cc56`](https://atlantic.pharosscan.xyz/tx/0xc7bab887b969a8c1d0d1acd0493794b4ba9bcce0f5c314e072d6af4548fccc56) |
| A commits (hidden) | [`0xc7fe…0fad`](https://atlantic.pharosscan.xyz/tx/0xc7fefc564ed8d4c9a016f38026e97a8b5a1d36c9f720adaf8bcc413149e30fad) |
| B commits (hidden) | [`0x83cc…1471`](https://atlantic.pharosscan.xyz/tx/0x83cceb0f237605e2b98c21d11bae2886aff3c251e9a5b8cca351aed7ab581471) |
| A reveals 100 | [`0x46c9…b877`](https://atlantic.pharosscan.xyz/tx/0x46c9dac7aa6421d6cbe464d5dfb623efb4eea968c80707add49702aa8261b877) |
| B reveals 250 | [`0x927a…d3be`](https://atlantic.pharosscan.xyz/tx/0x927a173f05cee115dcbc30d611db43fd0330a71cb43beaf7a29843e1bda8d3be) |
| Resolve → **B wins, 250** | [`0x68c5…47f3`](https://atlantic.pharosscan.xyz/tx/0x68c5139257a40328a682034c22952789f878c3ee096f6a81b0478d20d1ff47f3) |

Through the commit phase both bids were just hashes on-chain — neither agent could
see or copy the other's bid — and the higher bid won, decided entirely by the contract.

## Security

The commit binds `msg.sender`, so an agent that copies another's `commitHash` can
never reveal it: `keccak(value, salt, copier) != commitHash`. This is proven by
`test_CommitCopyAttack_Fails`, part of a 10/10 green Foundry suite:

```
forge test -vvv     # 10 passed, incl. commit-copy attack, wrong-salt, window, and double-action reverts
```

## Repo layout

```
SKILL.md                 # agent-facing: when & how to use
references/              # network params, contract reference, ABI
scripts/                 # ethers v6 agent scripts (create/commit/reveal/query/resolve + demo)
contracts/               # Foundry project: contract, tests, deploy script (build/proof workspace)
proof/transcript.md      # live on-chain run
```

## Composability (Phase 2)

Commit-reveal is the coordination spine of an agent-commerce protocol. Compose it
with pay-per-call settlement and verifiable work attestation and you get a full
Agent Arena entry: agents that can privately bid, settle payments, and prove work —
all on Pharos.

## License

MIT
