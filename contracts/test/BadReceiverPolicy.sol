// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../v2/interfaces/IFeePolicy.sol";

/**
 * @title BadReceiverPolicy
 * @notice Policy que retorna receiver = address(0) - testa proteção do Factory
 */
contract BadReceiverPolicy is IFeePolicy {
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
    ) external pure override returns (uint256 fee, address receiver) {
        return (0.01 ether, address(0)); // Receiver inválido!
    }
}
