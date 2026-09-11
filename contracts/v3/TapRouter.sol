// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./TapBond.sol";

/**
 * @title TapRouter
 * @notice Optional revenue splitter for a TapBond. The issuer points its fee
 *         stream here; `route()` sends `shareBps` to bondholders and books the
 *         rest for the issuer.
 *
 * No owner, no pause (fixes V2 R-9). The issuer's share is pull-based, so a
 * reverting issuer can never block payments to bondholders.
 *
 * Splitting happens while the bond is ACTIVE or DEFAULTED and before its
 * maturity time. During the SALE, revenue waits here. Otherwise (failed sale,
 * matured, term over, no holders left) everything is booked for the issuer.
 */
contract TapRouter is ReentrancyGuard {
    uint256 private constant BPS = 10_000;

    TapBond public immutable bond;
    address public immutable issuer;
    uint256 public immutable shareBps;

    uint256 public issuerOwed;
    uint256 public totalReceived;
    uint256 public totalToBond;
    uint256 public totalToIssuer;

    event RevenueReceived(address indexed from, uint256 amount);
    event Routed(uint256 toBond, uint256 toIssuer);
    event IssuerWithdrawn(address indexed to, uint256 amount);

    error ZeroAddress();
    error InvalidShare();
    error NothingToRoute();
    error WaitingForSale();
    error NotIssuer();
    error TransferFailed();

    constructor(TapBond _bond, address _issuer, uint256 _shareBps) {
        if (address(_bond) == address(0) || _issuer == address(0)) revert ZeroAddress();
        if (_shareBps == 0 || _shareBps > BPS) revert InvalidShare();
        bond = _bond;
        issuer = _issuer;
        shareBps = _shareBps;
    }

    receive() external payable {
        totalReceived += msg.value;
        emit RevenueReceived(msg.sender, msg.value);
    }

    /// @notice Revenue received but not yet routed.
    function pending() public view returns (uint256) {
        return address(this).balance - issuerOwed;
    }

    /// @notice True when incoming revenue is currently split with bondholders.
    function isSplitting() public view returns (bool) {
        TapBond.State s = bond.state();
        if (s != TapBond.State.Active && s != TapBond.State.Defaulted) return false;
        return block.timestamp < bond.maturityTime() && bond.totalSupply() > 0;
    }

    /// @notice Route pending revenue. Anyone may call.
    function route() external nonReentrant {
        uint256 amount = pending();
        if (amount == 0) revert NothingToRoute();

        if (bond.state() == TapBond.State.Sale) revert WaitingForSale();

        uint256 toBond;
        if (isSplitting()) {
            // Round in favour of bondholders.
            toBond = Math.mulDiv(amount, shareBps, BPS, Math.Rounding.Ceil);
        }
        uint256 toIssuer = amount - toBond;

        issuerOwed += toIssuer;
        if (toBond > 0) {
            totalToBond += toBond;
            bond.distribute{value: toBond}();
        }
        emit Routed(toBond, toIssuer);
    }

    /// @notice Pay the issuer its share. Anyone may call; funds go to `issuer`.
    function withdrawIssuer() external nonReentrant {
        _payIssuer(issuer);
    }

    /// @notice Issuer pulls its share to another address (e.g. if `issuer` cannot receive ETH).
    function withdrawIssuerTo(address to) external nonReentrant {
        if (msg.sender != issuer) revert NotIssuer();
        if (to == address(0)) revert ZeroAddress();
        _payIssuer(to);
    }

    function _payIssuer(address to) private {
        uint256 amount = issuerOwed;
        if (amount == 0) revert NothingToRoute();
        issuerOwed = 0;
        totalToIssuer += amount;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit IssuerWithdrawn(to, amount);
    }
}
