import { useState, useEffect } from "react";
import { useRole } from "./hooks/useRole";
import ConnectWallet from "./components/ConnectWallet";
import Dashboard from "./pages/Dashboard";
import ShipperPanel from "./pages/ShipperPanel";
import PackerPanel from "./pages/PackerPanel";
import CarrierPanel from "./pages/CarrierPanel";
import BuyerPanel from "./pages/BuyerPanel";
import AdminPanel from "./pages/AdminPanel";
import "./App.css";

function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const { role, loading } = useRole(account);

  // Define available tabs based on user role
  const allTabs = {
    ADMIN: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "admin", label: "Admin Panel", icon: "🛡️" },
      { id: "shipper", label: "Staff Panel", icon: "📦" },
      { id: "packer", label: "Packer Panel", icon: "📦" },
      { id: "carrier", label: "Carrier Panel", icon: "🚚" },
      { id: "buyer", label: "Buyer Panel", icon: "💰" },
    ],
    STAFF: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "shipper", label: "Staff Panel", icon: "📦" },
    ],
    PACKER: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "packer", label: "Packer Panel", icon: "📦" },
    ],
    CARRIER: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "carrier", label: "Carrier Panel", icon: "🚚" },
    ],
    BUYER: [
      { id: "dashboard", label: "Dashboard", icon: "📊" },
      { id: "buyer", label: "Buyer Panel", icon: "💰" },
    ],
    NONE: [{ id: "dashboard", label: "Dashboard", icon: "📊" }],
  };

  // Debug logging
  useEffect(() => {
    console.log("🔍 App State:", { account, role, loading, activeTab });
  }, [account, role, loading, activeTab]);

  // Auto-switch to dashboard if current tab not available for role
  useEffect(() => {
    if (!loading && role && activeTab !== "dashboard") {
      const availableTabs = allTabs[role] || [];
      const isTabAvailable = availableTabs.some((tab) => tab.id === activeTab);

      console.log("🔄 Tab availability check:", {
        role,
        activeTab,
        availableTabs: availableTabs.map((t) => t.id),
        isTabAvailable,
      });

      if (!isTabAvailable) {
        console.log("⚠️  Switching to dashboard - tab not available for role");
        setActiveTab("dashboard");
      }
    }
  }, [role, loading, activeTab, allTabs]);

  const tabs = role ? allTabs[role] : allTabs.NONE;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="logo">
            <h1>🔗 Smart Logistics</h1>
            <p className="tagline">
              Blockchain-Powered Supply Chain Management
            </p>
          </div>
          <ConnectWallet
            onAccountChange={setAccount}
            onChainIdChange={setChainId}
          />
        </div>
      </header>

      <nav className="app-nav">
        {loading ? (
          <div className="nav-loading">Loading role...</div>
        ) : (
          <>
            {role === "NONE" && account && (
              <div className="no-role-warning">
                ⚠️ No role assigned. Contact admin to grant permissions.
              </div>
            )}
            <div className="nav-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </nav>

      <main className="app-main">
        <div className="content-container">
          {activeTab === "dashboard" ? (
            <Dashboard account={account} chainId={chainId} role={role} />
          ) : activeTab === "shipper" &&
            (role === "STAFF" || role === "ADMIN") ? (
            <ShipperPanel account={account} chainId={chainId} />
          ) : activeTab === "packer" &&
            (role === "PACKER" || role === "ADMIN") ? (
            <PackerPanel account={account} chainId={chainId} />
          ) : activeTab === "carrier" &&
            (role === "CARRIER" || role === "ADMIN") ? (
            <CarrierPanel account={account} chainId={chainId} />
          ) : activeTab === "buyer" &&
            (role === "BUYER" || role === "ADMIN") ? (
            <BuyerPanel account={account} chainId={chainId} />
          ) : activeTab === "admin" && role === "ADMIN" ? (
            <AdminPanel account={account} chainId={chainId} />
          ) : (
            <div className="empty-state">
              <h3>Access Denied</h3>
              <p>You don't have permission to access this panel.</p>
              <button
                onClick={() => setActiveTab("dashboard")}
                className="btn-primary"
              >
                Go to Dashboard
              </button>
            </div>
          )}
        </div>
      </main>

      <footer className="app-footer">
        <p>© 2024 Smart Logistics - University Blockchain Project</p>
        <p className="footer-info">
          Built with Solidity • Hardhat • React • Ethers.js • IPFS
        </p>
      </footer>
    </div>
  );
}

export default App;
