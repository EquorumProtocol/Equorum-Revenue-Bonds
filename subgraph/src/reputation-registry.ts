import { BigInt, BigDecimal } from "@graphprotocol/graph-ts"
import {
  SeriesRegistered,
  RevenueReported,
  ProtocolBlacklisted,
  ProtocolWhitelisted
} from "../generated/templates/ProtocolReputationRegistry/ProtocolReputationRegistry"
import {
  Protocol,
  RevenueSeries,
  ProtocolStats
} from "../generated/schema"

const ZERO_BD = BigDecimal.fromString("0")
const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)
const PROTOCOL_STATS_ID = "protocol-stats"

export function handleSeriesRegistered(event: SeriesRegistered): void {
  let protocolAddress = event.params.protocol
  let seriesAddress = event.params.series
  let expectedRevenue = event.params.expectedRevenue.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let durationDays = event.params.durationDays

  // ============================================
  // UPDATE PROTOCOL EXPECTED REVENUE
  // ============================================
  let protocol = Protocol.load(protocolAddress.toHexString())
  if (protocol != null) {
    protocol.totalRevenueExpected = protocol.totalRevenueExpected.plus(expectedRevenue)
    
    // Recalculate delivery rate
    if (protocol.totalRevenueExpected.gt(ZERO_BD)) {
      protocol.deliveryRate = protocol.totalRevenueDelivered
        .div(protocol.totalRevenueExpected)
        .times(BigDecimal.fromString("100"))
    }
    
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }
}

export function handleRevenueReported(event: RevenueReported): void {
  let protocolAddress = event.params.protocol
  let seriesAddress = event.params.series
  let actualRevenue = event.params.actualRevenue.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let expectedRevenue = event.params.expectedRevenue.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let onTime = event.params.onTime

  // ============================================
  // 1. UPDATE PROTOCOL REPUTATION
  // ============================================
  let protocol = Protocol.load(protocolAddress.toHexString())
  if (protocol != null) {
    // Update delivered revenue
    protocol.totalRevenueDelivered = protocol.totalRevenueDelivered.plus(actualRevenue)
    
    // Update delivery counters
    if (onTime) {
      protocol.onTimeDeliveries = protocol.onTimeDeliveries.plus(ONE_BI)
    } else {
      protocol.lateDeliveries = protocol.lateDeliveries.plus(ONE_BI)
    }
    
    // If actual < expected, it's a missed delivery (partial or full)
    if (actualRevenue.lt(expectedRevenue)) {
      protocol.missedDeliveries = protocol.missedDeliveries.plus(ONE_BI)
    }
    
    // Recalculate delivery rate
    if (protocol.totalRevenueExpected.gt(ZERO_BD)) {
      protocol.deliveryRate = protocol.totalRevenueDelivered
        .div(protocol.totalRevenueExpected)
        .times(BigDecimal.fromString("100"))
    }
    
    // Calculate reputation score (0-100)
    // Formula: (deliveryRate * 0.7) + (onTimeRate * 0.3)
    let totalDeliveries = protocol.onTimeDeliveries.plus(protocol.lateDeliveries).plus(protocol.missedDeliveries)
    let onTimeRate = ZERO_BD
    if (totalDeliveries.gt(ZERO_BI)) {
      onTimeRate = protocol.onTimeDeliveries.toBigDecimal()
        .div(totalDeliveries.toBigDecimal())
        .times(BigDecimal.fromString("100"))
    }
    
    let reputationScore = protocol.deliveryRate
      .times(BigDecimal.fromString("0.7"))
      .plus(onTimeRate.times(BigDecimal.fromString("0.3")))
    
    protocol.reputationScore = BigInt.fromString(reputationScore.truncate(0).toString())
    
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }

  // ============================================
  // 2. UPDATE GLOBAL AVERAGE DELIVERY RATE
  // ============================================
  updateGlobalDeliveryRate()
}

export function handleProtocolBlacklisted(event: ProtocolBlacklisted): void {
  let protocolAddress = event.params.protocol
  let reason = event.params.reason

  // ============================================
  // UPDATE PROTOCOL BLACKLIST STATUS
  // ============================================
  let protocol = Protocol.load(protocolAddress.toHexString())
  if (protocol != null) {
    protocol.blacklisted = true
    protocol.blacklistedReason = reason
    protocol.blacklistedAt = event.block.timestamp
    protocol.reputationScore = ZERO_BI // Reset reputation to 0
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }
}

export function handleProtocolWhitelisted(event: ProtocolWhitelisted): void {
  let protocolAddress = event.params.protocol

  // ============================================
  // UPDATE PROTOCOL BLACKLIST STATUS
  // ============================================
  let protocol = Protocol.load(protocolAddress.toHexString())
  if (protocol != null) {
    protocol.blacklisted = false
    protocol.blacklistedReason = null
    protocol.blacklistedAt = null
    
    // Recalculate reputation score based on historical performance
    let totalDeliveries = protocol.onTimeDeliveries.plus(protocol.lateDeliveries).plus(protocol.missedDeliveries)
    let onTimeRate = ZERO_BD
    if (totalDeliveries.gt(ZERO_BI)) {
      onTimeRate = protocol.onTimeDeliveries.toBigDecimal()
        .div(totalDeliveries.toBigDecimal())
        .times(BigDecimal.fromString("100"))
    }
    
    let reputationScore = protocol.deliveryRate
      .times(BigDecimal.fromString("0.7"))
      .plus(onTimeRate.times(BigDecimal.fromString("0.3")))
    
    protocol.reputationScore = BigInt.fromString(reputationScore.truncate(0).toString())
    
    protocol.lastActivityTimestamp = event.block.timestamp
    protocol.save()
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function updateGlobalDeliveryRate(): void {
  let protocolStats = ProtocolStats.load(PROTOCOL_STATS_ID)
  if (protocolStats == null) return

  // Calculate average delivery rate across all protocols
  // This is a simplified calculation - in production you might want to
  // iterate through all protocols or maintain a running average
  
  // For now, we'll use a placeholder that can be updated by a more sophisticated
  // aggregation mechanism (possibly off-chain or via a separate indexing job)
  
  // Note: TheGraph doesn't support iterating all entities efficiently in mappings
  // So this would typically be calculated in the frontend by querying all protocols
  // and computing the average client-side
  
  // We'll leave this as a TODO for now and set it to 0
  // The frontend can calculate this dynamically
  protocolStats.averageDeliveryRate = ZERO_BD
  protocolStats.save()
}
