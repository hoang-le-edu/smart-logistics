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
    function releaseToAdmin(uint256 shipmentId, uint256 amount, uint256 milestone) external;
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
    bytes32 public constant STAFF_ROLE = keccak256("STAFF_ROLE");
    bytes32 public constant CARRIER_ROLE = keccak256("CARRIER_ROLE");
    bytes32 public constant BUYER_ROLE = keccak256("BUYER_ROLE");
    bytes32 public constant PACKER_ROLE = keccak256("PACKER_ROLE");

    enum MilestoneStatus {
        CREATED,        // 0: Shipment created
        PICKED_UP,      // 1: Carrier picked up
        IN_TRANSIT,     // 2: In transit
        ARRIVED,        // 3: Arrived at destination
        DELIVERED,      // 4: Delivered to buyer
        CANCELED,       // 5: Shipment canceled
        FAILED          // 6: Shipment failed, refund buyer
    }

    struct Shipment {
        uint256 id;
        address staff;
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
    
    // Track shipments by address (staff, carrier, buyer)
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
        address indexed staff,
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
    
    event CarrierAssigned(
        uint256 indexed shipmentId,
        address indexed carrier
    );
    
    event DocumentAttached(
        uint256 indexed shipmentId,
        string docType,
        string documentCid,
        address indexed uploadedBy,
        uint256 timestamp
    );

    event ShipmentFailed(
        uint256 indexed shipmentId,
        address indexed carrier,
        string reason,
        uint256 timestamp
    );

    // Escrow contract reference to enforce pickup guard
    address public escrowContract;
    address public logiToken;
    address private _adminAddress;

    // Base origin point for distance calculation (latitude, longitude as fixed-point numbers)
    // Stored as integers: actual_value * 1e6 (e.g., 21.0285 -> 21028500)
    uint256 public originLatitude;
    uint256 public originLongitude;

    // Shipping fee tiers based on distance
    struct ShippingTier {
        uint256 maxDistance;  // in km
        uint256 fee;          // fee amount in token units
    }
    ShippingTier[] public shippingTiers;

    event OriginLocationUpdated(uint256 latitude, uint256 longitude);
    event ShippingTierUpdated(uint256 index, uint256 maxDistance, uint256 fee);

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

    /**
     * @dev Set admin address for payment recipient (admin only)
     */
    function setAdmin(address _addr) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_addr != address(0), "Invalid admin address");
        _adminAddress = _addr;
    }

    /**
     * @dev Get admin address (used by EscrowMilestone)
     */
    function getAdmin() external view returns (address) {
        return _adminAddress;
    }

    /**
     * @dev Set origin location for shipping fee calculation (admin only)
     * @param _latitude Latitude * 1e6 (e.g., 21028500 for 21.0285°)
     * @param _longitude Longitude * 1e6 (e.g., 105854200 for 105.8542°)
     */
    function setOriginLocation(uint256 _latitude, uint256 _longitude) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        originLatitude = _latitude;
        originLongitude = _longitude;
        emit OriginLocationUpdated(_latitude, _longitude);
    }

    /**
     * @dev Initialize shipping fee tiers (admin only)
     * Default tiers: <2km=0, 2-10km=10, 10-100km=50, 100-500km=150, >=500km=300
     */
    function initializeShippingTiers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        delete shippingTiers;
        shippingTiers.push(ShippingTier(2, 0));           // < 2km: free
        shippingTiers.push(ShippingTier(10, 10));         // 2-10km: 10 LOGI
        shippingTiers.push(ShippingTier(100, 50));        // 10-100km: 50 LOGI
        shippingTiers.push(ShippingTier(500, 150));       // 100-500km: 150 LOGI
        shippingTiers.push(ShippingTier(type(uint256).max, 300)); // >= 500km: 300 LOGI
        emit ShippingTierUpdated(0, 0, 0);
    }

    /**
     * @dev Update a specific shipping tier (admin only)
     */
    function updateShippingTier(uint256 index, uint256 maxDistance, uint256 fee) 
        external 
        onlyRole(DEFAULT_ADMIN_ROLE) 
    {
        require(index < shippingTiers.length, "Invalid tier index");
        shippingTiers[index] = ShippingTier(maxDistance, fee);
        emit ShippingTierUpdated(index, maxDistance, fee);
    }

    /**
     * @dev Calculate shipping fee based on distance in km
     * @param distanceKm Distance in kilometers
     * @return fee The calculated shipping fee
     */
    function calculateShippingFee(uint256 distanceKm) public view returns (uint256) {
        require(shippingTiers.length > 0, "Shipping tiers not initialized");
        
        for (uint256 i = 0; i < shippingTiers.length; i++) {
            if (distanceKm < shippingTiers[i].maxDistance) {
                return shippingTiers[i].fee;
            }
        }
        return shippingTiers[shippingTiers.length - 1].fee;
    }

    /**
     * @dev Get shipping fee based on delivery coordinates
     * @param deliveryLatitude Latitude * 1e6 (e.g., 21028500)
     * @param deliveryLongitude Longitude * 1e6 (e.g., 105854200)
     * @return distance Distance in km
     * @return fee Calculated shipping fee
     */
    function getShippingFee(uint256 deliveryLatitude, uint256 deliveryLongitude) 
        external 
        view 
        returns (uint256 distance, uint256 fee) 
    {
        require(originLatitude != 0 && originLongitude != 0, "Origin location not set");
        distance = calculateHaversineDistance(originLatitude, originLongitude, deliveryLatitude, deliveryLongitude);
        fee = calculateShippingFee(distance);
    }

    /**
     * @dev Haversine formula for distance calculation (simplified approximation)
     * Returns distance in km
     * Note: This is a simplified version suitable for relatively short distances
     */
    function calculateHaversineDistance(
        uint256 lat1,
        uint256 lon1,
        uint256 lat2,
        uint256 lon2
    ) internal pure returns (uint256) {
        // Convert from 1e6 format and calculate differences
        int256 dlat = int256(lat2) - int256(lat1);
        int256 dlon = int256(lon2) - int256(lon1);

        // Get absolute values
        uint256 dlat_abs = dlat < 0 ? uint256(-dlat) : uint256(dlat);
        uint256 dlon_abs = dlon < 0 ? uint256(-dlon) : uint256(dlon);

        // Simplified calculation: distance ≈ sqrt(dlat² + dlon²) * 111 km per degree
        // Coordinates are in 1e6 format (e.g., 10.870493 -> 10870493)
        // Calculate: sqrt((dlat/1e6)² + (dlon/1e6)²) * 111
        // = sqrt(dlat² + dlon²) / 1e6 * 111
        // = sqrt(dlat² + dlon²) * 111 / 1e6
        
        uint256 sumSquares = dlat_abs * dlat_abs + dlon_abs * dlon_abs;
        uint256 sqrtValue = sqrt(sumSquares);
        
        // Multiply by 111 km/degree, then divide by 1e6 to convert from micro-degrees
        uint256 distance = (sqrtValue * 111) / 1e6;
        
        return distance;
    }

    /**
     * @dev Integer square root function (Babylonian method)
     */
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    /**
     * @dev Get all shipping tiers
     */
    function getShippingTiers() external view returns (ShippingTier[] memory) {
        return shippingTiers;
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
    ) external onlyRole(STAFF_ROLE) nonReentrant returns (uint256) {
        require(buyer != address(0), "Invalid buyer address");
        require(bytes(metadataCid).length > 0, "Metadata CID required");

        uint256 shipmentId = _shipmentIdCounter++;

        _shipments[shipmentId] = Shipment({
            id: shipmentId,
            staff: msg.sender,
            carrier: address(0),
            buyer: buyer,
            status: MilestoneStatus.CREATED,
            metadataCids: new string[](0),
            createdAt: block.timestamp,
            updatedAt: block.timestamp
        });
        _shipments[shipmentId].metadataCids.push(metadataCid);

        // Track shipment for staff and buyer only at creation
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
            // Flow: Staff creates -> Buyer escrow -> Packer marks PICKED_UP
            // Carrier may still be unset at this stage; allow PICKED_UP without assigned carrier
            require(hasRole(PACKER_ROLE, msg.sender), "Packer only");
        } else if (newStatus == MilestoneStatus.IN_TRANSIT) {
            // Any carrier can move to IN_TRANSIT and self-assign if none
            require(hasRole(CARRIER_ROLE, msg.sender), "Carrier only");
            if (shipment.carrier == address(0)) {
                shipment.carrier = msg.sender;
                _shipmentsByAddress[msg.sender].push(shipmentId);
                emit CarrierAssigned(shipmentId, msg.sender);
            } else {
                require(msg.sender == shipment.carrier, "Only assigned carrier");
            }
        } else if (newStatus == MilestoneStatus.ARRIVED) {
            require(hasRole(CARRIER_ROLE, msg.sender) && msg.sender == shipment.carrier, "Carrier only");
        } else if (newStatus == MilestoneStatus.DELIVERED) {
            require(hasRole(BUYER_ROLE, msg.sender) && msg.sender == shipment.buyer, "Buyer only");
        }

        shipment.status = newStatus;
        shipment.updatedAt = block.timestamp;
        emit MilestoneUpdated(shipmentId, newStatus, block.timestamp);

        // Handle escrow milestone payouts to admin: 30/30/20/20
        if (escrowContract != address(0)) {
            IEscrowMilestone.Escrow memory esc = IEscrowMilestone(escrowContract).getEscrowDetails(shipmentId);
            if (esc.isActive && esc.totalAmount > 0) {
                uint256 bp;
                uint256 milestoneNum;
                if (newStatus == MilestoneStatus.PICKED_UP) {
                    bp = 3000; milestoneNum = 1;
                } else if (newStatus == MilestoneStatus.IN_TRANSIT) {
                    bp = 3000; milestoneNum = 2;
                } else if (newStatus == MilestoneStatus.ARRIVED) {
                    bp = 2000; milestoneNum = 3;
                } else if (newStatus == MilestoneStatus.DELIVERED) {
                    bp = 2000; milestoneNum = 4;
                }
                if (bp > 0) {
                    uint256 amount = (esc.totalAmount * bp) / 10000;
                    // Safe guard: do not exceed remaining
                    uint256 remaining = esc.totalAmount - esc.releasedAmount;
                    if (amount > remaining) {
                        amount = remaining;
                    }
                    if (amount > 0) {
                        IEscrowMilestone(escrowContract).releaseToAdmin(shipmentId, amount, milestoneNum);
                    }
                }
            }
        }
    }

    /**
     * @dev Carrier nhận hàng: gán địa chỉ carrier NHƯNG KHÔNG chuyển status
     * Packer sẽ gọi updateMilestone(shipmentId, PICKED_UP) sau khi đóng gói xong
     */
    
    function acceptShipment(uint256 shipmentId) external nonReentrant onlyRole(CARRIER_ROLE) {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(shipment.status == MilestoneStatus.CREATED, "Not in CREATED");
        require(shipment.carrier == address(0) || shipment.carrier == msg.sender, "Carrier already set");

        // Guard: require escrow active by buyer before carrier accepts
        require(escrowContract != address(0), "Escrow not set");
        IEscrowMilestone.Escrow memory esc = IEscrowMilestone(escrowContract).getEscrowDetails(shipmentId);
        require(esc.isActive, "Escrow inactive");
        require(esc.buyer == shipment.buyer, "Escrow not opened by buyer");

        shipment.carrier = msg.sender;
        shipment.updatedAt = block.timestamp;

        // Track shipment for this carrier if it was empty before
        _shipmentsByAddress[msg.sender].push(shipmentId);

        emit CarrierAssigned(shipmentId, msg.sender);
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
            hasRole(STAFF_ROLE, msg.sender) ||
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
     * @dev Carrier marks shipment as FAILED (triggers buyer refund)
     * @param shipmentId ID of the shipment
     * @param reason Failure reason
     * @param evidenceType Type of evidence document
     * @param evidenceCid IPFS CID of evidence
     */
    function failShipment(
        uint256 shipmentId,
        string calldata reason,
        string calldata evidenceType,
        string calldata evidenceCid
    ) external nonReentrant onlyRole(CARRIER_ROLE) {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(msg.sender == shipment.carrier, "Only assigned carrier");
        require(shipment.status == MilestoneStatus.IN_TRANSIT || shipment.status == MilestoneStatus.ARRIVED, "Invalid status");
        require(bytes(reason).length > 0, "Failure reason required");

        shipment.status = MilestoneStatus.FAILED;
        shipment.updatedAt = block.timestamp;

        // Record failure reason
        shipment.metadataCids.push(reason);

        // Attach evidence document
        if (bytes(evidenceCid).length > 0) {
            _documents[shipmentId].push(Document({
                docType: evidenceType,
                cid: evidenceCid,
                uploadedBy: msg.sender,
                timestamp: block.timestamp
            }));
        }

        emit ShipmentFailed(shipmentId, msg.sender, reason, block.timestamp);
        emit MilestoneUpdated(shipmentId, MilestoneStatus.FAILED, block.timestamp);
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
            msg.sender == shipment.staff ||
            msg.sender == shipment.carrier ||
            msg.sender == shipment.buyer ||
            hasRole(PACKER_ROLE, msg.sender),
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
            msg.sender == shipment.staff ||
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
    function grantStaffRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(STAFF_ROLE, account);
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

    /**
     * @dev Grant PACKER_ROLE
     */
    function grantPackerRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(PACKER_ROLE, account);
    }

    /**
     * @dev Mark shipment as failed (CARRIER_ROLE only)
     * @param shipmentId ID of the shipment
     * @param reason Reason for failure
     */
    function markShipmentFailed(uint256 shipmentId, string calldata reason) 
        external 
        onlyRole(CARRIER_ROLE) 
        nonReentrant 
    {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.id == shipmentId, "Shipment does not exist");
        require(shipment.status != MilestoneStatus.DELIVERED, "Already delivered");
        require(shipment.status != MilestoneStatus.FAILED, "Already failed");
        require(shipment.status != MilestoneStatus.CANCELED, "Already canceled");
        
        shipment.status = MilestoneStatus.FAILED;
        shipment.updatedAt = block.timestamp;
        
        emit MilestoneUpdated(shipmentId, MilestoneStatus.FAILED, block.timestamp);
        emit ShipmentFailed(shipmentId, msg.sender, reason, block.timestamp);
    }
}
