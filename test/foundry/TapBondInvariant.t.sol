// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./Base.t.sol";

/// @dev Random actor that drives a single TapBond through its whole lifecycle.
contract TapHandler is Test {
    TapBond public bond;
    address public issuer;
    address[] public actors;

    uint256 public ghostClaimed;
    uint256 public ghostRedeemed;
    uint256 public ghostIssuerNet;
    uint256 public maxDrawnSeenAboveAllowance; // must stay 0
    mapping(uint8 => uint256) public reachedState; // coverage: how often each state was observed

    constructor(TapBond _bond, address _issuer, address[] memory _actors) {
        bond = _bond;
        issuer = _issuer;
        actors = _actors;
    }

    function _observe() internal {
        reachedState[uint8(bond.state())]++;
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function buy(uint256 seed, uint256 tokens) external {
        if (bond.state() != TapBond.State.Sale || block.timestamp >= bond.saleEnd()) return;
        uint256 room = bond.maxSupply() - bond.totalSupply();
        if (room == 0) return;
        tokens = bound(tokens, 1, room);
        uint256 cost = (tokens * bond.price() + 1e18 - 1) / 1e18;
        address a = _actor(seed);
        vm.deal(a, a.balance + cost);
        vm.prank(a);
        bond.buy{value: cost}(tokens);
    }

    function finalize() external {
        if (bond.state() != TapBond.State.Sale) return;
        if (block.timestamp < bond.saleEnd()) vm.warp(bond.saleEnd());
        bond.finalize();
    }

    function warp(uint256 secs) external {
        _observe();
        skip(bound(secs, 1 hours, 45 days));
    }

    function distribute(uint256 amount, bool fromIssuer) external {
        TapBond.State s = bond.state();
        if (s == TapBond.State.Sale || s == TapBond.State.Failed || bond.totalSupply() == 0) return;
        amount = bound(amount, 1, 50 ether);
        address from = fromIssuer ? issuer : actors[0];
        vm.deal(from, from.balance + amount);
        vm.prank(from);
        bond.distribute{value: amount}();
    }

    function draw() external {
        if (bond.availableToDraw() == 0) return;
        TapBond.State s = bond.state();
        if (s != TapBond.State.Active && s != TapBond.State.Matured) return;
        vm.prank(issuer);
        ghostIssuerNet += bond.drawCapital(issuer);
        _checkAllowance();
    }

    function transfer(uint256 fromSeed, uint256 toSeed, uint256 amount) external {
        address from = _actor(fromSeed);
        uint256 bal = bond.balanceOf(from);
        if (bal == 0) return;
        amount = bound(amount, 1, bal);
        vm.prank(from);
        bond.transfer(_actor(toSeed), amount);
    }

    function claim(uint256 seed) external {
        address a = _actor(seed);
        if (bond.earned(a) == 0) return;
        vm.prank(a);
        ghostClaimed += bond.claimRevenue();
    }

    function triggerDefault() external {
        if (!bond.isDefaultable()) return;
        bond.triggerDefault();
    }

    function mature() external {
        if (bond.state() != TapBond.State.Active) return;
        if (block.timestamp < bond.maturityTime() || bond.epochsCovered() < bond.numEpochs()) return;
        bond.mature();
    }

    function redeem(uint256 seed) external {
        TapBond.State s = bond.state();
        if (s != TapBond.State.Failed && s != TapBond.State.Defaulted) return;
        address a = _actor(seed);
        if (bond.balanceOf(a) == 0) return;
        vm.prank(a);
        ghostRedeemed += bond.redeem();
    }

    function _checkAllowance() internal {
        if (bond.state() != TapBond.State.Active) return;
        uint256 raised = bond.raised();
        uint256 k = bond.epochsElapsed();
        uint256 c = bond.epochsCovered();
        if (c < k) k = c;
        if (bond.tapEpochs() < k) k = bond.tapEpochs();
        uint256 initial = (raised * bond.initialReleaseBps()) / 10_000;
        uint256 allowed = initial + ((raised - initial) * k) / bond.tapEpochs();
        if (bond.capitalDrawn() > allowed) maxDrawnSeenAboveAllowance = bond.capitalDrawn() - allowed;
    }
}

abstract contract TapInvariantBase is Base {
    TapHandler handler;
    TapBond bond;

    function setUp() public override {
        super.setUp();
        TapBond.Terms memory t = defaultTerms();
        t.minRaise = 10 ether;
        (bond,) = createBond(t, 5 ether);
        _prepare();

        address[] memory actors = new address[](4);
        actors[0] = alice;
        actors[1] = bob;
        actors[2] = carol;
        actors[3] = makeAddr("dave");
        handler = new TapHandler(bond, issuer, actors);

        targetContract(address(handler));
    }

    function _prepare() internal virtual {}

    /// Contract always holds enough ETH for every outstanding obligation.
    function invariant_solvent() public view {
        assertGe(address(bond).balance, bond.reservedBalance());
    }

    function invariant_neverDrawMoreThanRaised() public view {
        assertLe(bond.capitalDrawn(), bond.raised());
    }

    function invariant_tapNeverExceedsCouponRecord() public view {
        assertEq(handler.maxDrawnSeenAboveAllowance(), 0);
    }

    function invariant_recoveryNeverOverpaid() public view {
        assertLe(bond.recoveryPaid(), bond.recoveryPool());
    }

    function invariant_revenueNeverOverClaimed() public view {
        assertLe(bond.totalRevenueClaimed(), bond.totalDistributed());
        assertEq(handler.ghostClaimed(), bond.totalRevenueClaimed());
    }

    function afterInvariant() public view {
        console.log("states seen  sale/active/matured/defaulted/failed:");
        console.log(handler.reachedState(0), handler.reachedState(1), handler.reachedState(2));
        console.log(handler.reachedState(3), handler.reachedState(4));
    }

    function invariant_couponsOnlyCountedWhileActive() public view {
        assertLe(bond.totalPaid(), bond.totalDistributed());
    }
}

/// Starts in SALE: explores buy / finalize / fail / cancel paths.
contract TapInvariantFromSale is TapInvariantBase {}

/// Starts ACTIVE (fully sold): explores tap, coupons, default, maturity, redemption.
/// forge-config: default.invariant.depth = 256
contract TapInvariantFromActive is TapInvariantBase {
    function _prepare() internal override {
        buy(bond, alice, 40_000e18);
        buy(bond, bob, 35_000e18);
        buy(bond, carol, 25_000e18);
        bond.finalize();
    }
}
