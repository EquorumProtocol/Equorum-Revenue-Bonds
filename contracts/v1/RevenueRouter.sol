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
 * Security improvements:
 * - Accepts revenue from any source (not just protocol)
 * - Checks if series is active before routing
 * - Emergency withdraw if something goes wrong
 * - Graceful fallback if series rejects
 */
contract RevenueRouter is Ownable, ReentrancyGuard, Pausable {
    // Configuration
    address public protocol;                    // Protocol address (for returning remainder)
    address payable public revenueSeries;       // RevenueSeries contract (payable because it has receive())
    uint256 public revenueShareBPS;             // Share for series (e.g., 2000 = 20%)
    bool private seriesAddressSet;              // Flag to ensure series address is set only once
    
    // Tracking
    uint256 public totalRevenueReceived;        // Total revenue received
    uint256 public totalRoutedToSeries;         // Total routed to series
    uint256 public totalReturnedToProtocol;     // Total returned to protocol
    uint256 public failedRouteCount;            // Number of failed route attempts
    
    // Events
    event RevenueReceived(address indexed from, uint256 amount, uint256 timestamp);
    event RevenueRouted(uint256 seriesAmount, uint256 protocolAmount, uint256 timestamp);
    event RouteAttemptFailed(string reason, uint256 amount);
    event EmergencyWithdraw(address indexed to, uint256 amount);
    
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
        
        totalRevenueReceived += msg.value;
        emit RevenueReceived(msg.sender, msg.value, block.timestamp);
    }
    
    /**
     * @notice Receive revenue and immediately attempt to route
     * @dev Useful when gas is cheap or for automated flows
     */
    function receiveAndRoute() external payable whenNotPaused {
        require(msg.value > 0, "No revenue");
        
        totalRevenueReceived += msg.value;
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
            // Series is matured/inactive, keep funds in router
            // Protocol can withdraw manually via withdrawToProtocol()
            failedRouteCount++;
            
            emit RouteAttemptFailed("Series inactive or matured", balance);
            return;
        }
        
        // Calculate splits
        uint256 seriesAmount = (balance * revenueShareBPS) / 10000;
        uint256 protocolAmount = balance - seriesAmount;
        
        // Try to send to series with graceful fallback
        try RevenueSeries(revenueSeries).distributeRevenue{value: seriesAmount}() {
            // Success - update totals
            totalRoutedToSeries += seriesAmount;
            // protocolAmount stays in router for manual withdrawal
            
            emit RevenueRouted(seriesAmount, protocolAmount, block.timestamp);
        } catch Error(string memory reason) {
            // Series rejected - keep all in router
            failedRouteCount++;
            
            emit RouteAttemptFailed(reason, balance);
        } catch {
            // Unknown error - keep all in router
            failedRouteCount++;
            
            emit RouteAttemptFailed("Unknown error", balance);
        }
    }
    
    /**
     * @notice Withdraw accumulated protocol share to protocol address
     * @dev Protocol or owner can call this to withdraw their share
     */
    function withdrawToProtocol(uint256 amount) external nonReentrant {
        require(msg.sender == protocol || msg.sender == owner(), "Not authorized");
        require(amount > 0, "Invalid amount");
        require(amount <= address(this).balance, "Insufficient balance");
        
        totalReturnedToProtocol += amount;
        
        (bool success, ) = protocol.call{value: amount}("");
        require(success, "Withdraw failed");
    }
    
    /**
     * @notice Withdraw all accumulated protocol share to protocol address
     * @dev Protocol or owner can call this to withdraw all available funds
     */
    function withdrawAllToProtocol() external nonReentrant {
        require(msg.sender == protocol || msg.sender == owner(), "Not authorized");
        
        uint256 amount = address(this).balance;
        require(amount > 0, "No balance");
        
        totalReturnedToProtocol += amount;
        
        (bool success, ) = protocol.call{value: amount}("");
        require(success, "Withdraw failed");
    }
    
    /**
     * @notice Emergency withdraw (only owner)
     * @dev Use if router is stuck or needs manual intervention
     */
    function emergencyWithdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "Invalid address");
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        
        (bool success, ) = to.call{value: balance}("");
        require(success, "Emergency withdraw failed");
        
        emit EmergencyWithdraw(to, balance);
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
