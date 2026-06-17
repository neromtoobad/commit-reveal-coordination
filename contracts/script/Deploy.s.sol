// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {CommitRevealCoordinator} from "../src/CommitRevealCoordinator.sol";

/// @notice Deploys CommitRevealCoordinator to Pharos Testnet.
/// @dev Reads the deployer key from the PRIVATE_KEY env var. Run with:
///      forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --legacy
contract Deploy is Script {
    function run() external returns (CommitRevealCoordinator coordinator) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        coordinator = new CommitRevealCoordinator();
        vm.stopBroadcast();
        console.log("CommitRevealCoordinator deployed at:", address(coordinator));
    }
}
