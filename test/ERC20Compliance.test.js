const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ERC-20 Compliance Tests", function () {
  let series;
  let protocol;
  let router;
  let alice;
  let bob;
  let charlie;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REVENUE_SHARE_BPS = 2000;
  const DURATION_DAYS = 365;

  beforeEach(async function () {
    [protocol, router, alice, bob, charlie] = await ethers.getSigners();

    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = await RevenueSeries.deploy(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      router.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );
  });

  describe("ERC-20 Standard Functions", function () {
    describe("transfer()", function () {
      it("Should transfer tokens correctly", async function () {
        const amount = ethers.parseEther("1000");
        
        await series.connect(protocol).transfer(alice.address, amount);
        
        expect(await series.balanceOf(alice.address)).to.equal(amount);
        expect(await series.balanceOf(protocol.address)).to.equal(INITIAL_SUPPLY - amount);
      });

      it("Should emit Transfer event", async function () {
        const amount = ethers.parseEther("1000");
        
        await expect(series.connect(protocol).transfer(alice.address, amount))
          .to.emit(series, "Transfer")
          .withArgs(protocol.address, alice.address, amount);
      });

      it("Should reject transfer to zero address", async function () {
        await expect(
          series.connect(protocol).transfer(ethers.ZeroAddress, ethers.parseEther("1000"))
        ).to.be.revertedWithCustomError(series, "ERC20InvalidReceiver");
      });

      it("Should reject transfer with insufficient balance", async function () {
        await expect(
          series.connect(alice).transfer(bob.address, ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(series, "ERC20InsufficientBalance");
      });

      it("Should allow transfer of zero amount", async function () {
        await expect(
          series.connect(protocol).transfer(alice.address, 0)
        ).to.not.be.reverted;
      });

      it("Should allow self-transfer", async function () {
        const balanceBefore = await series.balanceOf(protocol.address);
        
        await series.connect(protocol).transfer(protocol.address, ethers.parseEther("1000"));
        
        expect(await series.balanceOf(protocol.address)).to.equal(balanceBefore);
      });
    });

    describe("approve() and allowance()", function () {
      it("Should set allowance correctly", async function () {
        const amount = ethers.parseEther("1000");
        
        await series.connect(protocol).approve(alice.address, amount);
        
        expect(await series.allowance(protocol.address, alice.address)).to.equal(amount);
      });

      it("Should emit Approval event", async function () {
        const amount = ethers.parseEther("1000");
        
        await expect(series.connect(protocol).approve(alice.address, amount))
          .to.emit(series, "Approval")
          .withArgs(protocol.address, alice.address, amount);
      });

      it("Should allow updating allowance", async function () {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
        await series.connect(protocol).approve(alice.address, ethers.parseEther("2000"));
        
        expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("2000"));
      });

      it("Should allow zero allowance", async function () {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
        await series.connect(protocol).approve(alice.address, 0);
        
        expect(await series.allowance(protocol.address, alice.address)).to.equal(0);
      });

      it("Should reject approving zero address", async function () {
        await expect(
          series.connect(protocol).approve(ethers.ZeroAddress, ethers.parseEther("1000"))
        ).to.be.revertedWithCustomError(series, "ERC20InvalidSpender");
      });
    });

    describe("transferFrom()", function () {
      beforeEach(async function () {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("10000"));
      });

      it("Should transfer tokens using allowance", async function () {
        const amount = ethers.parseEther("1000");
        
        await series.connect(alice).transferFrom(protocol.address, bob.address, amount);
        
        expect(await series.balanceOf(bob.address)).to.equal(amount);
        expect(await series.balanceOf(protocol.address)).to.equal(INITIAL_SUPPLY - amount);
      });

      it("Should decrease allowance after transfer", async function () {
        const amount = ethers.parseEther("1000");
        const allowanceBefore = await series.allowance(protocol.address, alice.address);
        
        await series.connect(alice).transferFrom(protocol.address, bob.address, amount);
        
        expect(await series.allowance(protocol.address, alice.address)).to.equal(allowanceBefore - amount);
      });

      it("Should emit Transfer event", async function () {
        const amount = ethers.parseEther("1000");
        
        await expect(series.connect(alice).transferFrom(protocol.address, bob.address, amount))
          .to.emit(series, "Transfer")
          .withArgs(protocol.address, bob.address, amount);
      });

      it("Should reject transfer exceeding allowance", async function () {
        await expect(
          series.connect(alice).transferFrom(protocol.address, bob.address, ethers.parseEther("20000"))
        ).to.be.revertedWithCustomError(series, "ERC20InsufficientAllowance");
      });

      it("Should reject transfer with insufficient balance", async function () {
        await series.connect(bob).approve(alice.address, ethers.parseEther("1000"));
        
        await expect(
          series.connect(alice).transferFrom(bob.address, charlie.address, ethers.parseEther("1"))
        ).to.be.revertedWithCustomError(series, "ERC20InsufficientBalance");
      });

      it("Should reject transferFrom to zero address", async function () {
        await expect(
          series.connect(alice).transferFrom(protocol.address, ethers.ZeroAddress, ethers.parseEther("1000"))
        ).to.be.revertedWithCustomError(series, "ERC20InvalidReceiver");
      });

      it("Should handle multiple transferFrom calls", async function () {
        await series.connect(alice).transferFrom(protocol.address, bob.address, ethers.parseEther("1000"));
        await series.connect(alice).transferFrom(protocol.address, charlie.address, ethers.parseEther("2000"));
        
        expect(await series.balanceOf(bob.address)).to.equal(ethers.parseEther("1000"));
        expect(await series.balanceOf(charlie.address)).to.equal(ethers.parseEther("2000"));
        expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("7000"));
      });

      it("Should allow transferFrom with exact allowance", async function () {
        await series.connect(protocol).approve(bob.address, ethers.parseEther("500"));
        
        await series.connect(bob).transferFrom(protocol.address, charlie.address, ethers.parseEther("500"));
        
        expect(await series.allowance(protocol.address, bob.address)).to.equal(0);
      });
    });

    describe("Allowance Edge Cases", function () {
      it("Should handle allowance updates correctly", async function () {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
        expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("1000"));
        
        // Update allowance
        await series.connect(protocol).approve(alice.address, ethers.parseEther("500"));
        expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("500"));
      });

      it("Should handle setting allowance to zero", async function () {
        await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
        await series.connect(protocol).approve(alice.address, 0);
        
        expect(await series.allowance(protocol.address, alice.address)).to.equal(0);
      });
    });
  });

  describe("ERC-20 Metadata", function () {
    it("Should return correct name", async function () {
      expect(await series.name()).to.equal("Test Revenue Series");
    });

    it("Should return correct symbol", async function () {
      expect(await series.symbol()).to.equal("TEST-REV");
    });

    it("Should return correct decimals", async function () {
      expect(await series.decimals()).to.equal(18);
    });

    it("Should return correct total supply", async function () {
      expect(await series.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Balance Tracking", function () {
    it("Should track balances correctly after multiple transfers", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("10000"));
      await series.connect(protocol).transfer(bob.address, ethers.parseEther("5000"));
      await series.connect(alice).transfer(charlie.address, ethers.parseEther("3000"));
      
      expect(await series.balanceOf(alice.address)).to.equal(ethers.parseEther("7000"));
      expect(await series.balanceOf(bob.address)).to.equal(ethers.parseEther("5000"));
      expect(await series.balanceOf(charlie.address)).to.equal(ethers.parseEther("3000"));
      expect(await series.balanceOf(protocol.address)).to.equal(INITIAL_SUPPLY - ethers.parseEther("15000"));
    });

    it("Should maintain total supply after transfers", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("10000"));
      await series.connect(alice).transfer(bob.address, ethers.parseEther("5000"));
      
      expect(await series.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle maximum uint256 approval", async function () {
      const maxUint256 = ethers.MaxUint256;
      
      await series.connect(protocol).approve(alice.address, maxUint256);
      
      expect(await series.allowance(protocol.address, alice.address)).to.equal(maxUint256);
    });

    it("Should handle transfers with maximum balance", async function () {
      const balance = await series.balanceOf(protocol.address);
      
      await series.connect(protocol).transfer(alice.address, balance);
      
      expect(await series.balanceOf(protocol.address)).to.equal(0);
      expect(await series.balanceOf(alice.address)).to.equal(balance);
    });

    it("Should handle multiple approvals to same spender", async function () {
      await series.connect(protocol).approve(alice.address, ethers.parseEther("1000"));
      await series.connect(protocol).approve(alice.address, ethers.parseEther("2000"));
      await series.connect(protocol).approve(alice.address, ethers.parseEther("500"));
      
      expect(await series.allowance(protocol.address, alice.address)).to.equal(ethers.parseEther("500"));
    });
  });

  describe("Integration with Revenue Accounting", function () {
    beforeEach(async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
    });

    it("Should update rewards before transfer", async function () {
      const rewardsBefore = await series.rewards(alice.address);
      
      await series.connect(alice).transfer(bob.address, ethers.parseEther("50000"));
      
      const rewardsAfter = await series.rewards(alice.address);
      expect(rewardsAfter).to.be.gt(rewardsBefore);
    });

    it("Should update rewards before transferFrom", async function () {
      await series.connect(alice).approve(bob.address, ethers.parseEther("50000"));
      
      const rewardsBefore = await series.rewards(alice.address);
      
      await series.connect(bob).transferFrom(alice.address, charlie.address, ethers.parseEther("30000"));
      
      const rewardsAfter = await series.rewards(alice.address);
      expect(rewardsAfter).to.be.gt(rewardsBefore);
    });

    it("Should not lose rewards on approve", async function () {
      const rewardsBefore = await series.calculateClaimable(alice.address);
      
      await series.connect(alice).approve(bob.address, ethers.parseEther("50000"));
      
      const rewardsAfter = await series.calculateClaimable(alice.address);
      expect(rewardsAfter).to.equal(rewardsBefore);
    });
  });
});
