// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RevenueSeries.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title RevenueRouter
 * @notice Automatically captures protocol fees and routes to revenue series
 * @dev Protocol integrates this contract to automatically distribute revenue
 * 
 * ENFORCEMENT MODEL:
 * - Router tracks pendingToRoute to prevent protocol from withdrawing bondholder funds
 * - Protocol can only withdraw after pendingToRoute is routed or cleared
 * - This provides SOFT ENFORCEMENT: protocol cannot steal, but can delay
 * - Not trustless (protocol controls when to call routeRevenue)
 * - Trust-minimized (protocol cannot withdraw bondholder share)
 * 
 * Security improvements:
 * - Accepts revenue from any source (not just protocol)
 * - Checks if series is active before routing
 * - Emergency withdraw if something goes wrong
 * - Graceful fallback if series rejects
 * - pendingToRoute prevents protocol from stealing bondholder funds
 */
contract RevenueRouter is Ownable, ReentrancyGuard, Pausable {
    // Configuration (immutable for gas optimization)
    address public immutable protocol;          // Protocol address (for returning remainder)
    address payable public revenueSeries;       // RevenueSeries contract (payable because it has receive())
    uint256 public immutable revenueShareBPS;   // Share for series (e.g., 2000 = 20%)
    bool private seriesAddressSet;              // Flag to ensure series address is set only once
    
    // Tracking
    uint256 public totalRevenueReceived;        // Total revenue received
    uint256 public totalRoutedToSeries;         // Total routed to series
    uint256 public totalReturnedToProtocol;     // Total returned to protocol
    uint256 public failedRouteCount;            // Number of failed route attempts
    uint256 public pendingToRoute;              // ETH received but not yet routed (prevents early withdrawal)
    
    // Events
    event RevenueReceived(address indexed from, uint256 amount, uint256 timestamp);
    event RevenueRouted(uint256 seriesAmount, uint256 protocolAmount, uint256 timestamp);
    event RouteAttemptFailed(string reason, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    event WithdrawnToProtocol(uint256 amount, uint256 timestamp);
    
    /**
     * @notice Initialize revenue router
     * @param _protocol Protocol address
     * @param _revenueSeries RevenueSeries contract address
     * @param _revenueShareBPS Revenue share for series in BPS (2000 = 20%)
     */
    constructor(
        address _protocol,
        address payable _revenueSeries,
        uint256 _revenueShareBPS
    ) Ownable(msg.sender) {
        require(_protocol != address(0), "Invalid protocol");
        require(_revenueShareBPS > 0 && _revenueShareBPS <= 10000, "Invalid BPS");
        
        protocol = _protocol;
        revenueSeries = _revenueSeries;
        revenueShareBPS = _revenueShareBPS;
        seriesAddressSet = (_revenueSeries != address(0));
    }
    
    /**
     * @notice Update series address (only callable once by owner during deployment)
     * @param _revenueSeries RevenueSeries contract address
     */
    function updateSeriesAddress(address payable _revenueSeries) external {
        require(msg.sender == owner() || msg.sender == protocol, "Not authorized");
        require(!seriesAddressSet, "Series address already set");
        require(_revenueSeries != address(0), "Invalid series");
        
        revenueSeries = _revenueSeries;
        seriesAddressSet = true;
    }
    
    /**
     * @notice Receive revenue from any source
     * @dev Accepts ETH from anyone (not just protocol) for resilience
     */
    receive() external payable {
        require(msg.value > 0, "No revenue");
        require(seriesAddressSet, "Series not configured yet");
        
        totalRevenueReceived += msg.value;
        pendingToRoute += msg.value;  // Mark as pending routing
        emit RevenueReceived(msg.sender, msg.value, block.timestamp);
    }
    
    /**
     * @notice Receive revenue and immediately attempt to route
     * @dev Useful when gas is cheap or for automated flows
     */
    function receiveAndRoute() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "No revenue");
        
        totalRevenueReceived += msg.value;
        pendingToRoute += msg.value;  // Mark as pending routing
        emit RevenueReceived(msg.sender, msg.value, block.timestamp);
        
        // Attempt immediate routing
        _tryRouteRevenue();
    }
    
    /**
     * @notice Route accumulated revenue to series and protocol
     * @dev Anyone can call this to trigger distribution
     */
    function routeRevenue() external nonReentrant whenNotPaused {
        _tryRouteRevenue();
    }
    
    /**
     * @notice Internal function to attempt routing with graceful fallback
     * @dev Checks if series is active and not matured before routing
     */
    function _tryRouteRevenue() internal {
        require(revenueSeries != address(0), "Series not set");
        
        uint256 balance = address(this).balance;
        require(balance > 0, "No revenue to route");
        
        // Get series status
        (,, uint256 maturityDate,,,bool isActive, uint256 timeRemaining) = RevenueSeries(revenueSeries).getSeriesInfo();
        
        // Check if series is still active AND not matured
        if (!isActive || timeRemaining == 0 || block.timestamp >= maturityDate) {
            // Series is matured/inactive, clear pending so protocol can withdraw
            pendingToRoute = 0;
            failedRouteCount++;
            
            emit RouteAttemptFailed("Series inactive or matured", balance);
            return;
        }
        
        // Calculate splits based on pending amount (not total balance)
        uint256 amountToRoute = pendingToRoute;
        // Round UP for series to prevent protocol from gaining rounding errors
        uint256 seriesAmount = (amountToRoute * revenueShareBPS + 9999) / 10000;
        // Ensure we don't exceed amountToRoute due to rounding
        if (seriesAmount > amountToRoute) seriesAmount = amountToRoute;
        uint256 protocolAmount = amountToRoute - seriesAmount;
        
        // Check if seriesAmount meets minimum distribution requirement
        uint256 minDistribution = RevenueSeries(revenueSeries).minDistributionAmount();
        if (seriesAmount < minDistribution) {
            // Not enough to distribute - keep pending for accumulation
            emit RouteAttemptFailed("Amount below minDistribution", seriesAmount);
            return;
        }
        
        // Clear pending BEFORE external call (CEI pattern)
        pendingToRoute = 0;
        
        // Try to send to series with graceful fallback
        // NOTE: We do NOT increment owedToSeries before try - prevents race condition
        try RevenueSeries(revenueSeries).distributeRevenue{value: seriesAmount}() {
            // Success - update totals only
            totalRoutedToSeries += seriesAmount;
            
            emit RevenueRouted(seriesAmount, protocolAmount, block.timestamp);
        } catch Error(string memory reason) {
            // Series rejected - restore to pending for retry
            failedRouteCount++;
            pendingToRoute = amountToRoute;
            
            emit RouteAttemptFailed(reason, balance);
        } catch {
            // Unknown error - restore to pending for retry
            failedRouteCount++;
            pendingToRoute = amountToRoute;
            
            emit RouteAttemptFailed("Unknown error", balance);
        }
    }
    
    /**
     * @notice Withdraw accumulated protocol share to protocol address
     * @dev Protocol or owner can call this to withdraw their share
     * Only allows withdrawing balance that is NOT owed to series
     */
    function withdrawToProtocol(uint256 amount) external nonReentrant {
        require(msg.sender == protocol || msg.sender == owner(), "Not authorized");
        require(amount > 0, "Invalid amount");
        require(pendingToRoute == 0, "Must route pending revenue first");
        
        uint256 availableBalance = address(this).balance;
        require(amount <= availableBalance, "Insufficient available balance");
        
        totalReturnedToProtocol += amount;
        
        (bool success, ) = protocol.call{value: amount}("");
        require(success, "Withdraw failed");
        
        emit WithdrawnToProtocol(amount, block.timestamp);
    }
    
    /**
     * @notice Withdraw all accumulated protocol share to protocol address
     * @dev Protocol or owner can call this to withdraw all available funds
     * Only allows withdrawing balance that is NOT owed to series
     */
    function withdrawAllToProtocol() external nonReentrant {
        require(msg.sender == protocol || msg.sender == owner(), "Not authorized");
        require(pendingToRoute == 0, "Must route pending revenue first");
        
        uint256 amount = address(this).balance;
        require(amount > 0, "No available balance");
        
        totalReturnedToProtocol += amount;
        
        (bool success, ) = protocol.call{value: amount}("");
        require(success, "Withdraw failed");
        
        emit WithdrawnToProtocol(amount, block.timestamp);
    }
    
    /**
     * @notice Emergency withdraw (only owner)
     * @dev Use if router is stuck or needs manual intervention
     * @dev CRITICAL: Cannot withdraw funds pending for bondholders (pendingToRoute)
     */
    function emergencyWithdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        
        // CRITICAL: Protect bondholder funds - cannot withdraw pendingToRoute
        uint256 protectedAmount = pendingToRoute;
        uint256 availableBalance = address(this).balance > protectedAmount 
            ? address(this).balance - protectedAmount 
            : 0;
        require(availableBalance > 0, "No available balance (funds protected for bondholders)");
        
        (bool success, ) = to.call{value: availableBalance}("");
        require(success, "Emergency withdraw failed");
        
        emit EmergencyWithdraw(to, availableBalance);
    }
    
    /**
     * @notice Pause routing (emergency only)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause routing
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Get router status
     */
    function getRouterStatus() external view returns (
        uint256 currentBalance,
        uint256 totalReceived,
        uint256 totalToSeries,
        uint256 totalToProtocol,
        uint256 failedAttempts,
        uint256 shareBPS,
        bool canRouteNow
    ) {
        // Check if series is set before calling
        if (revenueSeries == address(0)) {
            return (address(this).balance, totalRevenueReceived, totalRoutedToSeries, totalReturnedToProtocol, failedRouteCount, revenueShareBPS, false);
        }
        
        (,, uint256 maturityDate,,,bool isActive, uint256 timeRemaining) = 
            RevenueSeries(revenueSeries).getSeriesInfo();
        
        // Same check as _tryRouteRevenue for consistency
        bool canRoute = isActive && timeRemaining > 0 && block.timestamp < maturityDate;
        
        return (
            address(this).balance,
            totalRevenueReceived,
            totalRoutedToSeries,
            totalReturnedToProtocol,
            failedRouteCount,
            revenueShareBPS,
            canRoute
        );
    }
}
