// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./RevenueRouter.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract RouterDeployer is Ownable {
    constructor() Ownable(msg.sender) {}

    function deploy(
        address protocol,
        address payable revenueSeries,
        uint256 revenueShareBPS
    ) external onlyOwner returns (address) {
        RevenueRouter router = new RevenueRouter(
            protocol,
            revenueSeries,
            revenueShareBPS
        );
        // Transfer ownership to caller (Factory), Factory will then transfer to protocol
        router.transferOwnership(msg.sender);
        return address(router);
    }
}
