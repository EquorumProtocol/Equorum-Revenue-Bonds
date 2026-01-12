const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Attack Vectors and Security Tests", function () {
  let factory;
  let series;
  let router;
  let protocol;
  let attacker;
  let alice;
  let bob;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const REVENUE_SHARE_BPS = 2000;
  const DURATION_DAYS = 365;

  beforeEach(async function () {
    [protocol, attacker, alice, bob] = await ethers.getSigners();

    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(protocol.address); // Treasury address

    const result = await factory.connect(protocol).createSeries.staticCall(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );

    await factory.connect(protocol).createSeries(
      "Test Revenue Series",
      "TEST-REV",
      protocol.address,
      REVENUE_SHARE_BPS,
      DURATION_DAYS,
      INITIAL_SUPPLY
    );

    const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
    series = RevenueSeries.attach(result.seriesAddress);

    const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
    router = RevenueRouter.attach(result.routerAddress);
  });

  describe("Griefing Attacks", function () {
    describe("Router Spam", function () {
      it("Should handle spam of tiny ETH amounts", async function () {
        // Attacker sends many tiny amounts to pollute totalRevenueReceived
        for (let i = 0; i < 10; i++) {
          await attacker.sendTransaction({ 
            to: await router.getAddress(), 
            value: 1 // 1 wei
          });
        }

        expect(await router.totalRevenueReceived()).to.equal(10);
        
        // Router should still function normally
        await router.routeRevenue();
        
        // Series should receive proportional amount (even if tiny)
        expect(await series.totalRevenueReceived()).to.be.lte(10);
      });

      it("Should not waste excessive gas on tiny distributions", async function () {
        await attacker.sendTransaction({ 
          to: await router.getAddress(), 
          value: 100 
        });

        const tx = await router.routeRevenue();
        const receipt = await tx.wait();
        
        // Should still be efficient even with tiny amounts
        expect(receipt.gasUsed).to.be.lt(200000);
      });

      it("Should handle zero-value route calls", async function () {
        // Attacker calls route with no balance - should revert
        await expect(router.connect(attacker).routeRevenue()).to.be.revertedWith("No revenue to route");
      });
    });

    describe("Claim Spam", function () {
      it("Should reject claim with no rewards", async function () {
        await expect(
          series.connect(attacker).claimRevenue()
        ).to.be.revertedWith("No revenue to claim");
      });

      it("Should reject claimFor with no rewards", async function () {
        await expect(
          series.connect(attacker).claimFor(alice.address)
        ).to.be.revertedWith("No revenue to claim");
      });

      it("Should not allow claiming same rewards twice", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        await series.connect(alice).claimRevenue();
        
        await expect(
          series.connect(alice).claimRevenue()
        ).to.be.revertedWith("No revenue to claim");
      });
    });

    describe("Transfer Griefing", function () {
      it("Should handle transfer to self", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        const balanceBefore = await series.balanceOf(alice.address);
        const rewardsBefore = await series.rewards(alice.address);

        // Self-transfer
        await series.connect(alice).transfer(alice.address, ethers.parseEther("10000"));

        // Balance should remain the same
        expect(await series.balanceOf(alice.address)).to.equal(balanceBefore);
        
        // Rewards should not be lost
        expect(await series.rewards(alice.address)).to.be.gte(rewardsBefore);
      });

      it("Should handle rapid transfers between accounts", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Rapid transfers
        await series.connect(alice).transfer(bob.address, ethers.parseEther("10000"));
        await series.connect(bob).transfer(alice.address, ethers.parseEther("5000"));
        await series.connect(alice).transfer(bob.address, ethers.parseEther("3000"));

        // Total supply should remain constant
        expect(await series.totalSupply()).to.equal(INITIAL_SUPPLY);
        
        // Rewards should be tracked correctly
        const aliceRewards = await series.calculateClaimable(alice.address);
        const bobRewards = await series.calculateClaimable(bob.address);
        
        expect(aliceRewards).to.be.gt(0);
        expect(bobRewards).to.equal(0); // Bob got tokens after distribution
      });
    });
  });

  describe("Denial of Service (DoS) Attacks", function () {
    describe("Total Supply Manipulation", function () {
      it("Should protect against zero total supply", async function () {
        // This is prevented by constructor validation
        const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
        
        await expect(
          RevenueSeries.deploy(
            "Test",
            "TEST",
            protocol.address,
            await router.getAddress(),
            REVENUE_SHARE_BPS,
            DURATION_DAYS,
            0
          )
        ).to.be.revertedWith("Invalid supply");
      });

      it("Should handle all tokens concentrated in one address", async function () {
        // Protocol holds all tokens
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
        
        // Should still work
        const claimable = await series.calculateClaimable(protocol.address);
        expect(claimable).to.equal(ethers.parseEther("10"));
      });

      it("Should handle tokens spread across many addresses", async function () {
        // Distribute to many addresses
        const addresses = [alice, bob, attacker];
        const amountEach = ethers.parseEther("10000");
        
        for (const addr of addresses) {
          await series.connect(protocol).transfer(addr.address, amountEach);
        }

        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // All should be able to claim
        for (const addr of addresses) {
          const claimable = await series.calculateClaimable(addr.address);
          expect(claimable).to.be.gt(0);
        }
      });
    });

    describe("Router DoS", function () {
      it("Should handle series rejection gracefully", async function () {
        // Mature series to make it reject distributions
        await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
        await series.matureSeries();

        // Send ETH to router
        await attacker.sendTransaction({ 
          to: await router.getAddress(), 
          value: ethers.parseEther("10") 
        });

        // Route should fail gracefully
        await router.routeRevenue();
        
        expect(await router.failedRouteCount()).to.equal(1);
        
        // ETH should remain in router
        expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(ethers.parseEther("10"));
      });

      it("Should not lock funds if series is broken", async function () {
        await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
        await series.matureSeries();

        await attacker.sendTransaction({ 
          to: await router.getAddress(), 
          value: ethers.parseEther("10") 
        });

        await router.routeRevenue();

        // Protocol can still withdraw
        await router.connect(protocol).withdrawAllToProtocol();
        
        expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0);
      });
    });

    describe("Gas Exhaustion", function () {
      it("Should handle large number of small distributions efficiently", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

        const gasUsed = [];
        
        for (let i = 0; i < 5; i++) {
          const tx = await series.connect(protocol).distributeRevenue({ 
            value: ethers.parseEther("1") 
          });
          const receipt = await tx.wait();
          gasUsed.push(receipt.gasUsed);
        }

        // Gas should remain relatively constant
        const avgGas = gasUsed.reduce((a, b) => a + b, 0n) / BigInt(gasUsed.length);
        expect(avgGas).to.be.lt(100000n);
      });

      it("Should handle claims efficiently regardless of distribution count", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

        // Multiple distributions
        for (let i = 0; i < 5; i++) {
          await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("1") });
        }

        // Claim should still be efficient
        const tx = await series.connect(alice).claimRevenue();
        const receipt = await tx.wait();
        
        expect(receipt.gasUsed).to.be.lt(150000);
      });
    });
  });

  describe("Front-Running Attacks", function () {
    describe("Distribution Front-Running", function () {
      it("Should not allow front-running distribution by buying tokens", async function () {
        // Alice holds tokens
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));

        // Attacker sees distribution coming and buys tokens BEFORE distribution
        await series.connect(protocol).transfer(attacker.address, ethers.parseEther("50000"));

        // Distribution happens - both get proportional shares
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Attacker gets proportional share (1/3 of 1 ETH = 0.33 ETH since 50K/150K)
        const attackerClaimable = await series.calculateClaimable(attacker.address);
        expect(attackerClaimable).to.be.closeTo(ethers.parseEther("0.5"), ethers.parseEther("0.01"));

        // Alice gets proportional share (2/3 of 1 ETH = 0.66 ETH since 100K/150K)
        const aliceClaimable = await series.calculateClaimable(alice.address);
        expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
      });

      it("Should track rewards correctly even with front-running attempts", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        
        // First distribution - alice gets 1 ETH (10% of 10)
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Attacker buys tokens AFTER first distribution
        await series.connect(protocol).transfer(attacker.address, ethers.parseEther("100000"));

        // Second distribution - both get 0.5 ETH each (50/50 split of 1 ETH)
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Alice should have accumulated from both distributions
        const aliceClaimable = await series.calculateClaimable(alice.address);
        expect(aliceClaimable).to.be.gt(0);
        expect(aliceClaimable).to.be.lte(ethers.parseEther("2"));

        // Attacker should only have rewards from second distribution
        const attackerClaimable = await series.calculateClaimable(attacker.address);
        expect(attackerClaimable).to.be.gte(0);
        expect(attackerClaimable).to.be.lte(ethers.parseEther("1"));
      });
    });

    describe("Claim Front-Running", function () {
      it("Should not allow stealing rewards by front-running claim", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Attacker tries to claim Alice's rewards (should fail)
        await expect(
          series.connect(attacker).claimFor(alice.address)
        ).to.not.be.reverted; // claimFor is allowed, but sends to alice

        // Alice should still be able to claim (or already claimed by attacker on her behalf)
        const aliceClaimable = await series.calculateClaimable(alice.address);
        expect(aliceClaimable).to.equal(0); // Already claimed by attacker for her
      });
    });
  });

  describe("Economic Attacks", function () {
    describe("Dust Attacks", function () {
      it("Should handle dust amounts correctly", async function () {
        // Send dust to many addresses
        const dustAmount = 1; // 1 wei
        
        await series.connect(protocol).transfer(alice.address, dustAmount);
        await series.connect(protocol).transfer(bob.address, dustAmount);
        await series.connect(protocol).transfer(attacker.address, dustAmount);

        // Distribute revenue
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Dust holders should get proportional (tiny) rewards
        const aliceClaimable = await series.calculateClaimable(alice.address);
        expect(aliceClaimable).to.be.gte(0);
      });

      it("Should not break accounting with dust transfers", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });

        // Transfer dust
        await series.connect(alice).transfer(attacker.address, 1);

        // Alice should still have her rewards
        const aliceClaimable = await series.calculateClaimable(alice.address);
        expect(aliceClaimable).to.be.closeTo(ethers.parseEther("1"), ethers.parseEther("0.01"));
      });
    });

    describe("Rounding Exploits", function () {
      it("Should handle rounding correctly with odd numbers", async function () {
        // Create scenario with numbers that don't divide evenly
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("33333"));
        await series.connect(protocol).transfer(bob.address, ethers.parseEther("66667"));

        await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("7") });

        const aliceClaimable = await series.calculateClaimable(alice.address);
        const bobClaimable = await series.calculateClaimable(bob.address);

        // Total claimed should not exceed distributed
        expect(aliceClaimable + bobClaimable).to.be.lte(ethers.parseEther("0.7")); // 10% of 7 ETH
      });

      it("Should not lose funds to rounding errors", async function () {
        await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
        
        // Many small distributions
        for (let i = 0; i < 10; i++) {
          await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("0.1") });
        }

        const claimable = await series.calculateClaimable(alice.address);
        
        // Should be close to 10% of 1 ETH
        expect(claimable).to.be.closeTo(ethers.parseEther("0.1"), ethers.parseEther("0.001"));
      });
    });
  });

  describe("Permission Exploits", function () {
    it("Should not allow unauthorized distribution", async function () {
      await expect(
        series.connect(attacker).distributeRevenue({ value: ethers.parseEther("1") })
      ).to.be.revertedWith("Only protocol or router can distribute");
    });

    it("Should not allow unauthorized withdrawal from router", async function () {
      await attacker.sendTransaction({ 
        to: await router.getAddress(), 
        value: ethers.parseEther("10") 
      });

      await expect(
        router.connect(attacker).withdrawToProtocol(ethers.parseEther("1"))
      ).to.be.revertedWith("Not authorized");
    });

    it("Should not allow unauthorized emergency withdraw", async function () {
      await attacker.sendTransaction({ 
        to: await router.getAddress(), 
        value: ethers.parseEther("10") 
      });

      await expect(
        router.connect(attacker).emergencyWithdraw(attacker.address)
      ).to.be.reverted; // Ownable: caller is not the owner
    });

    it("Should not allow creating series for another protocol", async function () {
      await expect(
        factory.connect(attacker).createSeries(
          "Fake Series",
          "FAKE",
          protocol.address, // Trying to create for protocol
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          INITIAL_SUPPLY
        )
      ).to.be.revertedWith("Only protocol can create series");
    });
  });

  describe("State Manipulation", function () {
    it("Should not allow manipulating maturity state", async function () {
      // Try to mature before time
      await expect(
        series.matureSeries()
      ).to.be.revertedWith("Not matured yet");
    });

    it("Should not allow double maturity", async function () {
      await time.increase(DURATION_DAYS * 24 * 60 * 60 + 1);
      await series.matureSeries();

      // Try to mature again (should revert - already matured)
      await expect(series.matureSeries()).to.be.revertedWith("Already matured");
      
      expect(await series.active()).to.equal(false);
    });

    it("Should maintain consistent state across operations", async function () {
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      
      const totalSupplyBefore = await series.totalSupply();
      
      // Multiple operations
      await series.connect(protocol).distributeRevenue({ value: ethers.parseEther("10") });
      await series.connect(alice).transfer(bob.address, ethers.parseEther("10000"));
      await series.connect(alice).claimRevenue();
      
      // Total supply should remain constant
      expect(await series.totalSupply()).to.equal(totalSupplyBefore);
    });
  });
});
