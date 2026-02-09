// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RevenueBondEscrow.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract EscrowDeployer is Ownable {
    constructor() Ownable(msg.sender) {}

    function deploy(
        string memory name,
        string memory symbol,
        address protocol,
        address routerAddress,
        address reputationRegistry,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 principalAmount,
        uint256 minPurchaseAmount,
        uint256 minDistributionAmount,
        uint256 depositDeadlineDays
    ) external onlyOwner returns (address) {
        RevenueBondEscrow series = new RevenueBondEscrow(
            name,
            symbol,
            protocol,
            routerAddress,
            reputationRegistry,
            revenueShareBPS,
            durationDays,
            totalSupply,
            principalAmount,
            minPurchaseAmount,
            minDistributionAmount,
            depositDeadlineDays
        );
        // Transfer ownership to caller (Factory), Factory will then transfer to protocol
        series.transferOwnership(msg.sender);
        return address(series);
    }
}
