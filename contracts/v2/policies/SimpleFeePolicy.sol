// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IFeePolicy.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SimpleFeePolicy
 * @notice Basic flat fee policy for series creation
 * @dev Example implementation of IFeePolicy - fixed fee for all series
 */
contract SimpleFeePolicy is IFeePolicy, Ownable {
    uint256 public baseFee;
    address public feeReceiver;
    
    event BaseFeeUpdated(uint256 oldFee, uint256 newFee);
    event FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    
    constructor(uint256 _baseFee, address _receiver) Ownable(msg.sender) {
        require(_receiver != address(0), "Invalid receiver");
        baseFee = _baseFee;
        feeReceiver = _receiver;
    }
    
    /**
     * @notice Marker function for interface validation
     */
    function isFeePolicy() external pure override returns (bool) {
        return true;
    }
    
    /**
     * @notice Policy version
     */
    function feePolicyVersion() external pure override returns (uint256) {
        return 1;
    }
    
    /**
     * @notice Calculate fee - simple flat fee for all series
     * @dev Ignores all parameters, returns fixed fee
     */
    function getFeeQuote(
        address, // protocol
        uint256, // revenueShareBPS
        uint256, // durationDays
        uint256, // totalSupply
        uint256  // minDistributionAmount
    ) external view override returns (uint256 fee, address receiver) {
        return (baseFee, feeReceiver);
    }
    
    /**
     * @notice Update base fee
     */
    function setBaseFee(uint256 _newFee) external onlyOwner {
        uint256 oldFee = baseFee;
        baseFee = _newFee;
        emit BaseFeeUpdated(oldFee, _newFee);
    }
    
    /**
     * @notice Update fee receiver
     */
    function setFeeReceiver(address _newReceiver) external onlyOwner {
        require(_newReceiver != address(0), "Invalid receiver");
        address oldReceiver = feeReceiver;
        feeReceiver = _newReceiver;
        emit FeeReceiverUpdated(oldReceiver, _newReceiver);
    }
}
