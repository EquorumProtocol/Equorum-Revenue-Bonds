const { ethers } = require("hardhat");

const FACTORY_PATH = "contracts/v2/core/RevenueSeriesFactory.sol:RevenueSeriesFactory";
const SERIES_PATH = "contracts/v2/core/RevenueSeries.sol:RevenueSeries";
const ROUTER_PATH = "contracts/v2/core/RevenueRouter.sol:RevenueRouter";
const REGISTRY_PATH = "contracts/v2/registry/ProtocolReputationRegistry.sol:ProtocolReputationRegistry";

const DEFAULT_PARAMS = {
  name: "Test Revenue Series",
  symbol: "TEST-REV",
  revenueShareBPS: 2000,
  durationDays: 365,
  totalSupply: ethers.parseEther("1000000"),
  minDistributionAmount: ethers.parseEther("0.001"),
};

async function deployRegistry() {
  const Registry = await ethers.getContractFactory(REGISTRY_PATH);
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  return registry;
}

async function deployFactory(treasury, registry) {
  const Factory = await ethers.getContractFactory(FACTORY_PATH);
  const factory = await Factory.deploy(treasury.address, await registry.getAddress());
  await factory.waitForDeployment();
  await registry.authorizeReporter(await factory.getAddress());
  return factory;
}

async function createSeriesViaFactory(factory, protocol, params = {}) {
  const p = { ...DEFAULT_PARAMS, ...params };

  const result = await factory.connect(protocol).createSeries.staticCall(
    p.name, p.symbol, protocol.address,
    p.revenueShareBPS, p.durationDays, p.totalSupply, p.minDistributionAmount,
    { value: p.value || 0 }
  );

  await factory.connect(protocol).createSeries(
    p.name, p.symbol, protocol.address,
    p.revenueShareBPS, p.durationDays, p.totalSupply, p.minDistributionAmount,
    { value: p.value || 0 }
  );

  const Series = await ethers.getContractFactory(SERIES_PATH);
  const series = Series.attach(result.seriesAddress);

  const Router = await ethers.getContractFactory(ROUTER_PATH);
  const router = Router.attach(result.routerAddress);

  return { series, router, seriesAddress: result.seriesAddress, routerAddress: result.routerAddress };
}

async function deployFullStack(signers) {
  const [owner, treasury, protocol, ...rest] = signers || await ethers.getSigners();
  const registry = await deployRegistry();
  const factory = await deployFactory(treasury, registry);
  return { owner, treasury, protocol, rest, registry, factory };
}

module.exports = {
  FACTORY_PATH, SERIES_PATH, ROUTER_PATH, REGISTRY_PATH,
  DEFAULT_PARAMS,
  deployRegistry, deployFactory, createSeriesViaFactory, deployFullStack,
};
