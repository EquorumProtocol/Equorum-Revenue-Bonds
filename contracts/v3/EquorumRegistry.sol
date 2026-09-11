// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./interfaces/IEquorumRegistry.sol";

/**
 * @title EquorumRegistry
 * @notice Append-only, fact-based history of every Tap Bond issuer.
 *
 * - Records money and outcomes, not a gameable score.
 * - Only bonds registered by an approved factory can write, and each bond
 *   is authorized automatically at registration (fixes V2 R-1).
 * - The owner (multisig) can approve or revoke factories. It cannot edit
 *   records, blacklist, or whitelist anyone.
 */
contract EquorumRegistry is IEquorumRegistry, Ownable2Step {
    struct IssuerStats {
        uint64 bondsIssued;
        uint64 bondsMatured;
        uint64 bondsDefaulted;
        uint64 lastDefaultAt;
        uint256 totalRaised;
        uint256 totalPaid;
    }

    struct BondRecord {
        address issuer;
        address factory;
        uint256 raised;
        uint256 paid;
        uint8 outcome; // 0 = open, 1 = matured, 2 = defaulted, 3 = failed sale
    }

    mapping(address => bool) public isFactory;
    mapping(address => IssuerStats) public issuerStats;
    mapping(address => BondRecord) public bonds;
    mapping(address => address[]) private _issuerBonds;

    event FactorySet(address indexed factory, bool approved);
    event BondRegistered(address indexed issuer, address indexed bond, address indexed factory);
    event RaiseRecorded(address indexed issuer, address indexed bond, uint256 amount);
    event PaymentRecorded(address indexed issuer, address indexed bond, uint256 amount);
    event BondMatured(address indexed issuer, address indexed bond);
    event BondDefaulted(address indexed issuer, address indexed bond, uint256 raised, uint256 paid);
    event BondFailed(address indexed issuer, address indexed bond);

    error NotFactory();
    error NotRegisteredBond();
    error AlreadyRegistered();
    error AlreadyClosed();
    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ------------------------------------------------------------------
    // Admin (factories only)
    // ------------------------------------------------------------------

    function setFactory(address factory, bool approved) external onlyOwner {
        if (factory == address(0)) revert ZeroAddress();
        isFactory[factory] = approved;
        emit FactorySet(factory, approved);
    }

    // ------------------------------------------------------------------
    // Factory hook
    // ------------------------------------------------------------------

    /// @inheritdoc IEquorumRegistry
    function registerBond(address issuer, address bond) external {
        if (!isFactory[msg.sender]) revert NotFactory();
        if (issuer == address(0) || bond == address(0)) revert ZeroAddress();
        if (bonds[bond].issuer != address(0)) revert AlreadyRegistered();

        bonds[bond] = BondRecord({issuer: issuer, factory: msg.sender, raised: 0, paid: 0, outcome: 0});
        _issuerBonds[issuer].push(bond);
        issuerStats[issuer].bondsIssued += 1;
        emit BondRegistered(issuer, bond, msg.sender);
    }

    // ------------------------------------------------------------------
    // Bond hooks (msg.sender must be a registered bond)
    // ------------------------------------------------------------------

    /// @inheritdoc IEquorumRegistry
    function recordRaise(uint256 amount) external {
        BondRecord storage b = _openBond(msg.sender);
        b.raised += amount;
        issuerStats[b.issuer].totalRaised += amount;
        emit RaiseRecorded(b.issuer, msg.sender, amount);
    }

    /// @inheritdoc IEquorumRegistry
    function recordPayment(uint256 amount) external {
        BondRecord storage b = _bond(msg.sender);
        b.paid += amount;
        issuerStats[b.issuer].totalPaid += amount;
        emit PaymentRecorded(b.issuer, msg.sender, amount);
    }

    /// @inheritdoc IEquorumRegistry
    function recordMatured() external {
        BondRecord storage b = _openBond(msg.sender);
        b.outcome = 1;
        issuerStats[b.issuer].bondsMatured += 1;
        emit BondMatured(b.issuer, msg.sender);
    }

    /// @inheritdoc IEquorumRegistry
    function recordDefault() external {
        BondRecord storage b = _openBond(msg.sender);
        b.outcome = 2;
        IssuerStats storage s = issuerStats[b.issuer];
        s.bondsDefaulted += 1;
        s.lastDefaultAt = uint64(block.timestamp);
        emit BondDefaulted(b.issuer, msg.sender, b.raised, b.paid);
    }

    /// @inheritdoc IEquorumRegistry
    function recordFailed() external {
        BondRecord storage b = _openBond(msg.sender);
        b.outcome = 3;
        emit BondFailed(b.issuer, msg.sender);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function getIssuerBonds(address issuer) external view returns (address[] memory) {
        return _issuerBonds[issuer];
    }

    function getIssuerStats(address issuer) external view returns (IssuerStats memory) {
        return issuerStats[issuer];
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    function _bond(address bond) private view returns (BondRecord storage b) {
        b = bonds[bond];
        if (b.issuer == address(0)) revert NotRegisteredBond();
    }

    function _openBond(address bond) private view returns (BondRecord storage b) {
        b = _bond(bond);
        if (b.outcome != 0) revert AlreadyClosed();
    }
}
