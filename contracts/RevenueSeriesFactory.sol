// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RevenueSeries.sol";
import "./RevenueRouter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueSeriesFactory
 * @notice Factory to create new revenue bond series
 * @dev Protocols use this to create new ERC-20 revenue series
 */
contract RevenueSeriesFactory is Ownable, Pausable, ReentrancyGuard {
    // Registry of all series
    address[] public allSeries;
    mapping(address => address[]) public seriesByProtocol;
    mapping(address => address) public routerBySeries;  // Series -> Router mapping
    
    // Fee configuration
    address public treasury;
    uint256 public creationFeeETH;
    bool public feesEnabled;
    
    // Safety limits
    uint256 public constant MAX_REVENUE_SHARE_BPS = 5000;  // Max 50%
    uint256 public constant MIN_DURATION_DAYS = 30;        // Min 30 days
    uint256 public constant MAX_DURATION_DAYS = 1825;      // Max 5 years
    uint256 public constant MIN_TOTAL_SUPPLY = 1000e18;    // Min 1000 tokens
    
    // Events
    event SeriesCreated(
        address indexed series,
        address indexed router,
        address indexed protocol,
        string name,
        string symbol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    );
    
    event FeeCollected(
        address indexed payer,
        address indexed treasury,
        uint256 amount,
        string feeType
    );
    
    event TreasuryUpdated(
        address indexed newTreasury
    );
    
    event FeesConfigUpdated(
        bool enabled,
        uint256 creationFeeETH
    );
    
    constructor(address _treasury) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        feesEnabled = false;  // Start with fees disabled
        creationFeeETH = 0;
    }
    
    /**
     * @notice Create a new revenue series with automatic router
     * @param name Token name (e.g., "Equorum Revenue - Camelot 20% 12M")
     * @param symbol Token symbol (e.g., "EQREV-CAMELOT-20-12M")
     * @param protocol Protocol address
     * @param revenueShareBPS Revenue share in basis points (2000 = 20%)
     * @param durationDays Duration in days
     * @param totalSupply Total token supply (with 18 decimals)
     * @return seriesAddress Address of the created series
     * @return routerAddress Address of the created router
     */
    function createSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply
    ) external payable whenNotPaused nonReentrant returns (address seriesAddress, address routerAddress) {
        require(msg.sender == protocol, "Only protocol can create series");
        require(protocol != address(0), "Invalid protocol");
        
        // Safety limits
        require(revenueShareBPS > 0 && revenueShareBPS <= MAX_REVENUE_SHARE_BPS, "Invalid BPS");
        require(durationDays >= MIN_DURATION_DAYS && durationDays <= MAX_DURATION_DAYS, "Invalid duration");
        require(totalSupply >= MIN_TOTAL_SUPPLY, "Supply too low");
        
        // Handle creation fee
        if (feesEnabled) {
            require(treasury != address(0), "Treasury not set");
            require(msg.value >= creationFeeETH, "Insufficient fee");
            
            // Send fee to treasury
            if (creationFeeETH > 0) {
                (bool success, ) = treasury.call{value: creationFeeETH}("");
                require(success, "Fee transfer failed");
                
                emit FeeCollected(msg.sender, treasury, creationFeeETH, "creation");
            }
            
            // Refund excess
            if (msg.value > creationFeeETH) {
                uint256 refundAmount = msg.value - creationFeeETH;
                (bool refundSuccess, ) = msg.sender.call{value: refundAmount}("");
                require(refundSuccess, "Refund failed");
            }
        } else {
            // No fees required, refund any ETH sent
            if (msg.value > 0) {
                (bool refundSuccess, ) = msg.sender.call{value: msg.value}("");
                require(refundSuccess, "Refund failed");
            }
        }
        
        // Deploy router first (need address for series)
        RevenueRouter router = new RevenueRouter(
            protocol,
            payable(address(0)), // Temporary, will be set after series creation
            revenueShareBPS
        );
        
        routerAddress = address(router);
        
        // Deploy series with router address
        RevenueSeries series = new RevenueSeries(
            name,
            symbol,
            protocol,
            routerAddress,
            revenueShareBPS,
            durationDays,
            totalSupply
        );
        
        seriesAddress = address(series);
        
        // Update router with series address
        router.updateSeriesAddress(payable(seriesAddress));
        
        // Register series and router
        allSeries.push(seriesAddress);
        seriesByProtocol[protocol].push(seriesAddress);
        routerBySeries[seriesAddress] = routerAddress;
        
        // Transfer ownership to protocol (series tokens already minted to protocol)
        series.transferOwnership(protocol);
        router.transferOwnership(protocol);
        
        emit SeriesCreated(
            seriesAddress,
            routerAddress,
            protocol,
            name,
            symbol,
            revenueShareBPS,
            durationDays,
            totalSupply
        );
        
        return (seriesAddress, routerAddress);
    }
    
    /**
     * @notice Get all series created
     */
    function getAllSeries() external view returns (address[] memory) {
        return allSeries;
    }
    
    /**
     * @notice Get series by protocol
     */
    function getSeriesByProtocol(address protocol) external view returns (address[] memory) {
        return seriesByProtocol[protocol];
    }
    
    /**
     * @notice Get total number of series
     */
    function getTotalSeries() external view returns (uint256) {
        return allSeries.length;
    }
    
    /**
     * @notice Get router address for a series
     */
    function getRouterForSeries(address series) external view returns (address) {
        return routerBySeries[series];
    }
    
    // ============================================
    // Admin Functions
    // ============================================
    
    /**
     * @notice Update treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }
    
    /**
     * @notice Update fees configuration
     */
    function setFees(bool _enabled, uint256 _creationFeeETH) external onlyOwner {
        feesEnabled = _enabled;
        creationFeeETH = _creationFeeETH;
        emit FeesConfigUpdated(_enabled, _creationFeeETH);
    }
    
    /**
     * @notice Pause contract (stops series creation)
     */
    function pause() external onlyOwner {
        _pause();
    }
    
    /**
     * @notice Unpause contract
     */
    function unpause() external onlyOwner {
        _unpause();
    }
    
    /**
     * @notice Get fee configuration
     */
    function getFeeConfig() external view returns (
        address treasuryAddress,
        uint256 feeETH,
        bool enabled
    ) {
        return (treasury, creationFeeETH, feesEnabled);
    }
    
    /**
     * @notice Get safety limits
     */
    function getSafetyLimits() external pure returns (
        uint256 maxShareBPS,
        uint256 minDurationDays,
        uint256 maxDurationDays,
        uint256 minSupply
    ) {
        return (
            MAX_REVENUE_SHARE_BPS,
            MIN_DURATION_DAYS,
            MAX_DURATION_DAYS,
            MIN_TOTAL_SUPPLY
        );
    }
}
