# 🚀 Smart Logistics - Blockchain Supply Chain Management

A comprehensive blockchain-based logistics management system featuring smart contracts, automated escrow payments, IPFS document storage, and a React frontend.

## 📋 Project Overview

**Presentation Date**: November 25, 2025, 9:40 AM  
**Course**: Blockchain Technology (Semester 7)  
**Institution**: University

This project implements a complete supply chain management solution using Ethereum smart contracts, enabling transparent and automated logistics tracking from shipment creation to final delivery with milestone-based payments.

## ✨ Key Features

### Smart Contracts

- **LogiToken (ERC-20)**: Payment token with minting and burning capabilities
- **ShipmentRegistry**: Track shipments through 5 milestone states
- **EscrowMilestone**: Automated milestone-based payments (30/30/20/20% distribution)

### Frontend Application

- **MetaMask Integration**: Seamless wallet connection
- **Role-Based Dashboard**: Shipper, Carrier, and Buyer panels
- **IPFS Document Storage**: Decentralized file storage via Pinata
- **Multi-Network Support**: Hardhat Local and Sepolia testnet

### Security Features

- ✅ Role-Based Access Control (RBAC)
- ✅ ReentrancyGuard protection
- ✅ SafeERC20 for secure token transfers
- ✅ Event emission for complete audit trail
- ✅ No hardcoded private keys

## 🎯 Use Cases Implemented

1. **Shipment Creation**: Shipper creates shipment with IPFS metadata
2. **Milestone Updates**: Carrier updates shipment status with proof documents
3. **Escrow Management**: Buyer opens escrow and deposits tokens
4. **Automated Payments**: Payments released automatically at each milestone
5. **Warehouse Validation**: Optional warehouse integration

## 🛠️ Technology Stack

### Backend

- Solidity 0.8.20
- Hardhat 2.27.0
- OpenZeppelin Contracts 5.2.0
- Ethers.js 6.x

### Frontend

- React 18.3.1
- Vite 7.2.4
- Ethers.js 6.13.5
- CSS3 with modern styling

### Infrastructure

- IPFS (Pinata Cloud)
- Ethereum (Hardhat Local / Sepolia)
- Node.js 20.18.0+

## 📦 Installation

### Prerequisites

- Node.js v20.18.0 or higher
- MetaMask browser extension
- Git

### Step 1: Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd smart-logistics

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Step 2: Configure Environment Variables

```bash
# Copy example files
cp .env.example .env
cp frontend/.env.example frontend/.env

# Edit .env files with your configuration (optional for local testing)
```

## 🚀 Quick Start

### 1. Start Hardhat Local Network

```bash
# Terminal 1: Start local blockchain
npx hardhat node
```

This starts a local Ethereum network with 20 test accounts, each having 10,000 ETH.

### 2. Deploy Smart Contracts

```bash
# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.js --network localhost

# Setup roles and mint test tokens
npx hardhat run scripts/setup.js --network localhost
```

### 3. Start Frontend Application

```bash
# Terminal 3: Start React app
cd frontend
npm run dev
```

The application will be available at `http://localhost:5173`

### 4. Configure MetaMask

1. Add Hardhat Network:

   - Network Name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency: `ETH`

2. Import test account from Hardhat output

3. Connect wallet in the application

## 🧪 Testing

Run the comprehensive test suite (34 test cases):

```bash
# Run all tests
npx hardhat test

# Run specific test file
npx hardhat test test/LogiToken.test.js

# Run with gas reporting
REPORT_GAS=true npx hardhat test
```

## 📝 Smart Contract Details

### LogiToken.sol

- **Type**: ERC-20 Token
- **Symbol**: LOGI
- **Decimals**: 18
- **Initial Supply**: 1,000,000 LOGI
- **Features**: Minting, Burning, Role-based access

### ShipmentRegistry.sol

- **Milestones**: CREATED → PICKED_UP → IN_TRANSIT → ARRIVED → DELIVERED
- **Roles**: SHIPPER, CARRIER, BUYER
- **Features**: Sequential milestone updates, IPFS metadata, document attachment

### EscrowMilestone.sol

- **Payment Distribution**:
  - 30% at PICKED_UP
  - 30% at IN_TRANSIT
  - 20% at ARRIVED
  - 20% at DELIVERED
- **Features**: Deadline enforcement, refund mechanism, role-based access

## 🎨 Frontend Components

- **ConnectWallet**: MetaMask integration and network switching
- **Dashboard**: View all shipments with role-based filtering
- **ShipperPanel**: Create new shipments with metadata
- **CarrierPanel**: Update milestones and attach proof documents
- **BuyerPanel**: Manage escrow and release payments

## 📁 Project Structure

```
smart-logistics/
├── contracts/              # Smart contracts
│   ├── LogiToken.sol
│   ├── ShipmentRegistry.sol
│   └── EscrowMilestone.sol
├── test/                   # Test files (34 tests)
│   ├── LogiToken.test.js
│   ├── ShipmentRegistry.test.js
│   └── EscrowMilestone.test.js
├── scripts/                # Deployment scripts
│   ├── deploy.js
│   ├── setup.js
│   └── check-status.js
├── frontend/               # React application
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── utils/
│   │   └── config/
│   └── package.json
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

## 🔐 Security Considerations

- All sensitive data stored in `.env` files (never committed)
- Role-based access control for all critical functions
- ReentrancyGuard on state-changing functions
- SafeERC20 for secure token transfers
- Input validation on all public functions
- Event emission for audit trail

## 🌐 Deployment to Sepolia

1. Get Sepolia ETH from [Sepolia Faucet](https://sepoliafaucet.com/)
2. Configure `.env` with your Sepolia RPC URL and private key
3. Deploy:
   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   npx hardhat run scripts/setup.js --network sepolia
   ```
4. Update contract addresses in `frontend/.env`

## 📊 Project Metrics

- **Smart Contracts**: 3 contracts, 485 lines of code
- **Test Coverage**: 34 test cases, 100% of main functions
- **Frontend Components**: 7 components, ~2,500 lines of code
- **Documentation**: 5 comprehensive files

## 🐛 Troubleshooting

### "Cannot connect to Hardhat network"

- Ensure `npx hardhat node` is running
- Check RPC URL is `http://127.0.0.1:8545`

### "Transaction failed"

- Check you have the correct role for the operation
- Ensure sufficient ETH for gas fees
- Verify correct network in MetaMask

### "IPFS upload failed"

- Pinata configuration is optional for local testing
- Get API keys from [Pinata Cloud](https://www.pinata.cloud/)

## 📚 Documentation

- [QUICKSTART.md](./QUICKSTART.md) - Detailed setup guide
- [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) - Technical architecture
- [PROJECT_STATUS.md](./PROJECT_STATUS.md) - Current project status
- [frontend/README.md](./frontend/README.md) - Frontend documentation

## 🤝 Contributing

This is a university project. For questions or suggestions, please contact the development team.

## 📄 License

MIT License - see LICENSE file for details

## 🎓 Academic Context

This project fulfills the requirements for the Blockchain Technology course:

- ✅ 5 use cases implemented
- ✅ 5 logic constraints enforced
- ✅ IPFS integration with 3+ data types
- ✅ No hardcoded secrets
- ✅ Comprehensive testing
- ✅ Working demo with frontend

## 📞 Support

For detailed instructions, see:

- Quick Start: `QUICKSTART.md`
- Technical Details: `IMPLEMENTATION_SUMMARY.md`
- Frontend Guide: `frontend/README.md`

---

**Built with ❤️ for Blockchain Course - November 2025**
