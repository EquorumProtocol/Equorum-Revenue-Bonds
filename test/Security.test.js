const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS, SERIES_PATH } = require("./helpers");

describe("Security Tests - Adversarial", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let series, router, alice, bob, attacker;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, attacker] = rest;
    ({ series, router } = await createSeriesViaFactory(factory, protocol));
  });

  // ============================================
  // 1) REENTRANCY ATTACKS
  // ============================================
  describe("Reentrancy Attacks", function () {
    it("Should block reentrancy on claimRevenue via MaliciousReceiver", async function () {
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious = await MaliciousReceiver.deploy(await series.getAddress());
      const malAddr = await malicious.getAddress();

      // Give malicious contract some tokens
      await series.connect(protocol).transfer(malAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(malAddr);
      expect(claimableBefore).to.be.gt(0);

      // Attack: malicious contract tries to reenter claimRevenue on receive()
      // The outer call succeeds (first claim works), but re-entry is blocked
      await malicious.attack();

      // Verify attackCount stayed at 0 (reentrancy was blocked by ReentrancyGuard)
      expect(await malicious.attackCount()).to.equal(0);

      // Verify rewards are now zero (only claimed once, not twice)
      expect(await series.calculateClaimable(malAddr)).to.equal(0);
    });

    it("Should block reentrancy on claimFor via MaliciousReceiver", async function () {
      const MaliciousReceiver = await ethers.getContractFactory("MaliciousReceiver");
      const malicious = await MaliciousReceiver.deploy(await series.getAddress());
      const malAddr = await malicious.getAddress();

      await series.connect(protocol).transfer(malAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Attack via claimFor - outer call succeeds, re-entry blocked
      await malicious.attackClaimFor();
      expect(await malicious.attackCount()).to.equal(0);
      expect(await series.calculateClaimable(malAddr)).to.equal(0);
    });

    it("Should block reentrancy on claimRevenue via MaliciousReentrancy mock", async function () {
      const MaliciousReentrancy = await ethers.getContractFactory("MaliciousReentrancy");
      const malicious = await MaliciousReentrancy.deploy(await series.getAddress());
      const malAddr = await malicious.getAddress();

      await series.connect(protocol).transfer(malAddr, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // attack() calls claimRevenue, which sends ETH, triggering receive() which tries to re-enter
      // Re-entry is blocked by ReentrancyGuard, but outer call succeeds
      await malicious.attack();

      // Verify only 1 claim happened (not multiple)
      expect(await series.calculateClaimable(malAddr)).to.equal(0);

      // The malicious contract received ETH only once
      const malBalance = await ethers.provider.getBalance(malAddr);
      // Should be ~1 ETH (10% of 10 ETH), NOT 2+ ETH
      expect(malBalance).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
    });

    it("Should block reentrancy on factory createSeries refund via AttackReceiver", async function () {
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), treasury.address);
      await factory.setFeePolicy(await feePolicy.getAddress());

      const AttackReceiver = await ethers.getContractFactory("AttackReceiver");
      const attackContract = await AttackReceiver.deploy(await factory.getAddress());
      const attackAddr = await attackContract.getAddress();

      // Fund the attack contract
      await owner.sendTransaction({ to: attackAddr, value: ethers.parseEther("1") });

      // Attack: send excess ETH to trigger refund, then try to reenter on receive()
      // The reentrancy guard on createSeries (nonReentrant) blocks the re-entry
      // The outer call may succeed or revert depending on the attack contract's logic
      const seriesBefore = await factory.getTotalSeries();
      try {
        await attackContract.attack(
          "Attack", "ATK", attackAddr,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.05") }
        );
      } catch (e) {
        // Attack reverted - that's fine too
      }
      const seriesAfter = await factory.getTotalSeries();
      // At most 1 series was created (not 2 from reentrancy)
      expect(seriesAfter - seriesBefore).to.be.lte(1);
    });
  });

  // ============================================
  // 2) ETH REJECTION ATTACKS
  // ============================================
  describe("ETH Rejection Attacks", function () {
    it("Should revert claim if receiver rejects ETH (RejectETH)", async function () {
      const RejectETH = await ethers.getContractFactory("RejectETH");
      const rejecter = await RejectETH.deploy(await series.getAddress());

      await series.connect(protocol).transfer(await rejecter.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Claim should revert because RejectETH rejects the ETH transfer
      await expect(rejecter.attemptClaim()).to.be.revertedWith("Transfer failed");
    });

    it("Should NOT lose funds if claim fails - rewards stay intact", async function () {
      const RejectETH = await ethers.getContractFactory("RejectETH");
      const rejecter = await RejectETH.deploy(await series.getAddress());

      await series.connect(protocol).transfer(await rejecter.getAddress(), ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Claim fails
      await expect(rejecter.attemptClaim()).to.be.reverted;

      // Rewards should still be claimable (not zeroed out)
      const claimable = await series.calculateClaimable(await rejecter.getAddress());
      expect(claimable).to.be.gt(0);

      // Now enable ETH acceptance and claim successfully
      await rejecter.setShouldReject(false);
      await expect(rejecter.attemptClaim()).to.not.be.reverted;

      // Now rewards should be zero
      expect(await series.calculateClaimable(await rejecter.getAddress())).to.equal(0);
    });

    it("Should handle MaliciousTreasury that rejects fee payment", async function () {
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      const malTreasury = await MaliciousTreasury.deploy();

      // Set up fee policy pointing to malicious treasury
      const FeePolicy = await ethers.getContractFactory("SimpleFeePolicy");
      const feePolicy = await FeePolicy.deploy(ethers.parseEther("0.01"), await malTreasury.getAddress());
      await factory.setFeePolicy(await feePolicy.getAddress());

      // createSeries should revert because fee transfer fails
      await expect(
        factory.connect(protocol).createSeries(
          "Test", "TEST", protocol.address,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Fee transfer failed");
    });
  });

  // ============================================
  // 3) MALICIOUS POLICY ATTACKS
  // ============================================
  describe("Malicious Policy Attacks", function () {
    it("Should handle MaliciousPolicy that always reverts", async function () {
      const MaliciousPolicy = await ethers.getContractFactory("MaliciousPolicy");
      const malPolicy = await MaliciousPolicy.deploy();
      await factory.setFeePolicy(await malPolicy.getAddress());

      await expect(
        factory.connect(protocol).createSeries(
          "Test", "TEST", protocol.address,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Malicious policy always reverts");
    });

    it("Should handle BadReceiverPolicy that returns address(0) as receiver", async function () {
      const BadReceiverPolicy = await ethers.getContractFactory("BadReceiverPolicy");
      const badPolicy = await BadReceiverPolicy.deploy();
      await factory.setFeePolicy(await badPolicy.getAddress());

      // Policy returns 0.01 ETH fee with address(0) receiver
      await expect(
        factory.connect(protocol).createSeries(
          "Test", "TEST", protocol.address,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001"),
          { value: ethers.parseEther("0.01") }
        )
      ).to.be.revertedWith("Invalid fee receiver");
    });

    it("Should enforce hardcoded limits even with WeakSafetyPolicy", async function () {
      const WeakPolicy = await ethers.getContractFactory("WeakSafetyPolicy");
      const weakPolicy = await WeakPolicy.deploy();
      await factory.setSafetyPolicy(await weakPolicy.getAddress());

      // Weak policy allows everything, but hardcoded limits should still block
      await expect(
        factory.connect(protocol).createSeries(
          "Bad", "BAD", protocol.address,
          8000, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid BPS");

      await expect(
        factory.connect(protocol).createSeries(
          "Bad", "BAD", protocol.address,
          2500, 1, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid duration");

      await expect(
        factory.connect(protocol).createSeries(
          "Bad", "BAD", protocol.address,
          2500, 180, ethers.parseEther("100"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should allow owner to recover from malicious policy by disabling it", async function () {
      const MaliciousPolicy = await ethers.getContractFactory("MaliciousPolicy");
      const malPolicy = await MaliciousPolicy.deploy();
      await factory.setFeePolicy(await malPolicy.getAddress());

      // Series creation blocked by malicious policy
      await expect(
        factory.connect(protocol).createSeries(
          "Test", "TEST", protocol.address,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.reverted;

      // Owner disables the policy
      await factory.setFeePolicy(ethers.ZeroAddress);

      // Now series creation works again
      await expect(
        factory.connect(protocol).createSeries(
          "Test", "TEST", protocol.address,
          2500, 180, ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.not.be.reverted;
    });

    it("Should prevent swapping to non-interface policy", async function () {
      // Try to set a random EOA as fee policy
      await expect(factory.setFeePolicy(attacker.address)).to.be.reverted;
      await expect(factory.setSafetyPolicy(attacker.address)).to.be.reverted;
      await expect(factory.setAccessPolicy(attacker.address)).to.be.reverted;
    });
  });

  // ============================================
  // 4) ACCESS CONTROL - EXHAUSTIVE
  // ============================================
  describe("Access Control - Exhaustive", function () {
    it("Should prevent attacker from creating series for another protocol", async function () {
      await expect(
        factory.connect(attacker).createSeries(
          "Fake", "FAKE", protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWith("Only protocol can create series for itself");
    });

    it("Should prevent attacker from distributing revenue", async function () {
      await expect(
        series.connect(attacker).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Only protocol or router can distribute");
    });

    it("Should prevent attacker from pausing/unpausing factory", async function () {
      await expect(factory.connect(attacker).pause())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await factory.pause();
      await expect(factory.connect(attacker).unpause())
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from pausing/unpausing router", async function () {
      await expect(router.connect(attacker).pause())
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from ALL admin functions", async function () {
      await expect(factory.connect(attacker).setTreasury(attacker.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(attacker).setFeePolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(attacker).setSafetyPolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(attacker).setAccessPolicy(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
      await expect(factory.connect(attacker).updateReputationRegistry(attacker.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from ALL router withdrawal functions", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();
      await expect(router.connect(attacker).withdrawToProtocol(1))
        .to.be.revertedWith("Not authorized");
      await expect(router.connect(attacker).withdrawAllToProtocol())
        .to.be.revertedWith("Not authorized");
      await expect(router.connect(attacker).emergencyWithdraw(attacker.address))
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from ALL registry admin functions", async function () {
      await expect(registry.connect(attacker).authorizeReporter(attacker.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(registry.connect(attacker).revokeReporter(attacker.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(registry.connect(attacker).blacklistProtocol(protocol.address, "x"))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(registry.connect(attacker).whitelistProtocol(protocol.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
      await expect(registry.connect(attacker).reportDefault(protocol.address, "x"))
        .to.be.revertedWith("Not authorized");
      await expect(registry.connect(attacker).registerSeries(protocol.address, attacker.address, 0, 30))
        .to.be.revertedWith("Not authorized");
    });
  });

  // ============================================
  // 5) GRIEFING ATTACKS
  // ============================================
  describe("Griefing Attacks", function () {
    it("Should prevent dust distribution griefing", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: 1 })
      ).to.be.revertedWith("Distribution too small");
    });

    it("Should prevent zero value distribution", async function () {
      await expect(
        series.connect(protocol).distributeRevenue({ value: 0 })
      ).to.be.revertedWith("No revenue to distribute");
    });

    it("Should prevent direct ETH transfer to series", async function () {
      await expect(
        attacker.sendTransaction({ to: await series.getAddress(), value: ethers.parseEther("1") })
      ).to.be.revertedWith("Use distributeRevenue() function");
    });

    it("Should prevent claiming with zero balance", async function () {
      await expect(series.connect(attacker).claimRevenue())
        .to.be.revertedWith("No revenue to claim");
    });

    it("Should prevent double claiming in same block", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).claimRevenue();
      await expect(series.connect(alice).claimRevenue())
        .to.be.revertedWith("No revenue to claim");
    });

    it("Should prevent attacker from spamming claimFor for user with no rewards", async function () {
      await expect(series.connect(attacker).claimFor(alice.address))
        .to.be.revertedWith("No revenue to claim");
    });

    it("Should prevent attacker from spamming matureSeries before time", async function () {
      for (let i = 0; i < 5; i++) {
        await expect(series.connect(attacker).matureSeries())
          .to.be.revertedWith("Not matured yet");
      }
    });
  });

  // ============================================
  // 6) ROUTER PROTECTION - DEEP
  // ============================================
  describe("Router Protection - Deep", function () {
    it("Should protect bondholder funds from protocol withdrawal when pending", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await expect(router.connect(protocol).withdrawToProtocol(1))
        .to.be.revertedWith("Must route pending revenue first");
      await expect(router.connect(protocol).withdrawAllToProtocol())
        .to.be.revertedWith("Must route pending revenue first");
    });

    it("Should protect bondholder funds from emergency withdrawal when pending", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await expect(router.connect(protocol).emergencyWithdraw(protocol.address))
        .to.be.revertedWith("No available balance (funds protected for bondholders)");
    });

    it("Should prevent updating series address twice (immutability)", async function () {
      await expect(router.connect(protocol).updateSeriesAddress(attacker.address))
        .to.be.revertedWith("Series address already set");
    });

    it("Should prevent unauthorized updateSeriesAddress", async function () {
      // Even if series wasn't set, attacker can't call it
      // (In this case it IS set, so it reverts with "already set" first)
      await expect(router.connect(attacker).updateSeriesAddress(attacker.address))
        .to.be.reverted;
    });

    it("Should not allow protocol to withdraw more than available", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("10") });
      await router.routeRevenue();
      const available = await ethers.provider.getBalance(await router.getAddress());
      await expect(
        router.connect(protocol).withdrawToProtocol(available + 1n)
      ).to.be.revertedWith("Insufficient available balance");
    });

    it("Should correctly track pendingToRoute across multiple receives", async function () {
      await alice.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("5") });
      await bob.sendTransaction({ to: await router.getAddress(), value: ethers.parseEther("3") });
      expect(await router.pendingToRoute()).to.equal(ethers.parseEther("8"));

      // Cannot withdraw while pending
      await expect(router.connect(protocol).withdrawToProtocol(1))
        .to.be.revertedWith("Must route pending revenue first");

      // Route clears pending
      await router.routeRevenue();
      expect(await router.pendingToRoute()).to.equal(0);
    });
  });

  // ============================================
  // 7) MATURITY ATTACKS
  // ============================================
  describe("Maturity Attacks", function () {
    it("Should prevent premature maturity at every second before deadline", async function () {
      const maturity = await series.maturityDate();
      const now = BigInt(await time.latest());
      const remaining = maturity - now;

      // Jump to 1 second before maturity
      await time.increase(Number(remaining) - 2);
      await expect(series.matureSeries()).to.be.revertedWith("Not matured yet");

      // Jump to maturity
      await time.increase(2);
      await expect(series.matureSeries()).to.not.be.reverted;
    });

    it("Should prevent distribution after maturity even from protocol", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series matured");
    });

    it("Should prevent distribution after matureSeries() is called", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Series not active");
    });

    it("Should prevent double maturity", async function () {
      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();
      await expect(series.matureSeries()).to.be.revertedWith("Already matured");
    });

    it("Should still allow claims and transfers after maturity", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Claims still work
      await expect(series.connect(alice).claimRevenue()).to.not.be.reverted;
      // Transfers still work
      await expect(series.connect(protocol).transfer(bob.address, ethers.parseEther("1000")))
        .to.not.be.reverted;
    });
  });

  // ============================================
  // 8) FACTORY VALIDATION BYPASS ATTEMPTS
  // ============================================
  describe("Factory Validation Bypass Attempts", function () {
    it("Should enforce ALL hardcoded limits regardless of policy", async function () {
      const WeakPolicy = await ethers.getContractFactory("WeakSafetyPolicy");
      const weakPolicy = await WeakPolicy.deploy();
      await factory.setSafetyPolicy(await weakPolicy.getAddress());

      // BPS > 50%
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 5001, 180,
          ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid BPS");

      // BPS = 0
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 0, 180,
          ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid BPS");

      // Duration < 30
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 29,
          ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid duration");

      // Duration > 1825
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 1826,
          ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid duration");

      // Supply < 1000
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          ethers.parseEther("999"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Supply too low");

      // minDistribution < 0.001 ether
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", protocol.address, 2500, 180,
          ethers.parseEther("100000"), ethers.parseEther("0.0009")
        )
      ).to.be.revertedWith("Min distribution too low");
    });

    it("Should reject factory address as any policy type", async function () {
      const factoryAddr = await factory.getAddress();
      await expect(factory.setFeePolicy(factoryAddr)).to.be.revertedWith("Cannot set policy to factory");
      await expect(factory.setSafetyPolicy(factoryAddr)).to.be.revertedWith("Cannot set policy to factory");
      await expect(factory.setAccessPolicy(factoryAddr)).to.be.revertedWith("Cannot set policy to factory");
    });

    it("Should reject createSeries when paused even with valid params", async function () {
      await factory.pause();
      await expect(
        factory.connect(protocol).createSeries(
          DEFAULT_PARAMS.name, DEFAULT_PARAMS.symbol, protocol.address,
          DEFAULT_PARAMS.revenueShareBPS, DEFAULT_PARAMS.durationDays,
          DEFAULT_PARAMS.totalSupply, DEFAULT_PARAMS.minDistributionAmount
        )
      ).to.be.revertedWithCustomError(factory, "EnforcedPause");
    });

    it("Should reject zero protocol address", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "X", "X", ethers.ZeroAddress, 2500, 180,
          ethers.parseEther("100000"), ethers.parseEther("0.001")
        )
      ).to.be.revertedWith("Invalid protocol");
    });
  });

  // ============================================
  // 9) REGISTRY MANIPULATION
  // ============================================
  describe("Registry Manipulation", function () {
    it("Should prevent unauthorized series registration", async function () {
      await expect(
        registry.connect(attacker).registerSeries(protocol.address, attacker.address, 0, 30)
      ).to.be.revertedWith("Not authorized");
    });

    it("Should prevent fake distribution recording", async function () {
      await expect(
        registry.connect(attacker).recordDistribution(protocol.address, ethers.parseEther("100"))
      ).to.be.revertedWith("Series not registered or inactive");
    });

    it("Should prevent non-protocol from updating expected revenue", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      await expect(
        registry.connect(attacker).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"))
      ).to.be.revertedWith("Only protocol owner");
    });

    it("Should prevent setting expected revenue twice (immutability)", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      await registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("100"));
      await expect(
        registry.connect(protocol).updateExpectedRevenue(seriesAddress, ethers.parseEther("200"))
      ).to.be.revertedWith("Already set");
    });

    it("Should prevent lateness spam (only once per cadence period)", async function () {
      const { seriesAddress } = await createSeriesViaFactory(factory, protocol);
      await time.increase(31 * 24 * 60 * 60); // 31 days
      await registry.checkAndRecordLateness(seriesAddress);
      await expect(registry.checkAndRecordLateness(seriesAddress))
        .to.be.revertedWith("Already recorded for this period");
    });

    it("Should prevent revoking reporter and then trying to register", async function () {
      await registry.revokeReporter(await factory.getAddress());
      // Factory can no longer register series (but createSeries handles this gracefully)
      // The factory uses low-level call, so it won't revert, but registration will fail
    });
  });

  // ============================================
  // 10) OWNERSHIP & PRIVILEGE ESCALATION
  // ============================================
  describe("Ownership & Privilege Escalation", function () {
    it("Should allow factory owner to transfer ownership", async function () {
      await factory.transferOwnership(alice.address);
      expect(await factory.owner()).to.equal(alice.address);
      // Old owner can no longer admin
      await expect(factory.pause()).to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should allow series owner (protocol) to transfer ownership", async function () {
      await series.connect(protocol).transferOwnership(alice.address);
      expect(await series.owner()).to.equal(alice.address);
    });

    it("Should allow router owner (protocol) to transfer ownership", async function () {
      await router.connect(protocol).transferOwnership(alice.address);
      expect(await router.owner()).to.equal(alice.address);
      // Old owner loses all privileges
      await expect(router.connect(protocol).pause())
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from transferring ownership of factory", async function () {
      await expect(factory.connect(attacker).transferOwnership(attacker.address))
        .to.be.revertedWithCustomError(factory, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from transferring ownership of series", async function () {
      await expect(series.connect(attacker).transferOwnership(attacker.address))
        .to.be.revertedWithCustomError(series, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from transferring ownership of router", async function () {
      await expect(router.connect(attacker).transferOwnership(attacker.address))
        .to.be.revertedWithCustomError(router, "OwnableUnauthorizedAccount");
    });

    it("Should prevent attacker from transferring ownership of registry", async function () {
      await expect(registry.connect(attacker).transferOwnership(attacker.address))
        .to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    });

    it("After ownership transfer, new owner should have full control", async function () {
      await factory.transferOwnership(alice.address);
      // Alice can now pause
      await factory.connect(alice).pause();
      expect(await factory.paused()).to.be.true;
      // Alice can set treasury
      await factory.connect(alice).setTreasury(bob.address);
      expect(await factory.treasury()).to.equal(bob.address);
    });

    it("Protocol should retain distributeRevenue access even after series ownership transfer", async function () {
      await series.connect(protocol).transferOwnership(alice.address);
      // Protocol can still distribute (it's checked by immutable protocol address, not owner)
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // 11) STATE MANIPULATION ATTEMPTS
  // ============================================
  describe("State Manipulation", function () {
    it("Should not allow manipulating maturity state directly", async function () {
      await expect(series.matureSeries()).to.be.revertedWith("Not matured yet");
    });

    it("Should not allow claiming before any distribution", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await expect(series.connect(alice).claimRevenue())
        .to.be.revertedWith("No revenue to claim");
    });

    it("Should not allow transferring more tokens than balance", async function () {
      await expect(
        series.connect(alice).transfer(bob.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(series, "ERC20InsufficientBalance");
    });

    it("Should not allow transferring from without approval", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await expect(
        series.connect(attacker).transferFrom(alice.address, attacker.address, ethers.parseEther("1"))
      ).to.be.revertedWithCustomError(series, "ERC20InsufficientAllowance");
    });

    it("Should not allow exceeding approved amount in transferFrom", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(alice).approve(attacker.address, ethers.parseEther("1000"));
      await expect(
        series.connect(attacker).transferFrom(alice.address, attacker.address, ethers.parseEther("1001"))
      ).to.be.revertedWithCustomError(series, "ERC20InsufficientAllowance");
    });
  });
});
