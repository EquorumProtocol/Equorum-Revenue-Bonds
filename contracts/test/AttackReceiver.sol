// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AttackReceiver
 * @notice Contrato malicioso que tenta reentrância no refund
 * @dev Usado para testar que Factory é seguro contra reentrancy
 */
contract AttackReceiver {
    address public factory;
    bool public attacking;
    
    constructor(address _factory) {
        factory = _factory;
    }
    
    /**
     * @notice Tenta criar série com excesso de ETH para acionar refund
     */
    function attack(
        string memory name,
        string memory symbol,
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 minDistributionAmount
    ) external payable {
        attacking = true;
        
        // Chama createSeries com excesso de ETH
        (bool success, ) = factory.call{value: msg.value}(
            abi.encodeWithSignature(
                "createSeries(string,string,address,uint256,uint256,uint256,uint256)",
                name,
                symbol,
                protocol,
                revenueShareBPS,
                durationDays,
                totalSupply,
                minDistributionAmount
            )
        );
        
        require(success, "Attack failed");
        attacking = false;
    }
    
    /**
     * @notice Fallback que tenta reentrar quando recebe refund
     */
    receive() external payable {
        if (attacking) {
            // Tenta reentrar chamando createSeries novamente
            (bool success, ) = factory.call{value: 0}(
                abi.encodeWithSignature(
                    "createSeries(string,string,address,uint256,uint256,uint256,uint256)",
                    "Reentrant",
                    "REENT",
                    address(this),
                    2500,
                    180,
                    100000e18,
                    0.001 ether
                )
            );
            
            // Se reentrância funcionou, é um problema
            require(!success, "Reentrancy succeeded - VULNERABILITY!");
        }
    }
}
