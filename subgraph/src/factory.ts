import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts"
import {
  SeriesCreated,
  FeeCollected,
  TreasuryUpdated,
  FeesConfigUpdated
} from "../generated/RevenueSeriesFactory/RevenueSeriesFactory"
import {
  RevenueSeries as RevenueSeriesTemplate,
  RevenueBondEscrow as RevenueBondEscrowTemplate,
  RevenueRouter as RevenueRouterTemplate
} from "../generated/templates"
import {
  FactoryStats,
  RevenueSeries,
  RevenueBondEscrow,
  RevenueRouter,
  Protocol,
  ProtocolStats,
  DailySnapshot
} from "../generated/schema"
import { RevenueSeries as RevenueSeriesContract } from "../generated/RevenueSeriesFactory/RevenueSeries"
import { RevenueBondEscrow as RevenueBondEscrowContract } from "../generated/RevenueSeriesFactory/RevenueBondEscrow"

// Constants
const ZERO_BD = BigDecimal.fromString("0")
const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const PROTOCOL_STATS_ID = "protocol-stats"

export function handleSeriesCreated(event: SeriesCreated): void {
  let seriesAddress = event.params.series
  let routerAddress = event.params.router
  let protocolAddress = event.params.protocol

  // ============================================
  // 1. CREATE OR UPDATE PROTOCOL
  // ============================================
  let protocol = Protocol.load(protocolAddress.toHexString())
  if (protocol == null) {
    protocol = new Protocol(protocolAddress.toHexString())
    protocol.address = protocolAddress
    protocol.seriesCount = ZERO_BI
    protocol.totalCapitalRaised = ZERO_BD
    protocol.totalRevenueShared = ZERO_BD
    protocol.reputationScore = ZERO_BI
    protocol.totalRevenueDelivered = ZERO_BD
    protocol.totalRevenueExpected = ZERO_BD
    protocol.deliveryRate = ZERO_BD
    protocol.onTimeDeliveries = ZERO_BI
    protocol.lateDeliveries = ZERO_BI
    protocol.missedDeliveries = ZERO_BI
    protocol.blacklisted = false
    protocol.blacklistedReason = null
    protocol.blacklistedAt = null
    protocol.createdAt = event.block.timestamp
    protocol.lastActivityTimestamp = event.block.timestamp
  }
  protocol.seriesCount = protocol.seriesCount.plus(ONE_BI)
  protocol.lastActivityTimestamp = event.block.timestamp
  protocol.save()

  // ============================================
  // 2. DETECT BOND TYPE (SOFT vs HYBRID)
  // ============================================
  let seriesContract = RevenueSeriesContract.bind(seriesAddress)
  let bondType = "SOFT"
  
  // Try to cast to RevenueBondEscrow to detect if it's Hybrid
  let escrowContract = RevenueBondEscrowContract.bind(seriesAddress)
  let principalAmountResult = escrowContract.try_principalAmount()
  if (!principalAmountResult.reverted) {
    bondType = "HYBRID"
  }

  // ============================================
  // 3. CREATE REVENUE SERIES ENTITY
  // ============================================
  let series = new RevenueSeries(seriesAddress.toHexString())
  series.name = event.params.name
  series.symbol = event.params.symbol
  series.bondType = bondType
  series.protocol = protocolAddress.toHexString()
  series.protocolAddress = protocolAddress
  series.router = routerAddress.toHexString()
  series.routerAddress = routerAddress
  
  // Configuration from contract
  series.revenueShareBPS = event.params.revenueShareBPS
  series.revenueSharePercentage = event.params.revenueShareBPS.toBigDecimal().div(BigDecimal.fromString("100"))
  series.durationDays = event.params.durationDays
  series.totalSupply = event.params.totalSupply.toBigDecimal().div(BigDecimal.fromString("1e18"))
  
  let minDistResult = seriesContract.try_minDistributionAmount()
  series.minDistributionAmount = minDistResult.reverted ? ZERO_BD : minDistResult.value.toBigDecimal().div(BigDecimal.fromString("1e18"))
  
  // Dates
  series.createdAt = event.block.timestamp
  series.createdAtBlock = event.block.number
  
  let maturityResult = seriesContract.try_maturityDate()
  series.maturityDate = maturityResult.reverted ? ZERO_BI : maturityResult.value
  
  // Status
  series.state = "Active"
  series.isActive = true
  
  // Financial Metrics (initialized)
  series.totalRevenueReceived = ZERO_BD
  series.totalRevenueDistributed = ZERO_BD
  series.totalRevenueClaimed = ZERO_BD
  series.revenuePerTokenStored = ZERO_BD
  
  // Distribution Stats
  series.distributionCount = ZERO_BI
  series.lastDistributionTimestamp = null
  series.averageDistributionAmount = ZERO_BD
  
  // Holder Stats
  series.holderCount = ZERO_BI
  series.claimCount = ZERO_BI
  
  // APY (will be calculated later)
  series.estimatedAPY = null
  
  // Escrow reference (will be set if HYBRID)
  series.escrow = bondType == "HYBRID" ? seriesAddress.toHexString() : null
  
  series.save()

  // ============================================
  // 4. CREATE REVENUE ROUTER ENTITY
  // ============================================
  let router = new RevenueRouter(routerAddress.toHexString())
  router.protocol = protocolAddress.toHexString()
  router.series = seriesAddress.toHexString()
  router.revenueShareBPS = event.params.revenueShareBPS
  router.totalRevenueReceived = ZERO_BD
  router.totalRoutedToSeries = ZERO_BD
  router.totalReturnedToProtocol = ZERO_BD
  router.owedToSeries = ZERO_BD
  router.pendingToRoute = ZERO_BD
  router.routingCount = ZERO_BI
  router.failedRouteCount = ZERO_BI
  router.lastRoutingTimestamp = null
  router.save()

  // ============================================
  // 5. CREATE ESCROW ENTITY (IF HYBRID)
  // ============================================
  if (bondType == "HYBRID") {
    let escrow = new RevenueBondEscrow(seriesAddress.toHexString())
    escrow.series = seriesAddress.toHexString()
    
    let principalAmount = escrowContract.try_principalAmount()
    escrow.principalAmount = principalAmount.reverted ? ZERO_BD : principalAmount.value.toBigDecimal().div(BigDecimal.fromString("1e18"))
    
    let minPurchase = escrowContract.try_minPurchaseAmount()
    escrow.minPurchaseAmount = minPurchase.reverted ? ZERO_BD : minPurchase.value.toBigDecimal().div(BigDecimal.fromString("1e18"))
    
    let depositDeadlineDays = escrowContract.try_depositDeadlineDays()
    escrow.depositDeadlineDays = depositDeadlineDays.reverted ? ZERO_BI : depositDeadlineDays.value
    
    let depositDeadline = escrowContract.try_depositDeadline()
    escrow.depositDeadline = depositDeadline.reverted ? ZERO_BI : depositDeadline.value
    
    escrow.state = "PendingPrincipal"
    escrow.principalDeposited = false
    escrow.principalDepositedAt = null
    escrow.totalPrincipalClaimed = ZERO_BD
    escrow.principalClaimCount = ZERO_BI
    escrow.dustRescued = ZERO_BD
    escrow.dustRescuedAt = null
    
    escrow.save()
    
    // Start indexing Escrow events
    RevenueBondEscrowTemplate.create(seriesAddress)
  }

  // ============================================
  // 6. UPDATE FACTORY STATS
  // ============================================
  let factory = FactoryStats.load(event.address.toHexString())
  if (factory == null) {
    factory = new FactoryStats(event.address.toHexString())
    factory.address = event.address
    factory.treasury = Address.fromString("0xBa69aEd75E8562f9D23064aEBb21683202c5279B")
    factory.reputationRegistry = Address.fromString("0x0000000000000000000000000000000000000000") // Update with actual
    factory.creationFeeETH = ZERO_BD
    factory.feesEnabled = false
    factory.totalSeriesCreated = ZERO_BI
    factory.totalFeesCollected = ZERO_BD
    factory.deployedAt = event.block.timestamp
    factory.lastSeriesCreatedAt = null
  }
  factory.totalSeriesCreated = factory.totalSeriesCreated.plus(ONE_BI)
  factory.lastSeriesCreatedAt = event.block.timestamp
  factory.save()

  // ============================================
  // 7. UPDATE PROTOCOL STATS (GLOBAL)
  // ============================================
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats == null) {
    protocolStats = new ProtocolStats(PROTOCOL_STATS_ID)
    protocolStats.totalRevenueBondsCreated = ZERO_BI
    protocolStats.totalCapitalRaised = ZERO_BD
    protocolStats.totalRevenueDistributed = ZERO_BD
    protocolStats.totalActiveSeries = ZERO_BI
    protocolStats.totalMaturedSeries = ZERO_BI
    protocolStats.totalDefaultedSeries = ZERO_BI
    protocolStats.totalProtocolsFunded = ZERO_BI
    protocolStats.averageDeliveryRate = ZERO_BD
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
  }
  protocolStats.totalRevenueBondsCreated = protocolStats.totalRevenueBondsCreated.plus(ONE_BI)
  protocolStats.totalActiveSeries = protocolStats.totalActiveSeries.plus(ONE_BI)
  
  // Count unique protocols
  let uniqueProtocols = protocol.seriesCount.equals(ONE_BI)
  if (uniqueProtocols) {
    protocolStats.totalProtocolsFunded = protocolStats.totalProtocolsFunded.plus(ONE_BI)
  }
  
  protocolStats.lastUpdatedTimestamp = event.block.timestamp
  protocolStats.lastUpdatedBlock = event.block.number
  protocolStats.save()

  // ============================================
  // 8. UPDATE DAILY SNAPSHOT
  // ============================================
  updateDailySnapshot(event.block.timestamp, ONE_BI, ZERO_BD, ZERO_BD)

  // ============================================
  // 9. START INDEXING TEMPLATES
  // ============================================
  RevenueSeriesTemplate.create(seriesAddress)
  RevenueRouterTemplate.create(routerAddress)
}

export function handleFeeCollected(event: FeeCollected): void {
  let factory = FactoryStats.load(event.address.toHexString())
  if (factory != null) {
    let feeAmount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))
    factory.totalFeesCollected = factory.totalFeesCollected.plus(feeAmount)
    factory.save()
  }
}

export function handleTreasuryUpdated(event: TreasuryUpdated): void {
  let factory = FactoryStats.load(event.address.toHexString())
  if (factory != null) {
    factory.treasury = event.params.newTreasury
    factory.save()
  }
}

export function handleFeesConfigUpdated(event: FeesConfigUpdated): void {
  let factory = FactoryStats.load(event.address.toHexString())
  if (factory != null) {
    factory.feesEnabled = event.params.enabled
    factory.creationFeeETH = event.params.creationFeeETH.toBigDecimal().div(BigDecimal.fromString("1e18"))
    factory.save()
  }
}

// ============================================
// HELPER: UPDATE DAILY SNAPSHOT
// ============================================
function updateDailySnapshot(
  timestamp: BigInt,
  newSeries: BigInt,
  revenueDistributed: BigDecimal,
  capitalRaised: BigDecimal
): void {
  let dayTimestamp = timestamp.div(BigInt.fromI32(86400)).times(BigInt.fromI32(86400))
  let snapshotId = dayTimestamp.toString()
  
  let snapshot = DailySnapshot.load(snapshotId)
  if (snapshot == null) {
    snapshot = new DailySnapshot(snapshotId)
    snapshot.date = dayTimestamp
    
    // Load current global stats
    let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
    if (protocolStats != null) {
      snapshot.totalRevenueBondsCreated = protocolStats.totalRevenueBondsCreated
      snapshot.totalCapitalRaised = protocolStats.totalCapitalRaised
      snapshot.totalRevenueDistributed = protocolStats.totalRevenueDistributed
      snapshot.activeSeries = protocolStats.totalActiveSeries
    } else {
      snapshot.totalRevenueBondsCreated = ZERO_BI
      snapshot.totalCapitalRaised = ZERO_BD
      snapshot.totalRevenueDistributed = ZERO_BD
      snapshot.activeSeries = ZERO_BI
    }
    
    snapshot.newSeriesCreated = ZERO_BI
    snapshot.revenueDistributedToday = ZERO_BD
    snapshot.capitalRaisedToday = ZERO_BD
  }
  
  snapshot.newSeriesCreated = snapshot.newSeriesCreated.plus(newSeries)
  snapshot.revenueDistributedToday = snapshot.revenueDistributedToday.plus(revenueDistributed)
  snapshot.capitalRaisedToday = snapshot.capitalRaisedToday.plus(capitalRaised)
  
  snapshot.save()
}
