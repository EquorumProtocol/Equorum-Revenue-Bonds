import { BigInt, BigDecimal } from "@graphprotocol/graph-ts"
import {
  RevenueReceived,
  RevenueRouted,
  RouteAttemptFailed
} from "../generated/templates/RevenueRouter/RevenueRouter"
import {
  RevenueRouter,
  RevenueRouting,
  RevenueSeries
} from "../generated/schema"

const ZERO_BD = BigDecimal.fromString("0")
const ZERO_BI = BigInt.fromI32(0)
const ONE_BI = BigInt.fromI32(1)

export function handleRevenueReceived(event: RevenueReceived): void {
  let router = RevenueRouter.load(event.address.toHexString())
  if (router == null) return

  let totalAmount = event.params.totalAmount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let pendingToRoute = event.params.pendingToRoute.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // UPDATE ROUTER METRICS
  // ============================================
  router.totalRevenueReceived = router.totalRevenueReceived.plus(totalAmount)
  router.pendingToRoute = pendingToRoute
  
  // Calculate owedToSeries (this is the cumulative amount that should go to series)
  // owedToSeries = totalReceived * revenueShareBPS / 10000 - totalRoutedToSeries
  let expectedToSeries = router.totalRevenueReceived
    .times(router.revenueShareBPS.toBigDecimal())
    .div(BigDecimal.fromString("10000"))
  router.owedToSeries = expectedToSeries.minus(router.totalRoutedToSeries)
  
  router.save()
}

export function handleRevenueRouted(event: RevenueRouted): void {
  let router = RevenueRouter.load(event.address.toHexString())
  if (router == null) return

  let seriesAmount = event.params.seriesAmount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let protocolAmount = event.params.protocolAmount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let totalRouted = event.params.totalRouted.toBigDecimal().div(BigDecimal.fromString("1e18"))

  // ============================================
  // 1. UPDATE ROUTER METRICS
  // ============================================
  router.totalRoutedToSeries = router.totalRoutedToSeries.plus(seriesAmount)
  router.totalReturnedToProtocol = router.totalReturnedToProtocol.plus(protocolAmount)
  router.routingCount = router.routingCount.plus(ONE_BI)
  router.lastRoutingTimestamp = event.block.timestamp
  
  // Update pending and owed amounts
  router.pendingToRoute = ZERO_BD // Reset after successful routing
  
  // Recalculate owedToSeries
  let expectedToSeries = router.totalRevenueReceived
    .times(router.revenueShareBPS.toBigDecimal())
    .div(BigDecimal.fromString("10000"))
  router.owedToSeries = expectedToSeries.minus(router.totalRoutedToSeries)
  
  router.save()

  // ============================================
  // 2. CREATE ROUTING EVENT
  // ============================================
  let routingId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let routing = new RevenueRouting(routingId)
  routing.router = router.id
  routing.seriesAmount = seriesAmount
  routing.protocolAmount = protocolAmount
  routing.success = true
  routing.failureReason = null
  routing.timestamp = event.block.timestamp
  routing.blockNumber = event.block.number
  routing.transactionHash = event.transaction.hash
  routing.save()
}

export function handleRouteAttemptFailed(event: RouteAttemptFailed): void {
  let router = RevenueRouter.load(event.address.toHexString())
  if (router == null) return

  let attemptedAmount = event.params.attemptedAmount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  let reason = event.params.reason

  // ============================================
  // 1. UPDATE ROUTER METRICS
  // ============================================
  router.failedRouteCount = router.failedRouteCount.plus(ONE_BI)
  router.save()

  // ============================================
  // 2. CREATE FAILED ROUTING EVENT
  // ============================================
  let routingId = event.transaction.hash.toHexString() + "-" + event.logIndex.toString()
  let routing = new RevenueRouting(routingId)
  routing.router = router.id
  routing.seriesAmount = ZERO_BD
  routing.protocolAmount = ZERO_BD
  routing.success = false
  routing.failureReason = reason
  routing.timestamp = event.block.timestamp
  routing.blockNumber = event.block.number
  routing.transactionHash = event.transaction.hash
  routing.save()
}
