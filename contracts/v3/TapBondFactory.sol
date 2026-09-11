// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "./TapBond.sol";
import "./TapRouter.sol";
import "./interfaces/IEquorumRegistry.sol";

/**
 * @title TapBondFactory
 * @notice Deploys Tap Bonds (and optional routers) and registers them.
 *
 * Owner (multisig) powers, and nothing else:
 *  - set the draw fee for NEW bonds, capped at TapBond.MAX_DRAW_FEE_BPS (3%)
 *  - pause / unpause creation of NEW bonds
 * Existing bonds are never affected: their fee and terms are immutable.
 *
 * The fee recipient (FeeSplitter) and registry are immutable.
 * Registration reverts on failure: a bond is never silently unregistered (fixes V2 R-1).
 */
contract TapBondFactory is Ownable2Step {
    /// @dev Must equal TapBond.MAX_DRAW_FEE_BPS (the bond re-checks it).
    uint256 public constant MAX_DRAW_FEE_BPS = 300;

    address public immutable feeRecipient;
    IEquorumRegistry public immutable registry;

    uint256 public drawFeeBps;
    bool public paused;

    address[] private _allBonds;
    mapping(address => address[]) private _bondsByIssuer;
    mapping(address => address) public routerOf;
    mapping(address => bool) public isBond;

    event BondCreated(
        address indexed bond, address indexed issuer, address router, uint256 collateral, uint256 drawFeeBps
    );
    event DrawFeeSet(uint256 oldFeeBps, uint256 newFeeBps);
    event PausedSet(bool paused);

    error Paused();
    error FeeTooHigh();
    error ZeroAddress();

    constructor(address initialOwner, address _feeRecipient, IEquorumRegistry _registry, uint256 _drawFeeBps)
        Ownable(initialOwner)
    {
        if (_feeRecipient == address(0) || address(_registry) == address(0)) revert ZeroAddress();
        if (_drawFeeBps > MAX_DRAW_FEE_BPS) revert FeeTooHigh();
        feeRecipient = _feeRecipient;
        registry = _registry;
        drawFeeBps = _drawFeeBps;
    }

    /**
     * @notice Create a Tap Bond. The caller is the issuer. `msg.value` is locked as collateral.
     * A router is deployed when `terms.revenueShareBps > 0`.
     */
    function createBond(string calldata name, string calldata symbol, TapBond.Terms calldata terms)
        external
        payable
        returns (address bond, address router)
    {
        if (paused) revert Paused();

        TapBond b = new TapBond{value: msg.value}(name, symbol, msg.sender, feeRecipient, registry, drawFeeBps, terms);
        bond = address(b);

        if (terms.revenueShareBps > 0) {
            router = address(new TapRouter(b, msg.sender, terms.revenueShareBps));
            routerOf[bond] = router;
        }

        registry.registerBond(msg.sender, bond);

        isBond[bond] = true;
        _allBonds.push(bond);
        _bondsByIssuer[msg.sender].push(bond);

        emit BondCreated(bond, msg.sender, router, msg.value, drawFeeBps);
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setDrawFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_DRAW_FEE_BPS) revert FeeTooHigh();
        emit DrawFeeSet(drawFeeBps, newFeeBps);
        drawFeeBps = newFeeBps;
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function totalBonds() external view returns (uint256) {
        return _allBonds.length;
    }

    function allBonds() external view returns (address[] memory) {
        return _allBonds;
    }

    function bondsByIssuer(address issuer) external view returns (address[] memory) {
        return _bondsByIssuer[issuer];
    }
}
