import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ShipmentRegistryABI, EscrowMilestoneABI, LogiTokenABI } from '../abis';
import {
  getContract,
  handleTransaction,
  parseContractError,
  getMilestoneStatusName,
  formatTokenAmount,
} from '../utils/contracts';
import { uploadJSONToIPFS, isPinataConfigured } from '../utils/ipfs';
import {
  calculateShippingFeeFromAddress,
  getShippingTierDescription,
} from '../utils/shippingFee';
import ShipmentDetailModal from '../components/ShipmentDetailModal';

export default function BuyerPanel({ account, chainId }) {
  const [shipments, setShipments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [escrowDetails, setEscrowDetails] = useState(null);
  const [viewingShipment, setViewingShipment] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [manualEscrowAmount, setManualEscrowAmount] = useState('');
  const [manualEscrowDeadline, setManualEscrowDeadline] = useState('30');
  const [tokenBalance, setTokenBalance] = useState('0');
  const [loading, setLoading] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');

  // Order form state
  const [orderForm, setOrderForm] = useState({
    productName: '',
    origin: '',
    destination: '',
    quantity: '',
    notes: '',
  });

  // Shipping fee calculation state
  const [shippingFee, setShippingFee] = useState(null);
  const [shippingDistance, setShippingDistance] = useState(null);
  const [calculatingFee, setCalculatingFee] = useState(false);
  const [feeError, setFeeError] = useState('');
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);

  useEffect(() => {
    if (account) {
      // Auto-fill origin from predefined shipping config and lock it
      const defaultOrigin = (import.meta && import.meta.env && import.meta.env.VITE_DEFAULT_ORIGIN) || "UIT HCMC";
      setOrderForm((prev) => ({ ...prev, origin: defaultOrigin }));
      loadBuyerData();
    }
  }, [account, chainId]);

  const loadBuyerData = async () => {
    if (!account) return;

    setLoadingShipments(true);
    setLoadingOrders(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const registry = getContract(
        'ShipmentRegistry',
        ShipmentRegistryABI.abi,
        provider,
        chainId
      );
      const token = getContract(
        'LogiToken',
        LogiTokenABI.abi,
        provider,
        chainId
      );

      // Load token balance
      const balance = await token.balanceOf(account);
      setTokenBalance(ethers.formatEther(balance));

      // Load shipments where account is buyer
      const shipmentIds = await registry.getShipmentsByAddress(account);

      const shipmentsData = await Promise.all(
        shipmentIds.map(async (id) => {
          const shipment = await registry.getShipment(id);

          if (shipment.buyer.toLowerCase() === account.toLowerCase()) {
            const latestCid =
              shipment.metadataCids.length > 0
                ? shipment.metadataCids[shipment.metadataCids.length - 1]
                : '';
            return {
              id: id.toString(),
              staff: shipment.staff,
              carrier: shipment.carrier,
              buyer: shipment.buyer,
              milestoneStatus: Number(shipment.status),
              metadataCid: latestCid,
              timestamp: Number(shipment.createdAt),
            };
          }
          return null;
        })
      );

      setShipments(shipmentsData.filter((s) => s !== null));

      // Load my orders from logs
      try {
        const iface = new ethers.Interface(ShipmentRegistryABI.abi);
        const topic = iface.getEvent('OrderCreated').topicHash;
        const logs = await provider.getLogs({
          address: await registry.getAddress(),
          topics: [topic, null, null],
          fromBlock: '0x0',
          toBlock: 'latest',
        });
        const myOrders = logs
          .map((l) => {
            const ev = iface.decodeEventLog('OrderCreated', l.data, l.topics);
            const orderId = ev.orderId.toString();
            const buyer = ev.buyer;
            const cid = ev.orderCid;
            const timestamp = Number(ev.timestamp);
            return { orderId, buyer, cid, timestamp };
          })
          .filter((o) => o.buyer.toLowerCase() === account.toLowerCase())
          .reverse();
        setOrders(myOrders);
      } catch (e) {
        console.warn('Load orders failed', e);
        setOrders([]);
      }
    } catch (err) {
      console.error('Error loading buyer data:', err);
      setError(parseContractError(err));
    } finally {
      setLoadingShipments(false);
      setLoadingOrders(false);
    }
  };

  const loadEscrowDetails = async (shipmentId) => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const escrow = getContract(
        'EscrowMilestone',
        EscrowMilestoneABI.abi,
        provider,
        chainId
      );

      const details = await escrow.getEscrowDetails(shipmentId);

      setEscrowDetails({
        totalAmount: ethers.formatEther(details.totalAmount),
        releasedAmount: ethers.formatEther(details.releasedAmount),
        deadline: Number(details.deadline),
        isActive: details.isActive,
        isCompleted: details.isCompleted,
      });
      // Show an info hint when escrow was auto-opened by registry on creation
      if (details.isActive && Number(details.totalAmount) > 0) {
        setSuccess(
          'Escrow is active and funded automatically at shipment creation.'
        );
      }
    } catch (err) {
      console.log('No escrow found for this shipment');
      setEscrowDetails(null);
    }
  };

  const handleOrderInput = (e) => {
    const { name, value } = e.target;
    // Prevent editing origin; it's auto-filled from config
    if (name === "origin") return;
    setOrderForm((prev) => ({ ...prev, [name]: value }));

    // Auto-calculate shipping fee when destination changes
    if (name === 'destination' && value.trim().length > 3) {
      calculateShippingFeeDebounced(value);
    } else if (name === 'destination' && value.trim().length === 0) {
      // Clear fee when destination is cleared
      setShippingFee(null);
      setShippingDistance(null);
      setFeeError('');
      setDeliveryCoordinates(null);
    }
  };

  // Debounced shipping fee calculation
  const calculateShippingFeeDebounced = (() => {
    let timer;
    return (address) => {
      clearTimeout(timer);
      timer = setTimeout(() => calculateShippingFee(address), 800);
    };
  })();

  const calculateShippingFee = async (address) => {
    if (!address || address.trim().length === 0) {
      return;
    }

    setCalculatingFee(true);
    setFeeError('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const registry = getContract(
        'ShipmentRegistry',
        ShipmentRegistryABI.abi,
        provider,
        chainId
      );

      const result = await calculateShippingFeeFromAddress(registry, address);

      setShippingFee(result.fee);
      setShippingDistance(result.distance);
      setDeliveryCoordinates(result.coordinates);
      setFeeError('');
    } catch (err) {
      console.error('Error calculating shipping fee:', err);
      setFeeError(err.message || 'Unable to calculate shipping fee');
      setShippingFee(null);
      setShippingDistance(null);
      setDeliveryCoordinates(null);
    } finally {
      setCalculatingFee(false);
    }
  };

  const createOrder = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setTxHash('');

    const { productName, origin, destination, quantity } = orderForm;
    if (!productName || !origin || !destination) {
      setError('Please fill required order fields');
      return;
    }
    if (!quantity) {
      setError('Please provide quantity');
      return;
    }

    // Validate shipping fee is calculated
    if (!shippingFee && shippingFee !== 0) {
      setError(
        'Please wait for shipping fee calculation or enter a valid destination address'
      );
      return;
    }

    try {
      // Upload order metadata to IPFS if configured; otherwise embed minimal JSON
      let orderCid = '';
      const data = {
        ...orderForm,
        shippingFee: shippingFee,
        shippingDistance: shippingDistance,
        deliveryCoordinates: deliveryCoordinates,
        version: '1.0',
        createdAt: new Date().toISOString(),
        buyer: account,
      };
      if (isPinataConfigured()) {
        const res = await uploadJSONToIPFS(data, `order-${Date.now()}.json`);
        orderCid = res.cid;
      } else {
        // As a fallback require manual CID entry is not ideal; embed JSON as CID-like string is not possible.
        // Force config to proceed
        setError(
          'Pinata chưa cấu hình. Vui lòng thêm VITE_PINATA_* để tạo order'
        );
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        'ShipmentRegistry',
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      const receipt = await handleTransaction(
        () => registry.createOrder(orderCid),
        async (receipt) => {
          setSuccess(
            `Order created successfully! Shipping fee: ${shippingFee} LOGI`
          );
          setTxHash(receipt.hash);
          setOrderForm({
            productName: '',
            origin: '',
            destination: '',
            quantity: '',
            notes: '',
          });
          setShippingFee(null);
          setShippingDistance(null);
          setDeliveryCoordinates(null);
          await loadBuyerData();
        },
        (errorMsg) => setError(parseContractError({ message: errorMsg }))
      );
      console.log('Order tx:', receipt);
    } catch (err) {
      console.error('Create order error:', err);
      setError(parseContractError(err));
    }
  };

  const selectShipment = async (shipment) => {
    setSelectedShipment(shipment);
    setError('');
    setSuccess('');
    await loadEscrowDetails(shipment.id);
  };

  const openEscrow = async (e) => {
    e.preventDefault();

    if (!account || !selectedShipment || !depositAmount) {
      setError('Please provide all required information');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid deposit amount');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        'EscrowMilestone',
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );
      const token = getContract('LogiToken', LogiTokenABI.abi, signer, chainId);

      const amountWei = ethers.parseEther(depositAmount);

      // Step 1: Check token balance
      const balance = await token.balanceOf(account);
      if (balance < amountWei) {
        setError(
          `Insufficient token balance. You have ${formatTokenAmount(
            balance
          )} LOGI`
        );
        setLoading(false);
        return;
      }

      // Step 2: Approve tokens for escrow contract
      const escrowAddress = await escrow.getAddress();
      const currentAllowance = await token.allowance(account, escrowAddress);

      if (currentAllowance < amountWei) {
        const approveReceipt = await handleTransaction(
          () => token.approve(escrowAddress, amountWei),
          () => {
            console.log('Tokens approved for escrow');
          },
          (err) => {
            throw new Error(`Approval failed: ${err}`);
          }
        );
        console.log('Approval transaction:', approveReceipt);
      }

      // Step 3: Open escrow (30 days deadline)
      const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

      const receipt = await handleTransaction(
        () => escrow.openEscrow(selectedShipment.id, amountWei, deadline),
        async (receipt) => {
          setSuccess(`Escrow opened with ${depositAmount} LOGI tokens!`);
          setTxHash(receipt.hash);
          setDepositAmount('');

          // Reload data
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log('Transaction receipt:', receipt);
    } catch (err) {
      console.error('Error opening escrow:', err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const openManualEscrow = async (e) => {
    e.preventDefault();

    if (
      !account ||
      !selectedShipment ||
      !manualEscrowAmount ||
      !manualEscrowDeadline
    ) {
      setError('Please provide all required information');
      return;
    }

    const amount = parseFloat(manualEscrowAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid escrow amount');
      return;
    }

    const deadlineDays = parseInt(manualEscrowDeadline);
    if (isNaN(deadlineDays) || deadlineDays <= 0) {
      setError('Invalid deadline (must be positive number of days)');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        'EscrowMilestone',
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );
      const token = getContract('LogiToken', LogiTokenABI.abi, signer, chainId);

      const amountWei = ethers.parseEther(manualEscrowAmount);

      // Step 1: Check token balance
      const balance = await token.balanceOf(account);
      if (balance < amountWei) {
        setError(
          `Insufficient token balance. You have ${formatTokenAmount(
            balance
          )} LOGI. Please request tokens from admin.`
        );
        setLoading(false);
        return;
      }

      // Step 2: Approve tokens for escrow contract
      const escrowAddress = await escrow.getAddress();
      const currentAllowance = await token.allowance(account, escrowAddress);

      if (currentAllowance < amountWei) {
        const approveReceipt = await handleTransaction(
          () => token.approve(escrowAddress, amountWei),
          () => {
            console.log('Tokens approved for escrow');
          },
          (err) => {
            throw new Error(`Approval failed: ${err}`);
          }
        );
        console.log('Approval transaction:', approveReceipt);
      }

      // Step 3: Open escrow with user-specified deadline
      const deadline =
        Math.floor(Date.now() / 1000) + deadlineDays * 24 * 60 * 60;

      const receipt = await handleTransaction(
        () => escrow.openEscrow(selectedShipment.id, amountWei, deadline),
        async (receipt) => {
          setSuccess(
            `Escrow opened successfully with ${manualEscrowAmount} LOGI tokens!`
          );
          setTxHash(receipt.hash);
          setManualEscrowAmount('');
          setManualEscrowDeadline('30');

          // Reload data
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log('Transaction receipt:', receipt);
    } catch (err) {
      console.error('Error opening manual escrow:', err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const depositToEscrow = async () => {
    if (!selectedShipment || !depositAmount) {
      setError('Please provide deposit amount');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Invalid deposit amount');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const escrow = getContract(
        'EscrowMilestone',
        EscrowMilestoneABI.abi,
        signer,
        chainId
      );
      const token = getContract('LogiToken', LogiTokenABI.abi, signer, chainId);

      const amountWei = ethers.parseEther(depositAmount);

      // Approve and deposit
      const escrowAddress = await escrow.getAddress();
      await handleTransaction(
        () => token.approve(escrowAddress, amountWei),
        () => console.log('Approved'),
        (err) => {
          throw new Error(err);
        }
      );

      const receipt = await handleTransaction(
        () => escrow.deposit(selectedShipment.id, amountWei),
        async (receipt) => {
          setSuccess(`Deposited ${depositAmount} LOGI to escrow!`);
          setTxHash(receipt.hash);
          setDepositAmount('');
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );

      console.log('Deposit receipt:', receipt);
    } catch (err) {
      console.error('Error depositing:', err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelivery = async () => {
    if (!selectedShipment) {
      setError('Please select a shipment first');
      return;
    }

    // Pre-checks to avoid contract reverts
    if (selectedShipment.milestoneStatus !== 3) {
      setError('Shipment must be ARRIVED before confirming delivery.');
      return;
    }

    if (!escrowDetails || !escrowDetails.isActive) {
      setError(
        'Escrow must be active to release payment. Please open or activate escrow first.'
      );
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setTxHash('');

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        'ShipmentRegistry',
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      // Buyer moves shipment to DELIVERED; registry handles escrow release internally
      await handleTransaction(
        () => registry.updateMilestone(selectedShipment.id, 4),
        async (receipt) => {
          setSuccess('Delivery confirmed! Final payment released.');
          setTxHash(receipt.hash);
          // Update local state to reflect DELIVERED and refresh escrow
          setSelectedShipment((prev) =>
            prev && prev.id === selectedShipment.id
              ? { ...prev, milestoneStatus: 4 }
              : prev
          );
          await loadBuyerData();
          await loadEscrowDetails(selectedShipment.id);
        },
        (errorMsg) => {
          setError(parseContractError({ message: errorMsg }));
        }
      );
    } catch (err) {
      console.error('Error confirming delivery:', err);
      setError(parseContractError(err));
    } finally {
      setLoading(false);
    }
  };

  if (!account) {
    return (
      <div className="buyer-panel">
        <div className="empty-state">
          <p>Please connect your wallet to manage escrow</p>
        </div>
      </div>
    );
  }

  return (
    <div className="buyer-panel">
      <div className="panel-header">
        <h2>Create Order</h2>
        <p className="subtitle">
          Buyer tạo đơn hàng: Tên hàng và số lượng (Shippe r sẽ nhập cân nặng)
        </p>
      </div>

      <form
        onSubmit={createOrder}
        className="open-escrow-form"
        style={{ marginBottom: 24 }}
      >
        <div className="form-row">
          <div className="form-group">
            <label>
              Product Name <span className="required">*</span>
            </label>
            <input
              name="productName"
              className="form-input"
              value={orderForm.productName}
              onChange={handleOrderInput}
              placeholder="Tên hàng hóa"
            />
          </div>
          <div className="form-group">
            <label>
              Origin <span className="required">*</span>
            </label>
            <input
              name="origin"
              className="form-input"
              value={orderForm.origin}
              readOnly
              disabled
              placeholder="TP.HCM, VN"
            />
          </div>
          <div className="form-group">
            <label>
              Destination <span className="required">*</span>
            </label>
            <input
              name="destination"
              className="form-input"
              value={orderForm.destination}
              onChange={handleOrderInput}
              placeholder="Nhập địa chỉ giao hàng đầy đủ..."
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>
              Quantity <span className="required">*</span>
            </label>
            <input
              name="quantity"
              type="number"
              className="form-input"
              value={orderForm.quantity}
              onChange={handleOrderInput}
              placeholder="10"
            />
          </div>
          <div className="form-group">
            <label>Notes</label>
            <input
              name="notes"
              className="form-input"
              value={orderForm.notes}
              onChange={handleOrderInput}
              placeholder="Yêu cầu đóng gói, bảo hiểm..."
            />
          </div>
        </div>

        {/* Shipping Fee Display */}
        {orderForm.destination && (
          <div
            className="shipping-fee-info"
            style={{
              marginTop: 16,
              padding: 12,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              border: '1px solid #ddd',
            }}
          >
            {calculatingFee && (
              <p style={{ margin: 0, color: '#666' }}>
                🔄 Đang tính phí vận chuyển...
              </p>
            )}

            {feeError && !calculatingFee && (
              <div style={{ color: '#d32f2f', margin: 0 }}>⚠️ {feeError}</div>
            )}

            {shippingFee !== null && !calculatingFee && !feeError && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    color: '#333',
                  }}
                >
                  <span>
                    <strong>📍 Khoảng cách:</strong>
                  </span>
                  <span>{shippingDistance} km</span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                    color: '#333',
                  }}
                >
                  <span>
                    <strong>💰 Phí vận chuyển:</strong>
                  </span>
                  <span
                    style={{
                      fontSize: 18,
                      fontWeight: 'bold',
                      color: '#2e7d32',
                    }}
                  >
                    {shippingFee} LOGI
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                  {getShippingTierDescription(shippingDistance)}
                </div>
                {deliveryCoordinates && (
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    📌 {deliveryCoordinates.displayAddress}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          className="submit-button"
          disabled={loadingOrders || calculatingFee}
        >
          {loadingOrders
            ? 'Processing...'
            : calculatingFee
            ? 'Calculating...'
            : 'Create Order'}
        </button>
      </form>

      <div className="panel-header" style={{ marginTop: 8 }}>
        <h3>My Orders ({orders.length})</h3>
      </div>
      <div className="shipments-grid" style={{ marginBottom: 24 }}>
        {loadingOrders ? (
          <p>Loading orders...</p>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <p>No orders yet</p>
          </div>
        ) : (
          orders.map((o) => (
            <div key={o.orderId} className="shipment-card">
              <div className="card-header">
                <h4>Order #{o.orderId}</h4>
              </div>
              <div className="card-body">
                <p>
                  <strong>Created:</strong>{' '}
                  {new Date(o.timestamp * 1000).toLocaleString()}
                </p>
                <button
                  className="metadata-link"
                  onClick={() =>
                    setViewingOrder({ id: o.orderId, metadataCid: o.cid })
                  }
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: 0,
                  }}
                >
                  View Order
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="panel-header">
        <h2>Manage Escrow</h2>
        <p className="subtitle">
          As Buyer, you can manage escrow payments for your shipments
        </p>
        <div className="token-balance">
          <strong>Your Balance:</strong> {parseFloat(tokenBalance).toFixed(2)}{' '}
          LOGI
        </div>
      </div>

      <div className="panel-content">
        <div className="shipments-list">
          <h3>Your Shipments ({shipments.length})</h3>

          {loadingShipments ? (
            <p>Loading shipments...</p>
          ) : shipments.length === 0 ? (
            <div className="empty-state">
              <p>No shipments found where you are the buyer</p>
            </div>
          ) : (
            <div className="shipments-grid">
              {shipments.map((shipment) => (
                <div
                  key={shipment.id}
                  className={`shipment-card ${
                    selectedShipment?.id === shipment.id ? 'selected' : ''
                  }`}
                  onClick={() => selectShipment(shipment)}
                >
                  <div className="card-header">
                    <h4>Shipment #{shipment.id}</h4>
                    <span
                      className={`status-badge status-${shipment.milestoneStatus}`}
                    >
                      {getMilestoneStatusName(shipment.milestoneStatus)}
                    </span>
                  </div>
                  <div className="card-body">
                    <p>
                      <strong>Staff:</strong> {shipment.staff.slice(0, 10)}
                      ...
                    </p>
                    <p>
                      <strong>Carrier:</strong> {shipment.carrier.slice(0, 10)}
                      ...
                    </p>
                    <p>
                      <strong>Created:</strong>{' '}
                      {new Date(shipment.timestamp * 1000).toLocaleDateString()}
                    </p>
                    {shipment.metadataCid && (
                      <button
                        className="metadata-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewingShipment(shipment);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        View Details
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedShipment && (
          <div className="escrow-management">
            <h3>Escrow for Shipment #{selectedShipment.id}</h3>

            {escrowDetails ? (
              <div className="escrow-info">
                <div className="info-grid">
                  <div className="info-item">
                    <label>Total Amount:</label>
                    <span>
                      {parseFloat(escrowDetails.totalAmount).toFixed(2)} LOGI
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Released:</label>
                    <span>
                      {parseFloat(escrowDetails.releasedAmount).toFixed(2)} LOGI
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Deadline:</label>
                    <span>
                      {new Date(
                        escrowDetails.deadline * 1000
                      ).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="info-item">
                    <label>Status:</label>
                    <span
                      className={
                        escrowDetails.isCompleted
                          ? 'text-success'
                          : 'text-primary'
                      }
                    >
                      {escrowDetails.isCompleted
                        ? 'Completed'
                        : escrowDetails.isActive
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>
                </div>

                <div className="escrow-actions">
                  {selectedShipment.milestoneStatus === 3 &&
                    escrowDetails.isActive && (
                      <button
                        onClick={confirmDelivery}
                        disabled={loading}
                        className="action-button primary"
                      >
                        {loading
                          ? 'Processing...'
                          : 'Confirm Delivery & Release Payment'}
                      </button>
                    )}
                  {selectedShipment.milestoneStatus !== 3 &&
                    escrowDetails.isActive && (
                      <p className="hint" style={{ marginTop: 8 }}>
                        Escrow is active and funded. Wait until shipment ARRIVED
                        to confirm delivery.
                      </p>
                    )}
                  {!escrowDetails.isActive &&
                    selectedShipment.milestoneStatus < 4 && (
                      <div style={{ marginTop: 16 }}>
                        <p
                          className="hint warning"
                          style={{ marginBottom: 12 }}
                        >
                          ⚠️ Escrow is not active. If the shipment was created
                          with a shipping fee of 0, auto-escrow will not open.
                          Deposit tokens to activate escrow payments.
                        </p>
                        <form
                          onSubmit={depositToEscrow}
                          style={{ marginTop: 12 }}
                        >
                          <div className="form-group">
                            <label htmlFor="depositAmount">
                              Deposit Amount (LOGI):
                            </label>
                            <input
                              type="number"
                              id="depositAmount"
                              value={depositAmount}
                              onChange={(e) => setDepositAmount(e.target.value)}
                              placeholder="Enter amount"
                              step="0.01"
                              min="0"
                              required
                              className="form-input"
                            />
                          </div>
                          <button
                            type="submit"
                            disabled={loading}
                            className="action-button primary"
                          >
                            {loading ? 'Processing...' : 'Deposit to Escrow'}
                          </button>
                        </form>
                      </div>
                    )}
                </div>
              </div>
            ) : (
              <div className="no-escrow">
                <p style={{ marginBottom: 16 }}>
                  No escrow found for this shipment. Open escrow manually to
                  enable milestone-based payments.
                </p>

                <form
                  onSubmit={openManualEscrow}
                  className="manual-escrow-form"
                >
                  <h4 style={{ marginBottom: 12 }}>Open Escrow Manually</h4>
                  <div className="form-group">
                    <label htmlFor="manualEscrowAmount">
                      Amount (LOGI): <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      id="manualEscrowAmount"
                      value={manualEscrowAmount}
                      onChange={(e) => setManualEscrowAmount(e.target.value)}
                      placeholder="Enter LOGI amount"
                      step="0.01"
                      min="0.01"
                      required
                      className="form-input"
                    />
                    <p className="hint">
                      Total amount to be released across milestones
                      (30%/30%/20%/20%)
                    </p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="manualEscrowDeadline">
                      Deadline (days from now):{' '}
                      <span className="required">*</span>
                    </label>
                    <input
                      type="number"
                      id="manualEscrowDeadline"
                      value={manualEscrowDeadline}
                      onChange={(e) => setManualEscrowDeadline(e.target.value)}
                      placeholder="30"
                      min="1"
                      required
                      className="form-input"
                    />
                    <p className="hint">Number of days before escrow expires</p>
                  </div>

                  <div
                    style={{
                      marginBottom: 12,
                      padding: 12,
                      backgroundColor: '#f5f5f5',
                      borderRadius: 4,
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 14 }}>
                      <strong>Your token balance:</strong>{' '}
                      {parseFloat(tokenBalance).toFixed(2)} LOGI
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="action-button primary"
                  >
                    {loading ? 'Processing...' : 'Open Escrow & Approve Tokens'}
                  </button>
                </form>
              </div>
            )}

            {error && (
              <div className="alert alert-error">
                <strong>Error:</strong> {error}
              </div>
            )}

            {success && (
              <div className="alert alert-success">
                <strong>Success:</strong> {success}
                {txHash && (
                  <p className="tx-hash">
                    Transaction: <code>{txHash}</code>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Shipment Detail Modal */}
        {viewingShipment && (
          <ShipmentDetailModal
            shipment={viewingShipment}
            onClose={() => setViewingShipment(null)}
          />
        )}

        {/* Order Detail Modal */}
        {viewingOrder && (
          <ShipmentDetailModal
            shipment={viewingOrder}
            onClose={() => setViewingOrder(null)}
          />
        )}
      </div>
    </div>
  );
}
