const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

describe("Pluggable Policies", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice] = rest;
  });

  // ============================================
  // SIMPLE FEE POLICY
  // ============================================
  describe("SimpleFeePolicy", function () {
    let feePolicy;
    const FEE = ethers.parseEther("0.01");

    beforeEach(async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      feePolicy = await FeePolicy.deploy(FEE, treasury.address);
      await feePolicy.waitForDeployment();
      await factory.setFeePolicy(await feePolicy.getAddress());
    });

    it("Should deploy with correct baseFee and receiver", async function () {
      expect(await feePolicy.baseFee()).to.equal(FEE);
      expect(await feePolicy.feeReceiver()).to.equal(treasury.address);
    });

    it("Should return isFeePolicy = true", async function () {
      expect(await feePolicy.isFeePolicy()).to.be.true;
    });

    it("Should charge fee on series creation", async function () {
      const balanceBefore = await ethers.provider.getBalance(treasury.address);
      await factory.connect(protocol).createSeries(
        DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
        DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
        DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount,
        { value: FEE }
      );
      const balanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(balanceAfter - balanceBefore).to.equal(FEE);
    });

    it("Should revert if insufficient fee", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount,
          { value: ethers.parseEther("0.005") }
        )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("Should refund excess fee", async function () {
      const balanceBefore = await ethers.provider.getBalance(protocol.address);
      const tx = await factory.connect(protocol).createSeries(
        DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
        DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
        DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount,
        { value: ethers.parseEther("0.02") }
      );
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(protocol.address);
      // Should have paid 0.01 fee + gas, refunded 0.01
      const spent = balanceBefore - balanceAfter;
      expect(spent).to.be.closeTo(FEE + gasUsed, ethers.parseEther("0.0001"));
    });

    it("Should emit FeeCollected event", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount,
          { value: FEE }
        )
      ).to.emit(factory, "FeeCollected");
    });

    it("Should allow owner to update baseFee", async function () {
      const newFee = ethers.parseEther("0.05");
      await expect(feePolicy.setBaseFee(newFee))
        .to.emit(feePolicy, "BaseFeeUpdated");
      expect(await feePolicy.baseFee()).to.equal(newFee);
    });

    it("Should allow owner to update feeReceiver", async function () {
      await expect(feePolicy.setFeeReceiver(alice.address))
        .to.emit(feePolicy, "FeeReceiverUpdated");
      expect(await feePolicy.feeReceiver()).to.equal(alice.address);
    });

    it("Should reject zero address feeReceiver", async function () {
      await expect(feePolicy.setFeeReceiver(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid receiver");
    });

    it("Should create series without fee when policy is disabled", async function () {
      await factory.setFeePolicy(ethers.ZeroAddress);
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // STRICT SAFETY POLICY
  // ============================================
  describe("StrictSafetyPolicy", function () {
    let safetyPolicy;

    beforeEach(async function () {
      const SafetyPolicy = await ethers.getContractFactory("StrictSafetyPolicy");
      safetyPolicy = await SafetyPolicy.deploy();
      await safetyPolicy.waitForDeployment();
      await factory.setSafetyPolicy(await safetyPolicy.getAddress());
    });

    it("Should return isSafetyPolicy = true", async function () {
      expect(await safetyPolicy.isSafetyPolicy()).to.be.true;
    });

    it("Should reject revenue share > 30% (strict max)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          4000, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Revenue share too high for strict policy");
    });

    it("Should accept revenue share = 30%", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          3000, 180,
          ethers.parseEther("100000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should reject duration < 90 days (strict min)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 60,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Duration too short for strict policy");
    });

    it("Should reject duration > 1095 days (strict max = 3 years)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, 1096,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Duration too long for strict policy");
    });

    it("Should reject supply < 10000 tokens (strict min)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          ethers.parseEther("5000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Supply too low for strict policy");
    });

    it("Should accept valid strict params", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          2500, 180,
          ethers.parseEther("100000"), DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should work normally after disabling safety policy", async function () {
      await factory.setSafetyPolicy(ethers.ZeroAddress);
      // Now 40% should pass (only core 50% limit applies)
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          4000, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // WHITELIST ACCESS POLICY
  // ============================================
  describe("WhitelistAccessPolicy", function () {
    let accessPolicy;

    beforeEach(async function () {
      const AccessPolicy = await ethers.getContractFactory("WhitelistAccessPolicy");
      accessPolicy = await AccessPolicy.deploy();
      await accessPolicy.waitForDeployment();
      await factory.setAccessPolicy(await accessPolicy.getAddress());
    });

    it("Should return isAccessPolicy = true", async function () {
      expect(await accessPolicy.isAccessPolicy()).to.be.true;
    });

    it("Should reject non-whitelisted protocol", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Access denied by policy");
    });

    it("Should allow whitelisted protocol", async function () {
      await accessPolicy.addToWhitelist(protocol.address);
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });

    it("Should allow batch whitelist", async function () {
      const otherProtocol = rest[1];
      await accessPolicy.batchAddToWhitelist([protocol.address, otherProtocol.address]);
      expect(await accessPolicy.whitelist(protocol.address)).to.be.true;
      expect(await accessPolicy.whitelist(otherProtocol.address)).to.be.true;
    });

    it("Should allow removing from whitelist", async function () {
      await accessPolicy.addToWhitelist(protocol.address);
      await accessPolicy.removeFromWhitelist(protocol.address);
      expect(await accessPolicy.whitelist(protocol.address)).to.be.false;
    });

    it("Should reject non-owner adding to whitelist", async function () {
      await expect(accessPolicy.connect(alice).addToWhitelist(protocol.address))
        .to.be.revertedWithCustomError(accessPolicy, "OwnableUnauthorizedAccount");
    });

    it("Should reject zero address in whitelist", async function () {
      await expect(accessPolicy.addToWhitelist(ethers.ZeroAddress))
        .to.be.revertedWith("Invalid protocol");
    });

    it("Should work permissionlessly after disabling access policy", async function () {
      await factory.setAccessPolicy(ethers.ZeroAddress);
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // POLICY MANAGEMENT (Factory Admin)
  // ============================================
  describe("Policy Management", function () {
    it("Should reject setting policy to factory address", async function () {
      await expect(factory.setFeePolicy(await factory.getAddress()))
        .to.be.revertedWith("Cannot set policy to factory");
      await expect(factory.setSafetyPolicy(await factory.getAddress()))
        .to.be.revertedWith("Cannot set policy to factory");
      await expect(factory.setAccessPolicy(await factory.getAddress()))
        .to.be.revertedWith("Cannot set policy to factory");
    });

    it("Should reject invalid interface for fee policy", async function () {
      await expect(factory.setFeePolicy(treasury.address)).to.be.reverted;
    });

    it("Should reject invalid interface for safety policy", async function () {
      await expect(factory.setSafetyPolicy(treasury.address)).to.be.reverted;
    });

    it("Should reject invalid interface for access policy", async function () {
      await expect(factory.setAccessPolicy(treasury.address)).to.be.reverted;
    });

    it("Should accept address(0) to disable fee policy", async function () {
      await factory.setFeePolicy(ethers.ZeroAddress);
      const policies = await factory.getPolicies();
      expect(policies.fee).to.equal(ethers.ZeroAddress);
    });

    it("Should accept address(0) to disable safety policy", async function () {
      await factory.setSafetyPolicy(ethers.ZeroAddress);
      const policies = await factory.getPolicies();
      expect(policies.safety).to.equal(ethers.ZeroAddress);
    });

    it("Should accept address(0) to disable access policy", async function () {
      await factory.setAccessPolicy(ethers.ZeroAddress);
      const policies = await factory.getPolicies();
      expect(policies.access).to.equal(ethers.ZeroAddress);
    });

    it("Should emit FeePolicyUpdated event", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const fp = await FeePolicy.deploy(0, treasury.address);
      await expect(factory.setFeePolicy(await fp.getAddress()))
        .to.emit(factory, "FeePolicyUpdated");
    });

    it("Should emit SafetyPolicyUpdated event", async function () {
      const SP = await ethers.getContractFactory("StrictSafetyPolicy");
      const sp = await SP.deploy();
      await expect(factory.setSafetyPolicy(await sp.getAddress()))
        .to.emit(factory, "SafetyPolicyUpdated");
    });

    it("Should emit AccessPolicyUpdated event", async function () {
      const AP = await ethers.getContractFactory("WhitelistAccessPolicy");
      const ap = await AP.deploy();
      await expect(factory.setAccessPolicy(await ap.getAddress()))
        .to.emit(factory, "AccessPolicyUpdated");
    });

    it("Should reject non-owner setting policies", async function () {
      await expect(factory.connect(protocol).setFeePolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(protocol).setSafetyPolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(protocol).setAccessPolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });
  });
});
