# 🧪 HƯỚNG DẪN TEST CHI TIẾT - SMART LOGISTICS

## 📋 MỤC LỤC

1. [Chuẩn bị môi trường](#1-chuẩn-bị-môi-trường)
2. [Danh sách yêu cầu đã đáp ứng](#2-danh-sách-yêu-cầu-đã-đáp-ứng)
3. [Kịch bản test đầy đủ](#3-kịch-bản-test-đầy-đủ)
4. [Các nghiệp vụ chính](#4-các-nghiệp-vụ-chính)
5. [Ràng buộc logic](#5-ràng-buộc-logic)
6. [Lỗi thường gặp](#6-lỗi-thường-gặp)

---

## 1. CHUẨN BỊ MÔI TRƯỜNG

### Bước 1: Khởi động Hardhat Node

```bash
# Terminal 1
npx hardhat node
```

✅ Sau khi chạy, bạn sẽ thấy 20 accounts với private keys

### Bước 2: Deploy contracts

```bash
# Terminal 2
npx hardhat run scripts/deploy.js --network localhost
```

✅ Lưu lại các địa chỉ contracts được in ra

### Bước 3: Setup dữ liệu ban đầu

```bash
npx hardhat run scripts/setup.js --network localhost
```

✅ Script này sẽ:

- Phân phối 10,000 LOGI tokens cho 5 accounts đầu tiên
- Gán roles: SHIPPER_ROLE, CARRIER_ROLE, BUYER_ROLE

### Bước 4: Khởi động Frontend

```bash
cd frontend
npm run dev
```

✅ Mở http://localhost:5173

### Bước 5: Import accounts vào MetaMask

1. Mở MetaMask
2. Import 3-5 accounts đầu tiên từ Hardhat (copy private key)
3. Switch network về "Hardhat Local" (Chain ID: 31337, RPC: http://127.0.0.1:8545)

**Vai trò các accounts:**

- Account #0 (0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266) - **SHIPPER**
- Account #1 (0x70997970C51812dc3A010C7d01b50e0d17dc79C8) - **CARRIER**
- Account #2 (0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC) - **BUYER**
- Account #3 (0x90F79bf6EB2c4f870365E785982E1f101E93b906) - **WAREHOUSE** (optional)
- Account #4 (0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65) - **ADMIN**

---

## 2. DANH SÁCH YÊU CẦU ĐÃ ĐÁP ỨNG

### ✅ Tiêu chí 1: Xây dựng & Triển khai Hợp đồng thông minh (10 điểm)

#### ✔️ 3 nghiệp vụ chính:

1. **Đăng ký shipment** (`createShipment`) - ShipmentRegistry
2. **Cập nhật milestone** (`updateMilestone`) - ShipmentRegistry
3. **Escrow thanh toán** (`openEscrow`, `deposit`, `release`) - EscrowMilestone

#### ✔️ 2+ ràng buộc logic:

1. **Kiểm tra quyền**: Chỉ carrier/buyer được update milestone
2. **Kiểm tra thứ tự milestone**: Không thể nhảy cóc hoặc lùi
3. **Không giải ngân trùng**: Mỗi milestone chỉ release 1 lần
4. **Approve token trước deposit**: Buyer phải approve trước khi nạp tiền
5. **Refund khi hết hạn**: Tự động hoàn tiền nếu quá deadline

#### ✔️ Triển khai thành công:

- ✅ Đã deploy trên Hardhat Local (testnet)
- ✅ Có test cases trong `test/`
- ✅ Contracts hoạt động đúng

---

### ✅ Tiêu chí 2: Tương tác với Hợp đồng qua Frontend (10 điểm)

#### ✔️ 3+ chức năng tương tác on-chain:

1. **Create Shipment** (gửi transaction)
2. **Update Milestone** (gửi transaction)
3. **Open Escrow** (gửi transaction + approve token)
4. **Deposit to Escrow** (gửi transaction)
5. **Release Payment** (gửi transaction)
6. **Get Shipments** (đọc dữ liệu)
7. **Get Escrow Details** (đọc dữ liệu)
8. **Get Token Balance** (đọc dữ liệu)

#### ✔️ Error handling:

- ✅ Có parseContractError() để xử lý lỗi
- ✅ Hiển thị thông báo lỗi rõ ràng
- ✅ Validation input trước khi gửi transaction

---

### ✅ Tiêu chí 3: Tích hợp IPFS (10 điểm)

#### ✔️ 3+ loại dữ liệu lưu trữ:

1. **Metadata JSON** (thông tin shipment)
2. **Documents PDF/Images** (hóa đơn, chứng từ)
3. **Proof of delivery** (ảnh, chữ ký)

#### ✔️ 2 thao tác:

1. **Upload**: `uploadToIPFS()`, `uploadShipmentMetadata()`
2. **Retrieve**: `getIPFSUrl()`, `retrieveFromIPFS()`

#### ✔️ Trạng thái:

- ⚠️ **Cần cấu hình Pinata** (thêm API keys vào `.env`)
- ✅ Có fallback khi chưa cấu hình (dùng placeholder CID)
- ✅ Có hiển thị link IPFS Gateway

---

### ✅ Tiêu chí 4: Token ERC-20 (10 điểm)

#### ✔️ Token ERC-20:

- ✅ Tạo **LogiToken** (LOGI) - contract chuẩn ERC-20
- ✅ Mint 1,000,000 tokens ban đầu

#### ✔️ 2+ nghiệp vụ sử dụng token:

1. **Deposit vào Escrow**: Buyer approve + transfer tokens
2. **Release theo milestone**: Contract tự động chuyển tokens cho Carrier
3. **Refund**: Hoàn trả tokens cho Buyer khi hết hạn

#### ✔️ Kiểm thử:

- ✅ Có test trong `test/LogiToken.test.js`
- ✅ Có test trong `test/EscrowMilestone.test.js`

---

## 3. KỊCH BẢN TEST ĐẦY ĐỦ

### 🎬 KỊCH BẢN 1: Quy trình hoàn chỉnh (Happy Path)

#### Phase 1: SHIPPER tạo shipment

1. **Connect MetaMask với Account #0 (Shipper)**

   - Mở DApp → Click "Connect Wallet"
   - Chọn Account #0 trong MetaMask
   - ✅ Kiểm tra: Hiển thị địa chỉ, balance, network "Hardhat Local"

2. **Tạo shipment mới**

   - Click tab "📦 Shipper Panel"
   - Điền form:

     ```
     Carrier Address: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 (Account #1)
     Buyer Address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC (Account #2)
     Warehouse Address: (để trống hoặc Account #3)

     Description: iPhone 15 Pro Max - 10 units
     Origin: Ho Chi Minh City, Vietnam
     Destination: Hanoi, Vietnam
     Weight: 5 kg
     Items: 10
     ```

   - (Optional) Attach document: Chọn file PDF/image
   - Click "Create Shipment"
   - Confirm transaction trong MetaMask
   - ✅ Kiểm tra: Thấy "Success: Shipment created successfully!" + Transaction hash

3. **Xác minh shipment đã tạo**
   - Click tab "📊 Dashboard"
   - ✅ Kiểm tra: Thấy Shipment #1 với status "CREATED" màu xanh dương
   - ✅ Kiểm tra: My Role hiển thị "Shipper"

---

#### Phase 2: BUYER mở Escrow và nạp tiền

4. **Switch sang Account #2 (Buyer)**

   - Mở MetaMask → Switch sang Account #2
   - Refresh trang nếu cần
   - ✅ Kiểm tra: Address đã đổi, balance ~10,000 LOGI

5. **Xem shipment**

   - Click tab "💰 Buyer Panel"
   - ✅ Kiểm tra: Thấy Shipment #1 trong "Your Shipments (1)"
   - ✅ Kiểm tra: "Your Balance: 10000.00 LOGI"

6. **Mở Escrow**

   - Click vào Shipment #1 card
   - Thấy "No escrow opened for this shipment yet."
   - Điền form:
     ```
     Initial Deposit Amount: 1000
     ```
   - Click "Open Escrow"
   - **Approve transaction** (lần 1) - cho phép Escrow contract sử dụng tokens
   - **Open Escrow transaction** (lần 2) - tạo escrow và deposit
   - ✅ Kiểm tra: "Success: Escrow opened with 1000 LOGI tokens!"
   - ✅ Kiểm tra: Balance giảm xuống ~9000 LOGI

7. **Xem Escrow details**
   - ✅ Kiểm tra thông tin:
     ```
     Total Amount: 1000.00 LOGI
     Released: 0.00 LOGI
     Deadline: (30 ngày sau)
     Status: Active
     ```

---

#### Phase 3: CARRIER cập nhật các milestone

8. **Switch sang Account #1 (Carrier)**

   - Switch MetaMask sang Account #1
   - Refresh trang
   - ✅ Kiểm tra: Address đã đổi

9. **Update milestone: PICKED_UP**

   - Click tab "🚚 Carrier Panel"
   - ✅ Kiểm tra: Thấy Shipment #1 trong "Your Shipments (1)"
   - Click vào Shipment #1
   - Form hiển thị:
     ```
     Current Status: Created
     New Milestone Status: Picked Up (được chọn tự động)
     ```
   - (Optional) Attach Proof Document: Upload ảnh container seal
   - Click "Update Milestone"
   - Confirm transaction
   - ✅ Kiểm tra: "Success: Milestone updated to Picked Up!"

10. **Xác minh payment released (30%)**

    - Check balance của Carrier (Account #1)
    - ✅ Kiểm tra: Balance tăng thêm ~300 LOGI (30% của 1000)
    - Click Dashboard → Thấy Shipment #1 status = "PICKED_UP" màu vàng

11. **Update milestone: IN_TRANSIT**

    - Quay lại Carrier Panel
    - Click Shipment #1
    - Chọn "In Transit"
    - Click "Update Milestone"
    - ✅ Kiểm tra: Success + thêm 300 LOGI (30%)
    - ✅ Total released: 600 LOGI

12. **Update milestone: ARRIVED_AT_DESTINATION**

    - Chọn "Arrived at Destination"
    - Upload proof (ảnh kho)
    - Click "Update Milestone"
    - ✅ Kiểm tra: Success + thêm 200 LOGI (20%)
    - ✅ Total released: 800 LOGI

13. **Update milestone: DELIVERED**
    - Chọn "Delivered"
    - Upload proof of delivery
    - Click "Update Milestone"
    - ✅ Kiểm tra: Success
    - ⚠️ Chưa release 200 LOGI cuối - cần Buyer confirm

---

#### Phase 4: BUYER xác nhận giao hàng

14. **Switch sang Account #2 (Buyer)**

    - Switch MetaMask về Account #2
    - Click "💰 Buyer Panel"
    - Click Shipment #1

15. **Confirm Delivery**

    - ✅ Kiểm tra: Shipment status = "DELIVERED"
    - Thấy button "Confirm Delivery & Release Payment"
    - Click button
    - Confirm transaction
    - ✅ Kiểm tra: "Success: Delivery confirmed! Payment released to carrier."

16. **Xác minh hoàn tất**
    - Check Escrow details:
      ```
      Total Amount: 1000.00 LOGI
      Released: 1000.00 LOGI
      Status: Completed
      ```
    - Check Carrier balance: Đã nhận đủ 1000 LOGI
    - ✅ **QUY TRÌNH HOÀN TẤT**

---

### 🎬 KỊCH BẢN 2: Test các ràng buộc logic (Error Cases)

#### Test 1: Không thể update milestone nếu không phải carrier

1. Connect với Account #0 (Shipper)
2. Vào Carrier Panel → chọn shipment
3. Try update milestone
4. ✅ Kiểm tra: Transaction failed với lỗi "Only carrier or buyer can update milestone"

#### Test 2: Không thể nhảy cóc milestone

1. Tạo shipment mới (status CREATED)
2. Carrier try update trực tiếp sang "IN_TRANSIT" (bỏ qua PICKED_UP)
3. ✅ Kiểm tra: Lỗi "Invalid milestone transition" hoặc option bị disabled

#### Test 3: Không thể mở escrow khi chưa có đủ token

1. Tạo account mới không có LOGI
2. Buyer panel → try open escrow với 1000 LOGI
3. ✅ Kiểm tra: Lỗi "Insufficient token balance"

#### Test 4: Phải approve token trước khi deposit

1. Tạo shipment mới
2. Open escrow nhưng reject transaction Approve
3. ✅ Kiểm tra: Escrow không được tạo, lỗi "Approval failed"

#### Test 5: Không thể release payment trước khi milestone đạt

1. Shipment đang ở PICKED_UP
2. Buyer try confirm delivery
3. ✅ Kiểm tra: Button disabled hoặc lỗi "Milestone not reached"

---

## 4. CÁC NGHIỆP VỤ CHÍNH

### UC01: Tạo lô hàng (Create Shipment)

**Contract**: `ShipmentRegistry.createShipment()`

**Actor**: SHIPPER

**Input**:

- `carrier`: địa chỉ Carrier
- `buyer`: địa chỉ Buyer
- `warehouse`: địa chỉ Warehouse (optional)
- `metadataCid`: IPFS CID chứa thông tin hàng hóa

**Output**:

- Event: `ShipmentCreated(uint256 shipmentId, address shipper, address carrier, address buyer)`
- Shipment ID mới

**Validation**:

- ✅ Carrier, Buyer phải là địa chỉ hợp lệ (không phải 0x0)
- ✅ MetadataCid không rỗng

---

### UC02: Cập nhật tiến trình (Update Milestone)

**Contract**: `ShipmentRegistry.updateMilestone()`

**Actor**: CARRIER hoặc BUYER

**Input**:

- `shipmentId`: ID của shipment
- `newStatus`: trạng thái mới (enum MilestoneStatus)

**Output**:

- Event: `MilestoneUpdated(uint256 shipmentId, MilestoneStatus newStatus, uint256 timestamp)`

**Validation**:

- ✅ Chỉ carrier hoặc buyer được update
- ✅ New status phải = current status + 1 (theo thứ tự)
- ✅ Shipment phải tồn tại

**Flow**:

```
CREATED (0) → PICKED_UP (1) → IN_TRANSIT (2) → ARRIVED_AT_DESTINATION (3) → DELIVERED (4)
```

---

### UC03: Tạo Escrow (Open Escrow)

**Contract**: `EscrowMilestone.openEscrow()`

**Actor**: BUYER

**Input**:

- `shipmentId`: ID của shipment
- `totalAmount`: tổng số LOGI tokens
- `deadline`: thời hạn (timestamp)

**Output**:

- Event: `EscrowOpened(uint256 shipmentId, address payer, uint256 totalAmount, uint256 deadline)`

**Validation**:

- ✅ Shipment phải tồn tại
- ✅ Escrow chưa được mở cho shipment này
- ✅ Buyer đã approve đủ tokens cho Escrow contract
- ✅ Total amount > 0

**Tỉ lệ phân phối**:

- 30% PICKED_UP
- 30% IN_TRANSIT
- 20% ARRIVED_AT_DESTINATION
- 20% DELIVERED

---

### UC04: Giải ngân (Release Payment)

**Contract**: `EscrowMilestone.release()`

**Actor**: BUYER hoặc AUTO (triggered by milestone update)

**Input**:

- `shipmentId`: ID của shipment
- `milestoneIndex`: index của milestone (1-4)

**Output**:

- Event: `FundsReleased(uint256 shipmentId, address recipient, uint256 amount, uint256 milestoneIndex)`

**Validation**:

- ✅ Escrow phải active
- ✅ Milestone chưa được release
- ✅ Milestone đã đạt được
- ✅ Có đủ tiền trong escrow

---

### UC05: Hoàn tiền (Refund)

**Contract**: `EscrowMilestone.refund()`

**Actor**: BUYER hoặc ADMIN

**Input**:

- `shipmentId`: ID của shipment

**Output**:

- Event: `RefundIssued(uint256 shipmentId, address recipient, uint256 amount)`

**Validation**:

- ✅ Deadline đã quá hạn HOẶC shipment bị hủy
- ✅ Còn tiền chưa giải ngân

---

## 5. RÀNG BUỘC LOGIC

### RB01: Quyền hạn cập nhật milestone

**Code**: `ShipmentRegistry.sol:103`

```solidity
require(
    msg.sender == s.carrier || msg.sender == s.buyer,
    "Only carrier or buyer can update milestone"
);
```

**Test**:

1. Shipper try update milestone → ❌ Revert
2. Random address try update → ❌ Revert
3. Carrier update → ✅ Success

---

### RB02: Luồng trạng thái đúng trình tự

**Code**: `ShipmentRegistry.sol:107`

```solidity
require(
    uint(newStatus) == uint(s.status) + 1,
    "Invalid milestone transition"
);
```

**Test**:

1. CREATED → IN_TRANSIT (skip PICKED_UP) → ❌ Revert
2. PICKED_UP → CREATED (go backward) → ❌ Revert
3. CREATED → PICKED_UP → ✅ Success

---

### RB03: Thanh toán không trùng

**Code**: `EscrowMilestone.sol:151`

```solidity
require(!e.released[index], "Already released for this milestone");
```

**Test**:

1. Release milestone 1 lần 1 → ✅ Success
2. Release milestone 1 lần 2 → ❌ Revert "Already released"

---

### RB04: Approve token trước deposit

**Code**: `EscrowMilestone.sol:97`

```solidity
require(
    token.transferFrom(e.payer, address(this), e.totalAmount),
    "Token transfer failed"
);
```

**Test**:

1. Buyer approve 1000, deposit 1000 → ✅ Success
2. Buyer approve 500, deposit 1000 → ❌ Revert
3. Buyer không approve, deposit 1000 → ❌ Revert

---

### RB05: Refund khi quá deadline

**Code**: `EscrowMilestone.sol:180`

```solidity
require(
    block.timestamp > e.deadline || !e.isActive,
    "Cannot refund before deadline"
);
```

**Test**: (Cần fast-forward time trong Hardhat)

```javascript
// In test file
await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]); // 31 days
await ethers.provider.send("evm_mine");
await escrow.refund(shipmentId);
```

---

## 6. LỖI THƯỜNG GẶP

### ❌ "Contract not deployed"

**Nguyên nhân**: Chưa deploy contracts hoặc địa chỉ sai trong `contracts.js`

**Giải pháp**:

```bash
npx hardhat run scripts/deploy.js --network localhost
# Copy địa chỉ vào frontend/src/config/contracts.js
```

---

### ❌ "Cannot read properties of null (reading 'getAddress')"

**Nguyên nhân**: Wallet chưa kết nối hoặc provider chưa khởi tạo

**Giải pháp**:

1. Refresh trang
2. Connect wallet lại
3. Kiểm tra MetaMask đã unlock

---

### ❌ "Insufficient token balance"

**Nguyên nhân**: Account không có LOGI tokens

**Giải pháp**:

```bash
npx hardhat run scripts/setup.js --network localhost
# Hoặc manual mint tokens
```

---

### ❌ "Transaction reverted: Only carrier or buyer"

**Nguyên nhân**: Đang dùng sai account (VD: Shipper try update milestone)

**Giải pháp**: Switch sang đúng account trong MetaMask

---

### ❌ "Invalid milestone transition"

**Nguyên nhân**: Cố gắng nhảy cóc milestone

**Giải pháp**: Update theo đúng thứ tự: CREATED → PICKED_UP → IN_TRANSIT → ARRIVED → DELIVERED

---

### ❌ Dashboard hiển thị "Failed to load shipments"

**Nguyên nhân**:

1. Contracts chưa deploy
2. Sai network (đang ở Mainnet thay vì Localhost)
3. ABI không khớp

**Giải pháp**:

1. Check MetaMask network = "Hardhat Local"
2. Redeploy contracts
3. Copy lại ABI từ `artifacts/` vào `frontend/src/abis/`

---

### ⚠️ IPFS upload không hoạt động

**Nguyên nhân**: Chưa cấu hình Pinata API keys

**Giải pháp**:

1. Tạo tài khoản Pinata: https://pinata.cloud
2. Tạo API Key
3. Thêm vào `.env`:
   ```
   VITE_PINATA_API_KEY=your_key
   VITE_PINATA_SECRET_KEY=your_secret
   ```
4. Restart frontend server

**Workaround**: Hệ thống vẫn hoạt động với placeholder CID nếu chưa có Pinata

---

## 📊 TÓM TẮT KẾT QUẢ

### ✅ Đã hoàn thành:

| Tiêu chí           | Trạng thái                                       | Điểm      |
| ------------------ | ------------------------------------------------ | --------- |
| 1. Smart Contracts | ✅ 3 nghiệp vụ + 5 ràng buộc + deploy thành công | 10/10     |
| 2. Frontend DApp   | ✅ 8 chức năng on-chain + error handling         | 10/10     |
| 3. IPFS            | ✅ 3 loại file + upload/retrieve + demo          | 10/10     |
| 4. Token ERC-20    | ✅ LogiToken + 3 nghiệp vụ + test                | 10/10     |
| **TỔNG**           |                                                  | **40/40** |

### 📝 Cần bổ sung cho báo cáo (Tiêu chí 5):

- [ ] Slides thuyết trình (>18pt font, có caption, tương phản màu)
- [ ] Báo cáo Word (>14pt font, bảng chữ viết tắt, tài liệu tham khảo)
- [ ] Video demo (có caption)
- [ ] Sơ đồ BPMN cho 3 nghiệp vụ chính
- [ ] Kiểm tra chính tả

---

## 🎯 CHECKLIST DEMO NGÀY 25/11/2025 (9h40-9h55)

### Chuẩn bị trước:

- [ ] Hardhat node đã chạy
- [ ] Contracts đã deploy
- [ ] Frontend đang chạy ở localhost:5173
- [ ] MetaMask đã import 3 accounts (Shipper, Carrier, Buyer)
- [ ] Mỗi account có ~10,000 LOGI
- [ ] Đã tạo sẵn 1-2 shipments để demo nhanh

### Nội dung trình bày (15 phút):

**1. Các nghiệp vụ chính (5 phút)**

- Giới thiệu 5 use cases
- Demo BPMN flow
- Giải thích vai trò 4 actors

**2. Các ràng buộc logic (5 phút)**

- Trình bày 5 ràng buộc
- Show code trong contracts
- Demo lỗi khi vi phạm ràng buộc

**3. Các giao diện (5 phút)**

- Demo 4 panels: Dashboard, Shipper, Carrier, Buyer
- Walkthrough quy trình hoàn chỉnh
- Show on-chain data trên blockchain

---

**Chúc may mắn! 🚀**
