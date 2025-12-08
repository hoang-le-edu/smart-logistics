/*
 Seed data script: creates bulk orders and shipments with diverse states
 - Orders: some without shipments
 - Shipments: CREATED, PICKED_UP, IN_TRANSIT, ARRIVED, FAILED (+ optional DELIVERED)

 Usage examples:
   npx hardhat run scripts/seed-data.js --network localhost
   npx hardhat run scripts/seed-data.js --network sepolia --deliver true --orders 3 --docsDir ./seed-docs

 Env/Args:
   --orders=N            number of standalone orders to create (default 3)
   --deliver=true|false  include one DELIVERED shipment (default false)
   --docsDir=path        folder with fake documents to attach; if PINATA_JWT set,
                         files will be uploaded and real CIDs used; otherwise fake CIDs.

   STAFF_ADDRESS / CARRIER_ADDRESS / BUYER_ADDRESS / PACKER_ADDRESS
     Override default addresses used in setup.js

   STAFF_PK / CARRIER_PK / BUYER_PK / PACKER_PK
     Private keys for role wallets. If absent, script temporarily grants roles
     to the deployer (admin) to perform actions, but still assigns shipment
     participants to the fixed addresses for realistic data.

   PINATA_JWT
     Optional: JWT token for Pinata; when present with --docsDir, files are uploaded.
*/

const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));

function getArgFlag(name, defaultVal) {
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0) {
    const val = process.argv[idx + 1];
    if (val === undefined || val.startsWith("--")) return true;
    if (val === "true") return true;
    if (val === "false") return false;
    const n = Number(val);
    return Number.isNaN(n) ? val : n;
  }
  return defaultVal;
}

function randomCidV0() {
  // Simple placeholder-like CID (not a valid IPFS CID but good for demo links)
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let s = "Qm";
  for (let i = 0; i < 44; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function maybePinFileToPinata(filePath) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) return null;
    const url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
    const fileName = path.basename(filePath);
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), fileName);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text();
      console.warn(`Pinata upload failed for ${fileName}:`, t);
      return null;
    }
    const json = await res.json();
    return json.IpfsHash || json.Hash || null;
  } catch (e) {
    console.warn("Pinata upload error:", e.message);
    return null;
  }
}

async function collectDocCids(docsDir) {
  if (!docsDir) return { pdfs: [], photos: [], jsons: [], all: [] };
  const abs = path.resolve(docsDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.warn(`Docs dir not found: ${abs}`);
    return { pdfs: [], photos: [], jsons: [], all: [] };
  }
  const entries = fs.readdirSync(abs).filter((f) => fs.statSync(path.join(abs, f)).isFile());
  const pdfs = [], photos = [], jsons = [], all = [];
  for (const f of entries) {
    const ext = path.extname(f).toLowerCase();
    const isPdf = ext === ".pdf";
    const isPhoto = ext === ".png" || ext === ".jpg" || ext === ".jpeg";
    const isJson = ext === ".json";
    const fp = path.join(abs, f);
    const uploaded = await maybePinFileToPinata(fp);
    const cid = uploaded || randomCidV0();
    const rec = { name: f, cid, type: isPdf ? "PDF" : isPhoto ? "Photo" : isJson ? "JSON" : "Doc" };
    all.push(rec);
    if (isPdf) pdfs.push(rec);
    else if (isPhoto) photos.push(rec);
    else if (isJson) jsons.push(rec);
  }
  return { pdfs, photos, jsons, all };
}

async function main() {
  const ordersCount = getArgFlag("orders", 3);
  const includeDelivered = !!getArgFlag("deliver", false);
  const docsDir = getArgFlag("docsDir", "D:/VyMinh/smart-logistics/fake-data");

  // Load deployment addresses
  const deploymentFile = path.join(
    __dirname,
    "..",
    "deployments",
    `${hre.network.name}.json`
  );
  if (!fs.existsSync(deploymentFile)) {
    console.error("Deployment file not found. Please deploy first.");
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));
  const { ShipmentRegistry, EscrowMilestone, LogiToken } = deployment.contracts;

  const provider = hre.ethers.provider;
  const [admin] = await hre.ethers.getSigners();

  // Addresses per setup.js with overrides
  const staffAddr = (process.env.STAFF_ADDRESS || "0x5dF270A6f760Cb51d0Fca0ABF2A34FC244AD3CE3").toLowerCase();
  const carrierAddr = (process.env.CARRIER_ADDRESS || "0xA6458d0921A4554ED4db22bf8c3E066F6313Bbc3").toLowerCase();
  const buyerAddr = (process.env.BUYER_ADDRESS || "0xC92bD76EdbFb971bE2354c823D718Ab5583E9122").toLowerCase();
  const packerAddr = (process.env.PACKER_ADDRESS || "0x971F6B9f1c7a61963aaB36e3F3E4ec3522786362").toLowerCase();

  // Wallets (prefer dedicated PKs, else use admin signer)
  const walletFromPk = (pk) => pk && pk.length >= 64 ? new hre.ethers.Wallet(pk, provider) : null;
  const staffW = walletFromPk(process.env.STAFF_PK) || admin;
  const carrierW = walletFromPk(process.env.CARRIER_PK) || admin;
  const buyerW = walletFromPk(process.env.BUYER_PK) || admin;
  const packerW = walletFromPk(process.env.PACKER_PK) || admin;

  const registry = await hre.ethers.getContractAt("ShipmentRegistry", ShipmentRegistry, admin);
  const escrow = await hre.ethers.getContractAt("EscrowMilestone", EscrowMilestone, admin);
  const token = await hre.ethers.getContractAt("LogiToken", LogiToken, admin);

  console.log("Seeding on network:", hre.network.name);
  console.log("Contracts:", { ShipmentRegistry, EscrowMilestone, LogiToken });

  // Ensure roles for acting wallets when using admin fallback
  const ensureRole = async (roleName, addr, grantFn) => {
    const role = await registry[roleName]();
    const has = await registry.hasRole(role, addr);
    if (!has) {
      await (await grantFn(addr)).wait();
      console.log(`✓ Granted ${roleName} to`, addr);
    }
  };

  if (staffW.address.toLowerCase() === admin.address.toLowerCase()) {
    await ensureRole("STAFF_ROLE", admin.address, (a) => registry.grantStaffRole(a));
  }
  if (carrierW.address.toLowerCase() === admin.address.toLowerCase()) {
    await ensureRole("CARRIER_ROLE", admin.address, (a) => registry.grantCarrierRole(a));
  }
  if (buyerW.address.toLowerCase() === admin.address.toLowerCase()) {
    await ensureRole("BUYER_ROLE", admin.address, (a) => registry.grantBuyerRole(a));
  }
  if (packerW.address.toLowerCase() === admin.address.toLowerCase()) {
    await ensureRole("PACKER_ROLE", admin.address, (a) => registry.grantPackerRole(a));
  }

  // Optionally collect document CIDs
  const docCids = await collectDocCids(docsDir);
  const toThreeDocArrays = () => {
    const parts = [];
    if (docCids.pdfs.length > 0) parts.push(docCids.pdfs[0]);
    if (docCids.photos.length > 0) {
      const idx = Math.floor(Math.random() * docCids.photos.length);
      const chosen = docCids.photos[idx];
      const ext = path.extname(chosen.name).toLowerCase();
      const photoName = `shipment-photo-${Math.floor(Math.random() * 100000)}${ext}`;
      parts.push({ ...chosen, name: photoName, type: "Photo" });
    }
    if (docCids.jsons.length > 0) parts.push(docCids.jsons[0]);
    const cids = parts.map((d) => d.cid);
    const types = parts.map((d) => d.type);
    return { cids, types };
  };

  // 1) Create standalone orders (no shipments)
  if (ordersCount > 0) {
    console.log(`\nCreating ${ordersCount} standalone orders (buyer=${buyerW.address})...`);
    const buyReg = registry.connect(buyerW);
    for (let i = 0; i < ordersCount; i++) {
      const data = {
        productName: `Seed Product ${i + 1}`,
        origin: "UIT HCMC",
        destination: i % 2 === 0 ? "Hanoi" : "Da Nang",
        quantity: 10 + i,
        createdAt: new Date().toISOString(),
      };
      const orderCid = JSON.stringify(data); // keep simple; can be replaced with real IPFS CID
      const tx = await buyReg.createOrder(orderCid);
      const rc = await tx.wait();
      console.log(`  - Order ${i + 1} tx:`, rc.hash);
    }
  }

  // Helper for creating shipment
  const createShipment = async ({ buyer, shippingFee, meta, docs }) => {
    const regStaff = registry.connect(staffW);
    const metadataCid = JSON.stringify(meta);
    const { cids, types } = docs || toThreeDocArrays();
    const tx = await regStaff.createShipment(buyer, metadataCid, cids, types, shippingFee);
    const rc = await tx.wait();
    const ev = rc.logs.find((l) => l.fragment && l.fragment.name === "ShipmentCreated");
    const shipmentId = ev ? ev.args.shipmentId.toString() : null;
    return { shipmentId, txHash: rc.hash };
  };

  // Helper transitions
  const accept = async (id) => {
    const regCar = registry.connect(carrierW);
    const tx = await regCar.acceptShipment(id);
    await tx.wait();
  };
  const move = async (w, id, status) => {
    const reg = registry.connect(w);
    const tx = await reg.updateMilestone(id, status);
    await tx.wait();
  };
  const fail = async (id, reason) => {
    const reg = registry.connect(carrierW);
    const tx = await reg.failShipment(id, reason, "Incident Report", randomCidV0());
    await tx.wait();
  };

  console.log("\nCreating shipments in various states...");
  const results = [];

  // A) CREATED (no escrow; shippingFee=0)
  {
    const meta = { description: "Seed CREATED", origin: "UIT", destination: "District 1" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 0, meta });
    results.push({ id: r.shipmentId, state: "CREATED", tx: r.txHash });
    console.log(`  - CREATED:  #${r.shipmentId}  tx:${r.txHash}`);
  }

  // B) PICKED_UP
  {
    const meta = { description: "Seed PICKED_UP", origin: "UIT", destination: "Thu Duc" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 120, meta });
    await accept(r.shipmentId);
    await move(packerW, r.shipmentId, 1); // PICKED_UP
    results.push({ id: r.shipmentId, state: "PICKED_UP", tx: r.txHash });
    console.log(`  - PICKED_UP: #${r.shipmentId}`);
  }

  // C) IN_TRANSIT
  {
    const meta = { description: "Seed IN_TRANSIT", origin: "UIT", destination: "Hanoi" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 150, meta });
    await accept(r.shipmentId);
    await move(packerW, r.shipmentId, 1); // to PICKED_UP
    await move(carrierW, r.shipmentId, 2); // to IN_TRANSIT
    results.push({ id: r.shipmentId, state: "IN_TRANSIT", tx: r.txHash });
    console.log(`  - IN_TRANSIT: #${r.shipmentId}`);
  }

  // D) ARRIVED
  {
    const meta = { description: "Seed ARRIVED", origin: "UIT", destination: "Da Nang" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 180, meta });
    await accept(r.shipmentId);
    await move(packerW, r.shipmentId, 1); // PICKED_UP
    await move(carrierW, r.shipmentId, 2); // IN_TRANSIT
    await move(carrierW, r.shipmentId, 3); // ARRIVED
    results.push({ id: r.shipmentId, state: "ARRIVED", tx: r.txHash });
    console.log(`  - ARRIVED:   #${r.shipmentId}`);
  }

  // E) FAILED (from IN_TRANSIT)
  {
    const meta = { description: "Seed FAILED", origin: "UIT", destination: "Hai Phong" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 200, meta });
    await accept(r.shipmentId);
    await move(packerW, r.shipmentId, 1); // PICKED_UP
    await move(carrierW, r.shipmentId, 2); // IN_TRANSIT
    await fail(r.shipmentId, "Damaged in transit");
    results.push({ id: r.shipmentId, state: "FAILED", tx: r.txHash });
    console.log(`  - FAILED:    #${r.shipmentId}`);
  }

  // F) DELIVERED (optional)
  if (includeDelivered) {
    const meta = { description: "Seed DELIVERED", origin: "UIT", destination: "Hue" };
    const r = await createShipment({ buyer: buyerAddr, shippingFee: 220, meta });
    await accept(r.shipmentId);
    await move(packerW, r.shipmentId, 1);
    await move(carrierW, r.shipmentId, 2);
    await move(carrierW, r.shipmentId, 3);
    await move(buyerW, r.shipmentId, 4);
    results.push({ id: r.shipmentId, state: "DELIVERED", tx: r.txHash });
    console.log(`  - DELIVERED: #${r.shipmentId}`);
  }

  console.log("\nSeed summary: ----------------------------------------------");
  for (const r of results) {
    console.log(`#${r.id}  ${r.state}  (tx: ${r.tx})`);
  }
  console.log("\nNotes:");
  console.log("- Some orders have no shipments (as requested).\n- Shipments use buyer=", buyerAddr, ", staff=", staffAddr, ", carrier=", carrierAddr, ", packer=", packerAddr);
  console.log("- If you want real IPFS CIDs, set PINATA_JWT and provide --docsDir with files.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
