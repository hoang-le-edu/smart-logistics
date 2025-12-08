# Fake Documents Setup

Prepare a folder of fake documents for shipments and orders. The seeding script can be extended to upload these to IPFS if Pinata is configured.

- Create a folder `fake-data/` at the project root.
- Add sample files:
  - `invoice-*.pdf`
  - `packing-list-*.pdf`
  - `bill-of-lading-*.pdf`
  - `certificate-*.pdf`
- Optionally include JSON metadata like `shipment-meta-*.json` with keys: `origin`, `destination`, `description`, `weight`, `items`.

If you want me to wire automatic IPFS upload:
- Provide Pinata keys in `.env` (`VITE_PINATA_API_KEY`, `VITE_PINATA_SECRET`, `VITE_PINATA_JWT`).
- Tell me which files to attach per shipment state and I’ll update the seeding script to upload and register `addShipmentDocument` for each.
