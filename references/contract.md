# Contract — CommitRevealCoordinator

Generic commit-reveal coordinator. One commit/reveal flow serves three round
types. Source: `contracts/src/CommitRevealCoordinator.sol`.

## The commit hash

```
commitHash = keccak256(abi.encodePacked(value, salt, msg.sender))
```

- `value` — committed bytes; for numeric rounds, `abi.encode(uint256)`.
- `salt` — 32 random bytes, secret until reveal.
- `msg.sender` — the committing wallet, bound into the hash so commits cannot be
  copied or replayed by another agent.

Build it with `scripts/lib.js` → `buildCommit(value, saltHex, agentAddress)`, which
matches the contract exactly. `randomSalt()` generates the salt.

## Types

```solidity
enum RoundType { SEALED_BID, BLIND_VOTE, PRIVATE_PREDICTION } // 0, 1, 2

struct Round {
    address   creator;
    uint64    commitDeadline;   // last timestamp commits are accepted
    uint64    revealDeadline;   // last timestamp reveals are accepted
    RoundType roundType;
    bool      resolved;
    uint256   participantCount;
    bytes32   metadata;         // free-form tag
}
```

## Functions

### `createRound(commitDuration, revealDuration, roundType, metadata) → roundId`
Opens a round. `commitDeadline = now + commitDuration`,
`revealDeadline = commitDeadline + revealDuration`.
- Reverts `ZeroDuration` if either duration is 0.
- Reverts `DeadlineOverflow` if the reveal deadline would exceed `uint64`.
- Emits `RoundCreated`.

### `commit(roundId, commitHash)`
Submit a sealed commitment (one per agent per round).
- Reverts `RoundDoesNotExist` if `roundId >= nextRoundId`.
- Reverts `CommitWindowClosed` if `now > commitDeadline`.
- Reverts `AlreadyCommitted` if the caller already committed this round.
- Reverts `EmptyCommitHash` if `commitHash == 0`.
- Emits `Committed`.

### `reveal(roundId, value, salt)`
Reveal the committed value during the reveal window.
- Reverts `RoundDoesNotExist` if `roundId >= nextRoundId`.
- Reverts `NotInRevealWindow` unless `commitDeadline < now <= revealDeadline`.
- Reverts `NothingCommitted` if the caller never committed.
- Reverts `AlreadyRevealed` on a second reveal.
- Reverts `CommitMismatch` if `keccak256(abi.encodePacked(value, salt, msg.sender))`
  does not equal the stored commit (wrong value, wrong salt, or a copied commit).
- Emits `Revealed`.

### `resolveHighest(roundId) → (winner, highBid)`
Built-in resolver for `SEALED_BID`: iterates revealed participants, decodes each
value as `uint256`, returns the highest. Callable once.
- Reverts `RoundDoesNotExist` if `roundId >= nextRoundId`.
- Reverts `RevealWindowNotOver` if `now <= revealDeadline`.
- Reverts `AlreadyResolved` if already resolved.
- Emits `Resolved(roundId, winner, highBid)`. (`winner = address(0)` if nobody revealed.)

For `BLIND_VOTE` / `PRIVATE_PREDICTION`, do not call `resolveHighest`; read reveals
via the views and tally off-chain in the calling agent.

## Views

| View | Returns |
|---|---|
| `getRound(roundId)` | the full `Round` struct |
| `getCommit(roundId, agent)` | the agent's commit hash (`0` if none) |
| `getReveal(roundId, agent)` | `(bytes value, bool revealed)` |
| `participants(roundId)` | ordered `address[]` of committers |
| `rounds(roundId)` | public mapping getter (round fields) |
| `commitOf(roundId, agent)` | public mapping getter (commit hash) |
| `hasRevealed(roundId, agent)` | public mapping getter (bool) |
| `nextRoundId()` | next id to be assigned / count of rounds |

## Events

```solidity
event RoundCreated(uint256 indexed roundId, address indexed creator, RoundType roundType, uint64 commitDeadline, uint64 revealDeadline);
event Committed(uint256 indexed roundId, address indexed agent);
event Revealed(uint256 indexed roundId, address indexed agent);
event Resolved(uint256 indexed roundId, address indexed winner, uint256 result);
```

## Security property

The commit binds `msg.sender`, so an agent that copies another's `commitHash`
cannot reveal it — `keccak(value, salt, copier) != commitHash`. Verified by
`test_CommitCopyAttack_Fails` in `contracts/test/CommitRevealCoordinator.t.sol`.
