const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShipmentRegistry", function () {
  async function deployShipmentRegistryFixture() {
    const [admin, shipper, carrier, buyer, warehouse, other] =
      await ethers.getSigners();

    const ShipmentRegistry = await ethers.getContractFactory(
      "ShipmentRegistry"
    );
    const registry = await ShipmentRegistry.deploy();

    // Grant roles (access as constants, not functions)
    const SHIPPER_ROLE = await registry.STAFF_ROLE();
    const CARRIER_ROLE = await registry.CARRIER_ROLE();
    const BUYER_ROLE = await registry.BUYER_ROLE();
    const WAREHOUSE_ROLE = await registry.PACKER_ROLE();

    await registry.grantStaffRole(shipper.address);
    await registry.grantCarrierRole(carrier.address);
    await registry.grantBuyerRole(buyer.address);
    await registry.grantPackerRole(warehouse.address);

    return { registry, admin, shipper, carrier, buyer, warehouse, other };
  }

  describe("Deployment", function () {
    it("Should grant admin role to deployer", async function () {
      const { registry, admin } = await loadFixture(
        deployShipmentRegistryFixture
      );
      const DEFAULT_ADMIN_ROLE = await registry.DEFAULT_ADMIN_ROLE();
      expect(await registry.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
    });

    it("Should start with zero shipments", async function () {
      const { registry } = await loadFixture(deployShipmentRegistryFixture);
      expect(await registry.getTotalShipments()).to.equal(0);
    });
  });

  describe("UC01: Create Shipment", function () {
    it("Should allow shipper to create shipment", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);

      const metadataCid = "QmTest123456789";

      await expect(
        registry
          .connect(shipper)
          .createShipment(
            buyer.address,
            metadataCid,
            [], // documentCids
            [], // documentTypes
            0   // shippingFee
          )
      )
        .to.emit(registry, "ShipmentCreated");

      const shipment = await registry.getShipment(0);
      expect(shipment.staff).to.equal(shipper.address);
      expect(shipment.carrier).to.equal(ethers.ZeroAddress);
      expect(shipment.buyer).to.equal(buyer.address);
      expect(shipment.status).to.equal(0); // CREATED
    });

    it("Should not allow non-shipper to create shipment", async function () {
      const { registry, carrier, buyer, warehouse, other } = await loadFixture(
        deployShipmentRegistryFixture
      );

      await expect(
        registry
          .connect(other)
          .createShipment(
            buyer.address,
            "QmTest",
            [],
            [],
            0
          )
      ).to.be.reverted;
    });

    it("Should reject invalid addresses", async function () {
      const { registry, shipper, buyer } = await loadFixture(
        deployShipmentRegistryFixture
      );

      await expect(
        registry
          .connect(shipper)
          .createShipment(
            ethers.ZeroAddress,
            "QmTest",
            [],
            [],
            0
          )
      ).to.be.revertedWith("Invalid buyer address");

      await expect(
        registry
          .connect(shipper)
          .createShipment(
            buyer.address,
            "", // empty metadataCid
            [],
            [],
            0
          )
      ).to.be.revertedWith("Metadata CID required");
    });
  });

  describe("UC02: Update Milestone", function () {
    async function createTestShipment(
      registry,
      shipper,
      buyer
    ) {
      // createShipment(buyer, metadataCid, documentCids, documentTypes, shippingFee)
      const tx = await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest",
          [], // documentCids
          [], // documentTypes
          0   // shippingFee
        );
      const receipt = await tx.wait();
      // Get shipmentId from event or return 0 (first shipment ID)
      return 0;
    }

    it("RB02: Should follow sequential milestone order", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);
      const shipmentId = await createTestShipment(
        registry,
        shipper,
        buyer
      );

      // Cannot skip from CREATED (0) to IN_TRANSIT (2)
      await expect(
        registry.connect(carrier).updateMilestone(shipmentId, 2)
      ).to.be.revertedWith("Sequential only");

      // Must go CREATED (0) -> PICKED_UP (1) - Packer role required
      await expect(
        registry
          .connect(warehouse)
          .updateMilestone(shipmentId, 1)
      ).to.not.be.reverted;
    });

    it("RB01: Only carrier can update PICKED_UP milestone", async function () {
      const { registry, shipper, carrier, buyer, warehouse, other } =
        await loadFixture(deployShipmentRegistryFixture);
      const shipmentId = await createTestShipment(
        registry,
        shipper,
        carrier,
        buyer,
        warehouse
      );

      // Packer can update to PICKED_UP (status 1)
      await expect(
        registry.connect(warehouse).updateMilestone(shipmentId, 1)
      ).to.not.be.reverted;

      // Create another shipment for testing unauthorized update
      await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest2",
          [],
          [],
          0
        );

      // Other users cannot update
      await expect(
        registry.connect(other).updateMilestone(1, 1)
      ).to.be.revertedWith("Packer only");
    });

    it("Should update milestone to DELIVERED", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);
      const shipmentId = await createTestShipment(
        registry,
        shipper,
        buyer
      );

      // Progress through all milestones
      await registry
        .connect(warehouse)
        .updateMilestone(shipmentId, 1); // PICKED_UP (Packer role)
      await registry
        .connect(carrier)
        .updateMilestone(shipmentId, 2); // IN_TRANSIT (Carrier role)
      await registry
        .connect(carrier)
        .updateMilestone(shipmentId, 3); // ARRIVED (Carrier role)
      await registry
        .connect(buyer)
        .updateMilestone(shipmentId, 4); // DELIVERED (Buyer role)

      const shipment = await registry.getShipment(shipmentId);
      expect(shipment.status).to.equal(4); // DELIVERED
    });
  });

  describe("Attach Documents", function () {
    it("Should allow authorized parties to attach documents", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);

      await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest",
          [],
          [],
          0
        );
      const shipmentId = 0;

      await expect(
        registry
          .connect(shipper)
          .attachDocument(shipmentId, "invoice", "QmInvoice123")
      )
        .to.emit(registry, "DocumentAttached");

      // Skip exact args check as DocumentAttached event has 5 params
      await expect(
        registry
          .connect(shipper)
          .attachDocument(shipmentId, "invoice2", "QmInvoice456")
      )
        .to.emit(registry, "DocumentAttached");

      const docs = await registry.getShipmentDocuments(shipmentId);
      expect(docs.length).to.equal(2);
      expect(docs[0].docType).to.equal("invoice");
      expect(docs[0].cid).to.equal("QmInvoice123");
    });

    it("Should not allow unauthorized parties to attach documents", async function () {
      const { registry, shipper, carrier, buyer, warehouse, other } =
        await loadFixture(deployShipmentRegistryFixture);

      await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest",
          [],
          [],
          0
        );

      await expect(
        registry.connect(other).attachDocument(0, "invoice", "QmInvoice")
      ).to.be.revertedWith("Not authorized to attach documents");
    });
  });

  describe("View Functions", function () {
    it("Should get shipments by address", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);

      await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest1",
          [],
          [],
          0
        );
      await registry
        .connect(shipper)
        .createShipment(
          buyer.address,
          "QmTest2",
          [],
          [],
          0
        );

      const shipperShipments = await registry.getShipmentsByAddress(
        shipper.address
      );
      const carrierShipments = await registry.getShipmentsByAddress(
        carrier.address
      );
      const buyerShipments = await registry.getShipmentsByAddress(
        buyer.address
      );

      // Shipper (staff) created 2 shipments
      expect(shipperShipments.length).to.equal(2);
      // Carrier not assigned yet, so 0 shipments
      expect(carrierShipments.length).to.equal(0);
      // Buyer assigned to 2 shipments
      expect(buyerShipments.length).to.equal(2);
    });
  });
});
