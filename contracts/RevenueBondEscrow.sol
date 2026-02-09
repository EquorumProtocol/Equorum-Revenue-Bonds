// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueBondEscrow
 * @notice HYBRID Revenue Bond with Principal Escrow
 * @dev Trust-minimized bond with HARD enforcement for principal repayment
 * 
 * MODEL: Revenue Share + Principal Guarantee
 * - Protocol deposits principal upfront (escrowed)
 * - Distributes revenue during bond duration
 * - Principal returned to bondholders at maturity
 * 
 * CRITICAL LIMITATIONS:
 * - PRINCIPAL is GUARANTEED (held in smart contract escrow)
 * - REVENUE is VOLUNTARY (trust-based, reputation-enforced)
 * - This protects DOWNSIDE (you get your money back)
 * - This does NOT guarantee YIELD (protocol may pay zero revenue)
 * 
 * This is a TRUE BOND (like corporate bonds):
 * - Principal is guaranteed (held in escrow)
 * - Revenue distributions are still trust-based
 * - Combines DeFi security with TradFi structure
 * 
 * Comparison:
 * - Traditional Bond: Principal + Interest guaranteed by legal contract
 * - This Bond: Principal guaranteed by smart contract, Revenue by reputation
 * 
 * USE CASE: Downside protection for risk-averse investors, not yield guarantee
 */
contract RevenueBondEscrow is ERC20, Ownable, ReentrancyGuard {
    // State enum
    enum SeriesState { PendingPrincipal, Active, Matured, Defaulted }
    
    // Immutable terms
    address public immutable protocol;
    address public immutable router;
    address public immutable reputationRegistry;
    uint256 public immutable revenueShareBPS;
    uint256 public immutable maturityDate;
    uint256 public immutable totalTokenSupply;
    uint256 public immutable principalAmount;  // Total principal escrowed
    uint256 public immutable minPurchaseAmount;  // Minimum purchase to prevent rounding to zero
    uint256 public immutable minDistributionAmount;  // Minimum distribution amount (prevents fake compliance)
    uint256 public immutable depositDeadline;  // Deadline for protocol to deposit principal (prevents unfair default)
    
    // Revenue tracking (Synthetix pattern)
    uint256 public totalRevenueReceived;
    uint256 public revenuePerTokenStored;
    mapping(address => uint256) public userRevenuePerTokenPaid;
    mapping(address => uint256) public revenueRewards;
    
    // Principal redemption tracking
    mapping(address => bool) public principalClaimed;
    uint256 public totalPrincipalClaimed;
    
    // Status
    SeriesState public state;
    bool public principalDeposited;
    
    // Events
    event SeriesConfigured(
        address indexed protocol,
        uint256 revenueShareBPS,
        uint256 maturityDate,
        uint256 totalSupply,
        uint256 principalAmount
    );
    event PrincipalDeposited(uint256 amount, uint256 timestamp);
    event RevenueReceived(uint256 amount, uint256 timestamp);
    event RevenueClaimed(address indexed user, uint256 amount);
    event PrincipalClaimed(address indexed user, uint256 amount);
    event SeriesMatured(uint256 timestamp);
    event SeriesDefaulted(uint256 timestamp);
    event DustRescued(uint256 amount);
    event ReputationReportFailed(address indexed protocol, uint256 amount);
    event DefaultDeclarationFailed(address indexed protocol, string reason);
    
    /**
     * @notice Create a new revenue bond with principal escrow
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _protocol Protocol address
     * @param _router Router address
     * @param _reputationRegistry Reputation registry address
     * @param _revenueShareBPS Revenue share in basis points
     * @param _durationDays Duration in days
     * @param _totalSupply Total token supply
     * @param _principalAmount Total principal to be escrowed (must match)
     * @param _minPurchaseAmount Minimum purchase amount (prevents rounding issues)
     * @param _minDistributionAmount Minimum distribution amount (prevents fake compliance)
     * @param _depositDeadlineDays Days from creation for protocol to deposit principal (default: 30)
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _protocol,
        address _router,
        address _reputationRegistry,
        uint256 _revenueShareBPS,
        uint256 _durationDays,
        uint256 _totalSupply,
        uint256 _principalAmount,
        uint256 _minPurchaseAmount,
        uint256 _minDistributionAmount,
        uint256 _depositDeadlineDays
    ) ERC20(_name, _symbol) Ownable(msg.sender) {
        require(_protocol != address(0), "Invalid protocol");
        require(_router != address(0), "Invalid router");
        require(_reputationRegistry != address(0), "Invalid registry");
        require(_revenueShareBPS > 0 && _revenueShareBPS <= 10000, "Invalid BPS");
        require(_durationDays > 0, "Invalid duration");
        require(_totalSupply > 0, "Invalid supply");
        require(_principalAmount > 0, "Invalid principal");
        require(_minPurchaseAmount > 0, "Invalid min purchase");
        require(_minDistributionAmount > 0, "Invalid min distribution");
        require(_depositDeadlineDays > 0 && _depositDeadlineDays <= 90, "Invalid deposit deadline");
        
        protocol = _protocol;
        router = _router;
        reputationRegistry = _reputationRegistry;
        revenueShareBPS = _revenueShareBPS;
        maturityDate = block.timestamp + (_durationDays * 1 days);
        totalTokenSupply = _totalSupply;
        principalAmount = _principalAmount;
        minPurchaseAmount = _minPurchaseAmount;
        minDistributionAmount = _minDistributionAmount;
        depositDeadline = block.timestamp + (_depositDeadlineDays * 1 days);
        state = SeriesState.PendingPrincipal;  // Becomes Active after depositPrincipal()
        
        emit SeriesConfigured(_protocol, _revenueShareBPS, maturityDate, _totalSupply, _principalAmount);
    }
    
    /**
     * @notice Protocol deposits principal (must be called before bonds can be sold)
     * @dev Principal is locked in contract until maturity
     */
    function depositPrincipal() external payable {
        require(msg.sender == protocol, "Only protocol");
        require(!principalDeposited, "Already deposited");
        require(state != SeriesState.Matured, "Already matured");
        require(block.timestamp < maturityDate, "Past maturity");
        require(msg.value == principalAmount, "Incorrect amount");
        
        principalDeposited = true;
        state = SeriesState.Active;
        
        // Mint tokens to protocol (can now sell them)
        // Note: minPurchaseAmount is enforced in _update() hook when protocol sells/transfers
        _mint(protocol, totalTokenSupply);
        
        emit PrincipalDeposited(msg.value, block.timestamp);
    }
    
    /**
     * @notice Distribute revenue to bondholders
     * @dev Protocol or router can distribute revenue
     */
    function distributeRevenue() external payable {
        require(msg.sender == protocol || msg.sender == router, "Only protocol or router");
        require(state == SeriesState.Active, "Not active");
        require(block.timestamp < maturityDate, "Matured");
        require(msg.value >= minDistributionAmount, "Distribution too small");
        
        uint256 supply = totalSupply();
        require(supply > 0, "No supply");
        
        totalRevenueReceived += msg.value;
        
        // Validate rounding to prevent revenue loss
        uint256 revenuePerToken = (msg.value * 1e18) / supply;
        require(revenuePerToken > 0, "Distribution too small for supply");
        revenuePerTokenStored += revenuePerToken;
        
        // Report to reputation registry
        (bool success, ) = reputationRegistry.call(
            abi.encodeWithSignature(
                "recordDistribution(address,uint256)",
                protocol,
                msg.value
            )
        );
        
        // Emit event if registry call failed (for debugging)
        if (!success) {
            emit ReputationReportFailed(protocol, msg.value);
        }
        
        emit RevenueReceived(msg.value, block.timestamp);
    }
    
    /**
     * @notice Update rewards for account (internal)
     */
    function _updateRewards(address account) internal {
        if (account == address(0)) return;
        
        uint256 balance = balanceOf(account);
        uint256 revenuePerTokenDelta = revenuePerTokenStored - userRevenuePerTokenPaid[account];
        
        // Calculate earned rewards with overflow protection
        if (balance > 0 && revenuePerTokenDelta > 0) {
            // Only check overflow if revenuePerTokenDelta > 1e18
            if (revenuePerTokenDelta > 1e18) {
                require(balance <= type(uint256).max / revenuePerTokenDelta, "Reward calculation overflow");
            }
            
            uint256 earned = (balance * revenuePerTokenDelta) / 1e18;
            revenueRewards[account] += earned;
        }
        
        userRevenuePerTokenPaid[account] = revenuePerTokenStored;
    }
    
    /**
     * @notice Claim accumulated revenue
     */
    function claimRevenue() external nonReentrant {
        _updateRewards(msg.sender);
        
        uint256 claimable = revenueRewards[msg.sender];
        require(claimable > 0, "No revenue");
        
        revenueRewards[msg.sender] = 0;
        
        (bool success, ) = msg.sender.call{value: claimable}("");
        require(success, "Transfer failed");
        
        emit RevenueClaimed(msg.sender, claimable);
    }
    
    /**
     * @notice Mature the series
     */
    function matureSeries() external {
        require(block.timestamp >= maturityDate, "Not matured");
        require(state == SeriesState.Active, "Not active");
        require(principalDeposited, "Principal not deposited");
        
        state = SeriesState.Matured;
        
        emit SeriesMatured(block.timestamp);
    }
    
    /**
     * @notice Declare default if principal not deposited by deadline
     * @dev Anyone can call this after depositDeadline if principal not deposited
     */
    function declareDefault() external {
        require(block.timestamp >= depositDeadline, "Too early to declare default");
        require(state == SeriesState.PendingPrincipal, "Not in PendingPrincipal state");
        require(!principalDeposited, "Principal was deposited");
        
        state = SeriesState.Defaulted;
        
        // Report to reputation registry (blacklist protocol)
        (bool success, ) = reputationRegistry.call(
            abi.encodeWithSignature(
                "blacklistProtocol(address,string)",
                protocol,
                "Failed to deposit principal"
            )
        );
        
        if (!success) {
            emit DefaultDeclarationFailed(protocol, "Registry call failed");
        }
        
        emit SeriesDefaulted(block.timestamp);
    }
    
    /**
     * @notice Claim principal after maturity
     * @dev Bondholders can redeem their share of escrowed principal
     * Tokens are burned to prevent double-claim
     * Auto-matures if past maturity date to prevent race condition
     */
    function claimPrincipal() external nonReentrant {
        require(principalDeposited, "Principal not deposited");
        require(!principalClaimed[msg.sender], "Already claimed");
        
        // Auto-mature if past maturity and still active
        if (block.timestamp >= maturityDate && state == SeriesState.Active) {
            state = SeriesState.Matured;
            emit SeriesMatured(block.timestamp);
        }
        
        require(state == SeriesState.Matured, "Not matured");
        
        uint256 holderBalance = balanceOf(msg.sender);
        require(holderBalance > 0, "No balance");
        
        // Calculate proportional share of principal
        uint256 principalShare = (principalAmount * holderBalance) / totalTokenSupply;
        require(principalShare > 0, "No principal to claim");
        
        // CEI pattern: Update state before external calls
        totalPrincipalClaimed += principalShare;
        principalClaimed[msg.sender] = true;
        
        // Burn tokens (prevents re-entrancy and double-claim)
        _burn(msg.sender, holderBalance);
        
        // Transfer principal to holder
        (bool success, ) = msg.sender.call{value: principalShare}("");
        require(success, "Transfer failed");
        
        emit PrincipalClaimed(msg.sender, principalShare);
    }    
        
    
    /**
     * @notice Calculate claimable revenue
     */
    function calculateClaimableRevenue(address account) external view returns (uint256) {
        uint256 balance = balanceOf(account);
        if (balance == 0) return revenueRewards[account];
        
        uint256 pending = (balance * (revenuePerTokenStored - userRevenuePerTokenPaid[account])) / 1e18;
        return revenueRewards[account] + pending;
    }
    
    /**
     * @notice Rescue dust principal left from rounding errors
     * @dev Only callable after all tokens are burned (totalSupply = 0)
     * Sends remaining principal to protocol as there are no more claimants
     * Does NOT touch revenue (only principal dust)
     * Requires minimum 1000 wei to prevent gas griefing
     */
    function rescueDustPrincipal() external {
        require(state == SeriesState.Matured, "Not matured");
        require(totalSupply() == 0, "Tokens still exist");
        
        // Calculate dust: remaining principal minus claimed
        uint256 dustPrincipal = principalAmount > totalPrincipalClaimed 
            ? principalAmount - totalPrincipalClaimed 
            : 0;
        
        require(dustPrincipal >= 1000, "Dust too small (min 1000 wei)");
        require(address(this).balance >= dustPrincipal, "Insufficient balance");
        
        (bool success, ) = protocol.call{value: dustPrincipal}("");
        require(success, "Transfer failed");
        
        emit DustRescued(dustPrincipal);
    }
    
    /**
     * @notice Calculate claimable principal
     */
    function calculateClaimablePrincipal(address account) external view returns (uint256) {
        if (state != SeriesState.Matured) return 0;
        if (principalClaimed[account]) return 0;
        
        uint256 balance = balanceOf(account);
        if (balance == 0) return 0;
        
        return (balance * principalAmount) / totalTokenSupply;
    }
    
    /**
     * @notice Get bond info
     */
    function getBondInfo() external view returns (
        address protocolAddress,
        uint256 revenueBPS,
        uint256 maturity,
        uint256 principal,
        uint256 totalRevenue,
        uint256 principalRemaining,
        SeriesState currentState
    ) {
        return (
            protocol,
            revenueShareBPS,
            maturityDate,
            principalAmount,
            totalRevenueReceived,
            principalAmount - totalPrincipalClaimed,
            state
        );
    }
    
    /**
     * @notice Override transfer to update rewards and enforce minimum purchase
     */
    function _update(address from, address to, uint256 value) internal virtual override {
        // Enforce minimum purchase (except for burns and mints from/to protocol)
        if (to != address(0) && from != address(0) && from != protocol && to != protocol) {
            // Check recipient will have minimum
            require(balanceOf(to) + value >= minPurchaseAmount, "Recipient below minimum");
            
            // Check sender will have minimum OR zero (full exit allowed)
            uint256 senderBalanceAfter = balanceOf(from) - value;
            require(
                senderBalanceAfter == 0 || senderBalanceAfter >= minPurchaseAmount,
                "Sender below minimum (must exit fully)"
            );
        }
        
        _updateRewards(from);
        _updateRewards(to);
        super._update(from, to, value);
    }
    
    /**
     * @notice Reject direct ETH transfers
     */
    receive() external payable {
        revert("Use depositPrincipal() or distributeRevenue()");
    }
}
