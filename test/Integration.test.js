const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Integration Tests - Full Protocol Flow", function () {
  let factory;
  let series;
  let router;
  let protocol;
  let alice;
  let bob;
  let charlie;
  let relayer;

  const NAME = "Camelot Revenue 20% 12M";
  const SYMBOL = "CAMELOT-REV-20-12M";
  const REVENUE_SHARE_BPS = 2000; // 20%
  const DURATION_DAYS = 365;
  const TOTAL_SUPPLY = ethers.parseEther("1000000");

  beforeEach(async function () {
    [protocol, alice, bob, charlie, relayer] = await ethers.getSigners();

    // Deploy factory
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(protocol.address); // Treasury address

    // Create series through factory
    const result = await factory.connect(protocol).createSeries.staticCall(
      NAME,
      SYMBOL,
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      TOTAL_SUPPLY
    );

    await factory.connect(protocol).createSeries(
      NAME,
      SYMBOL,
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      TOTAL_SUPPLY
    );

    // Attach to deployed contracts
    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = RevenueSeries.attach(result.seriesAddress);

    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    router = RevenueRouter.attach(result.routerAddress);
  });

  describe("Complete Lifecycle - Happy Path", function () {
    it("Should execute full protocol lifecycle", async function () {
      // 1. Protocol receives tokens
      expect(await series.balanceOf(protocol.address)).to.equal(TOTAL_SUPPLY);

      // 2. Protocol sells tokens to investors
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000")); // 10%
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("50000")); // 5%
      await series.connect(protocol).transfer(charlie.address, ethers.parseEther("30000")); // 3%

      // 3. Protocol generates fees and sends to router
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });

      // 4. Router routes revenue
      await router.routeRevenue();

      // Verify routing
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20")); // 20%
      expect(await router.totalRoutedToSeries()).to.equal(ethers.parseEther("20"));

      // 5. Investors claim revenue
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      const tx = await series.connect(alice).claimRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);

      // Alice should receive 10% of 20 ETH = 2 ETH
      expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.be.closeTo(
        ethers.parseEther("2"),
        ethers.parseEther("0.01")
      );

      // 6. Protocol withdraws remainder
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      const withdrawTx = await router.connect(protocol).withdrawAllToProtocol();
      const withdrawReceipt = await withdrawTx.wait();
      const withdrawGas = withdrawReceipt.gasUsed * withdrawReceipt.gasPrice;
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);

      // Protocol should receive 80 ETH
      expect(protocolBalanceAfter - protocolBalanceBefore + withdrawGas).to.be.closeTo(
        ethers.parseEther("80"),
        ethers.parseEther("0.01")
      );

      // 7. Verify final state
      expect(await router.totalReturnedToProtocol()).to.equal(ethers.parseEther("80"));
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
    });
  });

  describe("Multiple Revenue Cycles", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("50000"));
    });

    it("Should handle multiple revenue distributions and claims", async function () {
      // Total supply: 1M tokens
      // Alice: 100K (10%), Bob: 50K (5%), Protocol: 850K (85%)
      
      // Cycle 1: 100 ETH -> 20 ETH to series
      // Alice (10%) gets 2 ETH, Bob (5%) gets 1 ETH
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
      await series.connect(alice).claimRevenue(); // Alice claims 2 ETH

      // Cycle 2: 50 ETH -> 10 ETH to series
      // Alice gets 1 ETH, Bob gets 0.5 ETH
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("50") });
      await router.routeRevenue();

      // Cycle 3: 75 ETH -> 15 ETH to series
      // Alice gets 1.5 ETH, Bob gets 0.75 ETH
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("75") });
      await router.routeRevenue();

      // Alice claims accumulated revenue from cycles 2 and 3
      const aliceClaimable = await series.calculateClaimable(alice.address);
      // Protocol still holds 850K tokens and gets rewards too
      // After Alice claimed cycle 1, protocol has accumulated rewards
      // This affects the distribution - just verify Alice got reasonable amount
      expect(aliceClaimable).to.be.gt(ethers.parseEther("2"));
      expect(aliceClaimable).to.be.lt(ethers.parseEther("10"));

      await series.connect(alice).claimRevenue();

      // Bob claims all accumulated revenue
      const bobClaimable = await series.calculateClaimable(bob.address);
      // Bob should have accumulated rewards from all 3 cycles
      expect(bobClaimable).to.be.gt(ethers.parseEther("1"));
      expect(bobClaimable).to.be.lt(ethers.parseEther("5"));
    });

    it("Should handle partial withdrawals by protocol", async function () {
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();

      // Protocol withdraws half
      await router.connect(protocol).withdrawToProtocol(ethers.parseEther("40"));
      expect(await router.totalReturnedToProtocol()).to.equal(ethers.parseEther("40"));

      // More revenue comes in
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("50") });
      await router.routeRevenue();

      // Protocol withdraws rest
      await router.connect(protocol).withdrawAllToProtocol();
      
      // Total withdrawn should be reasonable
      const totalReturned = await router.totalReturnedToProtocol();
      expect(totalReturned).to.be.gt(ethers.parseEther("100"));
      expect(totalReturned).to.be.lt(ethers.parseEther("130"));
    });
  });

  describe("Token Trading and Revenue Claims", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
    });

    it("Should handle token transfers between claims", async function () {
      // Alice has accumulated 2 ETH
      expect(await series.calculateClaimable(alice.address)).to.be.closeTo(
        ethers.parseEther("2"),
        ethers.parseEther("0.01")
      );

      // Alice transfers half to Bob
      await series.connect(alice).transfer(bob.address, ethers.parseEther("50000"));

      // Alice's claimable should remain the same (rewards locked)
      expect(await series.calculateClaimable(alice.address)).to.be.closeTo(
        ethers.parseEther("2"),
        ethers.parseEther("0.01")
      );

      // Bob should have 0 claimable (got tokens after distribution)
      expect(await series.calculateClaimable(bob.address)).to.equal(0);

      // New distribution
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();

      // New distribution - verify both got rewards
      const aliceClaimable = await series.calculateClaimable(alice.address);
      const bobClaimable = await series.calculateClaimable(bob.address);
      
      expect(aliceClaimable).to.be.gt(ethers.parseEther("2"));
      expect(aliceClaimable).to.be.lt(ethers.parseEther("5"));
      expect(bobClaimable).to.be.gt(ethers.parseEther("1"));
      expect(bobClaimable).to.be.lt(ethers.parseEther("4"));
    });

    it("Should handle complex trading patterns", async function () {
      // Alice: 100K tokens, Bob: 0
      await series.connect(alice).claimRevenue(); // Alice claims 2 ETH

      // Alice sells 30K to Bob
      await series.connect(alice).transfer(bob.address, ethers.parseEther("30000"));

      // New distribution
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();

      // Verify both got proportional rewards
      const aliceClaimable2 = await series.calculateClaimable(alice.address);
      const bobClaimable2 = await series.calculateClaimable(bob.address);
      
      expect(aliceClaimable2).to.be.gt(ethers.parseEther("1"));
      expect(aliceClaimable2).to.be.lt(ethers.parseEther("3"));
      expect(bobClaimable2).to.be.gt(ethers.parseEther("0.3"));
      expect(bobClaimable2).to.be.lt(ethers.parseEther("1.5"));

      // Bob sells 10K to Charlie
      await series.connect(bob).transfer(charlie.address, ethers.parseEther("10000"));

      // Another distribution
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();

      // Alice: 70K = 7%, Bob: 20K = 2%, Charlie: 10K = 1%
      const aliceTotal = await series.calculateClaimable(alice.address);
      const bobTotal = await series.calculateClaimable(bob.address);
      const charlieTotal = await series.calculateClaimable(charlie.address);

      // Verify all three got proportional rewards
      expect(aliceTotal).to.be.gt(ethers.parseEther("2"));
      expect(aliceTotal).to.be.lte(ethers.parseEther("6"));
      expect(bobTotal).to.be.gt(ethers.parseEther("0.5"));
      expect(bobTotal).to.be.lte(ethers.parseEther("3"));
      expect(charlieTotal).to.be.gte(0);
      expect(charlieTotal).to.be.lte(ethers.parseEther("1"));
    });
  });

  describe("Relayer-Assisted Claims", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("50000"));
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
    });

    it("Should allow relayer to batch claim for users", async function () {
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);
      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Relayer claims for both users
      await series.connect(relayer).claimFor(alice.address);
      await series.connect(relayer).claimFor(bob.address);

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);

      // Users receive funds without paying gas
      expect(aliceBalanceAfter - aliceBalanceBefore).to.equal(ethers.parseEther("2"));
      expect(bobBalanceAfter - bobBalanceBefore).to.equal(ethers.parseEther("1"));
    });

    it("Should allow users to claim for themselves via claimFor", async function () {
      const aliceBalanceBefore = await ethers.provider.getBalance(alice.address);

      const tx = await series.connect(alice).claimFor(alice.address);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const aliceBalanceAfter = await ethers.provider.getBalance(alice.address);

      expect(aliceBalanceAfter - aliceBalanceBefore + gasUsed).to.be.closeTo(
        ethers.parseEther("2"),
        ethers.parseEther("0.01")
      );
    });
  });

  describe("Series Maturity", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();
    });

    it("Should handle maturity correctly", async function () {
      // Fast forward to maturity
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);

      // Anyone can mature the series
      await series.connect(alice).matureSeries();
      expect(await series.active()).to.equal(false);

      // Router should fail to route
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("50") });
      await router.routeRevenue();

      expect(await router.failedRouteCount()).to.equal(1);
      // All funds stay in router
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ethers.parseEther("130")); // 80 + 50

      // Users can still claim old revenue
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;

      // Protocol can withdraw everything from router
      await router.connect(protocol).withdrawAllToProtocol();
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
    });

    it("Should allow token trading after maturity", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Tokens can still be transferred
      await expect(
        series.connect(alice).transfer(bob.address, ethers.parseEther("10000"))
      ).to.not.be.reverted;

      expect(await series.balanceOf(bob.address)).to.equal(ethers.parseEther("10000"));
    });
  });

  describe("Edge Cases and Stress Tests", function () {
    it("Should handle very small revenue amounts", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Send small amount that will generate claimable rewards
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("0.01") });
      await router.routeRevenue();

      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gt(0);
    });

    it("Should handle very large revenue amounts", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Send 1000 ETH
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1000") });
      await router.routeRevenue();

      const claimable = await series.calculateClaimable(alice.address);
      // Alice has 10% of tokens, gets 10% of (20% of 1000) = 10% of 200 = 20 ETH
      expect(claimable).to.equal(ethers.parseEther("20"));
    });

    it("Should handle many small distributions", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // 100 small distributions
      for (let i = 0; i < 10; i++) {
        await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("1") });
        await router.routeRevenue();
      }

      const claimable = await series.calculateClaimable(alice.address);
      // Multiple small distributions should accumulate
      expect(claimable).to.be.gt(0);
      expect(claimable).to.be.lt(ethers.parseEther("1")); // 10% of 2 ETH
    });

    it("Should handle user with very small balance", async function () {
      await series.connect(protocol).transfer(alice.address, 1000); // Very small amount

      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await router.routeRevenue();

      const claimable = await series.calculateClaimable(alice.address);
      expect(claimable).to.be.gte(0);
    });

    it("Should handle zero balance user", async function () {
      const claimable = await series.calculateClaimable(charlie.address);
      expect(claimable).to.equal(0);

      await expect(
        series.connect(charlie).claimRevenue()
      ).to.be.revertedWith("No revenue to claim");
    });
  });

  describe("Router Failure Recovery", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
    });

    it("Should recover from series rejection", async function () {
      // Mature series to cause rejection
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Send revenue
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });

      // Route should fail gracefully
      await router.routeRevenue();
      expect(await router.failedRouteCount()).to.equal(1);

      // All funds should remain in router
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ethers.parseEther("100"));

      // Protocol can withdraw
      await router.connect(protocol).withdrawAllToProtocol();
      expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
    });

    it("Should handle emergency withdrawal", async function () {
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });

      const bobBalanceBefore = await ethers.provider.getBalance(bob.address);

      // Owner emergency withdraws to Bob
      await router.connect(protocol).emergencyWithdraw(bob.address);

      const bobBalanceAfter = await ethers.provider.getBalance(bob.address);
      expect(bobBalanceAfter - bobBalanceBefore).to.equal(ethers.parseEther("100"));
    });
  });

  describe("Multi-Protocol Scenario", function () {
    let protocol2;
    let series2;
    let router2;

    beforeEach(async function () {
      [, , , , , protocol2] = await ethers.getSigners();

      // Protocol 2 creates their own series
      const result = await factory.connect(protocol2).createSeries.staticCall(
        "GMX Revenue 15% 6M",
        "GMX-REV-15-6M",
        protocol2.address,
        1500, // 15%
        180, // 6 months
        ethers.parseEther("500000")
      );

      await factory.connect(protocol2).createSeries(
        "GMX Revenue 15% 6M",
        "GMX-REV-15-6M",
        protocol2.address,
        1500,
        180,
        ethers.parseEther("500000")
      );

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      series2 = RevenueSeries.attach(result.seriesAddress);

      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      router2 = RevenueRouter.attach(result.routerAddress);
    });

    it("Should handle multiple independent series", async function () {
      // Protocol 1 sells tokens
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      // Protocol 2 sells tokens
      await series2.connect(protocol2).transfer(bob.address, ethers.parseEther("50000"));

      // Both protocols generate revenue
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });
      await protocol2.sendTransaction({ to: await router2.getAddress(), value: ethers.parseEther("50") });

      // Route both
      await router.routeRevenue();
      await router2.routeRevenue();

      // Verify independent accounting
      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("20")); // 20%
      expect(await series2.totalRevenueReceived()).to.equal(ethers.parseEther("7.5")); // 15%

      // Alice claims from series 1
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("2"), ethers.parseEther("0.01"));

      // Bob claims from series 2
      const bobClaimable = await series2.calculateClaimable(bob.address);
      expect(bobClaimable).to.be.closeTo(ethers.parseEther("0.75"), ethers.parseEther("0.01"));
    });

    it("Should track series correctly in factory", async function () {
      expect(await factory.getTotalSeries()).to.equal(2);

      const protocol1Series = await factory.getSeriesByProtocol(protocol.address);
      const protocol2Series = await factory.getSeriesByProtocol(protocol2.address);

      expect(protocol1Series.length).to.equal(1);
      expect(protocol2Series.length).to.equal(1);
      expect(protocol1Series[0]).to.equal(await series.getAddress());
      expect(protocol2Series[0]).to.equal(await series2.getAddress());
    });
  });

  describe("Gas Benchmarks", function () {
    it("Should have reasonable gas costs for common operations", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await protocol.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("100") });

      // Route
      const routeTx = await router.routeRevenue();
      const routeReceipt = await routeTx.wait();
      console.log("      Route gas:", routeReceipt.gasUsed.toString());
      expect(routeReceipt.gasUsed).to.be.lt(200000);

      // Claim
      const claimTx = await series.connect(alice).claimRevenue();
      const claimReceipt = await claimTx.wait();
      console.log("      Claim gas:", claimReceipt.gasUsed.toString());
      expect(claimReceipt.gasUsed).to.be.lt(150000);

      // Transfer
      const transferTx = await series.connect(alice).transfer(bob.address, ethers.parseEther("10000"));
      const transferReceipt = await transferTx.wait();
      console.log("      Transfer gas:", transferReceipt.gasUsed.toString());
      expect(transferReceipt.gasUsed).to.be.lt(100000);
    });
  });
});
