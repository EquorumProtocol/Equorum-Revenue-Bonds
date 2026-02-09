// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library EscrowValidation {
    uint256 internal constant MAX_REVENUE_SHARE_BPS = 5000;
    uint256 internal constant MIN_DURATION_DAYS = 30;
    uint256 internal constant MAX_DURATION_DAYS = 1825;
    uint256 internal constant MIN_TOTAL_SUPPLY = 1000e18;
    
    function validateCreateParams(
        address protocol,
        uint256 revenueShareBPS,
        uint256 durationDays,
        uint256 totalSupply,
        uint256 principalAmount,
        uint256 minDistributionAmount,
        uint256 depositDeadlineDays
    ) internal pure {
        require(protocol != address(0), "!protocol");
        require(principalAmount > 0, "!principal");
        require(depositDeadlineDays > 0 && depositDeadlineDays <= 90, "!deadline");
        require(revenueShareBPS > 0 && revenueShareBPS <= MAX_REVENUE_SHARE_BPS, "!bps");
        require(durationDays >= MIN_DURATION_DAYS && durationDays <= MAX_DURATION_DAYS, "!duration");
        require(totalSupply >= MIN_TOTAL_SUPPLY, "!supply");
        require(minDistributionAmount >= 0.001 ether, "!minDist");
    }
    
    function handleFeeCollection(
        uint256 msgValue,
        uint256 fee,
        address feeReceiver,
        address sender
    ) internal returns (bool) {
        require(msgValue >= fee, "!fee");
        
        if (fee > 0) {
            require(feeReceiver != address(0), "!feeRcv");
            (bool feeSuccess, ) = feeReceiver.call{value: fee}("");
            require(feeSuccess, "!feeTx");
        }
        
        if (msgValue > fee) {
            (bool refundSuccess, ) = sender.call{value: msgValue - fee}("");
            require(refundSuccess, "!refund");
        }
        
        return true;
    }
    
    function calculateExpectedCadence(uint256 durationDays) internal pure returns (uint256) {
        return durationDays > 180 ? 30 : 7;
    }
}
