const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Invariants - Mainnet Grade Tests", function () {
  let factory, series, router;
  let owner, treasury, protocol, holder1, holder2;
  
  const VALID_CONFIG = {
    name: "Test Series",
    symbol: "TEST",
    revenueShareBPS: 2000, // 20%
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000")
  };

  beforeEach(async function () {
    [owner, treasury, protocol, holder1, holder2] = await ethers.getSigners();
    
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(treasury.address);
    await factory.waitForDeployment();
    
    const tx = await factory.connect(protocol).createSeries(
      VALID_CONFIG.name,
      VALID_CONFIG.symbol,
      protocol.address,
      VALID_CONFIG.revenueShareBPS,
      VALID_CONFIG.durationDays,
      VALID_CONFIG.totalSupply
    );
    
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try {
        const parsed = factory.interface.parseLog(log);
        return parsed?.name === "SeriesCreated";
      } catch {
        return false;
      }
    });
    
    const parsedEvent = factory.interface.parseLog(event);
    const seriesAddress = parsedEvent.args[0];
    const routerAddress = parsedEvent.args[1];
    
    series = await ethers.getContractAt("RevenueSeries", seriesAddress);
    router = await ethers.getContractAt("RevenueRouter", routerAddress);
    
    // Distribute tokens to holders
    await series.connect(protocol).transfer(holder1.address, ethers.parseEther("400000"));
    await series.connect(protocol).transfer(holder2.address, ethers.parseEther("300000"));
    // Protocol keeps 300000
  });

  describe("1) Money Never Disappears", function () {
    it("Router: totalReceived >= totalRoutedToSeries + totalReturnedToProtocol", async function () {
      // Send multiple revenue batches
      const amounts = [
        ethers.parseEther("1"),
        ethers.parseEther("0.5"),
        ethers.parseEther("2")
      ];
      
      for (const amount of amounts) {
        await owner.sendTransaction({
          to: await router.getAddress(),
          value: amount
        });
        await router.routeRevenue();
      }
      
      const status = await router.getRouterStatus();
      const totalReceived = status[1];
      const totalToSeries = status[2];
      const totalToProtocol = status[3];
      
      // Invariant: received >= distributed
      expect(totalReceived).to.be.gte(totalToSeries + totalToProtocol);
    });

    it("Series: sum(claimed) <= totalRevenueReceived", async function () {
      // Send revenue
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      
      const totalRevenueBefore = await series.totalRevenueReceived();
      
      // Track claimable amounts before claiming
      const claimable1 = await series.calculateClaimable(holder1.address);
      const claimable2 = await series.calculateClaimable(holder2.address);
      const claimableProtocol = await series.calculateClaimable(protocol.address);
      
      // Holders claim
      await series.connect(holder1).claimRevenue();
      await series.connect(holder2).claimRevenue();
      await series.connect(protocol).claimRevenue();
      
      const totalClaimed = claimable1 + claimable2 + claimableProtocol;
      
      // Invariant: total claimed <= total received
      expect(totalClaimed).to.be.lte(totalRevenueBefore);
    });

    it("Router balance + distributed == totalReceived", async function () {
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      
      const status = await router.getRouterStatus();
      const currentBalance = status[0];
      const totalReceived = status[1];
      const totalToSeries = status[2];
      const totalToProtocol = status[3];
      
      // Invariant: balance + distributed == received
      expect(currentBalance + totalToSeries + totalToProtocol).to.equal(totalReceived);
    });
  });

  describe("2) Money Never Gets Stuck", function () {
    it("Protocol can always withdraw from router", async function () {
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      
      if (routerBalance > 0n) {
        const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
        
        const tx = await router.connect(protocol).withdrawAllToProtocol();
        const receipt = await tx.wait();
        const gasUsed = receipt.gasUsed * receipt.gasPrice;
        
        const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
        
        // Protocol received the balance
        expect(protocolBalanceAfter).to.be.gt(protocolBalanceBefore - gasUsed);
      }
    });

    it("Holders can always claim from series (even if router fails)", async function () {
      // Send revenue
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      
      // Pause router (simulating failure)
      await router.connect(protocol).transferOwnership(owner.address);
      await router.pause();
      
      // Holders can still claim
      const claimable = await series.calculateClaimable(holder1.address);
      expect(claimable).to.be.gt(0);
      
      const tx = await series.connect(holder1).claimRevenue();
      await expect(tx).to.emit(series, "RevenueClaimed");
    });

    it("ETH sent to paused router can be withdrawn", async function () {
      await router.connect(protocol).transferOwnership(owner.address);
      await router.pause();
      
      // Send ETH while paused
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      expect(routerBalance).to.equal(ethers.parseEther("1"));
      
      // Protocol can withdraw
      await router.connect(protocol).withdrawAllToProtocol();
      
      const routerBalanceAfter = await ethers.provider.getBalance(await router.getAddress());
      expect(routerBalanceAfter).to.equal(0);
    });
  });

  describe("3) Ownership & Admin Surface", function () {
    it("Protocol is owner of series after creation", async function () {
      const seriesOwner = await series.owner();
      expect(seriesOwner).to.equal(protocol.address);
    });

    it("Protocol is owner of router after creation", async function () {
      const routerOwner = await router.owner();
      expect(routerOwner).to.equal(protocol.address);
    });

    it("Only owner can set fees on Factory", async function () {
      await expect(
        factory.connect(protocol).setFees(true, ethers.parseEther("0.01"))
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      
      // Owner can
      await factory.setFees(true, ethers.parseEther("0.01"));
    });

    it("Only owner can pause Factory", async function () {
      await expect(
        factory.connect(protocol).pause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      
      // Owner can
      await factory.pause();
    });

    it("Only owner can set treasury on Factory", async function () {
      await expect(
        factory.connect(protocol).setTreasury(holder1.address)
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      
      // Owner can
      await factory.setTreasury(holder1.address);
    });
  });

  describe("4) Maturity Boundary with Router", function () {
    // Using existing series from beforeEach (365 days)
    // We'll use time manipulation to test maturity

    it("Before maturity: router distributes normally", async function () {
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      
      const tx = await router.routeRevenue();
      await expect(tx).to.emit(router, "RevenueRouted");
      
      const status = await router.getRouterStatus();
      expect(status[2]).to.be.gt(0); // totalToSeries > 0
    });

    it("After maturity: router stops routing to series", async function () {
      // Fast forward time past maturity
      await ethers.provider.send("evm_increaseTime", [366 * 24 * 60 * 60]); // 366 days
      await ethers.provider.send("evm_mine");
      
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      
      // Router should not route to matured series
      const tx = await router.routeRevenue();
      
      // Check that routing failed gracefully
      const receipt = await tx.wait();
      const failEvent = receipt.logs.find(log => {
        try {
          const parsed = router.interface.parseLog(log);
          return parsed?.name === "RouteAttemptFailed";
        } catch {
          return false;
        }
      });
      
      expect(failEvent).to.not.be.undefined;
    });

    it("After maturity: funds stay in router, protocol can withdraw", async function () {
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [366 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      
      await router.routeRevenue();
      
      const routerBalance = await ethers.provider.getBalance(await router.getAddress());
      expect(routerBalance).to.be.gt(0);
      
      // Protocol can withdraw
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      const tx = await router.connect(protocol).withdrawAllToProtocol();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      expect(protocolBalanceAfter).to.be.gt(protocolBalanceBefore - gasUsed);
    });

    it("After maturity: holders can still claim existing revenue", async function () {
      // Send revenue before maturity
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      
      // Fast forward past maturity
      await ethers.provider.send("evm_increaseTime", [366 * 24 * 60 * 60]);
      await ethers.provider.send("evm_mine");
      
      // Holders can still claim
      const claimable = await series.calculateClaimable(holder1.address);
      expect(claimable).to.be.gt(0);
      
      const tx = await series.connect(holder1).claimRevenue();
      await expect(tx).to.emit(series, "RevenueClaimed");
    });
  });

  describe("5) Fuzz-like Tests (Multiple Random Operations)", function () {
    it("Multiple revenue sends and routes maintain invariants", async function () {
      const iterations = 10;
      
      for (let i = 0; i < iterations; i++) {
        // Random amount between 0.01 and 1 ETH
        const amount = ethers.parseEther((Math.random() * 0.99 + 0.01).toFixed(4));
        
        await owner.sendTransaction({
          to: await router.getAddress(),
          value: amount
        });
        
        await router.routeRevenue();
        
        // Check invariant after each iteration
        const status = await router.getRouterStatus();
        const currentBalance = status[0];
        const totalReceived = status[1];
        const totalToSeries = status[2];
        const totalToProtocol = status[3];
        
        expect(currentBalance + totalToSeries + totalToProtocol).to.equal(totalReceived);
        expect(totalReceived).to.be.gte(totalToSeries + totalToProtocol);
      }
    });

    it("Multiple claims from different holders maintain invariants", async function () {
      // Send revenue
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("10")
      });
      await router.routeRevenue();
      
      // Track total claimed manually
      let totalClaimed = 0n;
      
      // First round of claims
      let claimable = await series.calculateClaimable(holder1.address);
      if (claimable > 0n) {
        await series.connect(holder1).claimRevenue();
        totalClaimed += claimable;
      }
      
      claimable = await series.calculateClaimable(holder2.address);
      if (claimable > 0n) {
        await series.connect(holder2).claimRevenue();
        totalClaimed += claimable;
      }
      
      claimable = await series.calculateClaimable(protocol.address);
      if (claimable > 0n) {
        await series.connect(protocol).claimRevenue();
        totalClaimed += claimable;
      }
      
      // Send more revenue
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("5")
      });
      await router.routeRevenue();
      
      // Second round of claims
      claimable = await series.calculateClaimable(holder1.address);
      if (claimable > 0n) {
        await series.connect(holder1).claimRevenue();
        totalClaimed += claimable;
      }
      
      claimable = await series.calculateClaimable(holder2.address);
      if (claimable > 0n) {
        await series.connect(holder2).claimRevenue();
        totalClaimed += claimable;
      }
      
      const totalRevenueNow = await series.totalRevenueReceived();
      
      // Invariant: total claimed <= total revenue
      expect(totalClaimed).to.be.lte(totalRevenueNow);
    });

    it("Random senders can send ETH without breaking invariants", async function () {
      const senders = [owner, holder1, holder2, protocol, treasury];
      
      for (let i = 0; i < 5; i++) {
        const randomSender = senders[Math.floor(Math.random() * senders.length)];
        const amount = ethers.parseEther((Math.random() * 0.5 + 0.01).toFixed(4));
        
        await randomSender.sendTransaction({
          to: await router.getAddress(),
          value: amount
        });
      }
      
      // Route all accumulated revenue
      await router.routeRevenue();
      
      // Check invariant
      const status = await router.getRouterStatus();
      const currentBalance = status[0];
      const totalReceived = status[1];
      const totalToSeries = status[2];
      const totalToProtocol = status[3];
      
      expect(currentBalance + totalToSeries + totalToProtocol).to.equal(totalReceived);
    });

    it("Dust amounts (1 wei) don't break accounting", async function () {
      // Send 1 wei
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: 1n
      });
      
      await router.routeRevenue();
      
      const status = await router.getRouterStatus();
      expect(status[1]).to.equal(1n); // totalReceived == 1 wei
      
      // Invariant still holds
      const currentBalance = status[0];
      const totalReceived = status[1];
      const totalToSeries = status[2];
      const totalToProtocol = status[3];
      
      expect(currentBalance + totalToSeries + totalToProtocol).to.equal(totalReceived);
    });
  });

  describe("6) Series Token Supply Invariants", function () {
    it("Total supply never changes", async function () {
      const totalSupplyBefore = await series.totalSupply();
      
      // Various operations
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      await router.routeRevenue();
      await series.connect(holder1).claimRevenue();
      
      const totalSupplyAfter = await series.totalSupply();
      
      expect(totalSupplyAfter).to.equal(totalSupplyBefore);
      expect(totalSupplyAfter).to.equal(VALID_CONFIG.totalSupply);
    });

    it("Sum of all balances == total supply", async function () {
      const balance1 = await series.balanceOf(holder1.address);
      const balance2 = await series.balanceOf(holder2.address);
      const balanceProtocol = await series.balanceOf(protocol.address);
      
      const totalSupply = await series.totalSupply();
      
      expect(balance1 + balance2 + balanceProtocol).to.equal(totalSupply);
    });
  });
});
