// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MaliciousTreasury {
    receive() external payable {
        revert("I reject your money!");
    }
}
