// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ILogiToken is IERC20 {
    function mint(address to, uint256 amount) external;
}

interface IShipmentRegistry {
    function getAdmin() external view returns (address);
}

/**
 * @title EscrowMilestone
 * @dev Automated milestone-based payment escrow
 * Payment distribution: 30% (Pickup) + 30% (Transit) + 20% (Arrived) + 20% (Delivered)
 * All payments go to admin address from ShipmentRegistry
 */
contract EscrowMilestone is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant BUYER_ROLE = keccak256("BUYER_ROLE");
    bytes32 public constant CARRIER_ROLE = keccak256("CARRIER_ROLE");
    bytes32 public constant REGISTRY_ROLE = keccak256("REGISTRY_ROLE");

    IERC20 public immutable token;
    address public immutable registryAddress;

    struct Escrow {
        uint256 totalAmount;
        uint256 releasedAmount;
        address buyer;
        address carrier;
        uint256 deadline;
        bool isActive;
        bool isCompleted;
    }

    mapping(uint256 => Escrow) private _escrows; // shipmentId => Escrow

    // Milestone percentages (basis points: 10000 = 100%)
    uint256 public constant MILESTONE_1_PERCENT = 3000;  // 30%
    uint256 public constant MILESTONE_2_PERCENT = 3000;  // 30%
    uint256 public constant MILESTONE_3_PERCENT = 2000;  // 20%
    uint256 public constant MILESTONE_4_PERCENT = 2000;  // 20%

    event EscrowOpened(
        uint256 indexed shipmentId,
        address indexed buyer,
        address indexed carrier,
        uint256 amount,
        uint256 deadline
    );

    event PaymentReleased(
        uint256 indexed shipmentId,
        address indexed carrier,
        uint256 amount,
        uint256 milestone
    );

    event EscrowRefunded(
        uint256 indexed shipmentId,
        address indexed buyer,
        uint256 amount
    );

    event DepositAdded(
        uint256 indexed shipmentId,
        address indexed buyer,
        uint256 amount
    );

    event AdminAutoMintEscrowOpened(
        uint256 indexed shipmentId,
        address indexed buyer,
        uint256 amount,
        uint256 deadline
    );

    constructor(address _token, address _registryAddress) {
        require(_token != address(0), "Invalid token address");
        require(_registryAddress != address(0), "Invalid registry address");
        token = IERC20(_token);
        registryAddress = _registryAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Open escrow for a shipment (only BUYER_ROLE)
     * @param shipmentId ID of the shipment
     * @param amount Total escrow amount
     * @param deadline Unix timestamp deadline
     */
    function openEscrow(
        uint256 shipmentId,
        uint256 amount,
        uint256 deadline
    ) external onlyRole(BUYER_ROLE) nonReentrant {
        require(amount > 0, "Amount must be greater than zero");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(!_escrows[shipmentId].isActive, "Escrow already exists");

        _escrows[shipmentId] = Escrow({
            totalAmount: amount,
            releasedAmount: 0,
            buyer: msg.sender,
            carrier: address(0), // Will be set on first release
            deadline: deadline,
            isActive: true,
            isCompleted: false
        });

        token.safeTransferFrom(msg.sender, address(this), amount);

        emit EscrowOpened(shipmentId, msg.sender, address(0), amount, deadline);
    }

    /**
     * @dev Open escrow with admin auto-mint to contract, for cases buyer agrees to fee
     * Requirements:
     *  - caller has DEFAULT_ADMIN_ROLE
     *  - this contract must have MINTER_ROLE on LogiToken
     *  - amount > 0 and deadline in future
     * Funds are minted directly to this contract, avoiding buyer approval/transfer.
     */
    function openEscrowByAdmin(
        uint256 shipmentId,
        address buyer,
        uint256 amount,
        uint256 deadline
    ) external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant {
        require(buyer != address(0), "Invalid buyer");
        require(amount > 0, "Amount must be greater than zero");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(!_escrows[shipmentId].isActive, "Escrow already exists");

        // Mint LOGI to this contract; requires MINTER_ROLE granted to EscrowMilestone on LogiToken
        ILogiToken(address(token)).mint(address(this), amount);

        _escrows[shipmentId] = Escrow({
            totalAmount: amount,
            releasedAmount: 0,
            buyer: buyer,
            carrier: address(0),
            deadline: deadline,
            isActive: true,
            isCompleted: false
        });

        emit AdminAutoMintEscrowOpened(shipmentId, buyer, amount, deadline);
    }

    /**
     * @dev Open escrow initiated by ShipmentRegistry (requires REGISTRY_ROLE)
     * Mints LOGI directly to this contract and activates escrow for given shipment.
     */
    function openEscrowByRegistry(
        uint256 shipmentId,
        address buyer,
        uint256 amount,
        uint256 deadline
    ) external onlyRole(REGISTRY_ROLE) nonReentrant {
        require(buyer != address(0), "Invalid buyer");
        require(amount > 0, "Amount must be greater than zero");
        require(deadline > block.timestamp, "Deadline must be in the future");
        require(!_escrows[shipmentId].isActive, "Escrow already exists");

        ILogiToken(address(token)).mint(address(this), amount);

        _escrows[shipmentId] = Escrow({
            totalAmount: amount,
            releasedAmount: 0,
            buyer: buyer,
            carrier: address(0),
            deadline: deadline,
            isActive: true,
            isCompleted: false
        });

        emit AdminAutoMintEscrowOpened(shipmentId, buyer, amount, deadline);
    }

    /**
     * @dev Add additional funds to existing escrow
     * @param shipmentId ID of the shipment
     * @param amount Amount to add
     */
    function deposit(
        uint256 shipmentId,
        uint256 amount
    ) external nonReentrant {
        Escrow storage escrow = _escrows[shipmentId];
        require(escrow.isActive, "Escrow not active");
        require(msg.sender == escrow.buyer, "Not the buyer");
        require(amount > 0, "Amount must be greater than zero");

        escrow.totalAmount += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositAdded(shipmentId, msg.sender, amount);
    }

    /**
     * @dev Release payment for a milestone (only CARRIER_ROLE)
     * @param shipmentId ID of the shipment
     * @param milestone Milestone number (1-4)
     */
    function release(
        uint256 shipmentId,
        uint256 milestone
    ) external onlyRole(CARRIER_ROLE) nonReentrant {
        Escrow storage escrow = _escrows[shipmentId];
        require(escrow.isActive, "Escrow not active");
        require(!escrow.isCompleted, "Escrow already completed");
        require(block.timestamp <= escrow.deadline, "Deadline passed");
        require(milestone >= 1 && milestone <= 4, "Invalid milestone");

        // Set carrier on first release
        if (escrow.carrier == address(0)) {
            escrow.carrier = msg.sender;
        } else {
            require(escrow.carrier == msg.sender, "Not the assigned carrier");
        }

        // Calculate payment amount based on milestone
        uint256 paymentPercent;
        if (milestone == 1) paymentPercent = MILESTONE_1_PERCENT;
        else if (milestone == 2) paymentPercent = MILESTONE_2_PERCENT;
        else if (milestone == 3) paymentPercent = MILESTONE_3_PERCENT;
        else paymentPercent = MILESTONE_4_PERCENT;

        uint256 paymentAmount = (escrow.totalAmount * paymentPercent) / 10000;
        
        require(
            escrow.releasedAmount + paymentAmount <= escrow.totalAmount,
            "Payment exceeds total amount"
        );

        escrow.releasedAmount += paymentAmount;

        // Mark as completed if all milestones paid
        if (milestone == 4 || escrow.releasedAmount >= escrow.totalAmount) {
            escrow.isCompleted = true;
            escrow.isActive = false;
        }

        // Pay admin instead of carrier
        address admin = IShipmentRegistry(registryAddress).getAdmin();
        token.safeTransfer(admin, paymentAmount);

        emit PaymentReleased(shipmentId, admin, paymentAmount, milestone);
    }

    /**
     * @dev Refund escrow to buyer (only before first milestone or after deadline)
     * @param shipmentId ID of the shipment
     */
    function refund(uint256 shipmentId) external nonReentrant {
        Escrow storage escrow = _escrows[shipmentId];
        require(escrow.isActive, "Escrow not active");
        require(msg.sender == escrow.buyer, "Not the buyer");
        require(
            escrow.releasedAmount == 0 || block.timestamp > escrow.deadline,
            "Cannot refund after payments started unless deadline passed"
        );

        uint256 refundAmount = escrow.totalAmount - escrow.releasedAmount;
        require(refundAmount > 0, "Nothing to refund");

        escrow.isActive = false;
        escrow.isCompleted = true;

        token.safeTransfer(msg.sender, refundAmount);

        emit EscrowRefunded(shipmentId, msg.sender, refundAmount);
    }

    /**
     * @dev Get escrow details
     * @param shipmentId ID of the shipment
     */
    function getEscrowDetails(uint256 shipmentId) external view returns (Escrow memory) {
        return _escrows[shipmentId];
    }

    /**
     * @dev Grant BUYER_ROLE
     */
    function grantBuyerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(BUYER_ROLE, account);
    }

    /**
     * @dev Grant CARRIER_ROLE
     */
    function grantCarrierRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(CARRIER_ROLE, account);
    }
}
