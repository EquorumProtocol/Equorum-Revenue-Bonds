# Equorum V3 — Tap Bonds

**Status:** In development. Not deployed. Not audited.
**Spec:** [docs/V3_SPEC.md](../../docs/V3_SPEC.md)

| Contract | What it does |
|---|---|
| `TapBond.sol` | ERC-20 bond. Buyers' ETH is held in escrow and released to the issuer in tranches, each gated by coupons paid. A missed coupon (past grace) lets anyone trigger default, and holders then redeem undrawn capital plus collateral. |
| `TapRouter.sol` | Optional, ownerless revenue splitter (holders' share vs. issuer's share). |
| `TapBondFactory.sol` | Deploys and registers bonds. The multisig can only set the draw fee for new bonds (max 3%) and pause creation. |
| `FeeSplitter.sol` | Receives all protocol fees. Constant split: 80% treasury (multisig), 20% builder. |
| `EquorumRegistry.sol` | Append-only issuer history (raised, paid, matured, defaulted). No scores, no admin edits. |

## Build & test (Foundry)

```bash
git submodule update --init --recursive
forge build
forge test            # unit, fuzz, invariant and V2-regression tests
```

## Deploy

```bash
TREASURY=<multisig> BUILDER=<builder address> DRAW_FEE_BPS=200 \
forge script script/DeployV3.s.sol --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
# then the multisig calls EquorumRegistry.acceptOwnership()
```
