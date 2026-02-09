import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts"
import {
  RevenueReceived,
  RevenueClaimed,
  SeriesMatured,
  Transfer
} from "../generated/templates/RevenueSeries/RevenueSeries"
import {
  RevenueSeries,
  RevenueDistribution,
  RevenueClaim,
  SeriesHolder,
  Protocol,
  ProtocolStats,
  DailySnapshot
} from "../generated/schema"

const ZERO_BD = BigDecimal.fromString("0")
const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const PROTOCOL_STATS_ID = "protocol-stats"
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

export function handleRevenueReceived(event: RevenueReceived): void {
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let revenuePerToken = event.params.revenuePerToken.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // 1. UPDATE SERIES METRICS
  // ============================================
  series.totalRevenueReceived = series.totalRevenueReceived.plus(amount)
  series.totalRevenueDistributed = series.totalRevenueDistributed.plus(amount)
  series.revenuePerTokenStored = revenuePerToken
  series.distributionCount = series.distributionCount.plus(ONE_BI)
  series.lastDistributionTimestamp = event.block.timestamp
  
  // Update average distribution amount
  series.averageDistributionAmount = series.totalRevenueReceived
    .div(series.distributionCount.toBigDecimal())
  
  series.save()

  // ============================================
  // 2. CREATE DISTRIBUTION EVENT
  // ============================================
  let distributionId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let distribution = new RevenueDistribution(distributionId)
  distribution.series = series.id
  distribution.amount = amount
  distribution.revenuePerToken = revenuePerToken
  distribution.timestamp = event.block.timestamp
  distribution.blockNumber = event.block.number
  distribution.transactionHash = event.transaction.hash
  distribution.from = event.params.from
  distribution.save()

  // ============================================
  // 3. UPDATE PROTOCOL METRICS
  // ============================================
  let protocol = Protocol.load(series.protocol)
  if (protocol != null) {
    protocol.totalRevenueShared = protocol.totalRevenueShared.plus(amount)
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }

  // ============================================
  // 4. UPDATE GLOBAL PROTOCOL STATS
  // ============================================
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats != null) {
    protocolStats.totalRevenueDistributed = protocolStats.totalRevenueDistributed.plus(amount)
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
    protocolStats.save()
  }

  // ============================================
  // 5. UPDATE DAILY SNAPSHOT
  // ============================================
  updateDailySnapshot(event.block.timestamp, ZERO_BI, amount, ZERO_BD)
}

export function handleRevenueClaimed(event: RevenueClaimed): void {
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let holderAddress = event.params.holder
  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // 1. UPDATE SERIES METRICS
  // ============================================
  series.totalRevenueClaimed = series.totalRevenueClaimed.plus(amount)
  series.claimCount = series.claimCount.plus(ONE_BI)
  series.save()

  // ============================================
  // 2. UPDATE OR CREATE SERIES HOLDER
  // ============================================
  let holderId = series.id + "-" + holderAddress.toHexString()
  let holder = SeriesHolder.load(holderId)
  
  if (holder == null) {
    // This shouldn't happen (holder should exist from Transfer event)
    // But create it just in case
    holder = new SeriesHolder(holderId)
    holder.series = series.id
    holder.holder = holderAddress
    holder.balance = ZERO_BD
    holder.balancePercentage = ZERO_BD
    holder.totalRevenueClaimed = ZERO_BD
    holder.claimCount = ZERO_BI
    holder.lastClaimTimestamp = null
    holder.principalClaimed = false
    holder.principalClaimedAmount = null
    holder.principalClaimedAt = null
    holder.firstAcquiredAt = event.block.timestamp
    holder.lastTransferTimestamp = event.block.timestamp
  }
  
  holder.totalRevenueClaimed = holder.totalRevenueClaimed.plus(amount)
  holder.claimCount = holder.claimCount.plus(ONE_BI)
  holder.lastClaimTimestamp = event.block.timestamp
  holder.save()

  // ============================================
  // 3. CREATE CLAIM EVENT
  // ============================================
  let claimId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let claim = new RevenueClaim(claimId)
  claim.series = series.id
  claim.holder = holderId
  claim.amount = amount
  claim.holderAddress = holderAddress
  claim.timestamp = event.block.timestamp
  claim.blockNumber = event.block.number
  claim.transactionHash = event.transaction.hash
  claim.save()
}

export function handleSeriesMatured(event: SeriesMatured): void {
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  // ============================================
  // 1. UPDATE SERIES STATE
  // ============================================
  series.state = "Matured"
  series.isActive = false
  series.save()

  // ============================================
  // 2. UPDATE GLOBAL STATS
  // ============================================
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats != null) {
    protocolStats.totalActiveSeries = protocolStats.totalActiveSeries.minus(ONE_BI)
    protocolStats.totalMaturedSeries = protocolStats.totalMaturedSeries.plus(ONE_BI)
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
    protocolStats.save()
  }
}

export function handleTransfer(event: Transfer): void {
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let from = event.params.from
  let to = event.params.to
  let value = event.params.value.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // Skip if it's a mint (from zero address) - already handled in factory
  if (from.toHexString() == ZERO_ADDRESS) {
    // This is a mint - create holder for initial recipient
    updateHolder(series, to, value, event.block.timestamp, true)
    return
  }

  // Skip if it's a burn (to zero address)
  if (to.toHexString() == ZERO_ADDRESS) {
    updateHolder(series, from, value.neg(), event.block.timestamp, false)
    return
  }

  // Regular transfer: update both sender and receiver
  updateHolder(series, from, value.neg(), event.block.timestamp, false)
  updateHolder(series, to, value, event.block.timestamp, true)
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function updateHolder(
  series: RevenueSeries,
  holderAddress: Address,
  balanceChange: BigDecimal,
  timestamp: BigInt,
  isReceiving: boolean
): void {
  let holderId = series.id + "-" + holderAddress.toHexString()
  let holder = SeriesHolder.load(holderId)
  
  if (holder == null) {
    holder = new SeriesHolder(holderId)
    holder.series = series.id
    holder.holder = holderAddress
    holder.balance = ZERO_BD
    holder.balancePercentage = ZERO_BD
    holder.totalRevenueClaimed = ZERO_BD
    holder.claimCount = ZERO_BI
    holder.lastClaimTimestamp = null
    holder.principalClaimed = false
    holder.principalClaimedAmount = null
    holder.principalClaimedAt = null
    holder.firstAcquiredAt = timestamp
    holder.lastTransferTimestamp = timestamp
    
    // Increment holder count
    series.holderCount = series.holderCount.plus(ONE_BI)
    series.save()
  }
  
  // Update balance
  holder.balance = holder.balance.plus(balanceChange)
  
  // Calculate percentage of total supply
  if (series.totalSupply.gt(ZERO_BD)) {
    holder.balancePercentage = holder.balance
      .div(series.totalSupply)
      .times(BigDecimal.fromString("100"))
  }
  
  holder.lastTransferTimestamp = timestamp
  
  // If balance is now zero, decrement holder count
  if (holder.balance.equals(ZERO_BD) && !isReceiving) {
    series.holderCount = series.holderCount.minus(ONE_BI)
    series.save()
  }
  
  holder.save()
}

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
