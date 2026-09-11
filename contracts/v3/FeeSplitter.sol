// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title FeeSplitter
 * @notice Receives every Equorum V3 protocol fee and splits it between the
 *         treasury (multisig) and the builder.
 *
 * The split is a compile-time constant. Nobody can change it.
 * Each party may only rotate its own payout address.
 * Payouts are pull-based: a reverting recipient can never block fee payments.
 */
contract FeeSplitter is ReentrancyGuard {
    /// @notice Builder share of every fee, in basis points (20%).
    uint256 public constant BUILDER_SHARE_BPS = 2000;
    uint256 private constant BPS = 10_000;

    address public treasury;
    address public builder;

    uint256 public treasuryOwed;
    uint256 public builderOwed;

    uint256 public totalReceived;
    uint256 public totalPaidTreasury;
    uint256 public totalPaidBuilder;

    event FeeReceived(address indexed from, uint256 amount, uint256 toTreasury, uint256 toBuilder);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event BuilderWithdrawn(address indexed to, uint256 amount);
    event TreasuryChanged(address indexed oldTreasury, address indexed newTreasury);
    event BuilderChanged(address indexed oldBuilder, address indexed newBuilder);

    error ZeroAddress();
    error NotTreasury();
    error NotBuilder();
    error NothingOwed();
    error TransferFailed();

    constructor(address _treasury, address _builder) {
        if (_treasury == address(0) || _builder == address(0)) revert ZeroAddress();
        treasury = _treasury;
        builder = _builder;
    }

    receive() external payable {
        uint256 toBuilder = (msg.value * BUILDER_SHARE_BPS) / BPS;
        uint256 toTreasury = msg.value - toBuilder;
        builderOwed += toBuilder;
        treasuryOwed += toTreasury;
        totalReceived += msg.value;
        emit FeeReceived(msg.sender, msg.value, toTreasury, toBuilder);
    }

    /// @notice Pay the treasury what it is owed. Callable by anyone; funds go to `treasury`.
    function withdrawTreasury() external nonReentrant {
        uint256 amount = treasuryOwed;
        if (amount == 0) revert NothingOwed();
        treasuryOwed = 0;
        totalPaidTreasury += amount;
        (bool ok,) = treasury.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit TreasuryWithdrawn(treasury, amount);
    }

    /// @notice Pay the builder what it is owed. Callable by anyone; funds go to `builder`.
    function withdrawBuilder() external nonReentrant {
        uint256 amount = builderOwed;
        if (amount == 0) revert NothingOwed();
        builderOwed = 0;
        totalPaidBuilder += amount;
        (bool ok,) = builder.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit BuilderWithdrawn(builder, amount);
    }

    /// @notice Treasury rotates its own address (e.g. new multisig). Cannot touch the builder.
    function setTreasury(address newTreasury) external {
        if (msg.sender != treasury) revert NotTreasury();
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }

    /// @notice Builder rotates its own address (e.g. key rotation). Cannot touch the treasury.
    function setBuilder(address newBuilder) external {
        if (msg.sender != builder) revert NotBuilder();
        if (newBuilder == address(0)) revert ZeroAddress();
        emit BuilderChanged(builder, newBuilder);
        builder = newBuilder;
    }
}
