// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IEquorumRegistry {
    /// @notice Called by an approved factory when it deploys a bond.
    function registerBond(address issuer, address bond) external;

    /// @notice Called by a bond when its sale is finalized.
    function recordRaise(uint256 amount) external;

    /// @notice Called by a bond on every coupon / revenue distribution.
    function recordPayment(uint256 amount) external;

    /// @notice Called by a bond when it matures with every coupon paid.
    function recordMatured() external;

    /// @notice Called by a bond when default is triggered.
    function recordDefault() external;

    /// @notice Called by a bond when its sale fails or is cancelled.
    function recordFailed() external;
}
