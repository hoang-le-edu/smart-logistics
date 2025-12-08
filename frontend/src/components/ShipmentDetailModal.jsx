import { useState, useEffect } from 'react';
import CryptoJS from 'crypto-js';
import './ShipmentDetailModal.css';

const ENCRYPTION_KEY =
  import.meta.env.VITE_ENCRYPTION_KEY || 'default-secret-key';

export default function ShipmentDetailModal({ shipment, onClose }) {
  const [metadata, setMetadata] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [decryptedData, setDecryptedData] = useState(null);

  useEffect(() => {
    if (shipment?.metadataCid) {
      loadMetadata(shipment.metadataCid);
    }
  }, [shipment]);

  const loadMetadata = async (cid) => {
    setLoading(true);
    setError('');
    try {
      // Check if CID is actually a JSON string (from old seed data)
      try {
        // Try to parse as JSON first
        const parsedData = JSON.parse(cid);
        setMetadata(parsedData);
        setLoading(false);
        return;
      } catch {
        // Not JSON, proceed with IPFS fetch
      }

      // Validate CID format (should be base58 hash starting with Qm or bafy)
      if (!cid.startsWith('Qm') && !cid.startsWith('bafy')) {
        throw new Error('Invalid IPFS CID format');
      }

      // Try multiple IPFS gateways
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
      ];

      let response = null;
      let lastError = null;

      for (const gateway of gateways) {
        try {
          response = await fetch(gateway);
          if (response.ok) break;
        } catch (err) {
          lastError = err;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('All IPFS gateways failed');
      }

      const data = await response.json();
      setMetadata(data);

      // Try to decrypt if data is encrypted
      if (data.encrypted) {
        try {
          const decrypted = CryptoJS.AES.decrypt(
            data.encrypted,
            ENCRYPTION_KEY
          );
          const decryptedText = decrypted.toString(CryptoJS.enc.Utf8);
          if (decryptedText) {
            setDecryptedData(JSON.parse(decryptedText));
          }
        } catch (err) {
          console.warn('Decryption failed or data not encrypted:', err);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getMilestoneStatusName = (status) => {
    const statuses = [
      'CREATED',
      'PICKED_UP',
      'IN_TRANSIT',
      'ARRIVED',
      'DELIVERED',
      'CANCELED',
    ];
    return statuses[status] || 'UNKNOWN';
  };

  const formatAddress = (address) => {
    if (!address) return 'N/A';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    return new Date(Number(timestamp) * 1000).toLocaleString('vi-VN');
  };

  if (!shipment) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Shipment Details #{shipment.id}</h2>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Basic Info */}
          <section className="info-section">
            <h3>📦 Basic Information</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Status:</label>
                <span
                  className={`status-badge status-${shipment.milestoneStatus}`}
                >
                  {getMilestoneStatusName(shipment.milestoneStatus)}
                </span>
              </div>
              <div className="info-item">
                <label>Created:</label>
                <span>{formatDate(shipment.timestamp)}</span>
              </div>
            </div>
          </section>

          {/* Parties */}
          <section className="info-section">
            <h3>👥 Parties</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>Shipper:</label>
                <span className="address">
                  {formatAddress(shipment.shipper)}
                </span>
                <button
                  className="copy-btn"
                  onClick={() =>
                    navigator.clipboard.writeText(shipment.shipper)
                  }
                  title="Copy address"
                >
                  📋
                </button>
              </div>
              <div className="info-item">
                <label>Carrier:</label>
                <span className="address">
                  {formatAddress(shipment.carrier)}
                </span>
                <button
                  className="copy-btn"
                  onClick={() =>
                    navigator.clipboard.writeText(shipment.carrier)
                  }
                  title="Copy address"
                >
                  📋
                </button>
              </div>
              <div className="info-item">
                <label>Buyer:</label>
                <span className="address">{formatAddress(shipment.buyer)}</span>
                <button
                  className="copy-btn"
                  onClick={() => navigator.clipboard.writeText(shipment.buyer)}
                  title="Copy address"
                >
                  📋
                </button>
              </div>
            </div>
          </section>

          {/* Metadata */}
          <section className="info-section">
            <h3>
              📄 Metadata{' '}
              {shipment.metadataCid &&
                `(IPFS: ${shipment.metadataCid.slice(0, 10)}...)`}
            </h3>

            {loading && <p className="loading">Loading metadata...</p>}
            {error && <p className="error">Error: {error}</p>}

            {metadata && !loading && (
              <div className="metadata-container">
                {/* Show decrypted data if available */}
                {decryptedData ? (
                  <div className="decrypted-data">
                    <div className="decrypt-badge">🔓 Decrypted Data</div>
                    <pre>{JSON.stringify(decryptedData, null, 2)}</pre>
                  </div>
                ) : (
                  <>
                    {/* Show encrypted data */}
                    {metadata.encrypted && (
                      <div className="encrypted-data">
                        <div className="encrypt-badge">🔒 Encrypted Data</div>
                        <div className="encrypted-text">
                          {metadata.encrypted.slice(0, 100)}...
                        </div>
                        <p className="hint">
                          ⚠️ Không thể giải mã. Kiểm tra ENCRYPTION_KEY trong
                          .env
                        </p>
                      </div>
                    )}

                    {/* Show raw metadata if not encrypted */}
                    {!metadata.encrypted && (
                      <pre>{JSON.stringify(metadata, null, 2)}</pre>
                    )}
                  </>
                )}
              </div>
            )}
          </section>

          {/* IPFS Link */}
          {shipment.metadataCid && (
            <section className="info-section">
              <a
                href={`https://gateway.pinata.cloud/ipfs/${shipment.metadataCid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ipfs-link"
              >
                🔗 View on IPFS Gateway
              </a>
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
