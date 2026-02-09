// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../v2/interfaces/IFeePolicy.sol";

/**
 * @title MaliciousPolicy
 * @notice Policy maliciosa que sempre reverte - testa proteção do Factory
 */
contract MaliciousPolicy is IFeePolicy {
    function isFeePolicy() external pure override returns (bool) {
        return true;
    }
    
    function feePolicyVersion() external pure override returns (uint256) {
        return 1;
    }
    
    function getFeeQuote(
        address,
        uint256,
        uint256,
        uint256,
        uint256
    ) external pure override returns (uint256, address) {
        revert("Malicious policy always reverts");
    }
}
