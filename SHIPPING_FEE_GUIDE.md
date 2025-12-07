# Shipping Fee Calculation System

Hệ thống tính phí vận chuyển tự động dựa trên khoảng cách địa lý.

## 🎯 Tính năng

- **Tự động tính phí**: Khi buyer nhập địa chỉ giao hàng, hệ thống tự động tính khoảng cách và phí vận chuyển
- **Geocoding**: Chuyển đổi địa chỉ thành tọa độ GPS sử dụng OpenStreetMap (Nominatim)
- **Smart Contract**: Logic tính toán được lưu trữ và xử lý trên blockchain
- **Transparent**: Buyer xem được khoảng cách và phí trước khi tạo đơn

## 📊 Bảng phí vận chuyển

| Khoảng cách | Phí vận chuyển    |
| ----------- | ----------------- |
| < 2 km      | 0 LOGI (Miễn phí) |
| 2-10 km     | 10 LOGI           |
| 10-100 km   | 50 LOGI           |
| 100-500 km  | 150 LOGI          |
| ≥ 500 km    | 300 LOGI          |

## 🚀 Setup

### 1. Deploy Smart Contract với tính năng mới

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

### 2. Khởi tạo Origin Location và Shipping Tiers

```bash
npx hardhat run scripts/init-shipping-fees.js --network sepolia
```

Script này sẽ:

- Đặt origin location (mặc định: TP.HCM - 10.8231°N, 106.6297°E)
- Khởi tạo 5 tiers phí vận chuyển
- Kiểm tra cấu hình
- Test tính toán phí với địa chỉ mẫu (Hà Nội)

### 3. Cập nhật ABI cho Frontend

Sau khi deploy contract mới, copy ABI:

```bash
# Copy ABI từ artifacts
cp artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json frontend/src/abis/
```

## 💻 Sử dụng trên Frontend

### BuyerPanel - Tạo đơn hàng

1. Buyer nhập thông tin đơn hàng
2. Nhập **địa chỉ giao hàng đầy đủ** (ví dụ: "123 Nguyễn Huệ, Quận 1, TP.HCM")
3. Hệ thống tự động:
   - Chuyển địa chỉ thành tọa độ GPS
   - Tính khoảng cách từ origin
   - Hiển thị phí vận chuyển
4. Buyer xác nhận và tạo đơn

### Ví dụ hiển thị

```
📍 Khoảng cách: 1670 km
💰 Phí vận chuyển: 300 LOGI
Khoảng cách rất xa (≥ 500km)
📌 Hanoi, Vietnam
```

## 🔧 Admin Functions

### Cập nhật Origin Location

```javascript
await registry.setOriginLocation(
  10823100, // latitude * 1e6
  106629700 // longitude * 1e6
);
```

### Cập nhật một Tier cụ thể

```javascript
await registry.updateShippingTier(
  2, // tier index (0-4)
  100, // maxDistance (km)
  60 // new fee (LOGI)
);
```

### Khởi tạo lại tất cả Tiers

```javascript
await registry.initializeShippingTiers();
```

## 📝 Smart Contract Functions

### View Functions

```solidity
// Lấy phí dựa trên tọa độ
function getShippingFee(uint256 deliveryLatitude, uint256 deliveryLongitude)
    external view returns (uint256 distance, uint256 fee)

// Tính phí từ khoảng cách
function calculateShippingFee(uint256 distanceKm)
    public view returns (uint256)

// Lấy tất cả tiers
function getShippingTiers()
    external view returns (ShippingTier[] memory)
```

### Admin Functions

```solidity
// Đặt origin location
function setOriginLocation(uint256 _latitude, uint256 _longitude)
    external onlyRole(DEFAULT_ADMIN_ROLE)

// Khởi tạo shipping tiers mặc định
function initializeShippingTiers()
    external onlyRole(DEFAULT_ADMIN_ROLE)

// Cập nhật tier cụ thể
function updateShippingTier(uint256 index, uint256 maxDistance, uint256 fee)
    external onlyRole(DEFAULT_ADMIN_ROLE)
```

## 🧪 Testing

### Test tính phí từ địa chỉ

```javascript
import { calculateShippingFeeFromAddress } from './utils/shippingFee';

const result = await calculateShippingFeeFromAddress(
  registryContract,
  '123 Nguyễn Huệ, Quận 1, TP.HCM'
);

console.log(result);
// {
//   distance: 5,
//   fee: "10",
//   feeFormatted: "10",
//   coordinates: {
//     latitude: 10.823,
//     longitude: 106.629,
//     displayAddress: "123, Nguyễn Huệ, ..."
//   }
// }
```

## 🌍 Geocoding Service

Sử dụng **Nominatim (OpenStreetMap)**:

- Miễn phí, không cần API key
- Rate limit: 1 request/second
- Hỗ trợ địa chỉ tiếng Việt

### Lưu ý

- Nhập địa chỉ càng chi tiết càng chính xác
- Bao gồm: số nhà, tên đường, quận/huyện, thành phố
- Ví dụ tốt: "123 Lê Lợi, Quận 1, TP.HCM, Vietnam"
- Ví dụ kém: "Sài Gòn"

## 📐 Công thức tính khoảng cách

Sử dụng **Haversine formula** (đơn giản hóa):

```
distance ≈ sqrt(Δlat² + Δlon²) × 111 km/degree
```

Độ chính xác: phù hợp cho khoảng cách < 500km

## 🔒 Security

- Origin location và tiers chỉ được cập nhật bởi admin
- Tọa độ lưu dưới dạng integer (× 1e6) để tránh floating point
- Frontend validation trước khi submit transaction
- Contract validation cho mọi input

## 🐛 Troubleshooting

### "Origin location not set"

Chạy script init:

```bash
npx hardhat run scripts/init-shipping-fees.js --network sepolia
```

### "Address not found"

- Kiểm tra địa chỉ nhập có đúng không
- Thử thêm "Vietnam" vào cuối
- Sử dụng địa chỉ chi tiết hơn

### "Geocoding service unavailable"

- Kiểm tra internet connection
- Nominatim có thể bị rate limit (chờ 1 giây giữa các request)

## 📦 Dependencies

Frontend:

- `ethers` - Blockchain interaction
- Native `fetch` - Geocoding API calls

Smart Contract:

- `@openzeppelin/contracts` - AccessControl, ReentrancyGuard

## 📄 License

MIT
