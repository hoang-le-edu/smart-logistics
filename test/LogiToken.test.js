const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("LogiToken", function () {
  async function deployLogiTokenFixture() {
    const [owner, minter, user1, user2] = await ethers.getSigners();

    const initialSupply = ethers.parseEther("1000000"); // 1M tokens
    const LogiToken = await ethers.getContractFactory("LogiToken");
    const logiToken = await LogiToken.deploy(initialSupply);

    return { logiToken, owner, minter, user1, user2, initialSupply };
  }

  describe("Deployment", function () {
    it("Should set the right token name and symbol", async function () {
      const { logiToken } = await loadFixture(deployLogiTokenFixture);
      expect(await logiToken.name()).to.equal("Logistics Token");
      expect(await logiToken.symbol()).to.equal("LOGI");
    });

    it("Should mint initial supply to deployer", async function () {
      const { logiToken, owner, initialSupply } = await loadFixture(
        deployLogiTokenFixture
      );
      // Contract multiplies initialSupply by 10^decimals
      const expectedSupply = initialSupply * BigInt(10 ** 18);
      expect(await logiToken.balanceOf(owner.address)).to.equal(expectedSupply);
    });

    it("Should grant admin and minter roles to deployer", async function () {
      const { logiToken, owner } = await loadFixture(deployLogiTokenFixture);
      const DEFAULT_ADMIN_ROLE = await logiToken.DEFAULT_ADMIN_ROLE();
      const MINTER_ROLE = await logiToken.MINTER_ROLE();

      expect(await logiToken.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be
        .true;
      expect(await logiToken.hasRole(MINTER_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should allow minter to mint tokens", async function () {
      const { logiToken, user1 } = await loadFixture(deployLogiTokenFixture);
      const mintAmount = ethers.parseEther("1000");

      await expect(logiToken.mint(user1.address, mintAmount))
        .to.emit(logiToken, "TokensMinted")
        .withArgs(user1.address, mintAmount);

      expect(await logiToken.balanceOf(user1.address)).to.equal(mintAmount);
    });

    it("Should not allow non-minter to mint tokens", async function () {
      const { logiToken, user1, user2 } = await loadFixture(
        deployLogiTokenFixture
      );
      const mintAmount = ethers.parseEther("1000");

      await expect(logiToken.connect(user1).mint(user2.address, mintAmount)).to
        .be.reverted;
    });

    it("Should not allow minting to zero address", async function () {
      const { logiToken } = await loadFixture(deployLogiTokenFixture);
      const mintAmount = ethers.parseEther("1000");

      await expect(
        logiToken.mint(ethers.ZeroAddress, mintAmount)
      ).to.be.revertedWith("Cannot mint to zero address");
    });
  });

  describe("Burning", function () {
    it("Should allow users to burn their own tokens", async function () {
      const { logiToken, owner } = await loadFixture(deployLogiTokenFixture);
      const burnAmount = ethers.parseEther("1000");
      const initialBalance = await logiToken.balanceOf(owner.address);

      await expect(logiToken.burn(burnAmount))
        .to.emit(logiToken, "TokensBurned")
        .withArgs(owner.address, burnAmount);

      expect(await logiToken.balanceOf(owner.address)).to.equal(
        initialBalance - burnAmount
      );
    });

    it("Should not allow burning more than balance", async function () {
      const { logiToken, user1 } = await loadFixture(deployLogiTokenFixture);
      const burnAmount = ethers.parseEther("1000");

      // ERC20 _burn reverts with custom error, not a string message
      await expect(
        logiToken.connect(user1).burn(burnAmount)
      ).to.be.reverted;
    });
  });

  describe("Role Management", function () {
    it("Should allow admin to grant minter role", async function () {
      const { logiToken, owner, minter } = await loadFixture(
        deployLogiTokenFixture
      );
      const MINTER_ROLE = await logiToken.MINTER_ROLE();

      await logiToken.grantMinterRole(minter.address);
      expect(await logiToken.hasRole(MINTER_ROLE, minter.address)).to.be.true;

      // Minter should now be able to mint
      const mintAmount = ethers.parseEther("500");
      await expect(
        logiToken.connect(minter).mint(owner.address, mintAmount)
      ).to.emit(logiToken, "TokensMinted");
    });

    it("Should allow admin to revoke minter role", async function () {
      const { logiToken, minter } = await loadFixture(deployLogiTokenFixture);
      const MINTER_ROLE = await logiToken.MINTER_ROLE();

      await logiToken.grantMinterRole(minter.address);
      await logiToken.revokeMinterRole(minter.address);

      expect(await logiToken.hasRole(MINTER_ROLE, minter.address)).to.be.false;
    });
  });
});
