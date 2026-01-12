const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Pausable - Mainnet Grade Tests", function () {
  let factory, series, router;
  let owner, treasury, protocol, holder;
  
  const VALID_CONFIG = {
    name: "Test Series",
    symbol: "TEST",
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000")
  };

  beforeEach(async function () {
    [owner, treasury, protocol, holder] = await ethers.getSigners();
    
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(treasury.address);
    await factory.waitForDeployment();
    
    // Create a series for testing
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
    
    // Transfer some tokens to holder for claim tests
    await series.connect(protocol).transfer(holder.address, ethers.parseEther("100000"));
  });

  describe("1) Factory Pausable", function () {
    it("When paused: createSeries() reverts", async function () {
      await factory.pause();
      
      await expect(
        factory.connect(protocol).createSeries(
          "Another Series",
          "ANOTHER",
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("After unpause: createSeries() works normally", async function () {
      await factory.pause();
      await factory.unpause();
      
      const tx = await factory.connect(protocol).createSeries(
        "Another Series",
        "ANOTHER",
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });
  });

  describe("2) Router Pausable", function () {
    beforeEach(async function () {
      // Transfer router ownership to owner for pause control
      await router.connect(protocol).transferOwnership(owner.address);
    });

    it("When paused: routeRevenue() reverts", async function () {
      // Send some ETH to router
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.1")
      });
      
      await router.pause();
      
      await expect(router.routeRevenue())
        .to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("When paused: receiveAndRoute() reverts", async function () {
      await router.pause();
      
      await expect(
        router.receiveAndRoute({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("When paused: receive() STILL accepts ETH (funds park)", async function () {
      await router.pause();
      
      const balanceBefore = await ethers.provider.getBalance(await router.getAddress());
      
      // Send ETH directly via receive()
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.1")
      });
      
      const balanceAfter = await ethers.provider.getBalance(await router.getAddress());
      
      // ETH was accepted even though paused
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.1"));
    });

    it("When paused: protocol can still withdrawToProtocol()", async function () {
      // Send ETH to router
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.1")
      });
      
      await router.pause();
      
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      
      // Protocol withdraws while paused
      const tx = await router.connect(protocol).withdrawAllToProtocol();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      
      // Protocol received the ETH minus gas
      const expectedBalance = protocolBalanceBefore + ethers.parseEther("0.1") - gasUsed;
      expect(protocolBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.001"));
    });

    it("After unpause: routeRevenue() works normally", async function () {
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.1")
      });
      
      await router.pause();
      await router.unpause();
      
      const tx = await router.routeRevenue();
      await expect(tx).to.emit(router, "RevenueRouted");
    });
  });

  describe("3) Series - Claim NEVER Paused (Critical)", function () {
    beforeEach(async function () {
      // Send revenue to create claimable amount
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("1")
      });
      
      await router.connect(protocol).transferOwnership(owner.address);
      await router.routeRevenue();
    });

    it("Holder can claim even when Factory is paused", async function () {
      await factory.pause();
      
      const claimable = await series.calculateClaimable(holder.address);
      expect(claimable).to.be.gt(0);
      
      const tx = await series.connect(holder).claimRevenue();
      await expect(tx).to.emit(series, "RevenueClaimed");
    });

    it("Holder can claim even when Router is paused", async function () {
      await router.pause();
      
      const claimable = await series.calculateClaimable(holder.address);
      expect(claimable).to.be.gt(0);
      
      const tx = await series.connect(holder).claimRevenue();
      await expect(tx).to.emit(series, "RevenueClaimed");
    });

    it("Holder can claim even when BOTH Factory and Router are paused", async function () {
      await factory.pause();
      await router.pause();
      
      const claimable = await series.calculateClaimable(holder.address);
      expect(claimable).to.be.gt(0);
      
      const holderBalanceBefore = await ethers.provider.getBalance(holder.address);
      
      const tx = await series.connect(holder).claimRevenue();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const holderBalanceAfter = await ethers.provider.getBalance(holder.address);
      
      // Holder received revenue minus gas
      const netGain = holderBalanceAfter - holderBalanceBefore + gasUsed;
      expect(netGain).to.equal(claimable);
    });
  });

  describe("4) Pause Permissions", function () {
    it("Only owner can pause Factory", async function () {
      await expect(
        factory.connect(protocol).pause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Only owner can unpause Factory", async function () {
      await factory.pause();
      
      await expect(
        factory.connect(protocol).unpause()
      ).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Only owner can pause Router", async function () {
      await router.connect(protocol).transferOwnership(owner.address);
      
      await expect(
        router.connect(protocol).pause()
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Only owner can unpause Router", async function () {
      await router.connect(protocol).transferOwnership(owner.address);
      await router.pause();
      
      await expect(
        router.connect(protocol).unpause()
      ).to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });
  });

  describe("5) Pause State Persistence", function () {
    it("Factory pause state persists across transactions", async function () {
      await factory.pause();
      
      // Try multiple times
      for (let i = 0; i < 3; i++) {
        await expect(
          factory.connect(protocol).createSeries(
            `Series ${i}`,
            `S${i}`,
            protocol.address,
            VALID_CONFIG.revenueShareBPS,
            VALID_CONFIG.durationDays,
            VALID_CONFIG.totalSupply
          )
        ).to.be.revertedWithCustomError(factory, "EnforcedPause");
      }
    });

    it("Router pause state persists across transactions", async function () {
      await router.connect(protocol).transferOwnership(owner.address);
      await router.pause();
      
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.1")
      });
      
      // Try multiple times
      for (let i = 0; i < 3; i++) {
        await expect(router.routeRevenue())
          .to.be.revertedWithCustomError(router, "EnforcedPause");
      }
    });
  });
});
