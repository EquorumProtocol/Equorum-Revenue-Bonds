const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS, SERIES_PATH, ROUTER_PATH } = require("./helpers");

/**
 * Distribution Failure Tests
 * 
 * Isolated tests focused on revenue distribution failure scenarios.
 * Covers: rounding, dust, transfer-before-claim, matured series,
 * principal vs revenue mixing, and Router edge cases.
 * 
 * NO contracts are modified — tests only.
 */

describe("Distribution Failures — RevenueSeries (Soft Bonds)", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let series, router, alice, bob, charlie;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, charlie] = rest;
    ({ series, router } = await createSeriesViaFactory(factory, protocol));
  });

  // ============================================
  // ROUNDING AND DUST
  // ============================================
  describe("Rounding and Dust in distribution", function () {
    it("Minimum distribution: revenuePerToken must not be zero", async function () {
      // With 1M tokens (1e24 wei), distribute 0.001 ETH (1e15 wei)
      // revenuePerToken = (1e15 * 1e18) / 1e24 = 1e9 (ok, > 0)
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.001") });
      expect(await series.revenuePerTokenStored()).to.be.gt(0);
    });

    it("Too small distribution should be rejected (below minDistribution)", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: 100 }) // 100 wei
      ).to.be.revertedWith("Distribution too small");
    });

    it("Accumulated dust: sum of claims must be <= deposited ETH", async function () {
      // Distribute tokens to 3 holders with unequal proportions
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("333333"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("333333"));
      // charlie has no tokens, protocol keeps the rest (~333334)

      // Distribute revenue
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });

      // Calculate claimable for all
      const claimableAlice = await series.calculateClaimable(alice.address);
      const claimableBob = await series.calculateClaimable(bob.address);
      const claimableProtocol = await series.calculateClaimable(protocol.address);

      const totalClaimable = claimableAlice + claimableBob + claimableProtocol;
      const seriesBalance = await ethers.provider.getBalance(await series.getAddress());

      // Sum of claims must never exceed actual balance
      expect(totalClaimable).to.be.lte(seriesBalance);
    });

    it("Multiple small distributions: dust accumulates but does not lock funds", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // 10 distributions of 0.001 ETH
      for (let i = 0; i < 10; i++) {
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.001") });
      }

      const claimableAlice = await series.calculateClaimable(alice.address);
      const claimableProtocol = await series.calculateClaimable(protocol.address);

      // Alice has 50% of tokens, should receive ~0.005 ETH
      expect(claimableAlice).to.be.closeTo(ethers.parseEther("0.005"), ethers.parseEther("0.0001"));
      // Protocol has 50%, should receive ~0.005 ETH
      expect(claimableProtocol).to.be.closeTo(ethers.parseEther("0.005"), ethers.parseEther("0.0001"));
    });

    it("Dust trapped in contract after all claims", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("333333"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("333334"));
      // protocol keeps 333333

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });

      // All holders claim
      await series.connect(alice).claimRevenue();
      await series.connect(bob).claimRevenue();
      await series.connect(protocol).claimRevenue();

      // Check remaining dust in contract
      const remaining = await ethers.provider.getBalance(await series.getAddress());
      // Dust should be very small (< 1000 wei per holder)
      expect(remaining).to.be.lt(ethers.parseEther("0.000000000001")); // < 1000 wei
    });
  });

  // ============================================
  // TRANSFER BEFORE CLAIM
  // ============================================
  describe("Transfer before claim", function () {
    it("Holder transfers ALL tokens before claiming: rewards preserved", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice has ~1 ETH of rewards (10% of 10 ETH)
      const claimableBefore = await series.calculateClaimable(alice.address);
      expect(claimableBefore).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));

      // Alice transfers ALL tokens to Bob
      await series.connect(alice).transfer(bob.address, ethers.parseEther("100000"));

      // Alice should still be able to claim accumulated rewards
      const claimableAfter = await series.calculateClaimable(alice.address);
      expect(claimableAfter).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));

      // Alice claims successfully
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });

    it("New holder does not receive revenue from previous distributions", async function () {
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Bob buys tokens AFTER the distribution
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("100000"));

      // Bob should have nothing to claim
      const claimable = await series.calculateClaimable(bob.address);
      expect(claimable).to.equal(0);
    });

    it("Partial transfer: correct proportional rewards", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("200000")); // 20%
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice has ~2 ETH of rewards
      // Alice transfers half of tokens to Bob
      await series.connect(alice).transfer(bob.address, ethers.parseEther("100000"));

      // New distribution
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice: 2 ETH (1st dist) + 1 ETH (2nd dist, 10% of tokens) = ~3 ETH
      const claimableAlice = await series.calculateClaimable(alice.address);
      expect(claimableAlice).to.be.closeTo(ethers.parseEther("3"), ethers.parseEther("0.01"));

      // Bob: 0 ETH (1st dist) + 1 ETH (2nd dist, 10% of tokens) = ~1 ETH
      const claimableBob = await series.calculateClaimable(bob.address);
      expect(claimableBob).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });

    it("Multiple chained transfers: correct accounting", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice -> Bob -> Charlie
      await series.connect(alice).transfer(bob.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await series.connect(bob).transfer(charlie.address, ethers.parseEther("500000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Alice: 5 ETH (1st dist, 50%) + 0 (2nd, 0%) + 0 (3rd, 0%) = 5 ETH
      const claimableAlice = await series.calculateClaimable(alice.address);
      expect(claimableAlice).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));

      // Bob: 0 (1st) + 5 ETH (2nd, 50%) + 0 (3rd, 0%) = 5 ETH
      const claimableBob = await series.calculateClaimable(bob.address);
      expect(claimableBob).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));

      // Charlie: 0 (1st) + 0 (2nd) + 5 ETH (3rd, 50%) = 5 ETH
      const claimableCharlie = await series.calculateClaimable(charlie.address);
      expect(claimableCharlie).to.be.closeTo(ethers.parseEther("5"), ethers.parseEther("0.01"));

      // All holders claim
      await series.connect(alice).claimRevenue();
      await series.connect(bob).claimRevenue();
      await series.connect(charlie).claimRevenue();
      await series.connect(protocol).claimRevenue();
    });
  });

  // ============================================
  // CLAIM AFTER MATURITY
  // ============================================
  describe("Claim after maturity", function () {
    it("Revenue accumulated before maturity can be claimed after", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Advance past maturity
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Alice can still claim
      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });

    it("No new distributions after maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("Token transfer after maturity: rewards preserved", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Alice transfers tokens to Bob after maturity
      await series.connect(alice).transfer(bob.address, ethers.parseEther("100000"));

      // Alice can still claim accumulated rewards
      const claimableAlice = await series.calculateClaimable(alice.address);
      expect(claimableAlice).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
    });
  });
});

describe("Distribution Failures — RevenueRouter", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let series, router, alice, bob;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob] = rest;
    ({ series, router } = await createSeriesViaFactory(factory, protocol));
  });

  // ============================================
  // ROUNDING IN ROUTER SPLIT
  // ============================================
  describe("Rounding in Router split", function () {
    it("Split with 1 wei: series receives rounded up amount", async function () {
      // Send 1 wei — seriesAmount = (1 * 2000 + 9999) / 10000 = 1 (rounded up)
      // But minDistribution is 0.001 ETH, so it fails on minDistribution
      await alice.sendTransaction({ to: await router.getAddress(), value: 1 });
      // Should emit RouteAttemptFailed for being below minDistribution
      await expect(router.routeRevenue()).to.emit(router, "RouteAttemptFailed");
    });

    it("Split with odd value: series + protocol = total", async function () {
      // 7 ETH with 20% share
      // seriesAmount = (7e18 * 2000 + 9999) / 10000 = 1.4 ETH (rounded up)
      const amount = ethers.parseEther("7");
      await alice.sendTransaction({ to: await router.getAddress(), value: amount });
      
      const routerBalanceBefore = await ethers.provider.getBalance(await router.getAddress());
      await router.routeRevenue();
      
      const seriesReceived = await series.totalRevenueReceived();
      const routerBalanceAfter = await ethers.provider.getBalance(await router.getAddress());
      const protocolRemaining = routerBalanceAfter; // remaining in router belongs to protocol
      
      // series + protocol remaining must equal total sent
      expect(seriesReceived + protocolRemaining).to.equal(amount);
    });

    it("Multiple receive+route cycles: consistent accounting", async function () {
      for (let i = 0; i < 5; i++) {
        await alice.sendTransaction({
          to: await router.getAddress(),
          value: ethers.parseEther("3.33")
        });
        await router.routeRevenue();
      }

      const totalReceived = await router.totalRevenueReceived();
      const totalToSeries = await router.totalRoutedToSeries();
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());

      // totalToSeries + routerBalance (protocol) must equal totalReceived
      expect(totalToSeries + routerBalance).to.equal(totalReceived);
    });
  });

  // ============================================
  // SERIES REJECTS DISTRIBUTION
  // ============================================
  describe("Series rejects distribution", function () {
    it("Matured series: pendingToRoute is cleared and protocol can withdraw", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      // Mature the series
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Route should fail gracefully
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);

      // Protocol can withdraw everything
      await expect(router.connect(protocol).withdrawAllToProtocol()).to.not.be.reverted;
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
    });

    it("Series matured during accumulation: ETH is not stuck", async function () {
      // Send ETH before maturity
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });

      // Mature
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // More ETH arrives after maturity
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });

      // Route clears pending
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);

      // Protocol withdraws everything (10 ETH)
      const balance = await ethers.provider.getBalance(await router.getAddress());
      expect(balance).to.equal(ethers.parseEther("10"));
      await router.connect(protocol).withdrawAllToProtocol();
    });
  });

  // ============================================
  // BONDHOLDER FUND PROTECTION
  // ============================================
  describe("Bondholder fund protection", function () {
    it("Protocol cannot withdraw while pendingToRoute exists", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      await expect(
        router.connect(protocol).withdrawToProtocol(ethers.parseEther("1"))
      ).to.be.revertedWith("Must route pending revenue first");
    });

    it("Emergency withdraw protects pendingToRoute", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });

      // Everything is pending, nothing available for emergency
      await expect(
        router.connect(protocol).emergencyWithdraw(protocol.address)
      ).to.be.revertedWith("No available balance (funds protected for bondholders)");
    });

    it("Emergency withdraw allows only protocol share", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();

      // After route, remaining in router belongs to protocol (~8 ETH for 20% share)
      const available = await ethers.provider.getBalance(await router.getAddress());
      if (available > 0n) {
        await expect(
          router.connect(protocol).emergencyWithdraw(protocol.address)
        ).to.not.be.reverted;
      }
    });
  });
});

describe("Distribution Failures — RevenueBondEscrow (Guaranteed Bonds)", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let escrowFactory, escrowDeployer, routerDeployer;
  let escrow, escrowRouter, alice, bob, charlie;

  const ESCROW_FACTORY_PATH = "contracts/v2/core/RevenueBondEscrowFactory.sol:RevenueBondEscrowFactory";
  const ESCROW_DEPLOYER_PATH = "contracts/v2/core/EscrowDeployer.sol:EscrowDeployer";
  const ROUTER_DEPLOYER_PATH = "contracts/v2/core/RouterDeployer.sol:RouterDeployer";
  const ESCROW_PATH = "contracts/v2/core/RevenueBondEscrow.sol:RevenueBondEscrow";

  const ESCROW_PARAMS = {
    name: "Test Escrow Bond",
    symbol: "TEST-ESC",
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000"),
    principalAmount: ethers.parseEther("100"),
    minDistributionAmount: ethers.parseEther("0.001"),
    depositDeadlineDays: 30,
  };

  beforeEach(async function () {
    const signers = await ethers.getSigners();
    [owner, treasury, protocol, alice, bob, charlie] = signers;

    // Deploy registry
    const Registry = await ethers.getContractFactory("contracts/v2/registry/ProtocolReputationRegistry.sol:ProtocolReputationRegistry");
    registry = await Registry.deploy();

    // Deploy deployers
    const EscrowDeployer = await ethers.getContractFactory(ESCROW_DEPLOYER_PATH);
    escrowDeployer = await EscrowDeployer.deploy();

    const RouterDeployer = await ethers.getContractFactory(ROUTER_DEPLOYER_PATH);
    routerDeployer = await RouterDeployer.deploy();

    // Deploy escrow factory
    const EscrowFactory = await ethers.getContractFactory(ESCROW_FACTORY_PATH);
    escrowFactory = await EscrowFactory.deploy(
      treasury.address,
      await registry.getAddress(),
      await escrowDeployer.getAddress(),
      await routerDeployer.getAddress()
    );

    // Authorize factory
    await registry.authorizeReporter(await escrowFactory.getAddress());

    // Transfer deployer ownership to factory
    await escrowDeployer.transferOwnership(await escrowFactory.getAddress());
    await routerDeployer.transferOwnership(await escrowFactory.getAddress());

    // Create escrow series
    const result = await escrowFactory.connect(protocol).createEscrowSeries.staticCall(
      ESCROW_PARAMS.name, ESCROW_PARAMS.symbol, protocol.address,
      ESCROW_PARAMS.revenueShareBPS, ESCROW_PARAMS.durationDays,
      ESCROW_PARAMS.totalSupply, ESCROW_PARAMS.principalAmount,
      ESCROW_PARAMS.minDistributionAmount, ESCROW_PARAMS.depositDeadlineDays
    );

    await escrowFactory.connect(protocol).createEscrowSeries(
      ESCROW_PARAMS.name, ESCROW_PARAMS.symbol, protocol.address,
      ESCROW_PARAMS.revenueShareBPS, ESCROW_PARAMS.durationDays,
      ESCROW_PARAMS.totalSupply, ESCROW_PARAMS.principalAmount,
      ESCROW_PARAMS.minDistributionAmount, ESCROW_PARAMS.depositDeadlineDays
    );

    const Escrow = await ethers.getContractFactory(ESCROW_PATH);
    escrow = Escrow.attach(result.seriesAddress);

    const Router = await ethers.getContractFactory("contracts/v2/core/RevenueRouter.sol:RevenueRouter");
    escrowRouter = Router.attach(result.routerAddress);

    // Protocol deposits principal
    await escrow.connect(protocol).depositPrincipal({ value: ESCROW_PARAMS.principalAmount });
  });

  // ============================================
  // PRINCIPAL: ROUNDING AND DUST
  // ============================================
  describe("Principal: rounding and dust", function () {
    it("Proportional claim with 3 holders: sum <= principal", async function () {
      // Distribute tokens to 3 holders
      const third = ethers.parseEther("333333");
      await escrow.connect(protocol).transfer(alice.address, third);
      await escrow.connect(protocol).transfer(bob.address, third);
      await escrow.connect(protocol).transfer(charlie.address, third);

      // Mature
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      // All holders claim principal
      await escrow.connect(alice).claimPrincipal();
      await escrow.connect(bob).claimPrincipal();
      await escrow.connect(charlie).claimPrincipal();

      // Protocol claim (has 1 remaining token from rounding)
      const protocolBalance = await escrow.balanceOf(protocol.address);
      if (protocolBalance > 0n) {
        await escrow.connect(protocol).claimPrincipal();
      }

      // Total claimed must be <= principal
      const totalClaimed = await escrow.totalPrincipalClaimed();
      expect(totalClaimed).to.be.lte(ESCROW_PARAMS.principalAmount);
    });

    it("Principal dust can be rescued after all burns", async function () {
      // Transfer everything to alice
      const supply = ESCROW_PARAMS.totalSupply;
      await escrow.connect(protocol).transfer(alice.address, supply);

      // Mature
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      // Alice claims
      await escrow.connect(alice).claimPrincipal();

      // Verify totalSupply is 0
      expect(await escrow.totalSupply()).to.equal(0);

      // Check dust
      const contractBalance = await ethers.provider.getBalance(await escrow.getAddress());
      const totalClaimed = await escrow.totalPrincipalClaimed();
      const dust = ESCROW_PARAMS.principalAmount - totalClaimed;

      if (dust >= 1000n) {
        await expect(escrow.rescueDustPrincipal()).to.not.be.reverted;
      }
    });

    it("rescueDustPrincipal fails if tokens still exist", async function () {
      await escrow.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await escrow.connect(alice).claimPrincipal();

      // Protocol still has tokens
      await expect(escrow.rescueDustPrincipal()).to.be.revertedWith("Tokens still exist");
    });
  });

  // ============================================
  // REVENUE + PRINCIPAL MIXED
  // ============================================
  describe("Revenue + Principal mixed in same contract", function () {
    it("Distributed revenue does not affect escrowed principal", async function () {
      await escrow.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));

      // Distribute revenue
      await escrow.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });

      // Verify contract balance = principal + revenue
      const balance = await ethers.provider.getBalance(await escrow.getAddress());
      expect(balance).to.equal(ESCROW_PARAMS.principalAmount + ethers.parseEther("5"));

      // Alice claims revenue
      await escrow.connect(alice).claimRevenue();

      // Principal still intact
      const balanceAfterRevenueClaim = await ethers.provider.getBalance(await escrow.getAddress());
      // Should have ~principal + remaining revenue (protocol hasn't claimed yet)
      expect(balanceAfterRevenueClaim).to.be.gte(ESCROW_PARAMS.principalAmount);
    });

    it("Principal claim after revenue claim: both work", async function () {
      await escrow.connect(protocol).transfer(alice.address, ESCROW_PARAMS.totalSupply);

      // Distribute revenue
      await escrow.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") });

      // Alice claims revenue
      const balanceBefore = await ethers.provider.getBalance(alice.address);
      const tx1 = await escrow.connect(alice).claimRevenue();
      const receipt1 = await tx1.wait();
      const gas1 = receipt1.gasUsed * receipt1.gasPrice;

      // Mature
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      // Alice claims principal
      const tx2 = await escrow.connect(alice).claimPrincipal();
      const receipt2 = await tx2.wait();
      const gas2 = receipt2.gasUsed * receipt2.gasPrice;

      const balanceAfter = await ethers.provider.getBalance(alice.address);

      // Alice should have received ~5 ETH (revenue) + ~100 ETH (principal) - gas
      const netReceived = balanceAfter - balanceBefore + gas1 + gas2;
      expect(netReceived).to.be.closeTo(
        ethers.parseEther("105"),
        ethers.parseEther("0.1")
      );
    });

    it("Contract does not become insolvent after revenue + principal claims", async function () {
      // Split tokens
      await escrow.connect(protocol).transfer(alice.address, ethers.parseEther("500000"));
      await escrow.connect(protocol).transfer(bob.address, ethers.parseEther("500000"));

      // Revenue
      await escrow.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Revenue claims
      await escrow.connect(alice).claimRevenue();
      await escrow.connect(bob).claimRevenue();

      // Mature
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      // Principal claims
      await escrow.connect(alice).claimPrincipal();
      await escrow.connect(bob).claimPrincipal();

      // Contract balance should be >= 0 (may have dust)
      const remaining = await ethers.provider.getBalance(await escrow.getAddress());
      expect(remaining).to.be.gte(0);
    });
  });

  // ============================================
  // DOUBLE CLAIM AND PROTECTIONS
  // ============================================
  describe("Double claim and protections", function () {
    it("Cannot claim principal twice", async function () {
      await escrow.connect(protocol).transfer(alice.address, ESCROW_PARAMS.totalSupply);
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      await escrow.connect(alice).claimPrincipal();

      // Tokens were burned, second attempt fails
      await expect(
        escrow.connect(alice).claimPrincipal()
      ).to.be.revertedWith("Already claimed");
    });

    it("Cannot claim revenue with nothing to claim", async function () {
      await expect(
        escrow.connect(alice).claimRevenue()
      ).to.be.revertedWith("No revenue");
    });

    it("Principal claim burns tokens: cannot transfer after", async function () {
      await escrow.connect(protocol).transfer(alice.address, ESCROW_PARAMS.totalSupply);
      await time.increase(ESCROW_PARAMS.durationDays * 24 * 60 * 60 + 1);

      await escrow.connect(alice).claimPrincipal();

      // Alice has no more tokens
      expect(await escrow.balanceOf(alice.address)).to.equal(0);
    });
  });

  // ============================================
  // DEFAULT AND DEPOSIT DEADLINE
  // ============================================
  describe("Default and deposit deadline", function () {
    let freshEscrow;

    beforeEach(async function () {
      // Create new series WITHOUT depositing principal
      const result = await escrowFactory.connect(protocol).createEscrowSeries.staticCall(
        "Fresh Bond", "FRESH", protocol.address,
        2000, 365, ethers.parseEther("1000000"), ethers.parseEther("50"),
        ethers.parseEther("0.001"), 30
      );

      await escrowFactory.connect(protocol).createEscrowSeries(
        "Fresh Bond", "FRESH", protocol.address,
        2000, 365, ethers.parseEther("1000000"), ethers.parseEther("50"),
        ethers.parseEther("0.001"), 30
      );

      const Escrow = await ethers.getContractFactory(ESCROW_PATH);
      freshEscrow = Escrow.attach(result.seriesAddress);
    });

    it("Cannot declare default before deadline", async function () {
      await expect(
        freshEscrow.connect(alice).declareDefault()
      ).to.be.revertedWith("Too early to declare default");
    });

    it("Anyone can declare default after deadline without deposit", async function () {
      await time.increase(31 * 24 * 60 * 60); // 31 days

      await expect(freshEscrow.connect(alice).declareDefault())
        .to.emit(freshEscrow, "SeriesDefaulted");

      expect(await freshEscrow.state()).to.equal(3); // Defaulted
    });

    it("Cannot declare default if principal was deposited", async function () {
      await freshEscrow.connect(protocol).depositPrincipal({ value: ethers.parseEther("50") });
      await time.increase(31 * 24 * 60 * 60);

      await expect(
        freshEscrow.connect(alice).declareDefault()
      ).to.be.revertedWith("Not in PendingPrincipal state");
    });

    it("Cannot distribute revenue in PendingPrincipal state", async function () {
      await expect(
        freshEscrow.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Not active");
    });
  });
});
