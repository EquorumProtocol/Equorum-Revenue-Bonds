// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RevenueSeries.sol";
import "./RevenueRouter.sol";
import "../interfaces/IFeePolicy.sol";
import "../interfaces/ISafetyPolicy.sol";
import "../interfaces/IAccessPolicy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RevenueSeriesFactory V2
 * @notice Factory with pluggable policies - "Deploy Once, Extend Later"
 * @dev Trust-minimized capital raising for protocols
 * 
 * ARCHITECTURE:
 * - Minimal, auditable core (immutable)
 * - Extensibility via pluggable policy contracts
 * - Hardcoded safety limits (policies can only make MORE restrictive)
 * - Default permissionless (accessPolicy = address(0))
 * - Transparent governance via events
 * 
 * BOND TYPES:
 * 1. SOFT (Revenue-Only): Reputation-based, no principal guarantee
 * 2. HYBRID (Revenue + Escrow): Principal guaranteed via smart contract escrow
 */
contract RevenueSeriesFactory is Ownable, Pausable, ReentrancyGuard {
    // Registry of all series
    address[] public allSeries;
    mapping(address => address[]) public seriesByProtocol;
    mapping(address => address) public routerBySeries;  // Series -> Router mapping
    
    // Reputation system
    address public reputationRegistry;
    
    // Core addresses
    address public treasury;
    
    // 🔌 PLUGGABLE POLICIES (Extensibility without re-deploy)
    address public feePolicy;      // address(0) = no fees
    address public safetyPolicy;   // address(0) = use hardcoded defaults only
    address public accessPolicy;   // address(0) = permissionless
    
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
        address indexed receiver,
        uint256 amount,
        string feeType
    );
    
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    
    event ReputationRegistryUpdated(
        address indexed oldRegistry,
        address indexed newRegistry
    );
    
    // 🔔 GOVERNANCE EVENTS (Transparency for policy changes)
    event FeePolicyUpdated(
        address indexed oldPolicy,
        address indexed newPolicy
    );
    
    event SafetyPolicyUpdated(
        address indexed oldPolicy,
        address indexed newPolicy
    );
    
    event AccessPolicyUpdated(
        address indexed oldPolicy,
        address indexed newPolicy
    );
    
    event ReputationRegistrationFailed(
        address indexed protocol,
        address indexed series
    );
    
    
    constructor(address _treasury, address _reputationRegistry) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_reputationRegistry != address(0), "Invalid registry");
        
        treasury = _treasury;
        reputationRegistry = _reputationRegistry;
        
        // Policies start as address(0) = disabled/permissionless
        feePolicy = address(0);
        safetyPolicy = address(0);
        accessPolicy = address(0);
    }
    
    /**
     * @notice Create a new revenue series with automatic router
     * @param name Token name (e.g., "Equorum Revenue - Camelot 20% 12M")
     * @param symbol Token symbol (e.g., "EQREV-CAMELOT-20-12M")
     * @param protocol Protocol address
     * @param revenueShareBPS Revenue share in basis points (2000 = 20%)
     * @param durationDays Duration in days (e.g., 365)
     * @param totalSupply Total token supply (e.g., 1_000_000 * 10^18)
     * @param minDistributionAmount Minimum distribution amount (prevents griefing)
     */
    function createSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 minDistributionAmount
    ) external payable whenNotPaused nonReentrant returns (address seriesAddress, address routerAddress) {
        require(protocol != address(0), "Invalid protocol");
        require(protocol == msg.sender, "Only protocol can create series for itself");
        
        // ============================================
        // STEP 1: HARDCODED SAFETY (Always enforced FIRST)
        // ============================================
        // This ensures no policy can weaken core security
        require(revenueShareBPS > 0 && revenueShareBPS <= MAX_REVENUE_SHARE_BPS, "Invalid BPS");
        require(durationDays >= MIN_DURATION_DAYS && durationDays <= MAX_DURATION_DAYS, "Invalid duration");
        require(totalSupply >= MIN_TOTAL_SUPPLY, "Supply too low");
        require(minDistributionAmount >= 0.001 ether, "Min distribution too low");
        
        // ============================================
        // STEP 2: POLICY SAFETY (Additional restrictions)
        // ============================================
        // Can only make rules MORE restrictive
        if (safetyPolicy != address(0)) {
            ISafetyPolicy(safetyPolicy).validateParams(
                protocol,
                revenueShareBPS,
                durationDays,
                totalSupply,
                minDistributionAmount
            );
        }
        
        // ============================================
        // STEP 3: ACCESS CONTROL (Optional via policy)
        // ============================================
        if (accessPolicy != address(0)) {
            require(
                IAccessPolicy(accessPolicy).canCreate(msg.sender),
                "Access denied by policy"
            );
        }
        // Default: permissionless (anyone can create)
        
        // ============================================
        // STEP 4: FEE CALCULATION & COLLECTION
        // ============================================
        uint256 fee = 0;
        address feeReceiver = treasury;
        
        if (feePolicy != address(0)) {
            (fee, feeReceiver) = IFeePolicy(feePolicy).getFeeQuote(
                protocol,
                revenueShareBPS,
                durationDays,
                totalSupply,
                minDistributionAmount
            );
            
            require(msg.value >= fee, "Insufficient fee");
            
            if (fee > 0) {
                // Protect against invalid receiver
                require(feeReceiver != address(0), "Invalid fee receiver");
                
                // Transfer fee (effects before external call)
                (bool feeSuccess, ) = feeReceiver.call{value: fee}("");
                require(feeSuccess, "Fee transfer failed");
                
                emit FeeCollected(msg.sender, feeReceiver, fee, "creation");
            }
        }
        
        // Refund excess (after all effects)
        if (msg.value > fee) {
            (bool refundSuccess, ) = msg.sender.call{value: msg.value - fee}("");
            require(refundSuccess, "Refund failed");
        }
        
        // Deploy router first (need address for series)
        RevenueRouter router = new RevenueRouter(
            protocol,
            payable(address(0)), // Temporary, will be set after series creation
            revenueShareBPS
        );
        
        routerAddress = address(router);
        
        // Deploy series with router address and reputation registry
        RevenueSeries series = new RevenueSeries(
            name,
            symbol,
            protocol,
            routerAddress,
            reputationRegistry,
            revenueShareBPS,
            durationDays,
            totalSupply,
            minDistributionAmount
        );
        
        seriesAddress = address(series);
        
        // Update router with series address
        router.updateSeriesAddress(payable(seriesAddress));
        
        // Register series and router
        allSeries.push(seriesAddress);
        seriesByProtocol[protocol].push(seriesAddress);
        routerBySeries[seriesAddress] = routerAddress;
        
        // Register in reputation system
        // Expected cadence: 30 days for series > 6 months, 7 days for shorter
        uint256 expectedCadenceDays = durationDays > 180 ? 30 : 7;
        
        // CRITICAL: Authorize Series as reporter BEFORE registering
        // This allows Series.distributeRevenue() to call recordDistribution()
        (bool authSuccess, ) = reputationRegistry.call(
            abi.encodeWithSignature(
                "authorizeReporter(address)",
                seriesAddress
            )
        );
        
        (bool regSuccess, ) = reputationRegistry.call(
            abi.encodeWithSignature(
                "registerSeries(address,address,uint256,uint256)",
                protocol,
                seriesAddress,
                0,  // Expected revenue unknown at creation
                expectedCadenceDays
            )
        );
        
        // Emit event if registry calls failed (for debugging)
        if (!authSuccess || !regSuccess) {
            emit ReputationRegistrationFailed(protocol, seriesAddress);
        }
        
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
        address oldTreasury = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(oldTreasury, _treasury);
    }
    
    /**
     * @notice Set fee policy contract
     * @dev Validates interface to prevent mistakes
     * @dev Accepts address(0) to disable fees
     */
    function setFeePolicy(address _policy) external onlyOwner {
        // Guardrails
        require(_policy != address(this), "Cannot set policy to factory");
        
        // Validate interface if not disabling
        if (_policy != address(0)) {
            require(
                IFeePolicy(_policy).isFeePolicy(),
                "Invalid FeePolicy interface"
            );
        }
        
        address oldPolicy = feePolicy;
        feePolicy = _policy;
        emit FeePolicyUpdated(oldPolicy, _policy);
    }
    
    /**
     * @notice Set safety policy contract
     * @dev Validates interface to prevent mistakes
     * @dev Accepts address(0) to use only hardcoded limits
     */
    function setSafetyPolicy(address _policy) external onlyOwner {
        // Guardrails
        require(_policy != address(this), "Cannot set policy to factory");
        
        // Validate interface if not disabling
        if (_policy != address(0)) {
            require(
                ISafetyPolicy(_policy).isSafetyPolicy(),
                "Invalid SafetyPolicy interface"
            );
        }
        
        address oldPolicy = safetyPolicy;
        safetyPolicy = _policy;
        emit SafetyPolicyUpdated(oldPolicy, _policy);
    }
    
    /**
     * @notice Set access policy contract
     * @dev ⚠️ CRITICAL: Changing from permissionless to permissioned is major governance event
     * @dev Should ideally be done via timelock
     * @dev Accepts address(0) to return to permissionless
     */
    function setAccessPolicy(address _policy) external onlyOwner {
        // Guardrails
        require(_policy != address(this), "Cannot set policy to factory");
        
        // Validate interface if not disabling
        if (_policy != address(0)) {
            require(
                IAccessPolicy(_policy).isAccessPolicy(),
                "Invalid AccessPolicy interface"
            );
        }
        
        address oldPolicy = accessPolicy;
        accessPolicy = _policy;
        emit AccessPolicyUpdated(oldPolicy, _policy);
    }
    
    /**
     * @notice Update reputation registry address
     * @dev Allows protocol to upgrade registry if needed (hack recovery, improvements)
     * @param newRegistry New registry address
     */
    function updateReputationRegistry(address newRegistry) external onlyOwner {
        require(newRegistry != address(0), "Invalid registry");
        address oldRegistry = reputationRegistry;
        reputationRegistry = newRegistry;
        emit ReputationRegistryUpdated(oldRegistry, newRegistry);
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
     * @notice Get current policies
     */
    function getPolicies() external view returns (
        address fee,
        address safety,
        address access
    ) {
        return (feePolicy, safetyPolicy, accessPolicy);
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
