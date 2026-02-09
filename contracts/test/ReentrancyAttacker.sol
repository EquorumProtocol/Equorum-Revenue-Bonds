// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRevenueSeries {
    function claimRevenue() external;
    function balanceOf(address) external view returns (uint256);
}

/**
 * @title ReentrancyAttacker
 * @notice Tenta reentrância no claimRevenue
 */
contract ReentrancyAttacker {
    IRevenueSeries public series;
    bool public attacking;
    uint256 public attackCount;
    
    constructor(address _series) {
        series = IRevenueSeries(_series);
    }
    
    function attack() external {
        attacking = true;
        attackCount = 0;
        series.claimRevenue();
        attacking = false;
    }
    
    receive() external payable {
        if (attacking && attackCount < 3) {
            attackCount++;
            // Tenta reentrar
            try series.claimRevenue() {
                // Se conseguiu reentrar, é vulnerável!
            } catch {
                // Reentrância bloqueada (esperado)
            }
        }
    }
}
