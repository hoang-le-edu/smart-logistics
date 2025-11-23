// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

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
        DELIVERED       // 4: Delivered to buyer
    }

    struct Shipment {
        uint256 id;
        address shipper;
        address carrier;
        address buyer;
        address warehouse;
        MilestoneStatus milestoneStatus;
        string metadataCid;  // IPFS CID for shipment metadata
        uint256 timestamp;
    }

    uint256 private _shipmentIdCounter;
    mapping(uint256 => Shipment) private _shipments;
    mapping(uint256 => string[]) private _documents; // IPFS CIDs for documents
    
    // Track shipments by address (shipper, carrier, buyer)
    mapping(address => uint256[]) private _shipmentsByAddress;

    event ShipmentCreated(
        uint256 indexed shipmentId,
        address indexed shipper,
        address indexed carrier,
        address buyer,
        string metadataCid
    );
    
    event MilestoneUpdated(
        uint256 indexed shipmentId,
        MilestoneStatus newStatus,
        uint256 timestamp
    );
    
    event DocumentAttached(
        uint256 indexed shipmentId,
        string documentCid
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @dev Create a new shipment (only SHIPPER_ROLE)
     * @param carrier Address of the carrier
     * @param buyer Address of the buyer
     * @param warehouse Address of the warehouse (optional, can be zero address)
     * @param metadataCid IPFS CID containing shipment metadata
     */
    function createShipment(
        address carrier,
        address buyer,
        address warehouse,
        string calldata metadataCid
    ) external onlyRole(SHIPPER_ROLE) nonReentrant returns (uint256) {
        require(carrier != address(0), "Invalid carrier address");
        require(buyer != address(0), "Invalid buyer address");
        require(bytes(metadataCid).length > 0, "Metadata CID required");

        uint256 shipmentId = _shipmentIdCounter++;

        _shipments[shipmentId] = Shipment({
            id: shipmentId,
            shipper: msg.sender,
            carrier: carrier,
            buyer: buyer,
            warehouse: warehouse,
            milestoneStatus: MilestoneStatus.CREATED,
            metadataCid: metadataCid,
            timestamp: block.timestamp
        });

        // Track shipment for all parties
        _shipmentsByAddress[msg.sender].push(shipmentId);
        _shipmentsByAddress[carrier].push(shipmentId);
        _shipmentsByAddress[buyer].push(shipmentId);
        if (warehouse != address(0)) {
            _shipmentsByAddress[warehouse].push(shipmentId);
        }

        emit ShipmentCreated(shipmentId, msg.sender, carrier, buyer, metadataCid);
        return shipmentId;
    }

    /**
     * @dev Update shipment milestone (only CARRIER_ROLE)
     * @param shipmentId ID of the shipment
     * @param newStatus New milestone status
     */
    function updateMilestone(
        uint256 shipmentId,
        MilestoneStatus newStatus
    ) external onlyRole(CARRIER_ROLE) nonReentrant {
        Shipment storage shipment = _shipments[shipmentId];
        require(shipment.carrier == msg.sender, "Not the assigned carrier");
        require(shipment.id == shipmentId, "Shipment does not exist");

        // Enforce sequential milestone updates
        uint256 currentStatus = uint256(shipment.milestoneStatus);
        uint256 nextStatus = uint256(newStatus);
        
        require(
            nextStatus == currentStatus + 1,
            "Must progress to next milestone sequentially"
        );
        require(
            nextStatus <= uint256(MilestoneStatus.DELIVERED),
            "Invalid milestone status"
        );

        shipment.milestoneStatus = newStatus;

        emit MilestoneUpdated(shipmentId, newStatus, block.timestamp);
    }

    /**
     * @dev Attach a document (IPFS CID) to a shipment
     * @param shipmentId ID of the shipment
     * @param documentCid IPFS CID of the document
     */
    function attachDocument(
        uint256 shipmentId,
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

        _documents[shipmentId].push(documentCid);

        emit DocumentAttached(shipmentId, documentCid);
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
    function getShipmentDocuments(uint256 shipmentId) external view returns (string[] memory) {
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
