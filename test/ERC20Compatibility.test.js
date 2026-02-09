const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { deployFullStack, createSeriesViaFactory, DEFAULT_PARAMS } = require("./helpers");

/**
 * ERC20 COMPATIBILITY TESTS
 * 
 * Realistic ERC20 behavior verification:
 * - Standard ERC20 interface compliance
 * - Zero-value transfers
 * - Self-transfers
 * - Approve/transferFrom edge cases
 * - getSeriesInfo snapshot consistency before/after transfers
 * - Permit (EIP-2612) check
 * - Interaction patterns that DeFi protocols would use
 */
describe("ERC20 Compatibility & Realistic Patterns", function () {
  let owner, treasury, protocol, rest, registry, factory;
  let alice, bob, charlie;

  beforeEach(async function () {
    ({ owner, treasury, protocol, rest, registry, factory } = await deployFullStack());
    [alice, bob, charlie] = rest;
  });

  // ============================================
  // 1) STANDARD ERC20 INTERFACE
  // ============================================
  describe("Standard ERC20 Interface", function () {
    it("Should have correct name, symbol, decimals", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol, {
        name: "My Revenue Bond", symbol: "MRB",
      });
      expect(await series.name()).to.equal("My Revenue Bond");
      expect(await series.symbol()).to.equal("MRB");
      expect(await series.decimals()).to.equal(18);
    });

    it("Should have correct totalSupply matching constructor param", async function () {
      const supply = ethers.parseEther("500000");
      const { series } = await createSeriesViaFactory(factory, protocol, {
        totalSupply: supply,
      });
      expect(await series.totalSupply()).to.equal(supply);
    });

    it("Should mint all tokens to protocol on creation", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.balanceOf(protocol.address)).to.equal(DEFAULT_PARAMS.totalSupply);
    });

    it("Should return 0 balance for addresses with no tokens", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.balanceOf(alice.address)).to.equal(0);
      expect(await series.balanceOf(ethers.ZeroAddress)).to.equal(0);
    });

    it("Should return 0 allowance by default", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      expect(await series.allowance(protocol.address, alice.address)).to.equal(0);
    });

    it("Should emit Transfer event on transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await expect(series.connect(protocol).transfer(alice.address, ethers.parseEther("1000")))
        .to.emit(series, "Transfer")
        .withArgs(protocol.address, alice.address, ethers.parseEther("1000"));
    });

    it("Should emit Approval event on approve", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await expect(series.connect(protocol).approve(alice.address, ethers.parseEther("5000")))
        .to.emit(series, "Approval")
        .withArgs(protocol.address, alice.address, ethers.parseEther("5000"));
    });
  });

  // ============================================
  // 2) ZERO-VALUE TRANSFERS
  // ============================================
  describe("Zero-Value Transfers", function () {
    it("Should allow zero-value transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await expect(series.connect(protocol).transfer(alice.address, 0)).to.not.be.reverted;
    });

    it("Should not change balances on zero-value transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const protocolBal = await series.balanceOf(protocol.address);
      const aliceBal = await series.balanceOf(alice.address);

      await series.connect(protocol).transfer(alice.address, 0);

      expect(await series.balanceOf(protocol.address)).to.equal(protocolBal);
      expect(await series.balanceOf(alice.address)).to.equal(aliceBal);
    });

    it("Should not affect rewards on zero-value transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(alice.address);

      // Zero transfer
      await series.connect(alice).transfer(bob.address, 0);

      const claimableAfter = await series.calculateClaimable(alice.address);
      expect(claimableAfter).to.equal(claimableBefore);
    });

    it("Should allow zero-value transferFrom", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
      await expect(
        series.connect(alice).transferFrom(protocol.address, bob.address, 0)
      ).to.not.be.reverted;
    });
  });

  // ============================================
  // 3) SELF-TRANSFERS
  // ============================================
  describe("Self-Transfers", function () {
    it("Should allow self-transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      await expect(
        series.connect(alice).transfer(alice.address, ethers.parseEther("50000"))
      ).to.not.be.reverted;
    });

    it("Should not change balance on self-transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      const balBefore = await series.balanceOf(alice.address);

      await series.connect(alice).transfer(alice.address, ethers.parseEther("50000"));

      expect(await series.balanceOf(alice.address)).to.equal(balBefore);
    });

    it("Should not affect rewards on self-transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(alice.address);
      await series.connect(alice).transfer(alice.address, ethers.parseEther("100000"));
      const claimableAfter = await series.calculateClaimable(alice.address);

      expect(claimableAfter).to.equal(claimableBefore);
    });

    it("Should handle self-transfer of entire balance", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      const bal = await series.balanceOf(alice.address);

      await series.connect(alice).transfer(alice.address, bal);
      expect(await series.balanceOf(alice.address)).to.equal(bal);
    });
  });

  // ============================================
  // 4) APPROVE / TRANSFERFROM EDGE CASES
  // ============================================
  describe("Approve / TransferFrom Edge Cases", function () {
    it("Should allow approve to zero", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
      await series.connect(protocol).approve(alice.address, 0);
      expect(await series.allowance(protocol.address, alice.address)).to.equal(0);
    });

    it("Should allow overwriting approval without first setting to zero", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
      await series.connect(protocol).approve(alice.address, ethers.parseEther("5000"));
      expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("5000"));
    });

    it("Should decrease allowance after transferFrom", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
      await series.connect(alice).transferFrom(protocol.address, bob.address, ethers.parseEther("300"));
      expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("700"));
    });

    it("Should revert transferFrom exceeding allowance", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("100"));
      await expect(
        series.connect(alice).transferFrom(protocol.address, bob.address, ethers.parseEther("101"))
      ).to.be.reverted;
    });

    it("Should revert transferFrom exceeding balance", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const balance = await series.balanceOf(protocol.address);
      await series.connect(protocol).approve(alice.address, balance + 1n);
      await expect(
        series.connect(alice).transferFrom(protocol.address, bob.address, balance + 1n)
      ).to.be.reverted;
    });

    it("Should handle max uint256 approval (infinite approve)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const maxUint = ethers.MaxUint256;
      await series.connect(protocol).approve(alice.address, maxUint);
      expect(await series.allowance(protocol.address, alice.address)).to.equal(maxUint);

      // Transfer should work and allowance should decrease (OZ behavior)
      await series.connect(alice).transferFrom(protocol.address, bob.address, ethers.parseEther("1000"));

      // OZ ERC20: infinite approval does NOT decrease
      const remaining = await series.allowance(protocol.address, alice.address);
      expect(remaining).to.equal(maxUint);
    });

    it("Should update rewards correctly on transferFrom", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const claimableBefore = await series.calculateClaimable(alice.address);
      expect(claimableBefore).to.be.gt(0);

      // Approve and transferFrom
      await series.connect(alice).approve(bob.address, ethers.parseEther("50000"));
      await series.connect(bob).transferFrom(alice.address, charlie.address, ethers.parseEther("50000"));

      // Alice's rewards should be preserved (snapshotted before transfer)
      const claimableAfter = await series.calculateClaimable(alice.address);
      expect(claimableAfter).to.equal(claimableBefore);
    });
  });

  // ============================================
  // 5) SERIES INFO SNAPSHOT CONSISTENCY
  // ============================================
  describe("getSeriesInfo Snapshot Consistency", function () {
    it("Should return consistent info before and after token transfer", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const infoBefore = await series.getSeriesInfo();

      // Transfer tokens
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

      const infoAfter = await series.getSeriesInfo();

      // These should NOT change due to transfer
      expect(infoAfter.protocolAddress).to.equal(infoBefore.protocolAddress);
      expect(infoAfter.revenueBPS).to.equal(infoBefore.revenueBPS);
      expect(infoAfter.maturity).to.equal(infoBefore.maturity);
      expect(infoAfter.totalRevenue).to.equal(infoBefore.totalRevenue);
      expect(infoAfter.revenuePerToken).to.equal(infoBefore.revenuePerToken);
      expect(infoAfter.isActive).to.equal(infoBefore.isActive);
    });

    it("Should update totalRevenue in info after distribution", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const info1 = await series.getSeriesInfo();
      expect(info1.totalRevenue).to.equal(0);

      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      const info2 = await series.getSeriesInfo();
      expect(info2.totalRevenue).to.equal(ethers.parseEther("10"));
    });

    it("Should show isActive=false and timeRemaining=0 after maturity", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const info1 = await series.getSeriesInfo();
      expect(info1.isActive).to.be.true;
      expect(info1.timeRemaining).to.be.gt(0);

      await time.increase(DEFAULT_PARAMS.durationDays * 24 * 60 * 60 + 1);

      const info2 = await series.getSeriesInfo();
      expect(info2.isActive).to.be.false;
      expect(info2.timeRemaining).to.equal(0);
    });

    it("Should show decreasing timeRemaining over time", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      const info1 = await series.getSeriesInfo();
      const time1 = info1.timeRemaining;

      await time.increase(86400); // 1 day

      const info2 = await series.getSeriesInfo();
      const time2 = info2.timeRemaining;

      expect(time2).to.be.lt(time1);
      expect(time1 - time2).to.be.closeTo(86400n, 5n);
    });

    it("Should not show broken numbers after rapid transfers", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Rapid transfers
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(alice).transfer(bob.address, ethers.parseEther("50000"));
      await series.connect(bob).transfer(charlie.address, ethers.parseEther("25000"));
      await series.connect(charlie).transfer(protocol.address, ethers.parseEther("10000"));

      const info = await series.getSeriesInfo();
      expect(info.totalRevenue).to.equal(ethers.parseEther("10"));
      expect(info.isActive).to.be.true;
      expect(info.revenuePerToken).to.be.gt(0);
    });
  });

  // ============================================
  // 6) PERMIT (EIP-2612) CHECK
  // ============================================
  describe("Permit (EIP-2612) Check", function () {
    it("Should verify if permit function exists (or not)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const seriesInterface = series.interface;

      // Check if permit is in the ABI
      const hasPermit = seriesInterface.fragments.some(
        f => f.type === "function" && f.name === "permit"
      );

      if (hasPermit) {
        console.log("      ✓ Series supports EIP-2612 permit");
      } else {
        console.log("      ✗ Series does NOT support EIP-2612 permit (standard ERC20 only)");
      }
      // This test documents the capability, not a pass/fail
      expect(true).to.be.true;
    });
  });

  // ============================================
  // 7) DEFI INTERACTION PATTERNS
  // ============================================
  describe("DeFi Interaction Patterns", function () {
    it("Should handle approve-transfer-approve pattern (DEX listing)", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      // Simulate: protocol approves DEX (alice), DEX transfers, then new approval
      await series.connect(protocol).approve(alice.address, ethers.parseEther("500000"));
      await series.connect(alice).transferFrom(
        protocol.address, bob.address, ethers.parseEther("100000")
      );
      // New approval for remaining
      await series.connect(protocol).approve(alice.address, ethers.parseEther("400000"));
      expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("400000"));
    });

    it("Should handle multiple spenders simultaneously", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await series.connect(protocol).approve(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).approve(bob.address, ethers.parseEther("200000"));
      await series.connect(protocol).approve(charlie.address, ethers.parseEther("300000"));

      expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("100000"));
      expect(await series.allowance(protocol.address, bob.address)).to.equal(ethers.parseEther("200000"));
      expect(await series.allowance(protocol.address, charlie.address)).to.equal(ethers.parseEther("300000"));

      // All three spend simultaneously
      await series.connect(alice).transferFrom(protocol.address, alice.address, ethers.parseEther("50000"));
      await series.connect(bob).transferFrom(protocol.address, bob.address, ethers.parseEther("100000"));
      await series.connect(charlie).transferFrom(protocol.address, charlie.address, ethers.parseEther("150000"));

      expect(await series.balanceOf(alice.address)).to.equal(ethers.parseEther("50000"));
      expect(await series.balanceOf(bob.address)).to.equal(ethers.parseEther("100000"));
      expect(await series.balanceOf(charlie.address)).to.equal(ethers.parseEther("150000"));
    });

    it("Should handle transfer chain (A->B->C->A) with rewards intact", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const amount = ethers.parseEther("100000");

      await series.connect(protocol).transfer(alice.address, amount);
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

      // Chain: Alice -> Bob -> Charlie -> Alice
      await series.connect(alice).transfer(bob.address, amount);
      await series.connect(bob).transfer(charlie.address, amount);
      await series.connect(charlie).transfer(alice.address, amount);

      // Alice should have rewards from first distribution (snapshotted)
      const aliceClaimable = await series.calculateClaimable(alice.address);
      expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));

      // Bob and Charlie should have 0 (no distribution while they held)
      expect(await series.calculateClaimable(bob.address)).to.equal(0);
      expect(await series.calculateClaimable(charlie.address)).to.equal(0);
    });

    it("Should handle increaseAllowance/decreaseAllowance if available", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);

      // OZ v5 removed increaseAllowance/decreaseAllowance
      // Check if they exist
      const hasIncrease = series.interface.fragments.some(
        f => f.type === "function" && f.name === "increaseAllowance"
      );

      if (hasIncrease) {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("100"));
        await series.connect(protocol).increaseAllowance(alice.address, ethers.parseEther("50"));
        expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("150"));
      } else {
        console.log("      ✗ increaseAllowance not available (OZ v5)");
        expect(true).to.be.true;
      }
    });
  });

  // ============================================
  // 8) TRANSFER TO SPECIAL ADDRESSES
  // ============================================
  describe("Transfer to Special Addresses", function () {
    it("Should revert transfer to zero address", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      await expect(
        series.connect(protocol).transfer(ethers.ZeroAddress, ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("Should allow transfer to series contract itself", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const seriesAddr = await series.getAddress();

      // This is unusual but should work (tokens get locked in contract)
      await expect(
        series.connect(protocol).transfer(seriesAddr, ethers.parseEther("1000"))
      ).to.not.be.reverted;

      expect(await series.balanceOf(seriesAddr)).to.equal(ethers.parseEther("1000"));
    });

    it("Should allow transfer to factory contract", async function () {
      const { series } = await createSeriesViaFactory(factory, protocol);
      const factoryAddr = await factory.getAddress();

      await expect(
        series.connect(protocol).transfer(factoryAddr, ethers.parseEther("1000"))
      ).to.not.be.reverted;
    });
  });
});
