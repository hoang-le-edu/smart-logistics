import { ethers } from 'ethers';

/**
 * Get coordinates from address using geocoding API (Nominatim - OpenStreetMap)
 * @param {string} address - Delivery address
 * @returns {Promise<{latitude: number, longitude: number, displayAddress: string}>}
 */
export async function getCoordinatesFromAddress(address) {
  try {
    if (!address || address.trim().length === 0) {
      throw new Error('Address is required');
    }

    // Add "Vietnam" to query if not present for better results
    const searchQuery =
      address.toLowerCase().includes('vietnam') ||
      address.toLowerCase().includes('việt nam')
        ? address
        : `${address}, Vietnam`;

    console.log('🔍 Searching for address:', searchQuery);

    // Using Nominatim (OpenStreetMap - free, no API key needed)
    // Parameters:
    // - format=json: Return JSON
    // - q=query: Search query
    // - countrycode=vn: Limit to Vietnam only
    // - addressdetails=1: Include detailed address breakdown
    // - limit=5: Get top 5 results
    const params = new URLSearchParams({
      format: 'json',
      q: searchQuery,
      countrycode: 'vn',
      addressdetails: '1',
      limit: '5',
    });

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'SmartLogistics/1.0', // Nominatim requires User-Agent
        },
      }
    );

    if (!response.ok) {
      throw new Error('Geocoding service unavailable');
    }

    const data = await response.json();
    console.log('📍 Geocoding results:', data);

    if (data && data.length > 0) {
      // Use the first (best match) result
      const result = data[0];
      console.log('✅ Selected location:', {
        address: result.display_name,
        lat: result.lat,
        lon: result.lon,
        type: result.type,
        importance: result.importance,
      });

      return {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        displayAddress: result.display_name,
      };
    }

    throw new Error(
      "Không tìm thấy địa chỉ. Hãy thử: 'Tên đường, Quận/Huyện, Tỉnh/TP'"
    );
  } catch (error) {
    console.error('❌ Geocoding error:', error);
    throw error;
  }
}

/**
 * Call smart contract to get shipping fee based on coordinates
 * @param {ethers.Contract} contract - ShipmentRegistry contract instance
 * @param {number} deliveryLat - Delivery latitude
 * @param {number} deliveryLon - Delivery longitude
 * @returns {Promise<{distance: number, fee: string}>}
 */
export async function getShippingFeeFromContract(
  contract,
  deliveryLat,
  deliveryLon
) {
  try {
    if (!contract) {
      throw new Error('Contract not initialized');
    }

    // Convert to 1e6 format for contract (e.g., 21.0285 -> 21028500)
    const latInt = Math.round(deliveryLat * 1e6);
    const lonInt = Math.round(deliveryLon * 1e6);

    const result = await contract.getShippingFee(latInt, lonInt);

    return {
      distance: Number(result.distance),
      fee: result.fee.toString(), // Keep as string to preserve precision
    };
  } catch (error) {
    console.error('Error calculating shipping fee:', error);

    // Check if origin location is not set
    if (error.message && error.message.includes('Origin location not set')) {
      throw new Error(
        'Shipping fee system not configured. Please contact admin.'
      );
    }

    // Check if shipping tiers not initialized
    if (
      error.message &&
      error.message.includes('Shipping tiers not initialized')
    ) {
      throw new Error(
        'Shipping fee tiers not configured. Please contact admin.'
      );
    }

    throw error;
  }
}

/**
 * Calculate shipping fee from delivery address
 * @param {ethers.Contract} contract - ShipmentRegistry contract instance
 * @param {string} address - Delivery address
 * @returns {Promise<{distance: number, fee: string, feeFormatted: string, coordinates: object}>}
 */
export async function calculateShippingFeeFromAddress(contract, address) {
  try {
    // Step 1: Get coordinates from address
    const coords = await getCoordinatesFromAddress(address);
    console.log('Delivery coordinates:', coords);

    // Step 2: Calculate fee from smart contract
    const feeData = await getShippingFeeFromContract(
      contract,
      coords.latitude,
      coords.longitude
    );

    // Format fee for display (convert from wei/smallest unit if needed)
    // Assuming fee is in token units (not wei)
    const feeFormatted = feeData.fee;

    return {
      distance: feeData.distance,
      fee: feeData.fee,
      feeFormatted: feeFormatted,
      coordinates: coords,
    };
  } catch (error) {
    console.error('Error calculating shipping fee from address:', error);
    throw error;
  }
}

/**
 * Format shipping fee for display
 * @param {string|number} fee - Fee amount
 * @returns {string}
 */
export function formatShippingFee(fee) {
  if (!fee) return '0';
  return fee.toString();
}

/**
 * Get shipping tier description
 * @param {number} distance - Distance in km
 * @returns {string}
 */
export function getShippingTierDescription(distance) {
  if (distance < 2) return 'Miễn phí vận chuyển (< 2km)';
  if (distance < 10) return 'Khoảng cách gần (2-10km)';
  if (distance < 100) return 'Khoảng cách trung bình (10-100km)';
  if (distance < 500) return 'Khoảng cách xa (100-500km)';
  return 'Khoảng cách rất xa (≥ 500km)';
}
