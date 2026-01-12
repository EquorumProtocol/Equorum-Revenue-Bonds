// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MaliciousSeries
 * @notice Fake series contract that attacks the router
 * @dev Tests router resilience against malicious series contracts
 */
contract MaliciousSeries {
    enum AttackType {
        NONE,
        CONSUME_GAS,
        REVERT_ALWAYS,
        REVERT_WITH_HUGE_REASON
    }
    
    AttackType public attackType = AttackType.NONE;
    bool public isActive = true;
    uint256 public maturityDate;
    
    constructor() {
        maturityDate = block.timestamp + 365 days;
    }
    
    function setAttackType(AttackType _type) external {
        attackType = _type;
    }
    
    function setActive(bool _active) external {
        isActive = _active;
    }
    
    /**
     * @notice Fake getSeriesInfo that looks legitimate
     */
    function getSeriesInfo() external view returns (
        string memory name,
        string memory symbol,
        uint256 _maturityDate,
        uint256 totalSupply,
        uint256 totalRevenue,
        bool _isActive,
        uint256 timeRemaining
    ) {
        return (
            "Malicious Series",
            "MAL",
            maturityDate,
            1000000 ether,
            0,
            isActive,
            maturityDate > block.timestamp ? maturityDate - block.timestamp : 0
        );
    }
    
    /**
     * @notice Malicious distributeRevenue that attacks based on attackType
     */
    function distributeRevenue() external payable {
        if (attackType == AttackType.CONSUME_GAS) {
            // Consume all available gas
            uint256 i = 0;
            while (gasleft() > 2000) {
                i++;
            }
            // After consuming gas, revert to simulate failure
            revert("Out of gas");
        } else if (attackType == AttackType.REVERT_ALWAYS) {
            revert("Series always reverts");
        } else if (attackType == AttackType.REVERT_WITH_HUGE_REASON) {
            // Create a huge revert reason to consume gas
            string memory huge = new string(10000);
            revert(huge);
        }
        // AttackType.NONE - accept the ETH normally
    }
    
    /**
     * @notice Allow withdrawing trapped ETH for testing
     */
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
    
    receive() external payable {}
}
