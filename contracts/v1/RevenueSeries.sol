// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueSeries
 * @notice ERC-20 token representing a fungible revenue bond series
 * @dev Each series is an independent ERC-20 with immutable terms
 * 
 * Example: "CAMELOT-REV-20-12M" = 20% of Camelot fees for 12 months
 * - 1,000,000 tokens minted
 * - Each token = equal share of the 20% revenue
 * - Fully fungible and divisible
 * - Tradeable on Uniswap, usable as collateral in Aave
 */
contract RevenueSeries is ERC20, Ownable, ReentrancyGuard {
    // Immutable terms (set at creation, never change)
    address public immutable protocol;           // Protocol issuing the series
    address public immutable router;             // Authorized router for distribution
    uint256 public immutable revenueShareBPS;    // Revenue share in basis points (2000 = 20%)
    uint256 public immutable maturityDate;       // When series expires
    uint256 public immutable totalTokenSupply;   // Fixed supply
    
    // Revenue tracking (mutable, updated as revenue comes in)
    uint256 public totalRevenueReceived;         // Total ETH received from protocol
    uint256 public revenuePerTokenStored;        // Accumulated revenue per token (scaled by 1e18)
    mapping(address => uint256) public userRevenuePerTokenPaid; // Last revenuePerToken when user was updated
    mapping(address => uint256) public rewards;  // Accumulated rewards ready to claim
    
    // Status
    bool public active;
    
    // Events
    event SeriesConfigured(
        address indexed protocol,
        address indexed router,
        uint256 revenueShareBPS,
        uint256 maturityDate,
        uint256 totalSupply
    );
    event RevenueReceived(uint256 amount, uint256 timestamp);
    event RevenueClaimed(address indexed user, uint256 amount);
    event SeriesMatured(uint256 timestamp);
    
    /**
     * @notice Create a new revenue series
     * @param _name Token name (e.g., "Equorum Revenue - Camelot 20% 12M")
     * @param _symbol Token symbol (e.g., "EQREV-CAMELOT-20-12M")
     * @param _protocol Protocol address
     * @param _router Router address authorized to distribute revenue
     * @param _revenueShareBPS Revenue share in basis points (2000 = 20%)
     * @param _durationDays Duration in days
     * @param _totalSupply Total token supply (e.g., 1,000,000 * 10^18)
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _protocol,
        address _router,
        uint256 _revenueShareBPS,
        uint256 _durationDays,
        uint256 _totalSupply
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_protocol != address(0), "Invalid protocol");
        require(_router != address(0), "Invalid router");
        require(_revenueShareBPS > 0 && _revenueShareBPS <= 10000, "Invalid BPS");
        require(_durationDays > 0, "Invalid duration");
        require(_totalSupply > 0, "Invalid supply");
        
        protocol = _protocol;
        router = _router;
        revenueShareBPS = _revenueShareBPS;
        maturityDate = block.timestamp + (_durationDays * 1 days);
        totalTokenSupply = _totalSupply;
        active = true;
        
        // Mint all tokens directly to protocol (not factory)
        _mint(_protocol, _totalSupply);
        
        // Emit configuration event for indexers
        emit SeriesConfigured(_protocol, _router, _revenueShareBPS, maturityDate, _totalSupply);
    }
    
    /**
     * @notice Distribute revenue to token holders
     * @dev Protocol or authorized router can call this function to distribute revenue
     * Protocol must send the correct amount based on their actual revenue
     */
    function distributeRevenue() external payable {
        require(msg.sender == protocol || msg.sender == router, "Only protocol or router can distribute");
        require(active, "Series not active");
        require(block.timestamp < maturityDate, "Series matured");
        require(msg.value > 0, "No revenue to distribute");
        
        // Protect against division by zero
        uint256 supply = totalSupply();
        require(supply > 0, "No token supply");
        
        totalRevenueReceived += msg.value;
        
        // Update revenue per token (scaled by 1e18 for precision)
        revenuePerTokenStored += (msg.value * 1e18) / supply;
        
        emit RevenueReceived(msg.value, block.timestamp);
    }
    
    /**
     * @notice Fallback to reject direct ETH transfers
     * @dev Protocol must use distributeRevenue() function
     */
    receive() external payable {
        revert("Use distributeRevenue() function");
    }
    
    /**
     * @notice Update rewards for an account
     * @dev Called before any balance change to ensure correct accounting
     */
    function _updateRewards(address account) internal {
        if (account == address(0)) return;
        
        // Calculate earned since last update
        uint256 earned = (balanceOf(account) * (revenuePerTokenStored - userRevenuePerTokenPaid[account])) / 1e18;
        
        // Add to accumulated rewards
        rewards[account] += earned;
        
        // Update paid index
        userRevenuePerTokenPaid[account] = revenuePerTokenStored;
    }
    
    /**
     * @notice Claim accumulated revenue
     * @dev Anyone can claim their proportional share
     */
    function claimRevenue() external nonReentrant {
        _claimFor(msg.sender);
    }
    
    /**
     * @notice Claim accumulated revenue for a specific user
     * @dev Allows relayers/UI to pay gas, user receives funds
     * @param user Address to claim for
     */
    function claimFor(address user) external nonReentrant {
        require(user != address(0), "Invalid user");
        _claimFor(user);
    }
    
    /**
     * @notice Internal claim logic
     * @param user Address to claim for
     */
    function _claimFor(address user) internal {
        // Update rewards first
        _updateRewards(user);
        
        uint256 claimable = rewards[user];
        require(claimable > 0, "No revenue to claim");
        
        // Transfer ETH to user (not msg.sender) - CEI pattern: Interactions before Effects
        (bool success, ) = user.call{value: claimable}("");
        require(success, "Transfer failed");
        
        // Reset rewards AFTER successful transfer to prevent loss if transfer fails
        rewards[user] = 0;
        
        emit RevenueClaimed(user, claimable);
    }
    
    /**
     * @notice Calculate claimable revenue for an address
     */
    function calculateClaimable(address account) external view returns (uint256) {
        uint256 balance = balanceOf(account);
        if (balance == 0) return rewards[account];
        
        // Calculate pending + accumulated
        uint256 pending = (balance * (revenuePerTokenStored - userRevenuePerTokenPaid[account])) / 1e18;
        return rewards[account] + pending;
    }
    
    /**
     * @notice Mature the series (only after maturity date)
     */
    function matureSeries() external {
        require(block.timestamp >= maturityDate, "Not matured yet");
        require(active, "Already matured");
        
        active = false;
        emit SeriesMatured(block.timestamp);
    }
    
    /**
     * @notice Get series info
     */
    function getSeriesInfo() external view returns (
        address protocolAddress,
        uint256 revenueBPS,
        uint256 maturity,
        uint256 totalRevenue,
        uint256 revenuePerToken,
        bool isActive,
        uint256 timeRemaining
    ) {
        return (
            protocol,
            revenueShareBPS,
            maturityDate,
            totalRevenueReceived,
            revenuePerTokenStored,
            active && block.timestamp < maturityDate,
            block.timestamp < maturityDate ? maturityDate - block.timestamp : 0
        );
    }
    
    /**
     * @notice Override transfer hook to update rewards before balance changes
     * @dev Updates rewards for both sender and receiver before transfer
     * This ensures correct accounting when tokens are transferred
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        // Update rewards before balance changes
        _updateRewards(from);
        _updateRewards(to);
        
        // Execute transfer
        super._update(from, to, value);
    }
}
