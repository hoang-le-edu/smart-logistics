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

    // Grant roles
    const SHIPPER_ROLE = await registry.SHIPPER_ROLE();
    const CARRIER_ROLE = await registry.CARRIER_ROLE();
    const BUYER_ROLE = await registry.BUYER_ROLE();
    const WAREHOUSE_ROLE = await registry.WAREHOUSE_ROLE();

    await registry.grantShipperRole(shipper.address);
    await registry.grantCarrierRole(carrier.address);
    await registry.grantBuyerRole(buyer.address);
    await registry.grantWarehouseRole(warehouse.address);

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
            carrier.address,
            buyer.address,
            warehouse.address,
            metadataCid
          )
      )
        .to.emit(registry, "ShipmentCreated")
        .withArgs(
          1,
          shipper.address,
          carrier.address,
          buyer.address,
          metadataCid
        );

      const shipment = await registry.getShipment(1);
      expect(shipment.shipper).to.equal(shipper.address);
      expect(shipment.carrier).to.equal(carrier.address);
      expect(shipment.buyer).to.equal(buyer.address);
      expect(shipment.metadataCid).to.equal(metadataCid);
      expect(shipment.status).to.equal(0); // CREATED
      expect(shipment.exists).to.be.true;
    });

    it("Should not allow non-shipper to create shipment", async function () {
      const { registry, carrier, buyer, warehouse, other } = await loadFixture(
        deployShipmentRegistryFixture
      );

      await expect(
        registry
          .connect(other)
          .createShipment(
            carrier.address,
            buyer.address,
            warehouse.address,
            "QmTest"
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
            buyer.address,
            ethers.ZeroAddress,
            "QmTest"
          )
      ).to.be.revertedWith("Invalid carrier address");

      await expect(
        registry
          .connect(shipper)
          .createShipment(
            buyer.address,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            "QmTest"
          )
      ).to.be.revertedWith("Invalid buyer address");
    });
  });

  describe("UC02: Update Milestone", function () {
    async function createTestShipment(
      registry,
      shipper,
      carrier,
      buyer,
      warehouse
    ) {
      const tx = await registry
        .connect(shipper)
        .createShipment(
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest"
        );
      await tx.wait();
      return 1; // shipmentId
    }

    it("RB02: Should follow sequential milestone order", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);
      const shipmentId = await createTestShipment(
        registry,
        shipper,
        carrier,
        buyer,
        warehouse
      );

      // Cannot skip from CREATED (0) to IN_TRANSIT (2)
      await expect(
        registry.connect(carrier).updateMilestone(shipmentId, 2, "QmProof")
      ).to.be.revertedWith("Milestone must follow sequential order");

      // Must go CREATED (0) -> PICKED_UP (1)
      await expect(
        registry
          .connect(carrier)
          .updateMilestone(shipmentId, 1, "QmPickupProof")
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

      // Carrier can update
      await expect(
        registry.connect(carrier).updateMilestone(shipmentId, 1, "QmProof")
      ).to.not.be.reverted;

      // Create another shipment for testing unauthorized update
      await registry
        .connect(shipper)
        .createShipment(
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest2"
        );

      // Other users cannot update
      await expect(
        registry.connect(other).updateMilestone(2, 1, "QmProof")
      ).to.be.revertedWith("Only carrier can update this milestone");
    });

    it("Should update milestone to DELIVERED", async function () {
      const { registry, shipper, carrier, buyer, warehouse } =
        await loadFixture(deployShipmentRegistryFixture);
      const shipmentId = await createTestShipment(
        registry,
        shipper,
        carrier,
        buyer,
        warehouse
      );

      // Progress through all milestones
      await registry
        .connect(carrier)
        .updateMilestone(shipmentId, 1, "QmPickup"); // PICKED_UP
      await registry
        .connect(carrier)
        .updateMilestone(shipmentId, 2, "QmTransit"); // IN_TRANSIT
      await registry
        .connect(carrier)
        .updateMilestone(shipmentId, 3, "QmArrival"); // ARRIVED
      await registry
        .connect(buyer)
        .updateMilestone(shipmentId, 4, "QmDelivery"); // DELIVERED

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
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest"
        );
      const shipmentId = 1;

      await expect(
        registry
          .connect(shipper)
          .attachDocument(shipmentId, "invoice", "QmInvoice123")
      )
        .to.emit(registry, "DocumentAttached")
        .withArgs(shipmentId, "invoice", "QmInvoice123", shipper.address);

      const docs = await registry.getShipmentDocuments(shipmentId);
      expect(docs.length).to.equal(1);
      expect(docs[0].docType).to.equal("invoice");
      expect(docs[0].cid).to.equal("QmInvoice123");
    });

    it("Should not allow unauthorized parties to attach documents", async function () {
      const { registry, shipper, carrier, buyer, warehouse, other } =
        await loadFixture(deployShipmentRegistryFixture);

      await registry
        .connect(shipper)
        .createShipment(
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest"
        );

      await expect(
        registry.connect(other).attachDocument(1, "invoice", "QmInvoice")
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
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest1"
        );
      await registry
        .connect(shipper)
        .createShipment(
          carrier.address,
          buyer.address,
          warehouse.address,
          "QmTest2"
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

      expect(shipperShipments.length).to.equal(2);
      expect(carrierShipments.length).to.equal(2);
      expect(buyerShipments.length).to.equal(2);
    });
  });
});
