// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {CommitRevealCoordinator} from "../src/CommitRevealCoordinator.sol";

contract CommitRevealCoordinatorTest is Test {
    CommitRevealCoordinator internal coord;

    address internal agentA = address(0xA11CE);
    address internal agentB = address(0xB0B);

    uint256 internal constant COMMIT_DURATION = 100;
    uint256 internal constant REVEAL_DURATION = 100;

    function setUp() public {
        coord = new CommitRevealCoordinator();
    }

    // --- helpers ---------------------------------------------------------------

    /// @dev Mirrors the contract's hash recipe exactly:
    ///      keccak256(abi.encodePacked(value, salt, agent)) with value = abi.encode(uint256).
    function _hash(uint256 value, bytes32 salt, address agent) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(abi.encode(value), salt, agent));
    }

    function _createRound() internal returns (uint256) {
        return coord.createRound(
            COMMIT_DURATION,
            REVEAL_DURATION,
            CommitRevealCoordinator.RoundType.SEALED_BID,
            bytes32("round")
        );
    }

    function _commitBid(uint256 roundId, address agent, uint256 bid, bytes32 salt) internal {
        vm.prank(agent);
        coord.commit(roundId, _hash(bid, salt, agent));
    }

    // --- happy path ------------------------------------------------------------

    function test_HappyPath_SealedBid() public {
        uint256 roundId = _createRound();

        bytes32 saltA = keccak256("saltA");
        bytes32 saltB = keccak256("saltB");
        uint256 bidA = 100;
        uint256 bidB = 250;

        _commitBid(roundId, agentA, bidA, saltA);
        _commitBid(roundId, agentB, bidB, saltB);

        CommitRevealCoordinator.Round memory r = coord.getRound(roundId);
        assertEq(r.participantCount, 2);

        // Into the reveal window.
        vm.warp(r.commitDeadline + 1);
        vm.prank(agentA);
        coord.reveal(roundId, abi.encode(bidA), saltA);
        vm.prank(agentB);
        coord.reveal(roundId, abi.encode(bidB), saltB);

        // Past the reveal window.
        vm.warp(r.revealDeadline + 1);
        (address winner, uint256 highBid) = coord.resolveHighest(roundId);
        assertEq(winner, agentB);
        assertEq(highBid, bidB);

        assertTrue(coord.getRound(roundId).resolved);
    }

    // --- reveal integrity ------------------------------------------------------

    function test_RevertWhen_WrongSalt() public {
        uint256 roundId = _createRound();
        bytes32 salt = keccak256("real-salt");
        _commitBid(roundId, agentA, 100, salt);

        vm.warp(coord.getRound(roundId).commitDeadline + 1);
        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.CommitMismatch.selector);
        coord.reveal(roundId, abi.encode(uint256(100)), keccak256("wrong-salt"));
    }

    function test_RevertWhen_ValueDoesNotMatchCommit() public {
        uint256 roundId = _createRound();
        bytes32 salt = keccak256("salt");
        _commitBid(roundId, agentA, 100, salt);

        vm.warp(coord.getRound(roundId).commitDeadline + 1);
        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.CommitMismatch.selector);
        coord.reveal(roundId, abi.encode(uint256(999)), salt); // right salt, wrong value
    }

    // --- timing windows --------------------------------------------------------

    function test_RevertWhen_CommitAfterDeadline() public {
        uint256 roundId = _createRound();
        vm.warp(coord.getRound(roundId).commitDeadline + 1);

        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.CommitWindowClosed.selector);
        coord.commit(roundId, _hash(100, keccak256("s"), agentA));
    }

    function test_RevertWhen_RevealBeforeCommitWindowEnds() public {
        uint256 roundId = _createRound();
        bytes32 salt = keccak256("salt");
        _commitBid(roundId, agentA, 100, salt);

        // Still inside the commit window -> reveal not allowed yet.
        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.NotInRevealWindow.selector);
        coord.reveal(roundId, abi.encode(uint256(100)), salt);
    }

    function test_RevertWhen_RevealAfterDeadline() public {
        uint256 roundId = _createRound();
        bytes32 salt = keccak256("salt");
        _commitBid(roundId, agentA, 100, salt);

        vm.warp(coord.getRound(roundId).revealDeadline + 1);
        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.NotInRevealWindow.selector);
        coord.reveal(roundId, abi.encode(uint256(100)), salt);
    }

    // --- one-shot guarantees ---------------------------------------------------

    function test_RevertWhen_DoubleCommit() public {
        uint256 roundId = _createRound();
        _commitBid(roundId, agentA, 100, keccak256("s1"));

        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.AlreadyCommitted.selector);
        coord.commit(roundId, _hash(200, keccak256("s2"), agentA));
    }

    function test_RevertWhen_DoubleReveal() public {
        uint256 roundId = _createRound();
        bytes32 salt = keccak256("salt");
        _commitBid(roundId, agentA, 100, salt);

        vm.warp(coord.getRound(roundId).commitDeadline + 1);
        vm.prank(agentA);
        coord.reveal(roundId, abi.encode(uint256(100)), salt);

        vm.prank(agentA);
        vm.expectRevert(CommitRevealCoordinator.AlreadyRevealed.selector);
        coord.reveal(roundId, abi.encode(uint256(100)), salt);
    }

    function test_RevertWhen_ResolveBeforeRevealDeadline() public {
        uint256 roundId = _createRound();
        _commitBid(roundId, agentA, 100, keccak256("salt"));

        // Reveal window not over yet.
        vm.expectRevert(CommitRevealCoordinator.RevealWindowNotOver.selector);
        coord.resolveHighest(roundId);
    }

    // --- headline security test ------------------------------------------------

    /// @notice Agent B copies Agent A's exact commit hash, then cannot reveal it,
    ///         because the hash binds A's address. This is the property that stops
    ///         commit-copying and cross-agent replay.
    function test_CommitCopyAttack_Fails() public {
        uint256 roundId = _createRound();

        bytes32 salt = keccak256("A-secret-salt");
        uint256 bid = 500;
        bytes32 H = _hash(bid, salt, agentA);

        // A commits H.
        vm.prank(agentA);
        coord.commit(roundId, H);

        // B copies the SAME hash H.
        vm.prank(agentB);
        coord.commit(roundId, H);

        assertEq(coord.getCommit(roundId, agentA), H);
        assertEq(coord.getCommit(roundId, agentB), H);

        vm.warp(coord.getRound(roundId).commitDeadline + 1);

        // B tries to ride A's value+salt. keccak(value, salt, B) != H -> revert.
        vm.prank(agentB);
        vm.expectRevert(CommitRevealCoordinator.CommitMismatch.selector);
        coord.reveal(roundId, abi.encode(bid), salt);

        // A reveals correctly against the same data.
        vm.prank(agentA);
        coord.reveal(roundId, abi.encode(bid), salt);
        (bytes memory val, bool revealed) = coord.getReveal(roundId, agentA);
        assertTrue(revealed);
        assertEq(abi.decode(val, (uint256)), bid);
    }
}
