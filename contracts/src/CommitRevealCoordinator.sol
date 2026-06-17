// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title CommitRevealCoordinator
/// @notice Sealed-coordination primitive for on-chain agents. An agent submits a
///         hidden value now (`commit`) and discloses it later (`reveal`); the
///         contract enforces that the revealed value matches the original commit.
///         Powers sealed-bid auctions, blind voting, and private predictions.
/// @dev    The commit hash binds the committer:
///         `keccak256(abi.encodePacked(value, salt, msg.sender))`.
///         Binding `msg.sender` is what stops one agent copying another's commit
///         or replaying it across rounds — do not remove it.
contract CommitRevealCoordinator {
    /// @notice Coordination flavours that share one commit/reveal flow.
    enum RoundType {
        SEALED_BID,
        BLIND_VOTE,
        PRIVATE_PREDICTION
    }

    /// @notice A single coordination round.
    /// @param creator          Address that opened the round.
    /// @param commitDeadline   Last timestamp at which commits are accepted.
    /// @param revealDeadline   Last timestamp at which reveals are accepted.
    /// @param roundType         Semantic flavour of the round.
    /// @param resolved          Whether a built-in resolver has finalised it.
    /// @param participantCount  Number of distinct agents that committed.
    /// @param metadata          Free-form tag (e.g. market id, topic hash).
    struct Round {
        address creator;
        uint64 commitDeadline;
        uint64 revealDeadline;
        RoundType roundType;
        bool resolved;
        uint256 participantCount;
        bytes32 metadata;
    }

    /// @notice Round data by id.
    mapping(uint256 => Round) public rounds;
    /// @notice Commit hash per agent per round (bytes32(0) means no commit).
    mapping(uint256 => mapping(address => bytes32)) public commitOf;
    /// @notice Revealed value bytes per agent per round.
    mapping(uint256 => mapping(address => bytes)) private revealOf;
    /// @notice Whether an agent has revealed in a round.
    mapping(uint256 => mapping(address => bool)) public hasRevealed;
    /// @notice Ordered list of committers per round, for iteration in resolvers/views.
    mapping(uint256 => address[]) private participantList;
    /// @notice Id assigned to the next round; also the count of rounds created.
    uint256 public nextRoundId;

    event RoundCreated(
        uint256 indexed roundId,
        address indexed creator,
        RoundType roundType,
        uint64 commitDeadline,
        uint64 revealDeadline
    );
    event Committed(uint256 indexed roundId, address indexed agent);
    event Revealed(uint256 indexed roundId, address indexed agent);
    event Resolved(uint256 indexed roundId, address indexed winner, uint256 result);

    error ZeroDuration();
    error DeadlineOverflow();
    error RoundDoesNotExist();
    error CommitWindowClosed();
    error AlreadyCommitted();
    error EmptyCommitHash();
    error NotInRevealWindow();
    error NothingCommitted();
    error AlreadyRevealed();
    error CommitMismatch();
    error RevealWindowNotOver();
    error AlreadyResolved();

    /// @notice Open a new coordination round.
    /// @param commitDuration Seconds the commit window stays open from now.
    /// @param revealDuration Seconds the reveal window stays open after commit closes.
    /// @param roundType      Semantic flavour of the round.
    /// @param metadata       Free-form tag stored with the round.
    /// @return roundId       The id of the newly created round.
    function createRound(
        uint256 commitDuration,
        uint256 revealDuration,
        RoundType roundType,
        bytes32 metadata
    ) external returns (uint256 roundId) {
        if (commitDuration == 0 || revealDuration == 0) revert ZeroDuration();

        // Compute in uint256, then bound to uint64 so the casts below cannot truncate.
        uint256 commitDeadline = block.timestamp + commitDuration;
        uint256 revealDeadline = commitDeadline + revealDuration;
        if (revealDeadline > type(uint64).max) revert DeadlineOverflow();

        roundId = nextRoundId++;
        rounds[roundId] = Round({
            creator: msg.sender,
            commitDeadline: uint64(commitDeadline),
            revealDeadline: uint64(revealDeadline),
            roundType: roundType,
            resolved: false,
            participantCount: 0,
            metadata: metadata
        });

        emit RoundCreated(roundId, msg.sender, roundType, uint64(commitDeadline), uint64(revealDeadline));
    }

    /// @notice Submit a sealed commitment for a round.
    /// @dev    `commitHash` must equal
    ///         `keccak256(abi.encodePacked(value, salt, msg.sender))`.
    ///         One commit per agent per round.
    /// @param roundId    Target round.
    /// @param commitHash The sealed commitment.
    function commit(uint256 roundId, bytes32 commitHash) external {
        if (roundId >= nextRoundId) revert RoundDoesNotExist();
        Round storage r = rounds[roundId];
        if (block.timestamp > r.commitDeadline) revert CommitWindowClosed();
        if (commitOf[roundId][msg.sender] != bytes32(0)) revert AlreadyCommitted();
        if (commitHash == bytes32(0)) revert EmptyCommitHash();

        commitOf[roundId][msg.sender] = commitHash;
        participantList[roundId].push(msg.sender);
        unchecked {
            r.participantCount += 1;
        }

        emit Committed(roundId, msg.sender);
    }

    /// @notice Reveal a previously committed value.
    /// @dev    Only valid after the commit window closes and before the reveal
    ///         window closes. Reverts unless
    ///         `keccak256(abi.encodePacked(value, salt, msg.sender))` matches the
    ///         stored commit — binding the caller's address.
    /// @param roundId Target round.
    /// @param value   The committed value bytes (e.g. abi.encode(uint256 bid)).
    /// @param salt    The 32-byte secret used when committing.
    function reveal(uint256 roundId, bytes calldata value, bytes32 salt) external {
        if (roundId >= nextRoundId) revert RoundDoesNotExist();
        Round storage r = rounds[roundId];
        if (block.timestamp <= r.commitDeadline || block.timestamp > r.revealDeadline) {
            revert NotInRevealWindow();
        }

        bytes32 expected = commitOf[roundId][msg.sender];
        if (expected == bytes32(0)) revert NothingCommitted();
        if (hasRevealed[roundId][msg.sender]) revert AlreadyRevealed();
        if (keccak256(abi.encodePacked(value, salt, msg.sender)) != expected) {
            revert CommitMismatch();
        }

        revealOf[roundId][msg.sender] = value;
        hasRevealed[roundId][msg.sender] = true;

        emit Revealed(roundId, msg.sender);
    }

    /// @notice Built-in resolver for SEALED_BID rounds: pick the highest revealed
    ///         uint256 bid. Other round types expose reveals via views and let the
    ///         calling agent apply its own tally.
    /// @dev    Callable once, only after the reveal window closes. Decodes each
    ///         revealed value as uint256.
    /// @param roundId Target round.
    /// @return winner  Agent with the highest revealed bid (address(0) if none).
    /// @return highBid The winning bid amount.
    function resolveHighest(uint256 roundId) external returns (address winner, uint256 highBid) {
        if (roundId >= nextRoundId) revert RoundDoesNotExist();
        Round storage r = rounds[roundId];
        if (block.timestamp <= r.revealDeadline) revert RevealWindowNotOver();
        if (r.resolved) revert AlreadyResolved();

        address[] storage plist = participantList[roundId];
        uint256 len = plist.length;
        for (uint256 i = 0; i < len; ) {
            address agent = plist[i];
            if (hasRevealed[roundId][agent]) {
                uint256 bid = abi.decode(revealOf[roundId][agent], (uint256));
                if (bid > highBid) {
                    highBid = bid;
                    winner = agent;
                }
            }
            unchecked {
                ++i;
            }
        }

        r.resolved = true;
        emit Resolved(roundId, winner, highBid);
    }

    /// @notice Return a full round struct.
    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    /// @notice Return an agent's commit hash for a round.
    function getCommit(uint256 roundId, address agent) external view returns (bytes32) {
        return commitOf[roundId][agent];
    }

    /// @notice Return an agent's revealed value and whether it has revealed.
    function getReveal(uint256 roundId, address agent)
        external
        view
        returns (bytes memory value, bool revealed)
    {
        return (revealOf[roundId][agent], hasRevealed[roundId][agent]);
    }

    /// @notice Return the ordered list of committers for a round.
    function participants(uint256 roundId) external view returns (address[] memory) {
        return participantList[roundId];
    }
}
