# Commit-Reveal Coordination — Operation Instructions

> **Contract:** `0x0d609dA43455afFCaB082393233AC10f61e875DF` (`CommitRevealCoordinator`, verified on Pharos Scan)
> **Network:** Pharos Atlantic Testnet · chain-id `688689`
> **RPC:** `export RPC=https://api.zan.top/node/v1/pharos/atlantic/<YOUR_KEY>` (free key at zan.top → Node Service). The bare `dplabs` URL presents a `*.zan.top` cert and is rejected by `cast`/`forge`.
> **Private key:** pass explicitly via `--private-key $PRIVATE_KEY`. Add `--legacy` on every write — Atlantic requires legacy (type-0) gas.

Every operation below is a `cast`/`forge` command. Sections follow: Overview → Command Template → Parameters → Output Parsing → Error Handling → Agent Guidelines.

---

## Open a round

### Overview
Open a commit-reveal round (sealed-bid auction, blind vote, or private prediction) with a commit window and a reveal window.

### Command Template
```bash
# roundType: 0 = SEALED_BID, 1 = BLIND_VOTE, 2 = PRIVATE_PREDICTION
# The new roundId is the value of nextRoundId() immediately BEFORE this call (ids start at 0).
cast call  0x0d609dA43455afFCaB082393233AC10f61e875DF "nextRoundId()(uint256)" --rpc-url $RPC   # = your new roundId
cast send  0x0d609dA43455afFCaB082393233AC10f61e875DF \
  "createRound(uint256,uint256,uint8,bytes32)" \
  120 120 0 $(cast format-bytes32-string "auction-1") \
  --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| commitDuration | uint256 | Yes | Seconds the commit window stays open (must be > 0) |
| revealDuration | uint256 | Yes | Seconds the reveal window stays open after commit closes (must be > 0) |
| roundType | uint8 | Yes | 0 SEALED_BID · 1 BLIND_VOTE · 2 PRIVATE_PREDICTION |
| metadata | bytes32 | Yes | Free-form tag; `cast format-bytes32-string "<tag>"` (use `0x0` for none) |

### Output Parsing
| Field | Description |
|---|---|
| roundId | The value `nextRoundId()` returned *before* the send; also in the `RoundCreated` event |
| txhash | `cast receipt <txhash> --rpc-url $RPC` shows the `RoundCreated` log |

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `ZeroDuration()` | commit or reveal duration is 0 | Pass durations > 0 |
| `DeadlineOverflow()` | duration absurdly large | Use a sane duration (seconds) |

> **Agent Guidelines**: 1) read `nextRoundId()` first and record it as the roundId. 2) Run the write with `--legacy`. 3) Report the roundId + explorer link.

---

## Commit a hidden value

### Overview
Submit a sealed commitment. The hash binds **your address** — no other agent can copy or reveal it.

### Command Template
```bash
# 1) encode value, make a random salt, compute the sender-bound hash
VALUE=$(cast abi-encode "f(uint256)" 250)          # ABI-encoded uint256 bid/vote
SALT=0x$(openssl rand -hex 32)                      # 32 random bytes — SAVE THIS until reveal
ADDR=$(cast wallet address --private-key $PRIVATE_KEY)
HASH=$(cast keccak $(cast concat-hex $VALUE $SALT $ADDR))
# 2) submit the commitment
cast send 0x0d609dA43455afFCaB082393233AC10f61e875DF "commit(uint256,bytes32)" \
  <roundId> $HASH --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
# SAVE $VALUE and $SALT — reveal needs the exact same bytes.
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| roundId | uint256 | Yes | The round to commit to |
| commitHash | bytes32 | Yes | `keccak256(abi.encodePacked(value, salt, yourAddress))` (computed above) |

### Output Parsing
| Field | Description |
|---|---|
| Committed event | Confirms the commitment was stored |

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `CommitWindowClosed()` | past the commit deadline | Commit earlier / open a new round |
| `AlreadyCommitted()` | one commit per agent per round | Use a different wallet or round |
| `EmptyCommitHash()` | hash is `0x0` | Recompute the hash |
| `RoundDoesNotExist()` | roundId ≥ nextRoundId | Check the roundId |

> **Agent Guidelines**: 1) NEVER drop `msg.sender` from the hash — it is the security property. 2) Persist `$VALUE` and `$SALT`; without them the value can never be revealed. 3) Use `--legacy`.

---

## Reveal

### Overview
Disclose the committed value during the reveal window. The contract rejects any reveal whose `keccak256(abi.encodePacked(value, salt, msg.sender))` doesn't match the stored commit.

### Command Template
```bash
# use the SAME $VALUE and $SALT from the commit step
cast send 0x0d609dA43455afFCaB082393233AC10f61e875DF "reveal(uint256,bytes,bytes32)" \
  <roundId> $VALUE $SALT --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
```

### Parameters
| Parameter | Type | Required | Description |
|---|---|---|---|
| roundId | uint256 | Yes | The round |
| value | bytes | Yes | `abi.encode(uint256)` of the committed value (the `$VALUE` from commit) |
| salt | bytes32 | Yes | The secret salt from commit |

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `NotInRevealWindow()` | before commit closes or after reveal closes | Reveal inside the window |
| `CommitMismatch()` | value/salt/sender don't match the commit | Use the exact saved value + salt, from the committing wallet |
| `NothingCommitted()` | this wallet never committed | Commit first |
| `AlreadyRevealed()` | already revealed | — |

> **Agent Guidelines**: 1) Reveal only after the commit window closes. 2) Must be the same wallet that committed.

---

## Resolve highest bid (SEALED_BID)

### Overview
On-chain convenience resolver: picks the highest revealed `uint256` bid. Callable once, after the reveal window closes.

### Command Template
```bash
cast send 0x0d609dA43455afFCaB082393233AC10f61e875DF "resolveHighest(uint256)" \
  <roundId> --private-key $PRIVATE_KEY --rpc-url $RPC --legacy
cast receipt <txhash> --rpc-url $RPC      # winner + highBid are in the Resolved event
```

### Error Handling
| Error | Cause | Fix |
|---|---|---|
| `RevealWindowNotOver()` | reveal window still open | Wait until it closes |
| `AlreadyResolved()` | already resolved | Read the stored result via getRound |

> **Agent Guidelines**: For BLIND_VOTE / PRIVATE_PREDICTION, do NOT call this — read reveals via the views and tally off-chain.

---

## Views (free — no gas)

### Command Template
```bash
cast call 0x0d609dA43455afFCaB082393233AC10f61e875DF \
  "getRound(uint256)((address,uint64,uint64,uint8,bool,uint256,bytes32))" <roundId> --rpc-url $RPC
cast call 0x0d609dA43455afFCaB082393233AC10f61e875DF "getCommit(uint256,address)(bytes32)" <roundId> <agent> --rpc-url $RPC
cast call 0x0d609dA43455afFCaB082393233AC10f61e875DF "getReveal(uint256,address)(bytes,bool)" <roundId> <agent> --rpc-url $RPC
cast call 0x0d609dA43455afFCaB082393233AC10f61e875DF "participants(uint256)(address[])" <roundId> --rpc-url $RPC
```
