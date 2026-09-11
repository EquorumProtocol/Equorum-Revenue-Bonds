// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./interfaces/IEquorumRegistry.sol";

/**
 * @title TapBond
 * @notice Revenue bond whose capital is released to the issuer in tranches,
 *         each tranche gated by the coupons paid so far.
 *
 * Lifecycle:  SALE -> ACTIVE -> MATURED
 *                  \        \-> DEFAULTED  (coupon missed past grace)
 *                   \-> FAILED             (min raise not met / cancelled)
 *
 * Guarantees enforced by code:
 *  - Undrawn capital and collateral only ever leave to holders (default /
 *    failed sale) or to the issuer (maturity).
 *  - The issuer cannot draw faster than its coupon record allows.
 *  - All terms are immutable. There is no admin.
 *
 * NOT guaranteed: capital already drawn (beyond collateral), and any revenue
 * the issuer chooses not to route. See docs/V3_SPEC.md.
 */
contract TapBond is ERC20, ReentrancyGuard {
    // ------------------------------------------------------------------
    // Types & constants
    // ------------------------------------------------------------------

    enum State {
        Sale,
        Active,
        Matured,
        Defaulted,
        Failed
    }

    struct Terms {
        uint256 price; // wei per 1e18 token units
        uint256 maxSupply; // max tokens sold (18 decimals)
        uint256 minRaise; // soft cap in wei
        uint64 saleDuration; // seconds
        uint64 epochDuration; // seconds
        uint64 gracePeriod; // seconds, <= epochDuration
        uint32 numEpochs; // bond term, in epochs
        uint32 tapEpochs; // capital beyond the initial release unlocks over this many epochs
        uint16 couponBps; // minimum payment per epoch, bps of capital raised
        uint16 initialReleaseBps; // share of capital drawable right after the sale
        uint16 revenueShareBps; // router split to holders (informational here)
    }

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_DRAW_FEE_BPS = 300; // 3%
    uint256 public constant MAX_REVENUE_SHARE_BPS = 5_000; // 50%
    uint256 public constant MIN_PERIOD = 1 days;
    uint256 public constant MAX_PERIOD = 90 days;
    uint256 public constant MAX_EPOCHS = 120;
    uint256 private constant PRECISION = 1e18;

    // ------------------------------------------------------------------
    // Immutable configuration
    // ------------------------------------------------------------------

    address public immutable issuer;
    address public immutable factory;
    address public immutable feeRecipient;
    IEquorumRegistry public immutable registry;
    uint256 public immutable drawFeeBps;

    uint256 public immutable price;
    uint256 public immutable maxSupply;
    uint256 public immutable minRaise;
    uint256 public immutable saleEnd;
    uint256 public immutable epochDuration;
    uint256 public immutable gracePeriod;
    uint256 public immutable numEpochs;
    uint256 public immutable tapEpochs;
    uint256 public immutable couponBps;
    uint256 public immutable initialReleaseBps;
    uint256 public immutable revenueShareBps;

    // ------------------------------------------------------------------
    // State
    // ------------------------------------------------------------------

    State public state;

    uint256 public raised; // total ETH paid by buyers
    uint256 public startTime; // set at finalization
    uint256 public couponAmount; // minimum wei per epoch, fixed at finalization
    uint256 public capitalDrawn; // gross capital released to the issuer (incl. fee)
    uint256 public collateral; // issuer collateral still locked in the bond

    // Recovery (FAILED / DEFAULTED)
    uint256 public recoveryPool;
    uint256 public recoverySupply;
    uint256 public recoveryPaid;

    // Revenue accounting (reward-per-token with remainder carry)
    uint256 public totalPaid; // distributions made while ACTIVE (count toward coupons)
    uint256 public totalDistributed; // all distributions
    uint256 public totalRevenueClaimed;
    uint256 public revenuePerToken; // scaled by 1e18
    uint256 private _carry; // remainder of revenue * 1e18 not yet assigned
    mapping(address => uint256) public revenuePerTokenPaid;
    mapping(address => uint256) public revenueOwed;

    // ------------------------------------------------------------------
    // Events & errors
    // ------------------------------------------------------------------

    event Purchased(address indexed buyer, uint256 tokens, uint256 cost);
    event SaleFinalized(uint256 raised, uint256 couponAmount, uint256 startTime);
    event SaleFailed(uint256 raised);
    event CapitalDrawn(address indexed to, uint256 gross, uint256 fee);
    event RevenueDistributed(address indexed from, uint256 amount, bool countsAsCoupon);
    event RevenueClaimed(address indexed account, uint256 amount);
    event Matured(uint256 timestamp);
    event Defaulted(uint256 timestamp, uint256 recoveryPool, uint256 epochsDue, uint256 epochsCovered);
    event Redeemed(address indexed account, uint256 tokensBurned, uint256 amount);
    event CollateralWithdrawn(address indexed to, uint256 amount);
    event RegistryCallFailed(bytes4 selector);

    error InvalidTerms(string reason);
    error WrongState();
    error NotIssuer();
    error SaleClosed();
    error ExceedsMaxSupply();
    error InsufficientPayment();
    error ZeroAmount();
    error ZeroAddress();
    error MinRaiseNotMet();
    error NotMatured();
    error CouponsOutstanding();
    error NotInDefault();
    error NoSupply();
    error TransferFailed();

    modifier onlyIssuer() {
        if (msg.sender != issuer) revert NotIssuer();
        _;
    }

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    /**
     * @param _issuer        Protocol raising capital (receives drawn capital)
     * @param _feeRecipient  Protocol fee receiver (FeeSplitter)
     * @param _registry      Equorum registry
     * @param _drawFeeBps    Fee on every capital draw (snapshotted, <= 3%)
     * @param t              Bond terms
     * msg.value is locked as collateral.
     */
    constructor(
        string memory _name,
        string memory _symbol,
        address _issuer,
        address _feeRecipient,
        IEquorumRegistry _registry,
        uint256 _drawFeeBps,
        Terms memory t
    ) payable ERC20(_name, _symbol) {
        if (_issuer == address(0) || _feeRecipient == address(0) || address(_registry) == address(0)) {
            revert ZeroAddress();
        }
        _validate(_drawFeeBps, t);

        issuer = _issuer;
        factory = msg.sender;
        feeRecipient = _feeRecipient;
        registry = _registry;
        drawFeeBps = _drawFeeBps;

        price = t.price;
        maxSupply = t.maxSupply;
        minRaise = t.minRaise;
        saleEnd = block.timestamp + t.saleDuration;
        epochDuration = t.epochDuration;
        gracePeriod = t.gracePeriod;
        numEpochs = t.numEpochs;
        tapEpochs = t.tapEpochs;
        couponBps = t.couponBps;
        initialReleaseBps = t.initialReleaseBps;
        revenueShareBps = t.revenueShareBps;

        collateral = msg.value;
        state = State.Sale;
    }

    function _validate(uint256 fee, Terms memory t) private pure {
        if (fee > MAX_DRAW_FEE_BPS) revert InvalidTerms("fee");
        if (t.price == 0) revert InvalidTerms("price");
        if (t.maxSupply < 1e18) revert InvalidTerms("maxSupply");
        if (t.minRaise == 0 || t.minRaise > Math.mulDiv(t.maxSupply, t.price, 1e18)) revert InvalidTerms("minRaise");
        if (t.saleDuration < MIN_PERIOD || t.saleDuration > MAX_PERIOD) revert InvalidTerms("saleDuration");
        if (t.epochDuration < MIN_PERIOD || t.epochDuration > MAX_PERIOD) revert InvalidTerms("epochDuration");
        if (t.gracePeriod > t.epochDuration) revert InvalidTerms("gracePeriod");
        if (t.numEpochs == 0 || t.numEpochs > MAX_EPOCHS) revert InvalidTerms("numEpochs");
        if (t.tapEpochs == 0 || t.tapEpochs > t.numEpochs) revert InvalidTerms("tapEpochs");
        if (t.couponBps == 0 || t.couponBps > BPS) revert InvalidTerms("couponBps");
        // An issuer that never defaults must return at least 100% of the raise.
        if (uint256(t.couponBps) * t.numEpochs < BPS) revert InvalidTerms("couponBps*numEpochs");
        if (t.initialReleaseBps > BPS) revert InvalidTerms("initialReleaseBps");
        if (t.revenueShareBps > MAX_REVENUE_SHARE_BPS) revert InvalidTerms("revenueShareBps");
    }

    // ------------------------------------------------------------------
    // Sale
    // ------------------------------------------------------------------

    /// @notice Buy `amount` tokens (18 decimals) at the immutable price. Excess ETH is refunded.
    function buy(uint256 amount) external payable nonReentrant {
        if (state != State.Sale) revert WrongState();
        if (block.timestamp >= saleEnd) revert SaleClosed();
        if (amount == 0) revert ZeroAmount();
        if (totalSupply() + amount > maxSupply) revert ExceedsMaxSupply();

        uint256 cost = Math.mulDiv(amount, price, 1e18, Math.Rounding.Ceil);
        if (msg.value < cost) revert InsufficientPayment();

        raised += cost;
        _mint(msg.sender, amount);
        emit Purchased(msg.sender, amount, cost);

        uint256 excess = msg.value - cost;
        if (excess > 0) _send(msg.sender, excess);
    }

    /**
     * @notice Close the sale.
     * - Anyone may finalize once the sale window ended or the sale sold out.
     * - The issuer may close early once `minRaise` is met.
     * - If the window ended below `minRaise`, the bond becomes FAILED and buyers can redeem at cost.
     */
    function finalize() external {
        if (state != State.Sale) revert WrongState();
        bool ended = block.timestamp >= saleEnd || totalSupply() == maxSupply;

        if (!ended) {
            if (msg.sender != issuer) revert SaleClosed();
            if (raised < minRaise) revert MinRaiseNotMet();
        }

        if (raised >= minRaise) {
            state = State.Active;
            startTime = block.timestamp;
            couponAmount = Math.mulDiv(raised, couponBps, BPS, Math.Rounding.Ceil);
            _registryCall(abi.encodeCall(IEquorumRegistry.recordRaise, (raised)));
            emit SaleFinalized(raised, couponAmount, startTime);
        } else {
            _fail();
        }
    }

    /// @notice Issuer aborts the sale before finalization. Buyers redeem at cost.
    function cancelSale() external onlyIssuer {
        if (state != State.Sale) revert WrongState();
        _fail();
    }

    function _fail() private {
        state = State.Failed;
        recoveryPool = raised;
        recoverySupply = totalSupply();
        _registryCall(abi.encodeCall(IEquorumRegistry.recordFailed, ()));
        emit SaleFailed(raised);
    }

    // ------------------------------------------------------------------
    // Tap (capital release)
    // ------------------------------------------------------------------

    /// @notice Draw every unlocked tranche. The protocol fee is deducted and sent to the FeeSplitter.
    function drawCapital(address to) external onlyIssuer nonReentrant returns (uint256 net) {
        if (to == address(0)) revert ZeroAddress();
        if (state != State.Active && state != State.Matured) revert WrongState();

        uint256 gross = availableToDraw();
        if (gross == 0) revert ZeroAmount();

        capitalDrawn += gross;
        uint256 fee = (gross * drawFeeBps) / BPS;
        net = gross - fee;

        if (fee > 0) _send(feeRecipient, fee);
        _send(to, net);
        emit CapitalDrawn(to, gross, fee);
    }

    // ------------------------------------------------------------------
    // Coupons / revenue
    // ------------------------------------------------------------------

    /**
     * @notice Distribute ETH to current holders pro-rata. Anyone may call.
     * While ACTIVE, every wei counts toward the coupon schedule (overpaying prepays).
     */
    function distribute() external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        if (state == State.Sale || state == State.Failed) revert WrongState();
        uint256 supply = totalSupply();
        if (supply == 0) revert NoSupply();

        uint256 numerator = msg.value * PRECISION + _carry;
        revenuePerToken += numerator / supply;
        _carry = numerator % supply;
        totalDistributed += msg.value;

        bool counts = state == State.Active;
        if (counts) totalPaid += msg.value;

        _registryCall(abi.encodeCall(IEquorumRegistry.recordPayment, (msg.value)));
        emit RevenueDistributed(msg.sender, msg.value, counts);
    }

    function claimRevenue() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    /// @notice Claim on behalf of `account` (relayers / UIs). Funds always go to `account`.
    function claimRevenueFor(address account) external nonReentrant returns (uint256) {
        if (account == address(0)) revert ZeroAddress();
        return _claim(account);
    }

    function _claim(address account) private returns (uint256 amount) {
        _settle(account);
        amount = revenueOwed[account];
        if (amount == 0) revert ZeroAmount();
        revenueOwed[account] = 0;
        totalRevenueClaimed += amount;
        _send(account, amount);
        emit RevenueClaimed(account, amount);
    }

    // ------------------------------------------------------------------
    // Maturity / default
    // ------------------------------------------------------------------

    /// @notice Close the bond after its term when every coupon has been paid. Anyone may call.
    function mature() external {
        if (state != State.Active) revert WrongState();
        if (block.timestamp < maturityTime()) revert NotMatured();
        if (epochsCovered() < numEpochs) revert CouponsOutstanding();
        state = State.Matured;
        _registryCall(abi.encodeCall(IEquorumRegistry.recordMatured, ()));
        emit Matured(block.timestamp);
    }

    /// @notice Declare default when a coupon is unpaid past its grace period. Anyone may call.
    function triggerDefault() external {
        if (state != State.Active) revert WrongState();
        uint256 due = epochsDue();
        uint256 covered = epochsCovered();
        if (due <= covered) revert NotInDefault();

        state = State.Defaulted;
        uint256 pool = (raised - capitalDrawn) + collateral;
        collateral = 0;
        recoveryPool = pool;
        recoverySupply = totalSupply();

        _registryCall(abi.encodeCall(IEquorumRegistry.recordDefault, ()));
        emit Defaulted(block.timestamp, pool, due, covered);
    }

    /**
     * @notice Burn the caller's whole balance for its pro-rata share of the recovery pool.
     * Available after a failed sale or a default. Revenue already earned stays claimable.
     * There is no per-address flag: tokens received later can be redeemed too (fixes V2 R-4).
     */
    function redeem() external nonReentrant returns (uint256 amount) {
        if (state != State.Failed && state != State.Defaulted) revert WrongState();
        uint256 bal = balanceOf(msg.sender);
        if (bal == 0) revert ZeroAmount();

        amount = Math.mulDiv(recoveryPool, bal, recoverySupply);
        recoveryPaid += amount;
        _burn(msg.sender, bal);

        if (amount > 0) _send(msg.sender, amount);
        emit Redeemed(msg.sender, bal, amount);
    }

    /// @notice Issuer recovers its collateral after maturity or a failed sale.
    function withdrawCollateral(address to) external onlyIssuer nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (state != State.Matured && state != State.Failed) revert WrongState();
        uint256 amount = collateral;
        if (amount == 0) revert ZeroAmount();
        collateral = 0;
        _send(to, amount);
        emit CollateralWithdrawn(to, amount);
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function maturityTime() public view returns (uint256) {
        return startTime == 0 ? 0 : startTime + numEpochs * epochDuration;
    }

    /// @notice Whole epochs since the sale was finalized, capped at the term.
    function epochsElapsed() public view returns (uint256) {
        if (startTime == 0) return 0;
        return Math.min((block.timestamp - startTime) / epochDuration, numEpochs);
    }

    /// @notice Epochs fully paid by coupons/revenue distributed while ACTIVE (may exceed elapsed: prepayment).
    function epochsCovered() public view returns (uint256) {
        if (couponAmount == 0) return 0;
        return totalPaid / couponAmount;
    }

    /// @notice Epochs whose coupon must be paid by now (end of epoch + grace), capped at the term.
    function epochsDue() public view returns (uint256) {
        if (startTime == 0 || block.timestamp < startTime + gracePeriod) return 0;
        return Math.min((block.timestamp - startTime - gracePeriod) / epochDuration, numEpochs);
    }

    function isDefaultable() external view returns (bool) {
        return state == State.Active && epochsDue() > epochsCovered();
    }

    /// @notice Gross capital the issuer has unlocked so far (drawn or not).
    function unlockedCapital() public view returns (uint256) {
        if (state == State.Matured) return raised;
        if (state != State.Active) return capitalDrawn;

        uint256 k = Math.min(Math.min(epochsElapsed(), epochsCovered()), tapEpochs);
        uint256 initial = (raised * initialReleaseBps) / BPS;
        return initial + ((raised - initial) * k) / tapEpochs;
    }

    function availableToDraw() public view returns (uint256) {
        uint256 unlocked = unlockedCapital();
        return unlocked > capitalDrawn ? unlocked - capitalDrawn : 0;
    }

    /// @notice Revenue claimable by `account` right now.
    function earned(address account) public view returns (uint256) {
        return
            revenueOwed[account] + (balanceOf(account) * (revenuePerToken - revenuePerTokenPaid[account])) / PRECISION;
    }

    /// @notice Recovery amount `account` would receive from `redeem()` now.
    function redeemable(address account) external view returns (uint256) {
        if (state != State.Failed && state != State.Defaulted) return 0;
        if (recoverySupply == 0) return 0;
        return Math.mulDiv(recoveryPool, balanceOf(account), recoverySupply);
    }

    /// @notice ETH that must stay in the contract for holders and the issuer.
    function reservedBalance() external view returns (uint256) {
        bool holdsCapital = state == State.Sale || state == State.Active || state == State.Matured;
        uint256 capitalHeld = holdsCapital ? raised - capitalDrawn : 0;
        return capitalHeld + collateral + (recoveryPool - recoveryPaid) + (totalDistributed - totalRevenueClaimed);
    }

    /// @notice Bond terms. `saleDuration` is returned as 0; use `saleEnd` for the sale deadline.
    function terms() external view returns (Terms memory t) {
        t.price = price;
        t.maxSupply = maxSupply;
        t.minRaise = minRaise;
        t.epochDuration = uint64(epochDuration);
        t.gracePeriod = uint64(gracePeriod);
        t.numEpochs = uint32(numEpochs);
        t.tapEpochs = uint32(tapEpochs);
        t.couponBps = uint16(couponBps);
        t.initialReleaseBps = uint16(initialReleaseBps);
        t.revenueShareBps = uint16(revenueShareBps);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _settle(address account) private {
        uint256 rpt = revenuePerToken;
        uint256 delta = rpt - revenuePerTokenPaid[account];
        if (delta > 0) {
            uint256 bal = balanceOf(account);
            if (bal > 0) revenueOwed[account] += (bal * delta) / PRECISION;
            revenuePerTokenPaid[account] = rpt;
        }
    }

    /// @dev Settle revenue for both sides before any balance change (mint, burn, transfer).
    function _update(address from, address to, uint256 value) internal override {
        // Tokens sent to the bond itself could never claim revenue or redeem.
        if (to == address(this)) revert ERC20InvalidReceiver(to);
        if (from != address(0)) _settle(from);
        if (to != address(0)) _settle(to);
        super._update(from, to, value);
    }

    function _send(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev Registry failures must never block bondholders; they are surfaced as events.
    function _registryCall(bytes memory data) private {
        (bool ok,) = address(registry).call(data);
        if (!ok) emit RegistryCallFailed(bytes4(data));
    }

    /// @dev Direct ETH transfers are rejected; use buy() or distribute().
    receive() external payable {
        revert WrongState();
    }
}
