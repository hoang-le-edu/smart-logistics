import axios from "axios";
import CryptoJS from "crypto-js";

const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY;
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const ENCRYPTION_KEY =
  import.meta.env.VITE_ENCRYPTION_KEY ||
  "smart-logistics-default-key-2024-change-in-production";

const pinataBaseURL = "https://api.pinata.cloud";

/**
 * Encrypt data using AES encryption
 * @param {any} data - Data to encrypt (string, object, etc.)
 * @returns {string} - Encrypted ciphertext
 */
export function encryptData(data) {
  const jsonString = typeof data === "string" ? data : JSON.stringify(data);
  return CryptoJS.AES.encrypt(jsonString, ENCRYPTION_KEY).toString();
}

/**
 * Decrypt data using AES decryption
 * @param {string} ciphertext - Encrypted data
 * @returns {any} - Decrypted original data
 */
export function decryptData(ciphertext) {
  try {
    const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) {
      throw new Error("Decryption failed - empty result");
    }
    try {
      return JSON.parse(decrypted);
    } catch {
      return decrypted; // Return as string if not JSON
    }
  } catch (error) {
    console.error("Decryption error:", error);
    throw new Error(`Failed to decrypt data: ${error.message}`);
  }
}

/**
 * Upload file to IPFS via Pinata
 * @param {File} file - File object to upload
 * @param {string} filename - Optional custom filename
 * @returns {Promise<{cid: string, url: string}>}
 */
export const uploadToIPFS = async (file, filename = null) => {
  try {
    // Detect if file is binary (image, pdf, etc.)
    const isBinary =
      file.type.startsWith("image/") ||
      file.type.startsWith("video/") ||
      file.type === "application/pdf" ||
      file.type.startsWith("application/");

    let fileContent;
    if (isBinary) {
      // For binary files, read as arrayBuffer and convert to base64 properly
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Convert Uint8Array to base64 using proper method
      let binary = "";
      const chunkSize = 0x8000; // Process in chunks to avoid call stack issues
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
        binary += String.fromCharCode.apply(null, chunk);
      }
      fileContent = btoa(binary);
    } else {
      // For text files, read as text
      fileContent = await file.text();
    }

    // Encrypt the content (whether base64 or text)
    const encrypted = encryptData(fileContent);
    const encryptedBlob = new Blob([encrypted], {
      type: "application/octet-stream",
    });

    const formData = new FormData();
    formData.append("file", encryptedBlob, (filename || file.name) + ".enc");

    const metadata = JSON.stringify({
      name: (filename || file.name) + ".enc",
      keyvalues: {
        uploadedAt: new Date().toISOString(),
        originalType: file.type,
        originalSize: String(file.size),
        encrypted: "true",
        isBinary: String(isBinary),
      },
    });
    formData.append("pinataMetadata", metadata);

    const options = JSON.stringify({
      cidVersion: 1,
    });
    formData.append("pinataOptions", options);

    const headers = PINATA_JWT
      ? { Authorization: `Bearer ${PINATA_JWT}` }
      : {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        };

    const response = await axios.post(
      `${pinataBaseURL}/pinning/pinFileToIPFS`,
      formData,
      {
        maxBodyLength: "Infinity",
        headers: {
          ...headers,
          "Content-Type": "multipart/form-data",
        },
      }
    );

    const cid = response.data.IpfsHash;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    return {
      cid,
      url,
      size: response.data.PinSize,
      timestamp: response.data.Timestamp,
    };
  } catch (error) {
    console.error("Error uploading to IPFS:", error);
    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
};

/**
 * Upload JSON data to IPFS
 * @param {Object} jsonData - JSON object to upload
 * @param {string} filename - Optional filename
 * @returns {Promise<{cid: string, url: string}>}
 */
export const uploadJSONToIPFS = async (
  jsonData,
  filename = "metadata.json"
) => {
  try {
    // Encrypt JSON data
    const encrypted = encryptData(jsonData);

    const headers = PINATA_JWT
      ? { Authorization: `Bearer ${PINATA_JWT}` }
      : {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        };

    const response = await axios.post(
      `${pinataBaseURL}/pinning/pinJSONToIPFS`,
      {
        pinataContent: { encrypted },
        pinataMetadata: {
          name: filename,
          keyvalues: {
            uploadedAt: new Date().toISOString(),
            encrypted: "true", // Add encrypted flag as string
          },
        },
        pinataOptions: {
          cidVersion: 1,
        },
      },
      {
        headers: {
          ...headers,
          "Content-Type": "application/json",
        },
      }
    );

    const cid = response.data.IpfsHash;
    const url = `https://gateway.pinata.cloud/ipfs/${cid}`;

    return {
      cid,
      url,
      size: response.data.PinSize,
      timestamp: response.data.Timestamp,
    };
  } catch (error) {
    console.error("Error uploading JSON to IPFS:", error);
    throw new Error(`Failed to upload JSON to IPFS: ${error.message}`);
  }
};

/**
 * Retrieve content from IPFS with automatic decryption
 * @param {string} cid - IPFS CID
 * @returns {Promise<any>}
 */
export const retrieveFromIPFS = async (cid) => {
  try {
    const response = await axios.get(
      `https://gateway.pinata.cloud/ipfs/${cid}`
    );

    // Try to decrypt if data has encrypted field
    try {
      if (response.data && response.data.encrypted) {
        return decryptData(response.data.encrypted);
      }
      // For old non-encrypted data, return as-is
      return response.data;
    } catch (decryptError) {
      console.warn("Decryption failed, returning raw data:", decryptError);
      return response.data;
    }
  } catch (error) {
    console.error("Error retrieving from IPFS:", error);
    throw new Error(`Failed to retrieve from IPFS: ${error.message}`);
  }
};

/**
 * Get IPFS gateway URL for a CID
 * @param {string} cid - IPFS CID
 * @returns {string}
 */
export const getIPFSUrl = (cid) => {
  if (!cid) return "";
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
};

/**
 * Check if Pinata is configured
 * @returns {boolean}
 */
export const isPinataConfigured = () => {
  return !!(PINATA_JWT || (PINATA_API_KEY && PINATA_SECRET_KEY));
};

/**
 * Upload shipment metadata to IPFS
 * @param {Object} metadata - Shipment metadata
 * @returns {Promise<{cid: string, url: string}>}
 */
export const uploadShipmentMetadata = async (metadata) => {
  const data = {
    ...metadata,
    version: "1.0",
    createdAt: new Date().toISOString(),
  };
  return uploadJSONToIPFS(data, `shipment-${Date.now()}.json`);
};
