// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../v2/interfaces/ISafetyPolicy.sol";

/**
 * @title WeakSafetyPolicy
 * @notice Policy frouxa que permite tudo - usado para testar que hardcoded sempre valida primeiro
 * @dev Este contrato é APENAS PARA TESTES - prova que policy não pode enfraquecer o core
 */
contract WeakSafetyPolicy is ISafetyPolicy {
    function isSafetyPolicy() external pure override returns (bool) {
        return true;
    }
    
    /**
     * @notice Permite tudo - não valida nada
     * @dev Usado para provar que hardcoded limits do Factory sempre validam primeiro
     */
    function validateParams(
        address, // protocol
        uint256, // revenueShareBPS
        uint256, // durationDays
        uint256, // totalSupply
        uint256  // minDistributionAmount
    ) external pure override {
        // Não faz nada - permite tudo
        // Isso prova que mesmo com policy frouxa, hardcoded limits protegem
    }
}
