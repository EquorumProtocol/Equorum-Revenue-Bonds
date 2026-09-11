# Equorum V3 — Tap Bonds

**Status:** Draft, not deployed, not audited
**Solidity:** 0.8.24
**Scope of this release:** Tap Bond (replaces Soft Bond and Guaranteed Bond), immutable fee split, new reputation registry, fixes for every known V2 issue.
**Out of scope (next release):** Locked Revenue (issuer hands its fee-switch admin to a lock contract).

---

## 1. Why V3 exists

V2 had one economic flaw and several implementation bugs.

**The economic flaw.** The Guaranteed Bond made the issuer deposit the full principal before selling bonds. Buyers' ETH went straight to the issuer, and the deposit went back to buyers at maturity. So the issuer raised nothing: it locked 500 ETH to receive 500 ETH, and it paid a revenue share and a 2% fee on top. The guarantee held only because the capital never left escrow, and that also meant the bond financed nothing.

The Soft Bond had the opposite problem. Nothing made the issuer pay. The router protected only what the issuer chose to send it.

**The core constraint.** Without outside collateral, an issuer's net funding and the investors' unprotected exposure are the same number. Every wei the issuer can spend is a wei the investors can lose. No design removes that trade-off. A good design controls how it grows.

**The Tap Bond answer.** Investors' ETH goes into escrow. The issuer draws it down in tranches, and each tranche unlocks only after the issuer has paid the coupons due so far. If the issuer misses a coupon past the grace period, anyone can trigger default. The tap closes, and the undrawn capital plus any posted collateral goes back to bondholders. Exposure grows only with demonstrated payment. This is the DAICO "tap" idea (2018), gated by performance instead of by a vote.

---

## 2. Contracts

| Contract | Role | Admin |
|---|---|---|
| `FeeSplitter` | Receives all protocol fees. Splits them 80% treasury / 20% builder. | None. The split is a constant. Each party can only rotate its own address. |
| `EquorumRegistry` | Append-only record of issuer history: raised, paid, matured, defaulted. | Owner (multisig) can only approve factories. It cannot edit records or blacklist anyone. |
| `TapBondFactory` | Validates parameters, deploys the bond and optional router, registers the bond. | Owner (multisig) can set the draw fee within a hard cap (max 3%) and pause *new* bond creation. It cannot touch existing bonds. |
| `TapBond` | ERC-20 bond: sale, escrow, tap, coupons, default, redemption. | None. All terms are immutable. |
| `TapRouter` | Optional. Splits incoming revenue between bondholders and the issuer. | None. No owner, no pause. |

---

## 3. Tap Bond lifecycle

```
            finalize (raised >= minRaise)
   SALE ────────────────────────────────▶ ACTIVE ──── mature() ────▶ MATURED
    │                                        │   (all coupons paid)
    │ deadline missed / issuer cancels       │
    ▼                                        │ triggerDefault()
  FAILED  (holders redeem at cost,           ▼ (coupon missed past grace)
           issuer recovers collateral)    DEFAULTED (holders redeem undrawn
                                                     capital + collateral)
```

### 3.1 Parameters (fixed at creation)

| Parameter | Meaning | Hard limits |
|---|---|---|
| `price` | Wei per 1 token (1e18 units) | > 0 |
| `maxSupply` | Maximum tokens sold | ≥ 1 token |
| `minRaise` | Soft cap in wei. Below this the sale fails and everyone is refunded. | > 0, ≤ max raise |
| `saleDuration` | Sale window | 1–90 days |
| `epochDuration` | Coupon period | 1–90 days |
| `numEpochs` (N) | Bond term in epochs | 1–120 |
| `gracePeriod` | Extra time to pay a coupon before default is possible | ≤ `epochDuration` |
| `couponBps` | Minimum payment per epoch, in bps of capital raised | `couponBps × N ≥ 10000` |
| `initialReleaseBps` | Share of capital the issuer can draw right after the sale | 0–10000 |
| `tapEpochs` | Remaining capital unlocks linearly over this many epochs | 1–N |
| `revenueShareBps` | Router split to bondholders (0 = no router) | 0–5000 |
| collateral (`msg.value` at creation) | Extra ETH that goes to holders on default | any, including 0 |

`couponBps × N ≥ 10000` means that an issuer who does not default returns at least 100% of the raise over the term. The yield is whatever the issuer offers above that minimum, plus the revenue share.

### 3.2 Sale

- `buy(amount)`: pay `ceil(amount × price / 1e18)` and receive freshly minted tokens. The price is immutable, so the issuer cannot front-run buyers (this was V2 bug R-8).
- The issuer holds **zero** tokens at creation. It cannot pay coupons to itself to build reputation for free (V2 bug R-7).
- `finalize()`: anyone can call it after the deadline or once the sale sells out. The issuer may also close early once `minRaise` is met. If `raised < minRaise` the bond becomes `FAILED`.
- `cancelSale()`: the issuer may abort before finalization, and the bond becomes `FAILED`.

### 3.3 Coupons and revenue

- `distribute()` (payable, anyone): spreads ETH across current holders pro-rata. It uses the reward-per-token accumulator with remainder carry, so no wei is lost to rounding.
- Every wei distributed while `ACTIVE` counts toward coupons. Paying more than the minimum prepays future epochs.
- `couponAmount = ceil(raised × couponBps / 10000)`, fixed at finalization.
- `epochsCovered = totalPaid / couponAmount`.
- `epochsDue(t) = min(N, floor((t − start − grace) / epochDuration))`, or 0 before `start + grace`.

### 3.4 The tap

```
k        = min(epochsElapsed, epochsCovered, tapEpochs)
unlocked = raised × initialReleaseBps / 10000
         + (raised − initialPart) × k / tapEpochs
```

`drawCapital(to)` (issuer only) withdraws `unlocked − drawn`. The protocol fee is deducted from each draw and sent to `FeeSplitter`. Prepaying coupons does not speed up the tap past the calendar, and missing coupons stalls it.

**Worked example.** Raise 100 ETH, `initialReleaseBps` 25%, `tapEpochs` 3, N = 12 monthly epochs, `couponBps` 10% (1.2× total).

| After epoch | Drawn | Paid | Issuer net funding = holder exposure |
|---|---|---|---|
| 0 | 25 | 0 | 25 |
| 1 | 50 | 10 | 40 |
| 2 | 75 | 20 | 55 |
| 3 | 100 | 30 | 70 (peak) |
| 6 | 100 | 60 | 40 |
| 12 | 100 | 120 | −20 (holders +20% plus revenue share) |

If the issuer defaults after epoch 1, holders keep the 10 ETH already paid and redeem the 50 undrawn ETH plus any collateral. Posting 25 ETH of collateral would fully cover the initial draw.

### 3.5 Default

`triggerDefault()` works for anyone once `epochsDue > epochsCovered`. The steps are:

1. The state becomes `DEFAULTED`. The tap closes for good.
2. `recoveryPool = (raised − drawn) + collateral`.
3. `redeem()` burns the caller's entire balance and pays `recoveryPool × balance / supplyAtDefault`.
4. The default is written to the registry permanently. Nobody can remove it.

Revenue already earned stays claimable after default. The router keeps paying the revenue share until the original maturity date, but only to tokens that still exist: redeeming burns your tokens and ends your share of future revenue.

### 3.6 Maturity

`mature()` works for anyone once `now ≥ maturity` and all N coupons are covered. The issuer can then draw any remaining capital and withdraw its collateral. Tokens remain transferable, and later distributions are voluntary extras.

### 3.7 Failed sale

`redeem()` burns the caller's tokens and returns `raised × balance / supplyAtFailure`. The issuer recovers its collateral.

---

## 4. Fees and the builder share

- The **only** fee is the draw fee: a percentage of capital the issuer actually draws. The initial deploy value is 2% and the hard cap is 3%. There is no fee on sales that fail, on undrawn capital returned after default, or on coupons.
- The fee rate is snapshotted into each bond at creation. Later fee changes never affect existing bonds.
- `FeeSplitter` splits every fee **80% to the treasury (multisig) and 20% to the builder**. `BUILDER_SHARE_BPS = 2000` is a constant. The treasury cannot change the builder's share or address, and the builder cannot change the treasury's.
- Payouts are pull-based. Anyone can call `withdrawTreasury()` or `withdrawBuilder()`, and the funds always go to the current address on record.

---

## 5. Reputation registry

V2 computed a 0–100 score that anyone could farm for the cost of gas. V3 records facts only:

`bondsIssued`, `bondsMatured`, `bondsDefaulted`, `totalRaised`, `totalPaid`, `lastDefaultAt`.

- Only bonds deployed by an approved factory can write, and each bond is auto-authorized when the factory registers it. This fixes V2 bug R-1, where defaults were silently never recorded.
- Records are append-only. There is no admin blacklist or whitelist.
- **Remaining weakness:** an issuer can still buy its own bond to inflate `totalRaised`. That now costs the draw fee on the whole raise instead of just gas, but frontends should weight history by counterparties, not by volume alone.

---

## 6. V2 issues and how V3 handles them

| # | V2 issue | V3 |
|---|---|---|
| R-1 | Registry `authorizeReporter` is `onlyOwner` (the Safe), so factory calls failed silently. Escrow defaults were never recorded, and every soft series emitted a false `ReputationRegistrationFailed`. | Factory-driven registration auto-authorizes each bond. Tested. |
| R-2 | Escrow factory creation fee skipped when `msg.value == 0`. | No creation fee. The fee is taken inside `drawCapital`, so it cannot be bypassed. Tested. |
| R-3 | 2% sale fee sent to a treasury address chosen by the issuer in `startSale()`. | Fee recipient is the factory's immutable `FeeSplitter`. Tested. |
| R-4 | `principalClaimed` flag per address. Tokens received after claiming locked their principal forever. | Burn-based redemption with no per-address flag. Tested. |
| R-5 | Revenue owed to AMM pools or other contracts that can't receive ETH is stuck. | **Not fixed. Documented.** Claims are pull-based, so a stuck holder never blocks others. Recommendation: pair liquidity through a wrapper that can claim. |
| R-6 | Guaranteed Bond raised zero net capital. | Replaced by the tap (§3.4). |
| R-7 | Issuer held 100% of supply and could farm reputation by paying itself. | Supply is minted only against ETH during the sale. Registry records money, not counts. |
| R-8 | Issuer could raise the sale price in front of a buyer. | Price is immutable. |
| R-9 | Router owner (the issuer) could pause routing, and 1-wei deposits could block withdrawals. | Router has no owner and no pause, and the issuer's share is pull-based. |
| R-10 | ERC-20 transfers reverted below a minimum balance, which broke composability. | Plain ERC-20 with no transfer restrictions. |

---

## 7. Trust model — what is and is not guaranteed

**Guaranteed by code:**
- Undrawn capital and collateral can only go to holders (on default or failure) or to the issuer (on maturity).
- The issuer cannot draw faster than its coupon record allows.
- Nobody — not the multisig, the builder, or the issuer — can change a bond's terms after creation.

**Not guaranteed:**
- The revenue share. The issuer decides what goes through the router, until Locked Revenue ships.
- Recovery of capital the issuer has already drawn, beyond the posted collateral.
- Legal enforceability. Revenue-linked tokens may be securities in many jurisdictions, including Brazil (CVM Parecer de Orientação 40) and the US.

---

## 8. Known limitations / next steps

- External audit before any mainnet deployment.
- Locked Revenue: a fee-switch lock that makes the revenue share enforceable for issuers with on-chain fees.
- ETH only. ERC-20 settlement (USDC) is a natural extension.
- The registry does not detect self-dealing (see §5).
