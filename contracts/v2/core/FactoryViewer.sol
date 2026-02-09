// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../libraries/EscrowValidation.sol";

interface IFactory {
    function allSeries(uint256 index) external view returns (address);
    function seriesByProtocol(address protocol, uint256 index) external view returns (address);
    function totalSeries() external view returns (uint256);
    function seriesCount(address protocol) external view returns (uint256);
    function routerBySeries(address series) external view returns (address);
}

contract FactoryViewer {

    IFactory public immutable factory;

    constructor(address _factory) {
        require(_factory != address(0), "Invalid factory");
        factory = IFactory(_factory);
    }

    function getAllSeriesSlice(uint256 start, uint256 count) external view returns (address[] memory out) {
        uint256 len = factory.totalSeries();
        if (start >= len) return new address[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        out = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = factory.allSeries(i);
        }
    }

    function getSeriesByProtocolSlice(address protocol, uint256 start, uint256 count)
        external view returns (address[] memory out)
    {
        uint256 len = factory.seriesCount(protocol);
        if (start >= len) return new address[](0);
        uint256 end = start + count;
        if (end > len) end = len;
        out = new address[](end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = factory.seriesByProtocol(protocol, i);
        }
    }

    function limits() external pure returns (
        uint256 maxRevenueShareBps,
        uint256 minDurationDays,
        uint256 maxDurationDays,
        uint256 minTotalSupply
    ) {
        return (
            EscrowValidation.MAX_REVENUE_SHARE_BPS,
            EscrowValidation.MIN_DURATION_DAYS,
            EscrowValidation.MAX_DURATION_DAYS,
            EscrowValidation.MIN_TOTAL_SUPPLY
        );
    }
}
