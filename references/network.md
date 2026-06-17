# Network — Pharos Atlantic Testnet

| Field | Value |
|---|---|
| Network | Pharos Atlantic Testnet |
| Chain ID | `688689` |
| Token | `PHRS` |
| Explorer | https://atlantic.pharosscan.xyz (also https://pharos-testnet.socialscan.io) |
| Faucet | https://testnet.pharosnetwork.xyz (requires binding an X account) |

> Note: some older docs list Pharos Testnet as chainId `688688`. The current live
> testnet served by ZAN and funded by the faucet is **Atlantic, chainId `688689`** —
> that is the chain this skill is deployed to.

## Deployed contract

| Field | Value |
|---|---|
| Contract | `CommitRevealCoordinator` |
| Address | `0x0d609dA43455afFCaB082393233AC10f61e875DF` |
| Explorer | https://atlantic.pharosscan.xyz/address/0x0d609dA43455afFCaB082393233AC10f61e875DF |
| Deploy tx | `0x9edab92bf2daeeee61eb415ad5a106ba7a724a90458f92956cb22fdc82c49b01` |

## RPC — use a ZAN keyed endpoint

Set `RPC` in `.env` to a ZAN Atlantic endpoint:

```
RPC=https://api.zan.top/node/v1/pharos/atlantic/<YOUR_KEY>
```

Get a free key at https://zan.top → **Node Service** → create API key.

### Why not the bare `dplabs` URL?

The commonly documented endpoint `https://testnet.dplabs-internal.com` resolves to
infrastructure that presents a `*.zan.top` TLS certificate. Strict TLS clients —
`ethers` (the agent scripts), `forge`, and `cast` — reject the hostname mismatch
with `invalid peer certificate: NotValidForName`, and `curl` is dropped at the WAF
after the handshake. Browsers and MetaMask tolerate it, but the CLI tooling does
not. The ZAN keyed endpoint above presents a valid cert and serves standard
JSON-RPC, so it is the reliable choice for scripts and deploys.

## Wallet setup (MetaMask)

- Network Name: `Pharos Atlantic Testnet`
- RPC URL: your ZAN endpoint
- Chain ID: `688689`
- Currency Symbol: `PHRS`
- Block Explorer: `https://atlantic.pharosscan.xyz`
