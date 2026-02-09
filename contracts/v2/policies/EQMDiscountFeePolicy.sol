// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IFeePolicy.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title EQMDiscountFeePolicy
 * @notice Fee policy with discounts for EQM token holders
 * @dev Example of how to integrate EQM token benefits
 */
contract EQMDiscountFeePolicy is IFeePolicy, Ownable {
    address public immutable eqmToken;
    address public feeReceiver;
    
    uint256 public baseFee;
    uint256 public discountThreshold;  // EQM balance required for discount
    uint256 public discountBPS;        // Discount in basis points (5000 = 50% off)
    
    event BaseFeeUpdated(uint256 oldFee, uint256 newFee);
    event DiscountConfigUpdated(uint256 threshold, uint256 discountBPS);
    event FeeReceiverUpdated(address indexed oldReceiver, address indexed newReceiver);
    
    constructor(
        address _eqmToken,
        uint256 _baseFee,
        address _receiver,
        uint256 _discountThreshold,
        uint256 _discountBPS
    ) Ownable(msg.sender) {
        require(_eqmToken != address(0), "Invalid EQM token");
        require(_receiver != address(0), "Invalid receiver");
        require(_discountBPS <= 10000, "Discount too high");
        
        eqmToken = _eqmToken;
        baseFee = _baseFee;
        feeReceiver = _receiver;
        discountThreshold = _discountThreshold;
        discountBPS = _discountBPS;
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
     * @notice Calculate fee with EQM holder discount
     * @dev Checks protocol's EQM balance and applies discount if threshold met
     */
    function getFeeQuote(
        address protocol,
        uint256, // revenueShareBPS
        uint256, // durationDays
        uint256, // totalSupply
        uint256  // minDistributionAmount
    ) external view override returns (uint256 fee, address receiver) {
        uint256 eqmBalance = IERC20(eqmToken).balanceOf(protocol);
        
        // Apply discount if protocol holds enough EQM
        if (eqmBalance >= discountThreshold) {
            fee = baseFee * (10000 - discountBPS) / 10000;
        } else {
            fee = baseFee;
        }
        
        return (fee, feeReceiver);
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
     * @notice Update discount configuration
     */
    function setDiscountConfig(uint256 _threshold, uint256 _discountBPS) external onlyOwner {
        require(_discountBPS <= 10000, "Discount too high");
        discountThreshold = _threshold;
        discountBPS = _discountBPS;
        emit DiscountConfigUpdated(_threshold, _discountBPS);
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
