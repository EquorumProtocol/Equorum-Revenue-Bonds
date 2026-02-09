// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../v2/interfaces/IFeePolicy.sol";

/**
 * @title ReentrantFeePolicy
 * @notice Policy maliciosa que tenta reentrar no Factory.createSeries()
 *         durante a coleta de fee (via receive() do feeReceiver)
 */
contract ReentrantFeePolicy is IFeePolicy {
    address public factory;
    address public attacker;
    uint256 public attackCount;
    bool public attacking;

    constructor(address _factory, address _attacker) {
        factory = _factory;
        attacker = _attacker;
    }

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
    ) external view override returns (uint256 fee, address receiver) {
        // Fee vai pro próprio contrato (que tem receive() malicioso)
        return (0.01 ether, address(this));
    }

    // Quando recebe a fee, tenta reentrar no factory
    receive() external payable {
        if (!attacking) {
            attacking = true;
            // Tenta criar outra série via reentrância
            (bool success, ) = factory.call{value: msg.value}(
                abi.encodeWithSignature(
                    "createSeries(string,string,address,uint256,uint256,uint256,uint256)",
                    "REENTRANT", "REENT", attacker,
                    2000, 180, 100000e18, 0.001 ether
                )
            );
            if (success) {
                attackCount++;
            }
            attacking = false;
        }
    }
}
