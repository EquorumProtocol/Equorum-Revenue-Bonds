const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RevenueSeriesFactory - Fees, Pausable, Limits", function () {
  let factory;
  let owner, treasury, protocol, user;
  
  const VALID_CONFIG = {
    name: "Test Series",
    symbol: "TEST",
    revenueShareBPS: 2000, // 20%
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000")
  };

  beforeEach(async function () {
    [owner, treasury, protocol, user] = await ethers.getSigners();
    
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(treasury.address);
    await factory.waitForDeployment();
  });

  describe("Factory Fee Tests", function () {
    it("Should create series without fee when feesEnabled=false", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should revert if feesEnabled=true and msg.value < creationFeeETH", async function () {
      const creationFee = ethers.parseEther("0.01");
      await factory.setFees(true, creationFee);
      
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: ethers.parseEther("0.005") } // Insufficient
        )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should send fee to treasury when feesEnabled=true", async function () {
      const creationFee = ethers.parseEther("0.01");
      await factory.setFees(true, creationFee);
      
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: creationFee }
      );
      
      await expect(tx).to.emit(factory, "FeeCollected")
        .withArgs(protocol.address, treasury.address, creationFee, "creation");
      
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(creationFee);
    });

    it("Should refund excess when msg.value > creationFeeETH", async function () {
      const creationFee = ethers.parseEther("0.01");
      const sentValue = ethers.parseEther("0.02");
      await factory.setFees(true, creationFee);
      
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: sentValue }
      );
      
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      const expectedBalance = protocolBalanceBefore - creationFee - gasUsed;
      
      expect(protocolBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.0001"));
    });

    it("Should allow msg.value=0 when feesEnabled=false", async function () {
      await factory.setFees(false, ethers.parseEther("0.01"));
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });
  });

  describe("Pausable Tests", function () {
    it("Should revert createSeries when Factory is paused", async function () {
      await factory.pause();
      
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("Should allow createSeries after unpause", async function () {
      await factory.pause();
      await factory.unpause();
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });
  });

  describe("Safety Limits Tests", function () {
    it("Should revert if revenueShareBPS > MAX (5000)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          5001, // > 50%
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should accept revenueShareBPS = MAX (5000)", async function () {
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        5000, // Exactly 50%
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
    });

    it("Should revert if duration < MIN (30 days)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          29, // < 30 days
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should revert if duration > MAX (1825 days)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          1826, // > 1825 days
          VALID_CONFIG.totalSupply
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should revert if supply < MIN (1000 tokens)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          ethers.parseEther("999") // < 1000
        )
      ).to.be.revertedWith("Supply too low");
    });
  });

  describe("Events Tests", function () {
    it("Should emit FeeCollected with correct values", async function () {
      const creationFee = ethers.parseEther("0.01");
      await factory.setFees(true, creationFee);
      
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: creationFee }
        )
      ).to.emit(factory, "FeeCollected")
        .withArgs(protocol.address, treasury.address, creationFee, "creation");
    });

    it("Should emit FeesConfigUpdated when setFees is called", async function () {
      const creationFee = ethers.parseEther("0.01");
      
      await expect(factory.setFees(true, creationFee))
        .to.emit(factory, "FeesConfigUpdated")
        .withArgs(true, creationFee);
    });

    it("Should emit TreasuryUpdated when setTreasury is called", async function () {
      const newTreasury = user.address;
      
      await expect(factory.setTreasury(newTreasury))
        .to.emit(factory, "TreasuryUpdated")
        .withArgs(newTreasury);
    });
  });

  describe("Router Pausable Tests", function () {
    let router;

    beforeEach(async function () {
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
      const routerAddress = parsedEvent.args[1];
      
      router = await ethers.getContractAt("RevenueRouter", routerAddress);
      await router.connect(protocol).transferOwnership(owner.address);
    });

    it("Should revert routeRevenue when Router is paused", async function () {
      await owner.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("0.01") });
      await router.pause();
      
      await expect(router.routeRevenue())
        .to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("Should revert receiveAndRoute when Router is paused", async function () {
      await router.pause();
      
      await expect(
        router.receiveAndRoute({ value: ethers.parseEther("0.01") })
      ).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("Should still accept ETH via receive() when Router is paused", async function () {
      await router.pause();
      
      const balanceBefore = await ethers.provider.getBalance(await router.getAddress());
      
      await owner.sendTransaction({
        to: await router.getAddress(),
        value: ethers.parseEther("0.01")
      });
      
      const balanceAfter = await ethers.provider.getBalance(await router.getAddress());
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.01"));
    });
  });
});
