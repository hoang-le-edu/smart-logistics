import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { ShipmentRegistryABI } from "../abis";
import { getContract } from "../utils/contracts";

export default function AdminPanel({ account, chainId }) {
  const [role, setRole] = useState("STAFF");
  const [address, setAddress] = useState("");
  const [granteeName, setGranteeName] = useState("");
  const [status, setStatus] = useState("");
  const [grants, setGrants] = useState([]);
  const [allGrants, setAllGrants] = useState([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  // modal state for editing
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editIndex, setEditIndex] = useState(-1);
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState("STAFF");
  const loadGranted = async () => {
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );
      // Query RoleGranted logs
      const iface = new ethers.Interface(ShipmentRegistryABI.abi);
      const topic = iface.getEvent("RoleGranted").topicHash;
      const logs = await provider.getLogs({
        address: await registry.getAddress(),
        topics: [topic],
        fromBlock: "0x0",
        toBlock: "latest",
      });
      const defaultAdminRole = await registry.DEFAULT_ADMIN_ROLE();
      const shipperRole = await registry.SHIPPER_ROLE();
      const packerRole = await registry.PACKER_ROLE();
      const carrierRole = await registry.CARRIER_ROLE();
      const buyerRole = await registry.BUYER_ROLE();
      const decoded = logs.map((l) => {
        const ev = iface.decodeEventLog("RoleGranted", l.data, l.topics);
        const roleHex = ev.role;
        const acct = ev.account;
        const sender = ev.sender;
        const roleName =
          roleHex === defaultAdminRole
            ? "ADMIN"
            : roleHex === shipperRole
            ? "STAFF"
            : roleHex === packerRole
            ? "PACKER"
            : roleHex === carrierRole
            ? "CARRIER"
            : roleHex === buyerRole
            ? "BUYER"
            : "UNKNOWN";
        return { role: roleName, account: acct, sender };
      });
      // fetch display names in parallel to avoid await-in-map issues
      const withNames = await Promise.all(
        decoded.map(async (g) => {
          let name = "";
          let senderName = "";
          try {
            name = await registry.displayName(g.account);
          } catch {}
          try {
            senderName = await registry.displayName(g.sender);
          } catch {}
          return { ...g, name, senderName };
        })
      );
      // newest first
      const newestFirst = withNames.reverse();
      // keep only the most recent grant per account
      const seen = new Set();
      const unique = [];
      for (const item of newestFirst) {
        const key = item.account.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({ ...item, originalRole: item.role });
        }
      }
      // Filter out entries that no longer have the role (handle revokes)
      const roleHexMap = {
        ADMIN: defaultAdminRole,
        STAFF: shipperRole,
        PACKER: packerRole,
        CARRIER: carrierRole,
        BUYER: buyerRole,
      };
      const roleChecks = await Promise.all(
        unique.map(async (u) => ({
          u,
          has: await registry.hasRole(
            roleHexMap[u.role] || defaultAdminRole,
            u.account
          ),
        }))
      );

      // Store all grants with active status
      const allGrantsWithStatus = roleChecks.map((r) => ({
        ...r.u,
        isActive: r.has,
      }));
      setAllGrants(allGrantsWithStatus);

      // Active only for default view
      const activeOnly = roleChecks.filter((r) => r.has).map((r) => r.u);
      setGrants(activeOnly);
    } catch (e) {
      console.warn("Load grants failed", e);
    }
  };

  // load list on mount
  useEffect(() => {
    if (chainId && account) loadGranted();
  }, [chainId, account]);

  const validateAddress = (addr) => /^0x[0-9a-fA-F]{40}$/.test(addr);

  const run = async (fn) => {
    try {
      setStatus("Submitting transaction...");
      const receipt = await fn();
      await receipt.wait();
      setStatus("Success: " + receipt.hash);
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e.reason || e.message));
    }
  };

  const onGrantRole = async () => {
    if (!validateAddress(address)) return setStatus("Invalid wallet address");
    if (!granteeName.trim()) return setStatus("Display name is required");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const registry = getContract(
      "ShipmentRegistry",
      ShipmentRegistryABI.abi,
      signer,
      chainId
    );

    // If a grantee name is provided, save it to contract first (admin-only API)
    if (granteeName.trim()) {
      try {
        await run(() =>
          registry.setDisplayNameFor(address, granteeName.trim())
        );
      } catch (e) {
        console.warn("setDisplayNameFor failed", e);
        setStatus(
          "Không thể lưu tên cho người được gán. Kiểm tra quyền admin hoặc hàm trên contract."
        );
      }
    }

    if (role === "STAFF") await run(() => registry.grantShipperRole(address));
    else if (role === "PACKER")
      await run(() => registry.grantPackerRole(address));
    else if (role === "CARRIER")
      await run(() => registry.grantCarrierRole(address));
    else if (role === "BUYER")
      await run(() => registry.grantBuyerRole(address));
    else setStatus("Invalid role");
    await loadGranted();
  };

  const onRevokeRole = async () => {
    if (!validateAddress(address)) return setStatus("Invalid wallet address");
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const registry = getContract(
      "ShipmentRegistry",
      ShipmentRegistryABI.abi,
      signer,
      chainId
    );

    const ROLE =
      role === "STAFF"
        ? await registry.SHIPPER_ROLE()
        : role === "PACKER"
        ? await registry.PACKER_ROLE()
        : role === "CARRIER"
        ? await registry.CARRIER_ROLE()
        : role === "BUYER"
        ? await registry.BUYER_ROLE()
        : null;
    if (!ROLE) return setStatus("Invalid role");
    await run(() => registry.revokeRole(ROLE, address));
    await loadGranted();
  };

  const getRoleBytes = async (registry, roleStr) => {
    if (roleStr === "STAFF") return registry.SHIPPER_ROLE();
    if (roleStr === "PACKER") return registry.PACKER_ROLE();
    if (roleStr === "CARRIER") return registry.CARRIER_ROLE();
    if (roleStr === "BUYER") return registry.BUYER_ROLE();
    return null;
  };

  const openEditModal = (idx) => {
    const g = grants[idx];
    setEditIndex(idx);
    setEditName(g.name || "");
    setEditRole(g.role);
    setIsEditOpen(true);
  };

  const closeEditModal = () => {
    setIsEditOpen(false);
    setEditIndex(-1);
    setEditName("");
    setEditRole("STAFF");
  };

  const onSaveEdit = async () => {
    if (editIndex < 0) return;
    const g = grants[editIndex];
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      if (
        (editName || "").trim() &&
        editName.trim() !== (g.name || "").trim()
      ) {
        await run(() => registry.setDisplayNameFor(g.account, editName.trim()));
      }

      if (g.role !== "ADMIN" && editRole !== g.role) {
        const oldRole = await getRoleBytes(registry, g.role);
        const newRole = await getRoleBytes(registry, editRole);
        if (!newRole) throw new Error("Invalid target role");
        if (oldRole) await run(() => registry.revokeRole(oldRole, g.account));
        if (editRole === "STAFF")
          await run(() => registry.grantShipperRole(g.account));
        else if (editRole === "PACKER")
          await run(() => registry.grantPackerRole(g.account));
        else if (editRole === "CARRIER")
          await run(() => registry.grantCarrierRole(g.account));
        else if (editRole === "BUYER")
          await run(() => registry.grantBuyerRole(g.account));
      }

      await loadGranted();
      closeEditModal();
      setStatus("Updated successfully");
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e.reason || e.message));
    }
  };

  const onUpdateGrantCard = async (idx) => {
    const g = grants[idx];
    try {
      setStatus("Updating...");
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );

      // update name if provided
      if ((g.name || "").trim().length > 0) {
        await run(() => registry.setDisplayNameFor(g.account, g.name.trim()));
      }

      // update role if changed and not ADMIN
      if (g.role !== "ADMIN" && g.originalRole && g.originalRole !== g.role) {
        const oldRole = await getRoleBytes(registry, g.originalRole);
        const newRole = await getRoleBytes(registry, g.role);
        if (!newRole) throw new Error("Invalid target role");
        if (oldRole) {
          await run(() => registry.revokeRole(oldRole, g.account));
        }
        if (g.role === "STAFF")
          await run(() => registry.grantShipperRole(g.account));
        else if (g.role === "PACKER")
          await run(() => registry.grantPackerRole(g.account));
        else if (g.role === "CARRIER")
          await run(() => registry.grantCarrierRole(g.account));
        else if (g.role === "BUYER")
          await run(() => registry.grantBuyerRole(g.account));
      }
      await loadGranted();
      setStatus("Updated successfully");
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e.reason || e.message));
    }
  };

  const onRevokeGrantCard = async (idx) => {
    const g = grants[idx];
    if (g.role === "ADMIN") {
      return setStatus("Cannot revoke ADMIN role from this view");
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const registry = getContract(
        "ShipmentRegistry",
        ShipmentRegistryABI.abi,
        signer,
        chainId
      );
      const ROLE = await getRoleBytes(registry, g.role);
      if (!ROLE) return setStatus("Invalid role");
      await run(() => registry.revokeRole(ROLE, g.account));
      await loadGranted();
    } catch (e) {
      console.error(e);
      setStatus("Error: " + (e.reason || e.message));
    }
  };

  return (
    <div className="p-6 mx-auto max-w-lg" style={{ color: "#000" }}>
      <h2
        className="text-2xl font-semibold mb-6 text-center"
        style={{ color: "#000" }}
      >
        Admin: Grant/Revoke Roles
      </h2>

      <div className="w-full flex justify-center">
        <table className="w-full border-collapse">
          <tbody className="w-full">
            {/* Role */}
            <tr className="border bg-white">
              <td className="p-3 font-medium">Role</td>
              <td className="p-3">
                <select
                  className="form-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="STAFF">STAFF</option>
                  <option value="PACKER">PACKER</option>
                  <option value="CARRIER">CARRIER</option>
                  <option value="BUYER">BUYER</option>
                </select>
              </td>
            </tr>

            {/* Wallet Address */}
            <tr className="border bg-white">
              <td className="p-3 font-medium">Wallet Address</td>
              <td className="p-3">
                <input
                  className="form-input"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="0x..."
                />
              </td>
            </tr>

            {/* Display Name */}
            <tr className="border bg-white">
              <td className="p-3 font-medium">Display Name</td>
              <td className="p-3">
                <input
                  className="form-input"
                  value={granteeName}
                  onChange={(e) => setGranteeName(e.target.value)}
                  placeholder="Tên sẽ lưu xuống contract khi cấp quyền"
                />
              </td>
            </tr>

            {/* Buttons */}
            <tr className="border bg-white">
              <td className="p-3 font-medium">Actions</td>
              <td className="p-3">
                <div className="flex gap-3">
                  <button className="submit-button" onClick={onGrantRole}>
                    Grant Role
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-sm text-center mt-3" style={{ color: "#000" }}>
        {status}
      </div>

      {/* Recently Granted Roles */}
      <div className="mt-6">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
          }}
        >
          <h3 className="font-semibold" style={{ color: "#000", margin: 0 }}>
            Role Management History
          </h3>
          <div className="filter-tabs" style={{ display: "flex", gap: 8 }}>
            <button
              className={
                !showAllHistory ? "action-button primary" : "action-button"
              }
              onClick={() => setShowAllHistory(false)}
              style={{ fontSize: 13 }}
            >
              Active Roles Only
            </button>
            <button
              className={
                showAllHistory ? "action-button primary" : "action-button"
              }
              onClick={() => setShowAllHistory(true)}
              style={{ fontSize: 13 }}
            >
              All History
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {(showAllHistory ? allGrants : grants).map((g, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 shadow px-4 py-3 bg-white text-black"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 space-y-1">
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <strong>Role:</strong> {g.role}
                    {showAllHistory && (
                      <span
                        className={
                          g.isActive
                            ? "status-badge active"
                            : "status-badge revoked"
                        }
                        style={{
                          padding: "2px 8px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          backgroundColor: g.isActive ? "#e8f5e9" : "#ffebee",
                          color: g.isActive ? "#2e7d32" : "#c62828",
                        }}
                      >
                        {g.isActive ? "ACTIVE" : "REVOKED"}
                      </span>
                    )}
                  </div>
                  <div className="break-all">
                    <strong>Account:</strong> {g.account}
                  </div>
                  <div>
                    <strong>Name:</strong> {g.name || "(no name set)"}
                  </div>
                  <div className="text-xs text-gray-700">
                    granted by {g.sender}{" "}
                    {g.senderName ? `(${g.senderName})` : ""}
                  </div>
                </div>
                {(!showAllHistory || g.isActive) && (
                  <div className="flex flex-col gap-2">
                    <button
                      className="action-button"
                      onClick={() => openEditModal(i)}
                    >
                      Update
                    </button>
                    <button
                      className="action-button"
                      disabled={g.role === "ADMIN"}
                      onClick={() => onRevokeGrantCard(i)}
                    >
                      Revoke Role
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {(showAllHistory ? allGrants : grants).length === 0 && (
            <div className="text-sm text-gray-700 text-center">
              No records yet or logs not readable.
            </div>
          )}
        </div>
      </div>
      {isEditOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeEditModal}
          />
          <div className="relative bg-white text-black rounded-lg shadow-lg w-full max-w-md p-6">
            <h4 className="text-lg font-semibold mb-4">Edit Grant</h4>
            {editIndex >= 0 && (
              <>
                <div className="mb-3">
                  <div className="text-sm text-gray-700 mb-1">Account</div>
                  <div className="text-sm break-all">
                    {grants[editIndex].account}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="text-sm text-gray-700 mb-1">Role</div>
                  {grants[editIndex].role === "ADMIN" ? (
                    <div className="text-sm">ADMIN</div>
                  ) : (
                    <select
                      className="form-select"
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                    >
                      <option value="STAFF">STAFF</option>
                      <option value="PACKER">PACKER</option>
                      <option value="CARRIER">CARRIER</option>
                      <option value="BUYER">BUYER</option>
                    </select>
                  )}
                </div>
                <div className="mb-4">
                  <div className="text-sm text-gray-700 mb-1">Display Name</div>
                  <input
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="(no name set)"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button className="action-button" onClick={closeEditModal}>
                    Cancel
                  </button>
                  <button
                    className="action-button primary"
                    onClick={onSaveEdit}
                  >
                    Save
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
