// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IEscrowMilestone {
    struct Escrow {
        uint256 totalAmount;
        uint256 releasedAmount;
        address buyer;
        address carrier;
        uint256 deadline;
        bool isActive;
        bool isCompleted;
    }
    function getEscrowDetails(uint256 shipmentId) external view returns (Escrow memory);
    function openEscrowByRegistry(uint256 shipmentId, address buyer, uint256 amount, uint256 deadline) external;
}

interface ILogiToken {
    function mint(address to, uint256 amount) external;
}

/**
 * @title ShipmentRegistry
 * @dev Track shipments through 5 milestone states with IPFS metadata
 * Roles: SHIPPER_ROLE, CARRIER_ROLE, BUYER_ROLE
 */
contract ShipmentRegistry is AccessControl, ReentrancyGuard {
    bytes32 public constant SHIPPER_ROLE = keccak256("SHIPPER_ROLE");
    bytes32 public constant CARRIER_ROLE = keccak256("CARRIER_ROLE");
    bytes32 public constant BUYER_ROLE = keccak256("BUYER_ROLE");

    enum MilestoneStatus {
        CREATED,        // 0: Shipment created
        PICKED_UP,      // 1: Carrier picked up
        IN_TRANSIT,     // 2: In transit
        ARRIVED,        // 3: Arrived at destination
        DELIVERED,      // 4: Delivered to buyer
        CANCELED        // 5: Shipment canceled
    }

    struct Shipment {
        uint256 id;
        address shipper;
        address carrier;
        address buyer;
        MilestoneStatus status;
        string[] metadataCids;  // IPFS CIDs for shipment metadata history
        uint256 createdAt;
        uint256 updatedAt;
    }

    struct Document {
        string docType; // e.g., "Bill of Lading", filename, etc.
        string cid; // IPFS CID
        address uploadedBy;
        uint256 timestamp;
    }

    uint256 private _shipmentIdCounter;
    mapping(uint256 => Shipment) private _shipments;
    mapping(uint256 => Document[]) private _documents; // Documents attached to shipments
    
    // Track shipments by address (shipper, carrier, buyer)
    mapping(address => uint256[]) private _shipmentsByAddress;

    // Orders created by buyers (lightweight via events)
    uint256 private _orderIdCounter;

    event OrderCreated(
        uint256 indexed orderId,
        address indexed buyer,
        string orderCid,
        uint256 timestamp
    );

    event ShipmentCreated(
        uint256 indexed shipmentId,
        address indexed shipper,
        address indexed carrier,
        address buyer,
        string metadataCid,
        uint256 shippingFee
    );
    
    event MilestoneUpdated(
        uint256 indexed shipmentId,
        MilestoneStatus newStatus,
        uint256 timestamp
    );
    
    event DocumentAttached(
        uint256 indexed shipmentId,
        string docType,
        string documentCid,
        address indexed uploadedBy,
        uint256 timestamp
    );

    // Escrow contract reference to enforce pickup guard
    address public escrowContract;
    address public logiToken;

    /**
     * @dev Set the escrow contract address (admin only)
     */
    function setEscrowContract(address _addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_addr != address(0), "Invalid escrow address");
        escrowContract = _addr;
    }

    /**
     * @dev Set the LOGI token contract address (admin only) for auto-mint on shipment creation
     */
    function setLogiToken(address _addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_addr != address(0), "Invalid token address");
        logiToken = _addr;
    }

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Set default display name for admin
        displayName[msg.sender] = "Admin";
    }

    

    /**
     * @dev Create a new shipment (only SHIPPER_ROLE). Carrier is not set at creation and will be
     *      assigned by the carrier calling acceptShipment(shipmentId), which also moves status to PICKED_UP.
     * @param buyer Address of the buyer
     * @param metadataCid IPFS CID containing shipment metadata
     * @param documentCids Optional array of document CIDs to attach at creation
     * @param documentTypes Optional array of document types/names corresponding to CIDs
     */
    
    function createShipment(
        address buyer,
        string calldata metadataCid,
        string[] calldata documentCids,
        string[] calldata documentTypes,
        uint256 shippingFee
    ) external onlyRole(SHIPPER_ROLE) nonReentrant returns (uint256) {
        require(buyer != address(0), "Invalid buyer address");
        require(bytes(metadataCid).length > 0, "Metadata CID required");

        uint256 shipmentId = _shipmentIdCounter++;

        _shipments[shipmentId] = Shipment({
            id: shipmentId,
            shipper: msg.sender,
            carrier: address(0),
            buyer: buyer,
            status: MilestoneStatus.CREATED,
            metadataCids: new string[](0),
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        _shipments[shipmentId].metadataCids.push(metadataCid);

        // Track shipment for shipper and buyer only at creation
        _shipmentsByAddress[msg.sender].push(shipmentId);
        _shipmentsByAddress[buyer].push(shipmentId);

        // Attach any initial documents provided
        if (documentCids.length > 0) {
            // lengths should match; if types missing, use empty string
            for (uint256 i = 0; i < documentCids.length; i++) {
                string memory cid = documentCids[i];
                string memory dtype = "";
                if (i < documentTypes.length) {
                    dtype = documentTypes[i];
                }
                _documents[shipmentId].push(Document({
                    docType: dtype,
                    cid: cid,
                    uploadedBy: msg.sender,
                    timestamp: block.timestamp
                }));

                emit DocumentAttached(shipmentId, dtype, cid, msg.sender, block.timestamp);
            }
        }

        emit ShipmentCreated(shipmentId, msg.sender, address(0), buyer, metadataCid, shippingFee);

        // Auto-open escrow with shippingFee by minting funds directly to Escrow contract (registry role required)
        if (shippingFee > 0) {
            require(escrowContract != address(0), "Escrow not set");
            // Set a default deadline: 30 days from now
            uint256 deadline = block.timestamp + 30 days;
            IEscrowMilestone(escrowContract).openEscrowByRegistry(shipmentId, buyer, shippingFee, deadline);
        }
        return shipmentId;
    }

    /**
     * @dev Progress shipment milestone sequentially with role-based authorization:
     *      CREATED -> PICKED_UP      : Shipper
     *      PICKED_UP -> IN_TRANSIT   : Carrier
     *      IN_TRANSIT -> ARRIVED     : Carrier
     *      ARRIVED -> DELIVERED      : Buyer
     */
    function updateMilestone(
        uint256 shipmentId,
        MilestoneStatus newStatus
    ) external nonReentrant {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");

        uint256 current = uint256(shipment.status);
        uint256 target = uint256(newStatus);
        require(newStatus != MilestoneStatus.CANCELED, "Use cancelShipment");
        require(target == current + 1, "Sequential only");
        require(target <= uint256(MilestoneStatus.DELIVERED), "Invalid status");

        if (newStatus == MilestoneStatus.PICKED_UP) {
            require(hasRole(SHIPPER_ROLE, msg.sender) && msg.sender == shipment.shipper, "Shipper only");
        } else if (newStatus == MilestoneStatus.IN_TRANSIT || newStatus == MilestoneStatus.ARRIVED) {
            require(hasRole(CARRIER_ROLE, msg.sender) && msg.sender == shipment.carrier, "Carrier only");
        } else if (newStatus == MilestoneStatus.DELIVERED) {
            require(hasRole(BUYER_ROLE, msg.sender) && msg.sender == shipment.buyer, "Buyer only");
        }

        shipment.status = newStatus;
        shipment.updatedAt = block.timestamp;
        emit MilestoneUpdated(shipmentId, newStatus, block.timestamp);
    }

    /**
     * @dev Carrier nhận hàng: gán địa chỉ carrier và chuyển CREATED -> PICKED_UP
     * Chỉ gọi được bởi ví có CARRIER_ROLE. Nếu shipment đã có carrier hoặc không ở trạng thái CREATED sẽ bị từ chối.
     */
    
    function acceptShipment(uint256 shipmentId) external nonReentrant onlyRole(CARRIER_ROLE) {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(shipment.status == MilestoneStatus.CREATED, "Not in CREATED");
        require(shipment.carrier == address(0) || shipment.carrier == msg.sender, "Carrier already set");

        // Guard: require escrow active by buyer before pickup
        require(escrowContract != address(0), "Escrow not set");
        IEscrowMilestone.Escrow memory esc = IEscrowMilestone(escrowContract).getEscrowDetails(shipmentId);
        require(esc.isActive, "Escrow inactive");
        require(esc.buyer == shipment.buyer, "Escrow not opened by buyer");

        shipment.carrier = msg.sender;
        shipment.status = MilestoneStatus.PICKED_UP;
        shipment.updatedAt = block.timestamp;

        // Track shipment for this carrier if it was empty before
        _shipmentsByAddress[msg.sender].push(shipmentId);

        emit MilestoneUpdated(shipmentId, MilestoneStatus.PICKED_UP, block.timestamp);
    }

    /**
     * @dev Cancel a shipment with mandatory reason and optional evidence doc
     */
    function cancelShipment(
        uint256 shipmentId,
        string calldata reason,
        string calldata evidenceType,
        string calldata evidenceCid
    ) external nonReentrant {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(
            hasRole(SHIPPER_ROLE, msg.sender) ||
            hasRole(CARRIER_ROLE, msg.sender) ||
            hasRole(BUYER_ROLE, msg.sender),
            "Unauthorized"
        );
        require(bytes(reason).length > 0, "Cancel reason required");

        shipment.status = MilestoneStatus.CANCELED;
        shipment.updatedAt = block.timestamp;

        // Record cancel reason as metadata entry
        shipment.metadataCids.push(reason);

        if (bytes(evidenceCid).length > 0) {
            _documents[shipmentId].push(Document({
                docType: evidenceType,
                cid: evidenceCid,
                uploadedBy: msg.sender,
                timestamp: block.timestamp
            }));
        }

        emit MilestoneUpdated(shipmentId, MilestoneStatus.CANCELED, block.timestamp);
    }

    /**
     * @dev Attach a document (IPFS CID) to a shipment
     * @param shipmentId ID of the shipment
     * @param docType Type or name of the document
     * @param documentCid IPFS CID of the document
     */
    function attachDocument(
        uint256 shipmentId,
        string calldata docType,
        string calldata documentCid
    ) external nonReentrant {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(
            msg.sender == shipment.shipper ||
            msg.sender == shipment.carrier ||
            msg.sender == shipment.buyer,
            "Not authorized to attach documents"
        );
        require(bytes(documentCid).length > 0, "Document CID required");

        _documents[shipmentId].push(Document({
            docType: docType,
            cid: documentCid,
            uploadedBy: msg.sender,
            timestamp: block.timestamp
        }));

        emit DocumentAttached(shipmentId, docType, documentCid, msg.sender, block.timestamp);
    }

    /**
     * @dev Get shipment details
     * @param shipmentId ID of the shipment
     */
    function getShipment(uint256 shipmentId) external view returns (Shipment memory) {
        require(_shipments[shipmentId].id == shipmentId, "Shipment does not exist");
        return _shipments[shipmentId];
    }

    /**
     * @dev Get all documents attached to a shipment
     * @param shipmentId ID of the shipment
     */
    function getShipmentDocuments(uint256 shipmentId) external view returns (Document[] memory) {
        require(_shipments[shipmentId].id == shipmentId, "Shipment does not exist");
        return _documents[shipmentId];
    }

    /**
     * @dev Get all shipment IDs for an address (as shipper, carrier, or buyer)
     * @param addr Address to query
     */
    function getShipmentsByAddress(address addr) external view returns (uint256[] memory) {
        return _shipmentsByAddress[addr];
    }

    /**
     * @dev Get total number of shipments
     */
    function getTotalShipments() external view returns (uint256) {
        return _shipmentIdCounter;
    }

    /**
     * @dev Append a new metadata CID to shipment (transparent history)
     */
    function appendMetadata(uint256 shipmentId, string calldata metadataCid) external nonReentrant {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(
            msg.sender == shipment.shipper ||
            msg.sender == shipment.carrier ||
            msg.sender == shipment.buyer,
            "Not authorized"
        );
        require(bytes(metadataCid).length > 0, "CID required");
        shipment.metadataCids.push(metadataCid);
        shipment.updatedAt = block.timestamp;
    }

    /**
     * @dev Buyer creates an order by publishing an IPFS CID with order details
     */
    function createOrder(string calldata orderCid) external nonReentrant onlyRole(BUYER_ROLE) returns (uint256) {
        require(bytes(orderCid).length > 0, "CID required");
        uint256 orderId = _orderIdCounter++;
        emit OrderCreated(orderId, msg.sender, orderCid, block.timestamp);
        return orderId;
    }

    // Wallet display names for UI convenience
    mapping(address => string) public displayName;
    event DisplayNameUpdated(address indexed account, string name);
    function setDisplayName(string calldata name) external {
        require(bytes(name).length > 0, "Name required");
        displayName[msg.sender] = name;
        emit DisplayNameUpdated(msg.sender, name);
    }

    /**
     * @dev Admin can set display name for any account
     */
    function setDisplayNameFor(address account, string calldata name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(account != address(0), "Invalid address");
        require(bytes(name).length > 0, "Name required");
        displayName[account] = name;
        emit DisplayNameUpdated(account, name);
    }

    /**
     * @dev Grant SHIPPER_ROLE
     */
    function grantShipperRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(SHIPPER_ROLE, account);
    }

    /**
     * @dev Grant CARRIER_ROLE
     */
    function grantCarrierRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(CARRIER_ROLE, account);
    }

    /**
     * @dev Grant BUYER_ROLE
     */
    function grantBuyerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(BUYER_ROLE, account);
    }
}
