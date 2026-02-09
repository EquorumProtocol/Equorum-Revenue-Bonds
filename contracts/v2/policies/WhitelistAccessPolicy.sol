// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IAccessPolicy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WhitelistAccessPolicy
 * @notice Optional whitelist-based access control
 * @dev ⚠️ WARNING: Enabling this changes protocol from permissionless to permissioned
 * @dev Should only be used if absolutely necessary and with clear governance
 */
contract WhitelistAccessPolicy is IAccessPolicy, Ownable {
    mapping(address => bool) public whitelist;
    
    event ProtocolWhitelisted(address indexed protocol);
    event ProtocolRemovedFromWhitelist(address indexed protocol);
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @notice Marker function for interface validation
     */
    function isAccessPolicy() external pure override returns (bool) {
        return true;
    }
    
    /**
     * @notice Check if protocol can create series
     * @dev Returns bool - Factory handles the revert message
     */
    function canCreate(address protocol) external view override returns (bool) {
        return whitelist[protocol];
    }
    
    /**
     * @notice Add protocol to whitelist
     */
    function addToWhitelist(address protocol) external onlyOwner {
        require(protocol != address(0), "Invalid protocol");
        whitelist[protocol] = true;
        emit ProtocolWhitelisted(protocol);
    }
    
    /**
     * @notice Remove protocol from whitelist
     */
    function removeFromWhitelist(address protocol) external onlyOwner {
        whitelist[protocol] = false;
        emit ProtocolRemovedFromWhitelist(protocol);
    }
    
    /**
     * @notice Batch add protocols to whitelist
     */
    function batchAddToWhitelist(address[] calldata protocols) external onlyOwner {
        for (uint256 i = 0; i < protocols.length; i++) {
            require(protocols[i] != address(0), "Invalid protocol");
            whitelist[protocols[i]] = true;
            emit ProtocolWhitelisted(protocols[i]);
        }
    }
}
