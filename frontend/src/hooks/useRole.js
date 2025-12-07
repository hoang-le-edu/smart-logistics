import { useState, useEffect, useRef } from "react";
import { getShipmentRegistry } from "../utils/contracts";

/**
 * Custom hook to detect user role from smart contract
 * @param {string} account - Connected wallet address
 * @returns {{ role: string|null, loading: boolean }}
 */
export function useRole(account) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const abortControllerRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Clear previous timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    if (!account) {
      setRole(null);
      setLoading(false);
      return;
    }

    // Create new abort controller
    abortControllerRef.current = {
      aborted: false,
      abort: () => {
        abortControllerRef.current.aborted = true;
      },
    };
    const currentController = abortControllerRef.current;

    // Debounce role detection by 300ms to avoid race conditions
    timeoutRef.current = setTimeout(() => {
      detectRoleWithRetry(account, currentController, setRole, setLoading);
    }, 300);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [account]);

  return { role, loading };
}

/**
 * Detect user role with retry logic
 * @param {string} accountAddress - Account address
 * @param {object} controller - Abort controller
 * @param {function} setRole - Set role function
 * @param {function} setLoading - Set loading function
 * @param {number} retryCount - Current retry count
 */
async function detectRoleWithRetry(
  accountAddress,
  controller,
  setRole,
  setLoading,
  retryCount = 0
) {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;

  try {
    setLoading(true);

    // Check if aborted
    if (controller.aborted) {
      return;
    }

    const registry = await getShipmentRegistry();

    // Check if aborted after getting registry
    if (controller.aborted) {
      return;
    }

    // Check each role in priority order: admin > staff > packer > carrier > buyer
    const isAdmin = await registry.hasRole(
      await registry.DEFAULT_ADMIN_ROLE(),
      accountAddress
    );
    if (controller.aborted) return;
    if (isAdmin) {
      setRole("ADMIN");
      setLoading(false);
      return;
    }

    const isStaff = await registry.hasRole(
      await registry.SHIPPER_ROLE(),
      accountAddress
    );
    if (controller.aborted) return;
    if (isStaff) {
      setRole("STAFF");
      setLoading(false);
      return;
    }

    const isPacker = await registry.hasRole(
      await registry.PACKER_ROLE(),
      accountAddress
    );
    if (controller.aborted) return;
    if (isPacker) {
      setRole("PACKER");
      setLoading(false);
      return;
    }

    const isCarrier = await registry.hasRole(
      await registry.CARRIER_ROLE(),
      accountAddress
    );
    if (controller.aborted) return;
    if (isCarrier) {
      setRole("CARRIER");
      setLoading(false);
      return;
    }

    const isBuyer = await registry.hasRole(
      await registry.BUYER_ROLE(),
      accountAddress
    );
    if (controller.aborted) return;
    if (isBuyer) {
      setRole("BUYER");
      setLoading(false);
      return;
    }

    // No role found
    if (!controller.aborted) {
      setRole("NONE");
      setLoading(false);
    }
  } catch (error) {
    console.error(`Error detecting role (attempt ${retryCount + 1}):`, error);

    // Don't retry if aborted
    if (controller.aborted) {
      return;
    }

    // Retry logic for network errors
    if (retryCount < MAX_RETRIES && !controller.aborted) {
      console.log(`Retrying role detection in ${RETRY_DELAY}ms...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      if (!controller.aborted) {
        return detectRoleWithRetry(
          accountAddress,
          controller,
          setRole,
          setLoading,
          retryCount + 1
        );
      }
    }

    // If all retries failed or non-retryable error, set NONE instead of crashing
    if (!controller.aborted) {
      console.warn("Failed to detect role after retries, defaulting to NONE");
      setRole("NONE");
      setLoading(false);
    }
  }
}
