// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../contracts/v3/FeeSplitter.sol";
import "../../contracts/v3/EquorumRegistry.sol";
import "../../contracts/v3/TapBond.sol";
import "../../contracts/v3/TapRouter.sol";
import "../../contracts/v3/TapBondFactory.sol";

/// @dev Contract that rejects ETH (used to simulate AMM pools / bad recipients).
contract RejectsETH {
    receive() external payable {
        revert("no ETH");
    }

    function callTransfer(TapBond bond, address to, uint256 amount) external {
        bond.transfer(to, amount);
    }
}

abstract contract Base is Test {
    address internal multisig = makeAddr("multisig");
    address internal builder = makeAddr("builder");
    address internal issuer = makeAddr("issuer");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    FeeSplitter internal splitter;
    EquorumRegistry internal registry;
    TapBondFactory internal factory;

    uint256 internal constant DRAW_FEE_BPS = 200; // 2%
    uint256 internal constant PRICE = 0.001 ether; // per token
    uint256 internal constant EPOCH = 30 days;
    uint256 internal constant GRACE = 7 days;
    uint256 internal constant SALE = 7 days;

    function setUp() public virtual {
        splitter = new FeeSplitter(multisig, builder);
        registry = new EquorumRegistry(multisig);
        factory = new TapBondFactory(multisig, address(splitter), registry, DRAW_FEE_BPS);
        vm.prank(multisig);
        registry.setFactory(address(factory), true);

        vm.deal(issuer, 1_000 ether);
        vm.deal(alice, 1_000 ether);
        vm.deal(bob, 1_000 ether);
        vm.deal(carol, 1_000 ether);
    }

    /// Spec §3.4 worked example: 100 ETH cap, 25% initial, tap over 3 epochs, 12 epochs of 10%.
    function defaultTerms() internal pure returns (TapBond.Terms memory t) {
        t.price = PRICE;
        t.maxSupply = 100_000e18; // 100 ETH max raise
        t.minRaise = 50 ether;
        t.saleDuration = uint64(SALE);
        t.epochDuration = uint64(EPOCH);
        t.gracePeriod = uint64(GRACE);
        t.numEpochs = 12;
        t.tapEpochs = 3;
        t.couponBps = 1000;
        t.initialReleaseBps = 2500;
        t.revenueShareBps = 2000;
    }

    function createBond(TapBond.Terms memory t, uint256 collateral) internal returns (TapBond bond, TapRouter router) {
        vm.prank(issuer);
        (address b, address r) = factory.createBond{value: collateral}("Test Tap Bond", "TTB", t);
        bond = TapBond(payable(b));
        router = TapRouter(payable(r));
    }

    function buy(TapBond bond, address who, uint256 tokens) internal {
        uint256 cost = (tokens * bond.price() + 1e18 - 1) / 1e18;
        vm.prank(who);
        bond.buy{value: cost}(tokens);
    }

    /// Creates a bond and fills it with alice 60k + bob 40k tokens (100 ETH), finalized.
    function activeBond(uint256 collateral) internal returns (TapBond bond, TapRouter router) {
        (bond, router) = createBond(defaultTerms(), collateral);
        buy(bond, alice, 60_000e18);
        buy(bond, bob, 40_000e18);
        bond.finalize(); // sold out -> anyone
    }

    function payCoupons(TapBond bond, uint256 epochs) internal {
        uint256 amount = bond.couponAmount() * epochs;
        vm.prank(issuer);
        bond.distribute{value: amount}();
    }
}
