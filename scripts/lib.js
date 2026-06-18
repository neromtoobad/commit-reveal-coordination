// Shared helpers for the Pharos commit-reveal agent scripts.
// Loads env, wires up an ethers v6 provider/signer/contract, and—critically—
// builds the commit hash the SAME way the contract does:
//   keccak256(abi.encodePacked(value, salt, msg.sender))  with value = abi.encode(uint256)
import { config } from 'dotenv';
config({ override: true }); // project .env wins over any shell-injected vars (e.g. a global RPC)
import { readFileSync } from 'node:fs';
import { ethers } from 'ethers';

const abi = JSON.parse(readFileSync(new URL('../references/abi.json', import.meta.url)));

/** Throw a clear message if a required env var is missing. */
function requireEnv(name) {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in ` +
      `(RPC, PRIVATE_KEY, CONTRACT_ADDRESS).`
    );
  }
  return v;
}

/** JSON-RPC provider pointed at the Pharos testnet RPC.
 *  Forces legacy (type-0) gas: Pharos Atlantic's EIP-1559 maxFeePerGas can come
 *  back below the base fee, making type-2 txs fail intermittently ("insufficient
 *  funds"). The legacy gasPrice is reliable — the same one forge/cast use with --legacy. */
export function getProvider() {
  const provider = new ethers.JsonRpcProvider(requireEnv('RPC'));
  const baseGetFeeData = provider.getFeeData.bind(provider);
  provider.getFeeData = async () => {
    const fd = await baseGetFeeData();
    return new ethers.FeeData(fd.gasPrice, null, null); // gasPrice only -> legacy tx
  };
  return provider;
}

/** Wallet signer for the agent, connected to the provider. */
export function getSigner() {
  return new ethers.Wallet(requireEnv('PRIVATE_KEY'), getProvider());
}

/** CommitRevealCoordinator contract bound to a signer (writes) or provider (reads). */
export function getContract(signerOrProvider) {
  const runner = signerOrProvider ?? getProvider();
  return new ethers.Contract(requireEnv('CONTRACT_ADDRESS'), abi, runner);
}

/**
 * Build the commit hash that binds the committing agent.
 * MUST match the contract: keccak256(abi.encodePacked(value, salt, agent)),
 * where the committed bytes are abi.encode(uint256 value).
 */
export function buildCommit(valueUint, saltHex, agentAddress) {
  const encodedValue = ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [valueUint]);
  return ethers.solidityPackedKeccak256(
    ['bytes', 'bytes32', 'address'],
    [encodedValue, saltHex, agentAddress]
  );
}

/** abi.encode(uint256) of a value — the exact bytes passed to reveal(). */
export function encodeValue(valueUint) {
  return ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [valueUint]);
}

/** 32 random bytes as a 0x-hex salt; keep this secret until reveal. */
export function randomSalt() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/** Pharos Atlantic Testnet (chainId 688689) explorer base. */
export const EXPLORER = 'https://atlantic.pharosscan.xyz';

/** Explorer transaction link. */
export function txLink(hash) {
  return `${EXPLORER}/tx/${hash}`;
}

/** Explorer address link. */
export function addressLink(addr) {
  return `${EXPLORER}/address/${addr}`;
}
