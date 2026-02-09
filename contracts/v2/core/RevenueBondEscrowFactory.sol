// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/EscrowValidation.sol";
import "../interfaces/IFeePolicy.sol";
import "../interfaces/ISafetyPolicy.sol";
import "../interfaces/IAccessPolicy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

interface IReputationRegistry {
    function authorizeReporter(address reporter) external;
    function registerSeries(
        address protocol,
        address series,
        uint256 totalRevenuePromised,
        uint256 expectedCadenceDays
    ) external;
}

interface IEscrowDeployer {
    function deploy(
        string memory name,
        string memory symbol,
        address protocol,
        address routerAddress,
        address reputationRegistry,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 principalAmount,
        uint256 minPurchaseAmount,
        uint256 minDistributionAmount,
        uint256 depositDeadlineDays
    ) external returns (address);
}

interface IRouterDeployer {
    function deploy(
        address protocol,
        address payable revenueSeries,
        uint256 revenueShareBPS
    ) external returns (address);
}

interface IRouterLink {
    function updateSeriesAddress(address payable _revenueSeries) external;
    function transferOwnership(address newOwner) external;
}

interface ISeriesOwnable {
    function transferOwnership(address newOwner) external;
}

contract RevenueBondEscrowFactory is Ownable {

    error ZeroAddress();
    error NotProtocolSender();
    error NoAccess();
    error SelfPolicy();
    error InvalidFeePolicy();
    error InvalidSafetyPolicy();
    error InvalidAccessPolicy();

    bool public paused;
    uint256 private _locked = 1;

    modifier whenNotPaused() { require(!paused); _; }
    modifier nonReentrant() { require(_locked == 1); _locked = 2; _; _locked = 1; }

    using EscrowValidation for *;
    
    address[] public allSeries;
    mapping(address => address[]) public seriesByProtocol;
    mapping(address => address) public routerBySeries;
    address public reputationRegistry;
    address public treasury;
    address public feePolicy;
    address public safetyPolicy;
    address public accessPolicy;
    address public escrowDeployer;
    address public routerDeployer;
    
    // Constants (readable on-chain)
    uint256 public constant MAX_REVENUE_SHARE_BPS = EscrowValidation.MAX_REVENUE_SHARE_BPS;
    uint256 public constant MIN_DURATION_DAYS = EscrowValidation.MIN_DURATION_DAYS;
    uint256 public constant MAX_DURATION_DAYS = EscrowValidation.MAX_DURATION_DAYS;
    uint256 public constant MIN_TOTAL_SUPPLY = EscrowValidation.MIN_TOTAL_SUPPLY;
    
    // Events
    event EscrowSeriesCreated(
        address indexed series,
        address indexed router,
        address indexed protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 principalAmount
    );
    
    uint8 private constant FEE_ESCROW_CREATION = 1;

    event FeeCollected(
        address indexed payer,
        address indexed receiver,
        uint256 amount,
        uint8 feeType
    );
    
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ReputationRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event FeePolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event SafetyPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event AccessPolicyUpdated(address indexed oldPolicy, address indexed newPolicy);
    event ReputationRegistrationFailed(address indexed protocol, address indexed series);
    event Paused(address account);
    event Unpaused(address account);
    
    constructor(
        address _treasury,
        address _reputationRegistry,
        address _escrowDeployer,
        address _routerDeployer
    ) Ownable(msg.sender) {
        if (_treasury == address(0) || _reputationRegistry == address(0)) revert ZeroAddress();
        if (_escrowDeployer == address(0) || _routerDeployer == address(0)) revert ZeroAddress();
        
        treasury = _treasury;
        reputationRegistry = _reputationRegistry;
        escrowDeployer = _escrowDeployer;
        routerDeployer = _routerDeployer;
    }
    
    function createEscrowSeries(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 principalAmount,
        uint256 minDistributionAmount,
        uint256 depositDeadlineDays
    ) external payable whenNotPaused nonReentrant returns (address seriesAddress, address routerAddress) {
        if (protocol != msg.sender) revert NotProtocolSender();
        
        EscrowValidation.validateCreateParams(
            protocol,
            revenueShareBPS,
            durationDays,
            totalSupply,
            principalAmount,
            minDistributionAmount,
            depositDeadlineDays
        );
        
        // Policy safety
        if (safetyPolicy != address(0)) {
            ISafetyPolicy(safetyPolicy).validateParams(
                protocol,
                revenueShareBPS,
                durationDays,
                totalSupply,
                minDistributionAmount
            );
        }
        
        // Access control
        if (accessPolicy != address(0)) {
            if (!IAccessPolicy(accessPolicy).canCreate(msg.sender)) revert NoAccess();
        }
        
        // Fee collection
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
        }
        
        if (msg.value > 0) {
            EscrowValidation.handleFeeCollection(msg.value, fee, feeReceiver, msg.sender);
            if (fee > 0) {
                emit FeeCollected(msg.sender, feeReceiver, fee, FEE_ESCROW_CREATION);
            }
        }
        
        // Deploy router via deployer
        routerAddress = IRouterDeployer(routerDeployer).deploy(
            protocol,
            payable(address(0)),
            revenueShareBPS
        );
        
        // Deploy escrow series via deployer
        uint256 minPurchaseAmount = 1e18;
        
        seriesAddress = IEscrowDeployer(escrowDeployer).deploy(
            name,
            symbol,
            protocol,
            routerAddress,
            reputationRegistry,
            revenueShareBPS,
            durationDays,
            totalSupply,
            principalAmount,
            minPurchaseAmount,
            minDistributionAmount,
            depositDeadlineDays
        );
        
        // Link router to series
        IRouterLink(routerAddress).updateSeriesAddress(payable(seriesAddress));
        
        // Register
        allSeries.push(seriesAddress);
        seriesByProtocol[protocol].push(seriesAddress);
        routerBySeries[seriesAddress] = routerAddress;
        
        // Register in reputation system
        uint256 expectedCadenceDays = EscrowValidation.calculateExpectedCadence(durationDays);
        
        bool ok = true;
        try IReputationRegistry(reputationRegistry).authorizeReporter(seriesAddress) {
        } catch {
            ok = false;
        }
        try IReputationRegistry(reputationRegistry).registerSeries(
            protocol,
            seriesAddress,
            0,
            expectedCadenceDays
        ) {
        } catch {
            ok = false;
        }
        if (!ok) emit ReputationRegistrationFailed(protocol, seriesAddress);
        
        // Transfer ownership to protocol
        ISeriesOwnable(seriesAddress).transferOwnership(protocol);
        IRouterLink(routerAddress).transferOwnership(protocol);
        
        emit EscrowSeriesCreated(
            seriesAddress,
            routerAddress,
            protocol,
            revenueShareBPS,
            durationDays,
            totalSupply,
            principalAmount
        );
        
        return (seriesAddress, routerAddress);
    }
    
    // ============================================
    // Admin Functions
    // ============================================
    
    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = _treasury;
        emit TreasuryUpdated(old, _treasury);
    }
    
    function setReputationRegistry(address _registry) external onlyOwner {
        if (_registry == address(0)) revert ZeroAddress();
        address old = reputationRegistry;
        reputationRegistry = _registry;
        emit ReputationRegistryUpdated(old, _registry);
    }
    
    function setFeePolicy(address _policy) external onlyOwner {
        if (_policy == address(this)) revert SelfPolicy();
        if (_policy != address(0) && !IFeePolicy(_policy).isFeePolicy()) revert InvalidFeePolicy();
        address old = feePolicy;
        feePolicy = _policy;
        emit FeePolicyUpdated(old, _policy);
    }
    
    function setSafetyPolicy(address _policy) external onlyOwner {
        if (_policy == address(this)) revert SelfPolicy();
        if (_policy != address(0) && !ISafetyPolicy(_policy).isSafetyPolicy()) revert InvalidSafetyPolicy();
        address old = safetyPolicy;
        safetyPolicy = _policy;
        emit SafetyPolicyUpdated(old, _policy);
    }
    
    function setAccessPolicy(address _policy) external onlyOwner {
        if (_policy == address(this)) revert SelfPolicy();
        if (_policy != address(0) && !IAccessPolicy(_policy).isAccessPolicy()) revert InvalidAccessPolicy();
        address old = accessPolicy;
        accessPolicy = _policy;
        emit AccessPolicyUpdated(old, _policy);
    }
    
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }
    
    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // ============================================
    // View Functions
    // ============================================

    function totalSeries() external view returns (uint256) {
        return allSeries.length;
    }

    function seriesCount(address protocol) external view returns (uint256) {
        return seriesByProtocol[protocol].length;
    }
    
    function limits() external pure returns (
        uint256 maxRevenueShareBps,
        uint256 minDurationDays,
        uint256 maxDurationDays,
        uint256 minTotalSupply
    ) {
        return (
            EscrowValidation.MAX_REVENUE_SHARE_BPS,
            EscrowValidation.MIN_DURATION_DAYS,
            EscrowValidation.MAX_DURATION_DAYS,
            EscrowValidation.MIN_TOTAL_SUPPLY
        );
    }
}
