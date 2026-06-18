# Live proof — sealed-bid auction on Pharos Atlantic

- Contract: [`0x0d609dA43455afFCaB082393233AC10f61e875DF`](https://atlantic.pharosscan.xyz/address/0x0d609dA43455afFCaB082393233AC10f61e875DF)
- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz
- Agent A (payer): [`0x7137684FEA3e46b280307C2fDB59d095Af09a7fc`](https://atlantic.pharosscan.xyz/address/0x7137684FEA3e46b280307C2fDB59d095Af09a7fc)
- Agent B: [`0xE35D97b32E71b958E69750d17619532E560fda29`](https://atlantic.pharosscan.xyz/address/0xE35D97b32E71b958E69750d17619532E560fda29) (freshly generated, funded by A)

## 1. Fund agent B & create round
- fund tx: [`0x544e2cd51966f33c5744688588bfa799d01a9e247d20640a23c6e275fb59a634`](https://atlantic.pharosscan.xyz/tx/0x544e2cd51966f33c5744688588bfa799d01a9e247d20640a23c6e275fb59a634)
- create tx: [`0xb7333e42502656d6867d615eece62153907ef376a95668806b24f03a2f0f23fe`](https://atlantic.pharosscan.xyz/tx/0xb7333e42502656d6867d615eece62153907ef376a95668806b24f03a2f0f23fe) — round 3

## 2. Commit hidden bids
- A commits: [`0xa4807b178ccfb1067e6329ff7db9f15b6482438140de6a96b707342284ffaf83`](https://atlantic.pharosscan.xyz/tx/0xa4807b178ccfb1067e6329ff7db9f15b6482438140de6a96b707342284ffaf83)
- B commits: [`0x97708bd020de013b6a98412c3ccde7fc0797fb33b65b91fb5458bc5a27e30bfd`](https://atlantic.pharosscan.xyz/tx/0x97708bd020de013b6a98412c3ccde7fc0797fb33b65b91fb5458bc5a27e30bfd)
- On-chain only the hashes exist — A `0x00d06404c000411f1d4e05f3fcae3b7c4250b62418405c7aef6f14e739d14f20`, B `0xe0e28c810043e6efe5af8118c934fa3ec6b871152208272ac8f870e6a91df2f5` — so no bid is visible or copyable.

## 3. Copy/steal attack — rejected on-chain
- Agent B tried to reveal Agent A’s value+salt and was rejected: the commit binds A’s address, so `keccak(value, salt, B) != commitOf[A]`.

## 4. Reveal
- A reveals 100: [`0xbd637c27b1d830b2046febe3867e4604a9a5efa0a57e49b76074e806307ae4ef`](https://atlantic.pharosscan.xyz/tx/0xbd637c27b1d830b2046febe3867e4604a9a5efa0a57e49b76074e806307ae4ef)
- B reveals 250: [`0xc7707d8ccbc7f6da99511193e070e4101a6efc86cf5cb82b646ee96a2576ec5f`](https://atlantic.pharosscan.xyz/tx/0xc7707d8ccbc7f6da99511193e070e4101a6efc86cf5cb82b646ee96a2576ec5f)

## 5. Resolve
- resolve tx: [`0xf55880a177e45be065ef5be033af2f29aafede7a361981220b12e8ce4dd8ec31`](https://atlantic.pharosscan.xyz/tx/0xf55880a177e45be065ef5be033af2f29aafede7a361981220b12e8ce4dd8ec31)
- winner: `0xE35D97b32E71b958E69750d17619532E560fda29` · highBid: 250

## Result
**Winner: Agent B — bid 250.** Bids stayed hidden through the commit phase, a copy/steal attempt was rejected on-chain, and the higher bid won — decided entirely by the contract.
