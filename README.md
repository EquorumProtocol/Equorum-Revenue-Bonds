<div align="center">

# Equorum Revenue Bonds

**Capital against revenue, released only as it is repaid**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue)](https://soliditylang.org/)
[![Arbitrum](https://img.shields.io/badge/Arbitrum-Sepolia%20%7C%20One-28A0F0)](https://arbitrum.io/)
[![Tests](https://img.shields.io/badge/Tests-70%20%2B%206%20invariants-success)](./test/foundry)
[![Audit](https://img.shields.io/badge/External%20audit-none-red)](#security)
[![Version](https://img.shields.io/badge/Version-3.0%20testnet-blue)](./CHANGELOG.md)

[Website](https://equorumprotocol.org) • [Whitepaper](./WHITEPAPER.md) • [V3 spec](./docs/V3_SPEC.md) • [Deployments](./DEPLOYMENTS.md) • [Security](./SECURITY.md)

</div>

---

> [!IMPORTANT]
> **V3 (Tap Bonds) is live on Arbitrum Sepolia and has not been audited.** It is not on
> mainnet and should not hold real money yet.
>
> **V2 is deployed on Arbitrum One and is superseded.** A line-by-line review found ten
> issues, including that the Guaranteed Bond raises **zero net capital** and that escrow
> defaults were never recorded in the reputation registry. Six of them are reproduced against the real V2
> contracts in [`test/foundry/V2Regression.t.sol`](./test/foundry/V2Regression.t.sol), three
> more have a V3-side test, and one is handled by construction.
> **Do not create new V2 Guaranteed Bonds.**

---

## What this is

A protocol that earns revenue can raise capital against it here — without selling tokens and
without a lender.

Investors buy an ERC-20 **Tap Bond** with ETH. The ETH goes into escrow, not to the issuer.
The issuer draws it down in tranches, and **each tranche unlocks only after the coupons due
so far have actually been paid.** Miss one past the grace period and anyone can close the
tap for good: the undrawn capital plus any posted collateral goes back to bondholders, who
burn their bonds to claim.

### What it does not do

It does not force anyone to pay — nothing on chain can. What it does is turn an unbounded
risk into a number you can compute from the bond's own terms before you buy:

| After epoch | Drawn | Paid | Investor exposure |
|---|---|---|---|
| 0 | 25 | 0 | 25 |
| 3 | 100 | 30 | **70 (peak)** |
| 6 | 100 | 60 | 40 |
| 12 | 100 | 120 | −20 |

*100 ETH raise, 25% initial release, tap over 3 epochs, 12 monthly epochs, 10% coupon.*

Exposure rises, peaks on a known date, and falls. The peak is the most a dishonest issuer
can walk away with — and it holds even if that issuer pays coupons out of the money it just
drew, because what it keeps is still `drawn − paid`.

The honest limit: near the end of the term the undrawn remainder approaches zero, so the tap
stops being an incentive. Collateral is the only thing covering that window.

---

## How a bond lives

```
            finalize (raised >= minRaise)
   SALE ────────────────────────────────▶ ACTIVE ──── mature() ────▶ MATURED
    │                                        │   (all coupons paid)
    │ deadline passed below minRaise         │
    ▼                                        │ triggerDefault()
  FAILED  (holders redeem at cost,           ▼ (coupon missed past grace)
           issuer recovers collateral)    DEFAULTED (holders redeem undrawn
                                                     capital + collateral)
```

`couponBps × numEpochs ≥ 10000` is enforced in the constructor, so an issuer that reaches
maturity has returned **at least 100% of the raise**. Yield is whatever it offered above
that, plus the revenue share.

Full mechanics: [docs/V3_SPEC.md](./docs/V3_SPEC.md). Design rationale and trust model:
[WHITEPAPER.md](./WHITEPAPER.md).

---

## Contracts

| Contract | Role | Admin power |
|---|---|---|
| `TapBond` | ERC-20 bond: sale, escrow, tap, coupons, default, redemption | **None.** All terms immutable. |
| `TapRouter` | Optional. Splits revenue between holders and issuer. | **None.** No owner, no pause. |
| `TapBondFactory` | Validates terms, deploys bond + router, registers the bond | Owner sets the draw fee within a 3% hard cap, pauses *new* creation only |
| `EquorumRegistry` | Append-only issuer history | Owner approves or revokes factories. Cannot edit records or blacklist. |
| `FeeSplitter` | Receives fees, splits 80% treasury / 20% builder | **None.** The split is a compile-time constant. |

```
contracts/v3/
  TapBond.sol            # the bond: sale, escrow, tap, coupons, default
  TapRouter.sol          # optional revenue split
  TapBondFactory.sol     # validation, deployment, registration
  EquorumRegistry.sol    # append-only issuer record
  FeeSplitter.sol        # immutable 80/20
```

Everything fits under the 24 KB limit without proxies or deployer indirection — what is on
chain is what is in this repository.

---

## Fees

The only fee is on capital the issuer **actually draws**: 2% at deployment, hard-capped at
3% in the contract. Nothing is charged on a failed sale, on capital returned after a
default, or on coupons. The rate is snapshotted into each bond at creation, so later changes
never touch existing bonds.

`FeeSplitter` splits it 80% to the treasury multisig, 20% to the builder. Neither party can
change the other's share or address.

---

## Live deployments

### V3 — Arbitrum Sepolia

| Contract | Address |
|---|---|
| **TapBondFactory** | [`0xFfBDc68D5548C6dA3A04EE2BdE4690827f3736b5`](https://sepolia.arbiscan.io/address/0xFfBDc68D5548C6dA3A04EE2BdE4690827f3736b5) |
| **EquorumRegistry** | [`0x4338Fa9b8AD073106f951a2697CaEB0f55253D40`](https://sepolia.arbiscan.io/address/0x4338Fa9b8AD073106f951a2697CaEB0f55253D40) |
| **FeeSplitter** | [`0xa6160C5Efdac6861229e7E8C88726D9B902ee499`](https://sepolia.arbiscan.io/address/0xa6160C5Efdac6861229e7E8C88726D9B902ee499) |

The first end-to-end run on a live chain — sale, early close, tap draw with fee, coupon,
revenue routed, claim — settled in nine transactions on 15 September 2026. State read back
from the contracts afterwards: bond Active, 1 coupon covered, router drained to zero,
splitter owed 80/20 to the wei, and the registry holding a permanent record of the bond.
Addresses and figures in [DEPLOYMENTS.md](./DEPLOYMENTS.md).

### V2 — Arbitrum One (legacy, superseded)

| Contract | Address |
|---|---|
| RevenueSeriesFactory | [`0x280E83c47E243267753B7E2f322f55c52d4D2C3a`](https://arbiscan.io/address/0x280E83c47E243267753B7E2f322f55c52d4D2C3a) |
| RevenueBondEscrowFactory | [`0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650`](https://arbiscan.io/address/0x2CfE9a33050EB77fC124ec3eAac4fA4D687bE650) |
| ProtocolReputationRegistry | [`0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA`](https://arbiscan.io/address/0xfe0A22D77fdf98cC556CBc2dC6B3749EBa4E89bA) |
| Treasury / owner (Safe) | [`0xBa69aEd75E8562f9D23064aEBb21683202c5279B`](https://arbiscan.io/address/0xBa69aEd75E8562f9D23064aEBb21683202c5279B) |

**Track record, stated plainly:** these V2 factories have never issued a series. The only
series that exists on Equorum is `UNDERDOG-RB`, a V1 demo from the author's own protocol,
with one holder and 0.003 ETH ever distributed. There is no production history to point at.

---

## Quick start

```bash
git clone https://github.com/EquorumProtocol/Equorum-Revenue-Bonds
cd Equorum-Revenue-Bonds
git submodule update --init
forge test
```

Foundry only — the old Hardhat pipeline is no longer used for V3.

### Issue a bond

```solidity
TapBond.Terms memory t;
t.price             = 0.001 ether;  // per token
t.maxSupply         = 100_000e18;   // max raise 100 ETH
t.minRaise          = 40 ether;
t.saleDuration      = 14 days;
t.epochDuration     = 30 days;
t.gracePeriod       = 5 days;
t.numEpochs         = 12;
t.tapEpochs         = 3;
t.couponBps         = 1000;         // 10% per epoch -> 1.2x over the term
t.initialReleaseBps = 2500;         // 25% drawable on day one
t.revenueShareBps   = 2000;         // 20% of routed revenue to holders

// collateral is msg.value — it goes to holders on default
factory.createBond{value: 25 ether}("My Protocol Bond", "PROTO-TB", t);
```

### Buy, pay, claim

```solidity
bond.buy{value: cost}(amount);   // investor, during the sale
bond.drawCapital(treasury);      // issuer, as coupons unlock tranches
bond.distribute{value: amount}();// anyone — counts toward coupons while Active
bond.claimRevenue();             // holder
bond.triggerDefault();           // anyone, once a coupon is overdue past grace
bond.redeem();                   // holder, after default or a failed sale
```

### Deploy

```bash
forge script script/DeployV3.s.sol --rpc-url arbitrum_sepolia --account deployer --broadcast
FACTORY=0x... forge script script/SmokeV3.s.sol --rpc-url arbitrum_sepolia --account deployer --broadcast
```

---

## Security

**No external audit.** That is the single most important fact in this README.

The test suite is 69 unit tests, 1 fuzz test, and 6 invariant properties run from two starting
states (an open sale, and a fully-sold bond at the start of its term). Each property runs 128
random call sequences per state — 8,192 and 32,768 calls in total — with zero reverts.

| Suite | Covers |
|---|---|
| [`TapBond.t.sol`](./test/foundry/TapBond.t.sol) | Sale rounding, finalize paths, tap formula, coupons, default, maturity, transfers |
| [`RouterFactorySplitter.t.sol`](./test/foundry/RouterFactorySplitter.t.sol) | Router splits, factory validation and pause, registry write rules, the 80/20 split |
| [`V2Regression.t.sol`](./test/foundry/V2Regression.t.sol) | Six V2 issues reproduced against the real V2 contracts, V3 behaviour beside each |
| [`TapBondInvariant.t.sol`](./test/foundry/TapBondInvariant.t.sol) | Solvency, draw ≤ raised, recovery never overpaid, revenue never over-claimed, tap never ahead of coupons |

Known and documented, not fixed: revenue owed to a contract that cannot receive ETH stays
stuck. Claims are pull-based, so one stuck holder never blocks anyone else.

Report a vulnerability to **suport@equorumprotocol.org** with `[SECURITY]` in the subject,
and please do not open a public issue before we have replied.

---

## Roadmap

| | |
|---|---|
| **Done** | V3 contracts, V2 regression suite, testnet deployment, first live end-to-end run |
| **Next** | External audit — required before any mainnet deployment |
| **After that** | Locked Revenue: a fee-switch lock that makes the revenue share enforceable for issuers with on-chain fees |
| **Later** | ERC-20 settlement (USDC), other chains |

An EQM token is an idea, not a commitment, and nothing in this repository depends on one.

---

## Documentation

- [Whitepaper](./WHITEPAPER.md) — design, trust model, what is and is not guaranteed
- [V3 spec](./docs/V3_SPEC.md) — exact mechanics, parameters, formulas, V2 issue list
- [Deployments](./DEPLOYMENTS.md) — every address, plus the live smoke-test run
- [Integration guide](./INTEGRATION_GUIDE.md) — V2-era, being rewritten for V3
- [Security](./SECURITY.md) · [Changelog](./CHANGELOG.md) · [V1 → V2 migration](./MIGRATION.md)

---

## Contact

- **Issuers and developers:** leonardomondaine@gmail.com
- **Support:** suport@equorumprotocol.org
- **Bugs and features:** [GitHub issues](https://github.com/EquorumProtocol/Equorum-Revenue-Bonds/issues)

---

<div align="center">

MIT licensed · Built on Arbitrum with OpenZeppelin 5

[Website](https://equorumprotocol.org) • [Whitepaper](./WHITEPAPER.md) • [GitHub](https://github.com/EquorumProtocol)

</div>
