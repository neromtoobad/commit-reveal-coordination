# Live proof — sealed-bid auction on Pharos Atlantic

- Contract: [`0x0d609dA43455afFCaB082393233AC10f61e875DF`](https://atlantic.pharosscan.xyz/address/0x0d609dA43455afFCaB082393233AC10f61e875DF)
- Chain: Pharos Atlantic Testnet (688689) · Explorer: https://atlantic.pharosscan.xyz
- Run started: 2026-06-17T10:37:31.389Z
- Agent A: [`0x7137684FEA3e46b280307C2fDB59d095Af09a7fc`](https://atlantic.pharosscan.xyz/address/0x7137684FEA3e46b280307C2fDB59d095Af09a7fc)
- Agent B: [`0x536E642fa6C594F1A4fc8345Ae4260aeC662077E`](https://atlantic.pharosscan.xyz/address/0x536E642fa6C594F1A4fc8345Ae4260aeC662077E) (freshly generated, funded by A)

## 1. Fund agent B
- fund tx: [`0xc49ffc40741273a8af54c87b3d786b789d5e91d6c33ceab42dc95c44c693f4bc`](https://atlantic.pharosscan.xyz/tx/0xc49ffc40741273a8af54c87b3d786b789d5e91d6c33ceab42dc95c44c693f4bc)

## 2. Create round (SEALED_BID)
- create tx: [`0xc7bab887b969a8c1d0d1acd0493794b4ba9bcce0f5c314e072d6af4548fccc56`](https://atlantic.pharosscan.xyz/tx/0xc7bab887b969a8c1d0d1acd0493794b4ba9bcce0f5c314e072d6af4548fccc56)
- roundId: 0
- commit closes: 2026-06-17T10:38:30.000Z
- reveal closes: 2026-06-17T10:39:15.000Z

## 3. Commit hidden bids
- A commits (bid hidden): [`0xc7fefc564ed8d4c9a016f38026e97a8b5a1d36c9f720adaf8bcc413149e30fad`](https://atlantic.pharosscan.xyz/tx/0xc7fefc564ed8d4c9a016f38026e97a8b5a1d36c9f720adaf8bcc413149e30fad)
- B commits (bid hidden): [`0x83cceb0f237605e2b98c21d11bae2886aff3c251e9a5b8cca351aed7ab581471`](https://atlantic.pharosscan.xyz/tx/0x83cceb0f237605e2b98c21d11bae2886aff3c251e9a5b8cca351aed7ab581471)
- On-chain, both bids are just hashes right now — neither agent can see the other's bid.

## 4. Reveal (after the commit window closes)
- A reveals 100: [`0x46c9dac7aa6421d6cbe464d5dfb623efb4eea968c80707add49702aa8261b877`](https://atlantic.pharosscan.xyz/tx/0x46c9dac7aa6421d6cbe464d5dfb623efb4eea968c80707add49702aa8261b877)
- B reveals 250: [`0x927a173f05cee115dcbc30d611db43fd0330a71cb43beaf7a29843e1bda8d3be`](https://atlantic.pharosscan.xyz/tx/0x927a173f05cee115dcbc30d611db43fd0330a71cb43beaf7a29843e1bda8d3be)

## 5. Resolve (after the reveal window closes — highest bid wins, decided on-chain)
- resolve tx: [`0x68c5139257a40328a682034c22952789f878c3ee096f6a81b0478d20d1ff47f3`](https://atlantic.pharosscan.xyz/tx/0x68c5139257a40328a682034c22952789f878c3ee096f6a81b0478d20d1ff47f3)
- **winner: [`0x536E642fa6C594F1A4fc8345Ae4260aeC662077E`](https://atlantic.pharosscan.xyz/address/0x536E642fa6C594F1A4fc8345Ae4260aeC662077E)  highBid: 250**
- expected winner: `0x536E642fa6C594F1A4fc8345Ae4260aeC662077E` -> MATCH ✅

## Result
A complete sealed-bid auction ran end-to-end on-chain: bids stayed hidden through the commit phase, the contract enforced reveal integrity, and the higher bid won — all without any agent able to copy or front-run the other.
