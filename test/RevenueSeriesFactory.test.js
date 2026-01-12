const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RevenueSeriesFactory", function () {
  let factory;
  let protocol;
  let otherProtocol;
  let alice;
  let bob;

  beforeEach(async function () {
    [protocol, otherProtocol, alice, bob] = await ethers.getSigners();

    const RevenueSeriesFactory = await ethers.getContractFactory("RevenueSeriesFactory");
    factory = await RevenueSeriesFactory.deploy(protocol.address); // Treasury address
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      expect(await factory.getAddress()).to.be.properAddress;
    });

    it("Should initialize with zero series", async function () {
      expect(await factory.getTotalSeries()).to.equal(0);
    });
  });

  describe("Create Series", function () {
    const NAME = "Test Revenue Series";
    const SYMBOL = "TEST-REV";
    const REVENUE_SHARE_BPS = 2000; // 20%
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should create series successfully", async function () {
      const tx = await factory.connect(protocol).createSeries(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return factory.interface.parseLog(log).name === "SeriesCreated";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
    });

    it("Should return series and router addresses", async function () {
      const result = await factory.connect(protocol).createSeries.staticCall(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      expect(result.seriesAddress).to.be.properAddress;
      expect(result.routerAddress).to.be.properAddress;
      expect(result.seriesAddress).to.not.equal(ethers.ZeroAddress);
      expect(result.routerAddress).to.not.equal(ethers.ZeroAddress);
    });

    it("Should emit SeriesCreated event", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.emit(factory, "SeriesCreated");
    });

    it("Should register series in allSeries array", async function () {
      await factory.connect(protocol).createSeries(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      expect(await factory.getTotalSeries()).to.equal(1);
      const allSeries = await factory.allSeries(0);
      expect(allSeries).to.be.properAddress;
    });

    it("Should register series in seriesByProtocol mapping", async function () {
      await factory.connect(protocol).createSeries(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      const protocolSeries = await factory.getSeriesByProtocol(protocol.address);
      expect(protocolSeries.length).to.equal(1);
      expect(protocolSeries[0]).to.be.properAddress;
    });

    it("Should register router in routerBySeries mapping", async function () {
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

      const router = await factory.getRouterForSeries(result.seriesAddress);
      expect(router).to.equal(result.routerAddress);
    });

    it("Should transfer series ownership to protocol", async function () {
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);
      
      expect(await series.owner()).to.equal(protocol.address);
    });

    it("Should transfer router ownership to protocol", async function () {
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

      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      const router = RevenueRouter.attach(result.routerAddress);
      
      expect(await router.owner()).to.equal(protocol.address);
    });

    it("Should mint tokens to protocol", async function () {
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);
      
      expect(await series.balanceOf(protocol.address)).to.equal(TOTAL_SUPPLY);
    });

    it("Should link router and series correctly", async function () {
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);
      
      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      const router = RevenueRouter.attach(result.routerAddress);

      expect(await series.router()).to.equal(result.routerAddress);
      expect(await router.revenueSeries()).to.equal(result.seriesAddress);
    });
  });

  describe("Access Control", function () {
    const NAME = "Test Revenue Series";
    const SYMBOL = "TEST-REV";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should only allow protocol to create series in their name", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.not.be.reverted;
    });

    it("Should reject if msg.sender != protocol", async function () {
      await expect(
        factory.connect(alice).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Only protocol can create series");
    });

    it("Should reject if trying to create for another protocol", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          otherProtocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Only protocol can create series");
    });
  });

  describe("Validation", function () {
    const NAME = "Test Revenue Series";
    const SYMBOL = "TEST-REV";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should reject zero protocol address", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          ethers.ZeroAddress,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Only protocol can create series");
    });

    it("Should reject invalid BPS (zero)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          0,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject invalid BPS (> 10000)", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          10001,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid BPS");
    });

    it("Should reject zero duration", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          REVENUE_SHARE_BPS,
          0,
          TOTAL_SUPPLY
        )
      ).to.be.revertedWith("Invalid duration");
    });

    it("Should reject zero supply", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          REVENUE_SHARE_BPS,
          DURATION_DAYS,
          0
        )
      ).to.be.revertedWith("Supply too low");
    });

    it("Should accept valid BPS at boundaries", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          NAME,
          SYMBOL,
          protocol.address,
          1,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.not.be.reverted;

      // MAX is now 5000 (50%)
      await expect(
        factory.connect(protocol).createSeries(
          NAME + "2",
          SYMBOL + "2",
          protocol.address,
          5000,
          DURATION_DAYS,
          TOTAL_SUPPLY
        )
      ).to.not.be.reverted;
    });
  });

  describe("Multiple Series", function () {
    const NAME1 = "Series 1";
    const SYMBOL1 = "SER1";
    const NAME2 = "Series 2";
    const SYMBOL2 = "SER2";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should allow protocol to create multiple series", async function () {
      await factory.connect(protocol).createSeries(
        NAME1,
        SYMBOL1,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      await factory.connect(protocol).createSeries(
        NAME2,
        SYMBOL2,
        protocol.address,
        3000,
        180,
        ethers.parseEther("500000")
      );

      expect(await factory.getTotalSeries()).to.equal(2);
      const protocolSeries = await factory.getSeriesByProtocol(protocol.address);
      expect(protocolSeries.length).to.equal(2);
    });

    it("Should track series from different protocols separately", async function () {
      await factory.connect(protocol).createSeries(
        NAME1,
        SYMBOL1,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      await factory.connect(otherProtocol).createSeries(
        NAME2,
        SYMBOL2,
        otherProtocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      const protocol1Series = await factory.getSeriesByProtocol(protocol.address);
      const protocol2Series = await factory.getSeriesByProtocol(otherProtocol.address);

      expect(protocol1Series.length).to.equal(1);
      expect(protocol2Series.length).to.equal(1);
      expect(await factory.getTotalSeries()).to.equal(2);
    });

    it("Should create independent series with different parameters", async function () {
      const result1 = await factory.connect(protocol).createSeries.staticCall(
        NAME1,
        SYMBOL1,
        protocol.address,
        2000,
        365,
        ethers.parseEther("1000000")
      );

      await factory.connect(protocol).createSeries(
        NAME1,
        SYMBOL1,
        protocol.address,
        2000,
        365,
        ethers.parseEther("1000000")
      );

      const result2 = await factory.connect(protocol).createSeries.staticCall(
        NAME2,
        SYMBOL2,
        protocol.address,
        5000,
        180,
        ethers.parseEther("500000")
      );

      await factory.connect(protocol).createSeries(
        NAME2,
        SYMBOL2,
        protocol.address,
        5000,
        180,
        ethers.parseEther("500000")
      );

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series1 = RevenueSeries.attach(result1.seriesAddress);
      const series2 = RevenueSeries.attach(result2.seriesAddress);

      expect(await series1.revenueShareBPS()).to.equal(2000);
      expect(await series2.revenueShareBPS()).to.equal(5000);
      expect(await series1.totalTokenSupply()).to.equal(ethers.parseEther("1000000"));
      expect(await series2.totalTokenSupply()).to.equal(ethers.parseEther("500000"));
    });
  });

  describe("View Functions", function () {
    const NAME = "Test Revenue Series";
    const SYMBOL = "TEST-REV";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    beforeEach(async function () {
      await factory.connect(protocol).createSeries(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );
    });

    it("Should return correct total series count", async function () {
      expect(await factory.getTotalSeries()).to.equal(1);

      await factory.connect(otherProtocol).createSeries(
        "Series 2",
        "SER2",
        otherProtocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      expect(await factory.getTotalSeries()).to.equal(2);
    });

    it("Should return series by protocol", async function () {
      const series = await factory.getSeriesByProtocol(protocol.address);
      expect(series.length).to.equal(1);
      expect(series[0]).to.be.properAddress;
    });

    it("Should return empty array for protocol with no series", async function () {
      const series = await factory.getSeriesByProtocol(alice.address);
      expect(series.length).to.equal(0);
    });

    it("Should return router for series", async function () {
      const result = await factory.connect(protocol).createSeries.staticCall(
        "Series 2",
        "SER2",
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      await factory.connect(protocol).createSeries(
        "Series 2",
        "SER2",
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      const router = await factory.getRouterForSeries(result.seriesAddress);
      expect(router).to.equal(result.routerAddress);
    });

    it("Should return zero address for non-existent series", async function () {
      const router = await factory.getRouterForSeries(alice.address);
      expect(router).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Integration", function () {
    const NAME = "Integration Test Series";
    const SYMBOL = "INT-TEST";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should create fully functional series and router", async function () {
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);
      
      const RevenueRouter = await ethers.getContractFactory("RevenueRouter");
      const router = RevenueRouter.attach(result.routerAddress);

      // Test series functionality
      await series.connect(protocol).transfer(alice.address, ethers.parseEther("100000"));
      expect(await series.balanceOf(alice.address)).to.equal(ethers.parseEther("100000"));

      // Test router functionality
      await alice.sendTransaction({ to: result.routerAddress, value: ethers.parseEther("10") });
      await router.routeRevenue();

      expect(await series.totalRevenueReceived()).to.equal(ethers.parseEther("2")); // 20%
    });

    it("Should allow protocol to manage created series", async function () {
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);

      // Protocol can distribute revenue
      await expect(
        series.connect(protocol).distributeRevenue({ value: ethers.parseEther("5") })
      ).to.not.be.reverted;

      // Protocol can transfer ownership
      await expect(
        series.connect(protocol).transferOwnership(alice.address)
      ).to.not.be.reverted;
    });

    it("Should create series with correct maturity date", async function () {
      const beforeCreate = await time.latest();
      
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

      const RevenueSeries = await ethers.getContractFactory("RevenueSeries");
      const series = RevenueSeries.attach(result.seriesAddress);

      const maturityDate = await series.maturityDate();
      const expectedMaturity = beforeCreate + (DURATION_DAYS * 24 * 60 * 60);
      
      expect(maturityDate).to.be.closeTo(expectedMaturity, 10);
    });
  });

  describe("Gas Optimization", function () {
    const NAME = "Gas Test Series";
    const SYMBOL = "GAS-TEST";
    const REVENUE_SHARE_BPS = 2000;
    const DURATION_DAYS = 365;
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    it("Should have reasonable gas cost for series creation", async function () {
      const tx = await factory.connect(protocol).createSeries(
        NAME,
        SYMBOL,
        protocol.address,
        REVENUE_SHARE_BPS,
        DURATION_DAYS,
        TOTAL_SUPPLY
      );

      const receipt = await tx.wait();
      
      // Should be under 5M gas (deploying 2 contracts)
      expect(receipt.gasUsed).to.be.lt(5000000);
    });
  });

  describe("Edge Cases", function () {
    it("Should handle very long names and symbols", async function () {
      const longName = "A".repeat(100);
      const longSymbol = "B".repeat(50);

      await expect(
        factory.connect(protocol).createSeries(
          longName,
          longSymbol,
          protocol.address,
          2000,
          365,
          ethers.parseEther("1000000")
        )
      ).to.not.be.reverted;
    });

    it("Should handle minimum valid parameters", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Min",
          "MIN",
          protocol.address,
          1, // Min BPS
          30, // MIN_DURATION_DAYS
          ethers.parseEther("1000") // MIN_TOTAL_SUPPLY
        )
      ).to.not.be.reverted;
    });

    it("Should handle maximum valid BPS", async function () {
      await expect(
        factory.connect(protocol).createSeries(
          "Max BPS",
          "MAX",
          protocol.address,
          5000, // MAX_REVENUE_SHARE_BPS (50%)
          365,
          ethers.parseEther("1000000")
        )
      ).to.not.be.reverted;
    });

    it("Should handle very large supply", async function () {
      const largeSupply = ethers.parseEther("1000000000"); // 1 billion tokens

      await expect(
        factory.connect(protocol).createSeries(
          "Large Supply",
          "LARGE",
          protocol.address,
          2000,
          365,
          largeSupply
        )
      ).to.not.be.reverted;
    });

    it("Should handle very long duration", async function () {
      const longDuration = 1825; // MAX_DURATION_DAYS (5 years)

      await expect(
        factory.connect(protocol).createSeries(
          "Long Duration",
          "LONG",
          protocol.address,
          2000,
          longDuration,
          ethers.parseEther("1000000")
        )
      ).to.not.be.reverted;
    });
  });
});
