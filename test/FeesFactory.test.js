const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Factory Fees - Mainnet Grade Tests", function () {
  let factory;
  let owner, treasury, protocol, attacker;
  
  const VALID_CONFIG = {
    name: "Test Series",
    symbol: "TEST",
    revenueShareBPS: 2000,
    durationDays: 365,
    totalSupply: ethers.parseEther("1000000")
  };

  beforeEach(async function () {
    [owner, treasury, protocol, attacker] = await ethers.getSigners();
    
    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(treasury.address);
    await factory.waitForDeployment();
  });

  describe("1) Fee ON/OFF", function () {
    it("feesEnabled=false: createSeries without msg.value works", async function () {
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

    it("feesEnabled=true, msg.value < fee: reverts", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: ethers.parseEther("0.005") }
        )
      ).to.be.revertedWith("Insufficient fee");
    });

    it("feesEnabled=true, msg.value == fee: creates and treasury receives fee", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: fee }
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
      await expect(tx).to.emit(factory, "FeeCollected")
        .withArgs(protocol.address, treasury.address, fee, "creation");
      
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(fee);
    });

    it("feesEnabled=true, msg.value > fee: creates, treasury receives fee, caller gets refund", async function () {
      const fee = ethers.parseEther("0.01");
      const sent = ethers.parseEther("0.02");
      await factory.setFees(true, fee);
      
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      const treasuryBalanceBefore = await ethers.provider.getBalance(treasury.address);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: sent }
      );
      
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      const treasuryBalanceAfter = await ethers.provider.getBalance(treasury.address);
      
      // Treasury received exactly the fee
      expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(fee);
      
      // Protocol paid fee + gas, got refund
      const expectedBalance = protocolBalanceBefore - fee - gasUsed;
      expect(protocolBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.0001"));
    });
  });

  describe("2) Treasury Maliciosa (rejeita ETH)", function () {
    let maliciousTreasury;

    beforeEach(async function () {
      const MaliciousTreasury = await ethers.getContractFactory("MaliciousTreasury");
      maliciousTreasury = await MaliciousTreasury.deploy();
      await maliciousTreasury.waitForDeployment();
      
      await factory.setTreasury(await maliciousTreasury.getAddress());
    });

    it("Should revert when treasury rejects ETH (documented behavior)", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      // Comportamento escolhido: reverter (mais simples)
      // Isso força o owner a configurar uma treasury válida
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: fee }
        )
      ).to.be.revertedWith("Fee transfer failed");
    });
  });

  describe("3) Reentrancy no Refund", function () {
    let reentrantAttacker;

    beforeEach(async function () {
      const ReentrantAttacker = await ethers.getContractFactory("ReentrantAttacker");
      reentrantAttacker = await ReentrantAttacker.deploy(await factory.getAddress());
      await reentrantAttacker.waitForDeployment();
    });

    it("Should prevent reentrancy attack on refund", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      // Attacker tenta criar série com excesso e reentrar no refund
      await expect(
        reentrantAttacker.attack(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: ethers.parseEther("0.02") }
        )
      ).to.be.reverted; // nonReentrant previne
      
      // Verificar que nenhuma série foi criada
      const totalSeries = await factory.getTotalSeries();
      expect(totalSeries).to.equal(0);
    });
  });

  describe("4) Eventos", function () {
    it("FeeCollected emitted with correct values", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      await expect(
        factory.connect(protocol).createSeries(
          VALID_CONFIG.name,
          VALID_CONFIG.symbol,
          protocol.address,
          VALID_CONFIG.revenueShareBPS,
          VALID_CONFIG.durationDays,
          VALID_CONFIG.totalSupply,
          { value: fee }
        )
      ).to.emit(factory, "FeeCollected")
        .withArgs(protocol.address, treasury.address, fee, "creation");
    });

    it("SeriesCreated still correct with fees", async function () {
      const fee = ethers.parseEther("0.01");
      await factory.setFees(true, fee);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: fee }
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
      
      expect(event).to.not.be.undefined;
      const parsed = factory.interface.parseLog(event);
      expect(parsed.args[2]).to.equal(protocol.address); // protocol
      expect(parsed.args[3]).to.equal(VALID_CONFIG.name); // name
    });
  });

  describe("5) Edge Cases", function () {
    it("Should handle zero fee correctly", async function () {
      await factory.setFees(true, 0);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply
      );
      
      await expect(tx).to.emit(factory, "SeriesCreated");
      // No FeeCollected event when fee is 0
    });

    it("Should refund all ETH when feesEnabled=false", async function () {
      await factory.setFees(false, ethers.parseEther("0.01"));
      
      const protocolBalanceBefore = await ethers.provider.getBalance(protocol.address);
      
      const tx = await factory.connect(protocol).createSeries(
        VALID_CONFIG.name,
        VALID_CONFIG.symbol,
        protocol.address,
        VALID_CONFIG.revenueShareBPS,
        VALID_CONFIG.durationDays,
        VALID_CONFIG.totalSupply,
        { value: ethers.parseEther("0.05") } // Sending ETH even though fees disabled
      );
      
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      
      const protocolBalanceAfter = await ethers.provider.getBalance(protocol.address);
      
      // Should only pay gas, get full refund
      const expectedBalance = protocolBalanceBefore - gasUsed;
      expect(protocolBalanceAfter).to.be.closeTo(expectedBalance, ethers.parseEther("0.0001"));
    });
  });
});

// Helper contracts for testing
// These should be in separate files in a real project, but included here for completeness

// MaliciousTreasury.sol
const MaliciousTreasurySource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MaliciousTreasury {
    receive() external payable {
        revert("I reject your money!");
    }
}
`;

// ReentrantAttacker.sol
const ReentrantAttackerSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFactory {
    function createSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external payable returns (address, address);
}

contract ReentrantAttacker {
    IFactory public factory;
    bool public attacking;
    
    constructor(address _factory) {
        factory = IFactory(_factory);
    }
    
    function attack(
        string memory name,
        string memory symbol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external payable {
        attacking = true;
        factory.createSeries{value: msg.value}(
            name,
            symbol,
            address(this),
            revenueShareBPS,
            durationDays,
            totalSupply
        );
    }
    
    receive() external payable {
        if (attacking) {
            // Try to reenter on refund
            attacking = false;
            factory.createSeries{value: 0}(
                "Reentrant",
                "REENT",
                address(this),
                2000,
                365,
                1000e18
            );
        }
    }
}
`;
