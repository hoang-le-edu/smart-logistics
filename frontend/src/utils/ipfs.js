import axios from "axios";

const PINATA_API_KEY = import.meta.env.VITE_PINATA_API_KEY;
const PINATA_SECRET_KEY = import.meta.env.VITE_PINATA_SECRET_KEY;
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

const pinataBaseURL = "https://api.pinata.cloud";

/**
 * Upload file to IPFS via Pinata
 * @param {File} file - File object to upload
 * @param {string} filename - Optional custom filename
 * @returns {Promise<{cid: string, url: string}>}
 */
export const uploadToIPFS = async (file, filename = null) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const metadata = JSON.stringify({
      name: filename || file.name,
      keyvalues: {
        uploadedAt: new Date().toISOString(),
        type: file.type,
        size: file.size,
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
    const headers = PINATA_JWT
      ? { Authorization: `Bearer ${PINATA_JWT}` }
      : {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        };

    const response = await axios.post(
      `${pinataBaseURL}/pinning/pinJSONToIPFS`,
      {
        pinataContent: jsonData,
        pinataMetadata: {
          name: filename,
          keyvalues: {
            uploadedAt: new Date().toISOString(),
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
 * Retrieve content from IPFS
 * @param {string} cid - IPFS CID
 * @returns {Promise<any>}
 */
export const retrieveFromIPFS = async (cid) => {
  try {
    const response = await axios.get(
      `https://gateway.pinata.cloud/ipfs/${cid}`
    );
    return response.data;
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
