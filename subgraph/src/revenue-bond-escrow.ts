import { BigInt, BigDecimal, Address } from "@graphprotocol/graph-ts"
import {
  PrincipalDeposited,
  PrincipalClaimed,
  SeriesDefaulted,
  DustRescued,
  RevenueReceived,
  RevenueClaimed,
  Transfer
} from "../generated/templates/RevenueBondEscrow/RevenueBondEscrow"
import {
  RevenueBondEscrow,
  RevenueSeries,
  PrincipalClaim,
  SeriesHolder,
  ProtocolStats,
  DailySnapshot
} from "../generated/schema"

const ZERO_BD = BigDecimal.fromString("0")
const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const PROTOCOL_STATS_ID = "protocol-stats"

export function handlePrincipalDeposited(event: PrincipalDeposited): void {
  let escrow = RevenueBondEscrow.load(event.address.toHexString())
  if (escrow == null) return

  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // 1. UPDATE ESCROW STATE
  // ============================================
  escrow.state = "Active"
  escrow.principalDeposited = true
  escrow.principalDepositedAt = event.block.timestamp
  escrow.save()

  // ============================================
  // 2. UPDATE SERIES (CAPITAL RAISED)
  // ============================================
  let series = RevenueSeries.load(escrow.series)
  if (series != null) {
    // Update protocol capital raised
    let protocol = series.protocol
    let protocolEntity = Protocol.load(protocol)
    if (protocolEntity != null) {
      protocolEntity.totalCapitalRaised = protocolEntity.totalCapitalRaised.plus(amount)
      protocolEntity.lastActivityTimestamp = event.block.timestamp
      protocolEntity.save()
    }
  }

  // ============================================
  // 3. UPDATE GLOBAL STATS
  // ============================================
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats != null) {
    protocolStats.totalCapitalRaised = protocolStats.totalCapitalRaised.plus(amount)
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
    protocolStats.save()
  }

  // ============================================
  // 4. UPDATE DAILY SNAPSHOT
  // ============================================
  updateDailySnapshot(event.block.timestamp, ZERO_BI, ZERO_BD, amount)
}

export function handlePrincipalClaimed(event: PrincipalClaimed): void {
  let escrow = RevenueBondEscrow.load(event.address.toHexString())
  if (escrow == null) return

  let holderAddress = event.params.holder
  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // 1. UPDATE ESCROW METRICS
  // ============================================
  escrow.totalPrincipalClaimed = escrow.totalPrincipalClaimed.plus(amount)
  escrow.principalClaimCount = escrow.principalClaimCount.plus(ONE_BI)
  escrow.save()

  // ============================================
  // 2. UPDATE SERIES HOLDER
  // ============================================
  let series = RevenueSeries.load(escrow.series)
  if (series != null) {
    let holderId = series.id + "-" + holderAddress.toHexString()
    let holder = SeriesHolder.load(holderId)
    
    if (holder != null) {
      holder.principalClaimed = true
      holder.principalClaimedAmount = amount
      holder.principalClaimedAt = event.block.timestamp
      holder.save()
    }
  }

  // ============================================
  // 3. CREATE PRINCIPAL CLAIM EVENT
  // ============================================
  let claimId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let claim = new PrincipalClaim(claimId)
  claim.escrow = escrow.id
  claim.holder = holderAddress
  claim.amount = amount
  claim.timestamp = event.block.timestamp
  claim.blockNumber = event.block.number
  claim.transactionHash = event.transaction.hash
  claim.save()
}

export function handleSeriesDefaulted(event: SeriesDefaulted): void {
  let escrow = RevenueBondEscrow.load(event.address.toHexString())
  if (escrow == null) return

  // ============================================
  // 1. UPDATE ESCROW STATE
  // ============================================
  escrow.state = "Defaulted"
  escrow.save()

  // ============================================
  // 2. UPDATE SERIES STATE
  // ============================================
  let series = RevenueSeries.load(escrow.series)
  if (series != null) {
    series.isActive = false
    series.save()
  }

  // ============================================
  // 3. UPDATE GLOBAL STATS
  // ============================================
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats != null) {
    protocolStats.totalActiveSeries = protocolStats.totalActiveSeries.minus(ONE_BI)
    protocolStats.totalDefaultedSeries = protocolStats.totalDefaultedSeries.plus(ONE_BI)
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
    protocolStats.save()
  }
}

export function handleDustRescued(event: DustRescued): void {
  let escrow = RevenueBondEscrow.load(event.address.toHexString())
  if (escrow == null) return

  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // UPDATE ESCROW DUST TRACKING
  // ============================================
  escrow.dustRescued = escrow.dustRescued.plus(amount)
  escrow.dustRescuedAt = event.block.timestamp
  escrow.save()
}

// ============================================
// REVENUE EVENTS (INHERITED FROM REVENUESERIES)
// ============================================
// These events are also emitted by RevenueBondEscrow since it inherits from RevenueSeries
// We need to handle them here as well to update the correct entities

export function handleRevenueReceived(event: RevenueReceived): void {
  // This is the same logic as in revenue-series.ts
  // but we need to handle it here because RevenueBondEscrow also emits this event
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let revenuePerToken = event.params.revenuePerToken.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // Update series metrics
  series.totalRevenueReceived = series.totalRevenueReceived.plus(amount)
  series.totalRevenueDistributed = series.totalRevenueDistributed.plus(amount)
  series.revenuePerTokenStored = revenuePerToken
  series.distributionCount = series.distributionCount.plus(ONE_BI)
  series.lastDistributionTimestamp = event.block.timestamp
  series.averageDistributionAmount = series.totalRevenueReceived
    .div(series.distributionCount.toBigDecimal())
  series.save()

  // Create distribution event
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

  // Update protocol metrics
  let protocol = Protocol.load(series.protocol)
  if (protocol != null) {
    protocol.totalRevenueShared = protocol.totalRevenueShared.plus(amount)
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }

  // Update global stats
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats != null) {
    protocolStats.totalRevenueDistributed = protocolStats.totalRevenueDistributed.plus(amount)
    protocolStats.lastUpdatedTimestamp = event.block.timestamp
    protocolStats.lastUpdatedBlock = event.block.number
    protocolStats.save()
  }

  // Update daily snapshot
  updateDailySnapshot(event.block.timestamp, ZERO_BI, amount, ZERO_BD)
}

export function handleRevenueClaimed(event: RevenueClaimed): void {
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let holderAddress = event.params.holder
  let amount = event.params.amount.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // Update series metrics
  series.totalRevenueClaimed = series.totalRevenueClaimed.plus(amount)
  series.claimCount = series.claimCount.plus(ONE_BI)
  series.save()

  // Update holder
  let holderId = series.id + "-" + holderAddress.toHexString()
  let holder = SeriesHolder.load(holderId)
  if (holder != null) {
    holder.totalRevenueClaimed = holder.totalRevenueClaimed.plus(amount)
    holder.claimCount = holder.claimCount.plus(ONE_BI)
    holder.lastClaimTimestamp = event.block.timestamp
    holder.save()
  }

  // Create claim event
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

export function handleTransfer(event: Transfer): void {
  // Same logic as revenue-series.ts
  let series = RevenueSeries.load(event.address.toHexString())
  if (series == null) return

  let from = event.params.from
  let to = event.params.to
  let value = event.params.value.toBigDecimal().div(BigDecimal.fromString("1e18"))

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

  if (from.toHexString() == ZERO_ADDRESS) {
    updateHolder(series, to, value, event.block.timestamp, true)
    return
  }

  if (to.toHexString() == ZERO_ADDRESS) {
    updateHolder(series, from, value.neg(), event.block.timestamp, false)
    return
  }

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
    
    series.holderCount = series.holderCount.plus(ONE_BI)
    series.save()
  }
  
  holder.balance = holder.balance.plus(balanceChange)
  
  if (series.totalSupply.gt(ZERO_BD)) {
    holder.balancePercentage = holder.balance
      .div(series.totalSupply)
      .times(BigDecimal.fromString("100"))
  }
  
  holder.lastTransferTimestamp = timestamp
  
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

// Import missing entities
import { RevenueDistribution, RevenueClaim, Protocol } from "../generated/schema"
