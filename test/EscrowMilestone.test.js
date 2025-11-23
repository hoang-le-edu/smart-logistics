const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("EscrowMilestone", function () {
  async function deployEscrowFixture() {
    const [admin, buyer, carrier, other] = await ethers.getSigners();

    // Deploy LogiToken
    const initialSupply = ethers.parseEther("1000000");
    const LogiToken = await ethers.getContractFactory("LogiToken");
    const logiToken = await LogiToken.deploy(initialSupply);

    // Deploy EscrowMilestone
    const EscrowMilestone = await ethers.getContractFactory("EscrowMilestone");
    const escrow = await EscrowMilestone.deploy(await logiToken.getAddress());

    // Mint tokens to buyer for testing
    const buyerAmount = ethers.parseEther("10000");
    await logiToken.mint(buyer.address, buyerAmount);

    return { escrow, logiToken, admin, buyer, carrier, other, buyerAmount };
  }

  describe("Deployment", function () {
    it("Should set the correct token address", async function () {
      const { escrow, logiToken } = await loadFixture(deployEscrowFixture);
      expect(await escrow.logiToken()).to.equal(await logiToken.getAddress());
    });

    it("Should grant admin role to deployer", async function () {
      const { escrow, admin } = await loadFixture(deployEscrowFixture);
      const DEFAULT_ADMIN_ROLE = await escrow.DEFAULT_ADMIN_ROLE();
      expect(await escrow.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be
        .true;
    });
  });

  describe("UC03: Open Escrow", function () {
    it("Should allow buyer to open escrow", async function () {
      const { escrow, buyer, carrier } = await loadFixture(deployEscrowFixture);
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400 * 30; // 30 days

      await expect(
        escrow
          .connect(buyer)
          .openEscrow(shipmentId, carrier.address, totalAmount, deadline)
      )
        .to.emit(escrow, "EscrowOpened")
        .withArgs(
          shipmentId,
          buyer.address,
          carrier.address,
          totalAmount,
          deadline
        );

      const escrowData = await escrow.getEscrow(shipmentId);
      expect(escrowData.payer).to.equal(buyer.address);
      expect(escrowData.payee).to.equal(carrier.address);
      expect(escrowData.totalAmount).to.equal(totalAmount);
      expect(escrowData.isActive).to.be.true;
    });

    it("Should reject invalid parameters", async function () {
      const { escrow, buyer, carrier } = await loadFixture(deployEscrowFixture);
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await expect(
        escrow
          .connect(buyer)
          .openEscrow(1, ethers.ZeroAddress, totalAmount, deadline)
      ).to.be.revertedWith("Invalid payee address");

      await expect(
        escrow.connect(buyer).openEscrow(1, carrier.address, 0, deadline)
      ).to.be.revertedWith("Total amount must be greater than 0");

      const pastDeadline = (await time.latest()) - 1000;
      await expect(
        escrow
          .connect(buyer)
          .openEscrow(1, carrier.address, totalAmount, pastDeadline)
      ).to.be.revertedWith("Deadline must be in the future");
    });

    it("Should not allow duplicate escrow for same shipment", async function () {
      const { escrow, buyer, carrier } = await loadFixture(deployEscrowFixture);
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);

      await expect(
        escrow
          .connect(buyer)
          .openEscrow(shipmentId, carrier.address, totalAmount, deadline)
      ).to.be.revertedWith("Escrow already exists for this shipment");
    });
  });

  describe("UC04: Deposit & Release Payment", function () {
    it("RB04: Should require token approval before deposit", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);

      // Try deposit without approval - should fail
      await expect(
        escrow.connect(buyer).deposit(shipmentId)
      ).to.be.revertedWith("Token transfer failed - check approval");

      // Approve tokens then deposit
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await expect(escrow.connect(buyer).deposit(shipmentId))
        .to.emit(escrow, "FundsDeposited")
        .withArgs(shipmentId, buyer.address, totalAmount);
    });

    it("RB03: Should release milestone payment only once", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400 * 30;

      // Open escrow and deposit
      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      // Release first milestone (30%)
      const milestone0Amount = ethers.parseEther("300");
      await expect(escrow.release(shipmentId, 0))
        .to.emit(escrow, "FundsReleased")
        .withArgs(shipmentId, 0, carrier.address, milestone0Amount);

      // Try to release same milestone again - should fail
      await expect(escrow.release(shipmentId, 0)).to.be.revertedWith(
        "Milestone already released"
      );
    });

    it("Should release correct amounts based on percentages", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400 * 30;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      const initialCarrierBalance = await logiToken.balanceOf(carrier.address);

      // Release all 4 milestones: 30%, 30%, 20%, 20%
      await escrow.release(shipmentId, 0); // 30%
      await escrow.release(shipmentId, 1); // 30%
      await escrow.release(shipmentId, 2); // 20%
      await escrow.release(shipmentId, 3); // 20%

      const finalCarrierBalance = await logiToken.balanceOf(carrier.address);
      expect(finalCarrierBalance - initialCarrierBalance).to.equal(totalAmount);

      // Check release status
      const releaseStatus = await escrow.getReleaseStatus(shipmentId);
      expect(releaseStatus[0]).to.be.true;
      expect(releaseStatus[1]).to.be.true;
      expect(releaseStatus[2]).to.be.true;
      expect(releaseStatus[3]).to.be.true;
    });

    it("Should not release after deadline", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600; // 1 hour

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      // Fast forward past deadline
      await time.increase(3601);

      await expect(escrow.release(shipmentId, 0)).to.be.revertedWith(
        "Escrow deadline exceeded"
      );
    });
  });

  describe("UC05: Refund", function () {
    it("RB05: Should refund unreleased funds after deadline", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      // Release only first milestone (30%)
      await escrow.release(shipmentId, 0);

      const buyerBalanceBefore = await logiToken.balanceOf(buyer.address);

      // Fast forward past deadline
      await time.increase(3601);

      // Refund should return 70% (700 tokens)
      const refundAmount = ethers.parseEther("700");
      await expect(escrow.connect(buyer).refund(shipmentId))
        .to.emit(escrow, "RefundIssued")
        .withArgs(shipmentId, buyer.address, refundAmount);

      const buyerBalanceAfter = await logiToken.balanceOf(buyer.address);
      expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(refundAmount);

      // Escrow should be marked inactive
      const escrowData = await escrow.escrows(shipmentId);
      expect(escrowData.isActive).to.be.false;
    });

    it("Should not refund before deadline", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      await expect(escrow.connect(buyer).refund(shipmentId)).to.be.revertedWith(
        "Deadline not yet exceeded"
      );
    });

    it("Should not refund if all milestones released", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 3600;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      // Release all milestones
      await escrow.release(shipmentId, 0);
      await escrow.release(shipmentId, 1);
      await escrow.release(shipmentId, 2);
      await escrow.release(shipmentId, 3);

      // Fast forward past deadline
      await time.increase(3601);

      await expect(escrow.connect(buyer).refund(shipmentId)).to.be.revertedWith(
        "No funds to refund"
      );
    });
  });

  describe("View Functions", function () {
    it("Should calculate total released correctly", async function () {
      const { escrow, logiToken, buyer, carrier } = await loadFixture(
        deployEscrowFixture
      );
      const shipmentId = 1;
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await escrow
        .connect(buyer)
        .openEscrow(shipmentId, carrier.address, totalAmount, deadline);
      await logiToken
        .connect(buyer)
        .approve(await escrow.getAddress(), totalAmount);
      await escrow.connect(buyer).deposit(shipmentId);

      expect(await escrow.getTotalReleased(shipmentId)).to.equal(0);

      await escrow.release(shipmentId, 0); // 30%
      expect(await escrow.getTotalReleased(shipmentId)).to.equal(
        ethers.parseEther("300")
      );

      await escrow.release(shipmentId, 1); // 30%
      expect(await escrow.getTotalReleased(shipmentId)).to.equal(
        ethers.parseEther("600")
      );
    });

    it("Should get escrows by payer and payee", async function () {
      const { escrow, buyer, carrier } = await loadFixture(deployEscrowFixture);
      const totalAmount = ethers.parseEther("1000");
      const deadline = (await time.latest()) + 86400;

      await escrow
        .connect(buyer)
        .openEscrow(1, carrier.address, totalAmount, deadline);
      await escrow
        .connect(buyer)
        .openEscrow(2, carrier.address, totalAmount, deadline);

      const payerEscrows = await escrow.getEscrowsByPayer(buyer.address);
      const payeeEscrows = await escrow.getEscrowsByPayee(carrier.address);

      expect(payerEscrows.length).to.equal(2);
      expect(payeeEscrows.length).to.equal(2);
    });
  });
});
