# 🚀 Smart Logistics - Setup Guide for Team

Hướng dẫn setup project blockchain logistics cho team members.

---

## 📋 Yêu Cầu Hệ Thống

- **Node.js:** v20.18.0 hoặc cao hơn
- **npm:** v10.x trở lên
- **MetaMask:** Browser extension
- **Git:** Để clone project

---

## 🔧 Bước 1: Clone Project

```bash
git clone <repository-url>
cd smart-logistics
```

---

## 📦 Bước 2: Install Dependencies

### Backend (Smart Contracts):

```bash
npm install
```

### Frontend (React DApp):

```bash
cd frontend
npm install
cd ..
```

---

## ⚙️ Bước 3: Cấu Hình Environment

### Tạo file `.env` trong thư mục root:

```bash
# Copy từ file mẫu
cp .env.example .env
```

### Nội dung file `.env`:

```env
# Hardhat Local Network (để trống hoặc dùng private key test)
PRIVATE_KEY=

# Sepolia Testnet (optional - khi deploy lên testnet)
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
ETHERSCAN_API_KEY=your_etherscan_api_key

# Pinata IPFS (optional - nếu cần upload files)
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
```

**LƯU Ý:** File `.env` đã được thêm vào `.gitignore` - KHÔNG commit lên Git!

---

## 🚀 Bước 4: Start Hardhat Node

**Mở terminal mới** và chạy:

```bash
npx hardhat node
```

**QUAN TRỌNG:**

- Giữ terminal này chạy suốt quá trình development
- Hardhat sẽ tạo 20 test accounts với mỗi account có 10,000 ETH
- Server chạy tại: `http://127.0.0.1:8545`
- Chain ID: `31337`

**Copy 3 addresses này** (sẽ dùng ở bước sau):

```
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (Admin/Deployer)
Account #1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Shipper)
Account #2: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Carrier)
Account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906 (Buyer)
```

---

## 📝 Bước 5: Deploy Smart Contracts

**Mở terminal mới** (Hardhat node vẫn chạy ở terminal cũ):

```bash
# Deploy 3 contracts: LogiToken, ShipmentRegistry, EscrowMilestone
npx hardhat run scripts/deploy.js --network localhost
```

**Kết quả:**

```
✓ LogiToken deployed to: 0x...
✓ ShipmentRegistry deployed to: 0x...
✓ EscrowMilestone deployed to: 0x...
✓ Deployment info saved to: deployments/localhost.json
✓ ABIs saved to: frontend/src/abis
```

---

## 🎭 Bước 6: Setup Roles & Mint Tokens

```bash
# Grant roles và mint LOGI tokens cho test accounts
npx hardhat run scripts/setup.js --network localhost
```

**Kết quả:**

```
✓ Granted SHIPPER_ROLE to: 0x7099...
✓ Granted CARRIER_ROLE to: 0x3C44...
✓ Granted BUYER_ROLE to: 0x90F7...
✓ Minted 10000.0 LOGI to buyer
✓ Minted 5000.0 LOGI to carrier
```

---

## 🦊 Bước 7: Setup MetaMask

### 7.1. Cài đặt MetaMask Extension

1. Truy cập: https://metamask.io/download/
2. Install extension cho Chrome/Brave/Edge
3. Tạo ví mới hoặc import existing wallet

---

### 7.2. Thêm Hardhat Local Network

1. **Mở MetaMask** → Click dropdown network (góc trên trái)
2. **Click "Add network"** → **"Add a network manually"**
3. **Điền thông tin:**

```
Network name:     Hardhat Local
RPC URL:          http://127.0.0.1:8545
Chain ID:         31337
Currency symbol:  ETH
```

4. **Click "Save"** → **"Switch to Hardhat Local"**

---

### 7.3. Import Test Accounts

**⚠️ CẢNH BÁO:**

```
Các private keys này là PUBLIC và được biết bởi tất cả mọi người!
TUYỆT ĐỐI KHÔNG gửi tiền thật vào các accounts này!
CHỈ DÙNG CHO LOCAL TESTING!
```

**Import 3 accounts sau:**

#### 🚢 Account 1: SHIPPER

```
Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

- Click icon tròn (góc phải MetaMask) → "Import account"
- Paste private key → "Import"
- Đổi tên thành: **"Shipper"**

#### 🚚 Account 2: CARRIER

```
Private Key: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
```

- Import tương tự
- Đổi tên thành: **"Carrier"**
- Balance: 10,000 ETH + 5,000 LOGI tokens

#### 💰 Account 3: BUYER

```
Private Key: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

- Import tương tự
- Đổi tên thành: **"Buyer"**
- Balance: 10,000 ETH + 10,000 LOGI tokens

---

### 7.4. Import LOGI Token

1. **Switch sang account "Buyer"** hoặc "Carrier"
2. **Scroll xuống** trong MetaMask
3. **Click "Import tokens"**
4. **Paste địa chỉ contract** (lấy từ `deployments/localhost.json`):
   ```
   Token Address: <LogiToken address từ deployment>
   Symbol: LOGI
   Decimals: 18
   ```
5. **Click "Import"**

**Kiểm tra:**

- Buyer: 10,000 LOGI
- Carrier: 5,000 LOGI

---

## 🎨 Bước 8: Start Frontend

**Mở terminal mới:**

```bash
cd frontend
npm run dev
```

**Frontend chạy tại:** http://localhost:5173

**Nếu có warning về Node version** - có thể bỏ qua, frontend vẫn chạy bình thường.

---

## 🌐 Bước 9: Connect Wallet & Test

1. **Mở browser:** http://localhost:5173
2. **Click "Connect Wallet"**
3. **MetaMask popup:**
   - Chọn account "Shipper"
   - Click "Next" → "Connect"
4. **Kiểm tra kết nối:**
   - ✅ Network: Hardhat Local
   - ✅ Balance: 10000.0000 ETH

---

## 🧪 Bước 10: Test Workflow

### Test 1: Create Shipment (Shipper)

1. **Switch MetaMask** sang account **"Shipper"**
2. **Refresh browser** (F5)
3. **Click tab "Shipper Panel"**
4. **Điền form:**
   ```
   Carrier Address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
   Buyer Address:   0x90F79bf6EB2c4f870365E785982E1f101E93b906
   Description:     Hàng điện tử từ HCM đến Hà Nội
   Origin:          Ho Chi Minh City
   Destination:     Hanoi
   Weight (kg):     100
   ```
5. **Click "Create Shipment"**
6. **MetaMask popup** → **"Confirm"**
7. **Đợi transaction confirm** (~1-2 giây)

✅ **Shipment đã tạo thành công!**

---

### Test 2: Open Escrow (Buyer)

1. **Switch MetaMask** sang **"Buyer"**
2. **Refresh browser**
3. **Click tab "Buyer Panel"**
4. **Chọn shipment vừa tạo**
5. **Open Escrow:**
   ```
   Amount: 1000 LOGI
   Deadline: 7 days from now
   ```
6. **Transaction 1:** Approve LOGI → **"Confirm"**
7. **Transaction 2:** Deposit into escrow → **"Confirm"**

✅ **Escrow đã mở! 1,000 LOGI locked trong contract**

---

### Test 3: Update Milestone (Carrier)

1. **Switch MetaMask** sang **"Carrier"**
2. **Refresh browser**
3. **Click tab "Carrier Panel"**
4. **Chọn shipment**
5. **Update milestone:** "Created" → **"Picked Up"**
6. **Upload proof document** (optional)
7. **Click "Update Milestone"** → **"Confirm"**

✅ **Milestone updated! Carrier nhận 300 LOGI (30%)**

**Tiếp tục test các milestones:**

- In Transit → +300 LOGI (30%)
- Arrived → +200 LOGI (20%)
- Delivered → +200 LOGI (20%)

---

## 📊 Kiểm Tra Contract Status

```bash
npx hardhat run scripts/check-status.js --network localhost
```

Hiển thị:

- Contract addresses
- Token balances
- Roles granted
- Shipments created

---

## 🧹 Reset & Restart

Nếu cần reset toàn bộ và bắt đầu lại:

### 1. Stop tất cả processes:

- `Ctrl + C` trong terminal Hardhat node
- `Ctrl + C` trong terminal frontend

### 2. Clear MetaMask cache:

- MetaMask → Settings → Advanced
- "Clear activity tab data"
- "Reset account"

### 3. Restart từ đầu:

```bash
# Terminal 1: Start Hardhat node
npx hardhat node

# Terminal 2: Deploy & Setup
npx hardhat run scripts/deploy.js --network localhost
npx hardhat run scripts/setup.js --network localhost

# Terminal 3: Start frontend
cd frontend
npm run dev
```

### 4. Refresh browser: `Ctrl + Shift + R`

---

## 🐛 Troubleshooting

### Lỗi: "Cannot connect to network"

**Nguyên nhân:** Hardhat node chưa chạy hoặc đã tắt

**Giải pháp:**

```bash
# Check xem node có chạy không
curl http://127.0.0.1:8545 -Method POST -Body '{"jsonrpc":"2.0","method":"net_version","params":[],"id":1}' -ContentType "application/json"

# Nếu không có response → Restart node
npx hardhat node
```

---

### Lỗi: "Nonce too high"

**Nguyên nhân:** MetaMask cache bị lỗi

**Giải pháp:**

- MetaMask → Settings → Advanced
- "Reset account"
- Refresh browser

---

### Lỗi: "Insufficient funds"

**Nguyên nhân:**

- Account không có đủ ETH hoặc LOGI tokens
- Contracts chưa được deploy
- Roles chưa được grant

**Giải pháp:**

```bash
# Re-run setup script
npx hardhat run scripts/setup.js --network localhost

# Check balances
npx hardhat run scripts/check-status.js --network localhost
```

---

### DApp hiển thị "Please connect your wallet"

**Giải pháp:**

1. Check MetaMask đã chọn đúng network "Hardhat Local" chưa
2. Click "Disconnect" → Refresh browser → "Connect Wallet" lại
3. Clear browser cache: `Ctrl + Shift + R`

---

### Frontend không load được contracts

**Giải pháp:**

1. Check file `deployments/localhost.json` có tồn tại không
2. Check folder `frontend/src/abis/` có 3 files JSON không
3. Restart frontend server

---

## 📁 Cấu Trúc Project

```
smart-logistics/
├── contracts/              # Smart contracts (Solidity)
│   ├── LogiToken.sol       # ERC-20 payment token
│   ├── ShipmentRegistry.sol # Shipment tracking
│   └── EscrowMilestone.sol # Automated payments
├── scripts/                # Deployment & setup scripts
│   ├── deploy.js           # Deploy contracts
│   ├── setup.js            # Grant roles & mint tokens
│   └── check-status.js     # Verify deployment
├── test/                   # Contract tests (Mocha/Chai)
├── deployments/            # Deployed contract addresses
│   └── localhost.json      # Local deployment info
├── frontend/               # React DApp
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Dashboard, Panels
│   │   ├── utils/          # IPFS, contracts helpers
│   │   ├── abis/           # Contract ABIs (auto-generated)
│   │   └── config.js       # Network & addresses config
│   └── package.json
├── hardhat.config.js       # Hardhat configuration
├── package.json            # Backend dependencies
├── .env.example            # Environment variables template
└── README.md               # Project overview
```

---

## 🚀 Deploy Lên Sepolia Testnet (Optional)

### 1. Lấy Sepolia ETH từ faucet:

- https://sepoliafaucet.com/
- https://www.infura.io/faucet/sepolia

### 2. Cấu hình `.env`:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=your_real_private_key_64_characters
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 3. Deploy:

```bash
npx hardhat run scripts/deploy.js --network sepolia
npx hardhat run scripts/setup.js --network sepolia
```

### 4. Update frontend config:

Sửa file `frontend/src/config.js`:

```javascript
export const DEFAULT_NETWORK = "sepolia"; // Đổi từ "localhost"
```

### 5. Thêm Sepolia network vào MetaMask:

- Network name: Sepolia Testnet
- RPC URL: https://sepolia.infura.io/v3/YOUR_KEY
- Chain ID: 11155111

---

## 📚 Tài Liệu Tham Khảo

- **Hardhat:** https://hardhat.org/docs
- **OpenZeppelin:** https://docs.openzeppelin.com/
- **Ethers.js v6:** https://docs.ethers.org/v6/
- **React:** https://react.dev/
- **MetaMask:** https://docs.metamask.io/

---

## 🤝 Team Workflow

### Phân công roles để test:

- **Member 1:** Shipper - tạo shipments, upload documents
- **Member 2:** Carrier - cập nhật milestones, upload proof
- **Member 3:** Buyer - mở escrow, deposit tokens, theo dõi payments
- **Member 4:** Admin - deploy contracts, grant roles, monitor system

### Git workflow:

```bash
# Pull latest code
git pull origin main

# Create feature branch
git checkout -b feature/your-feature

# After making changes
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature

# Create Pull Request on GitHub
```

---

## 📞 Support

Nếu gặp vấn đề, check:

1. **Hardhat node có đang chạy không?**
2. **MetaMask đã chọn đúng network Hardhat Local chưa?**
3. **Contracts đã được deploy chưa?** (check `deployments/localhost.json`)
4. **Frontend server có đang chạy không?** (http://localhost:5173)

---

**🎉 CHÚC BẠN VÀ TEAM SETUP THÀNH CÔNG!**

Built with ❤️ using Solidity, Hardhat, React, and IPFS
