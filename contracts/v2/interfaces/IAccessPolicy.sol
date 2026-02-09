// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IAccessPolicy
 * @notice Interface for pluggable access control policies
 * @dev Allows optional permissioning without changing core Factory
 * @dev Default (address(0)) = permissionless (anyone can create)
 * @dev ⚠️ WARNING: Enabling access control changes the protocol's trust model
 * @dev Should only be activated with clear governance (ideally timelock)
 */
interface IAccessPolicy {
    /**
     * @notice Marker function to validate interface implementation
     * @dev Used by Factory to ensure correct policy contract
     * @return Always returns true for valid IAccessPolicy implementation
     */
    function isAccessPolicy() external pure returns (bool);
    
    /**
     * @notice Check if a protocol can create a series
     * @dev Should revert with clear message if access denied
     * @param protocol Protocol address requesting to create series
     * @return allowed True if protocol can create, false otherwise
     */
    function canCreate(address protocol) external view returns (bool allowed);
}
