import { useState } from "react";
import ConnectWallet from "./components/ConnectWallet";
import Dashboard from "./pages/Dashboard";
import ShipperPanel from "./pages/ShipperPanel";
import CarrierPanel from "./pages/CarrierPanel";
import BuyerPanel from "./pages/BuyerPanel";
import "./App.css";

function App() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "shipper", label: "Shipper Panel", icon: "📦" },
    { id: "carrier", label: "Carrier Panel", icon: "🚚" },
    { id: "buyer", label: "Buyer Panel", icon: "💰" },
  ];

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
      </nav>

      <main className="app-main">
        <div className="content-container">
          {activeTab === "dashboard" && (
            <Dashboard account={account} chainId={chainId} />
          )}
          {activeTab === "shipper" && (
            <ShipperPanel account={account} chainId={chainId} />
          )}
          {activeTab === "carrier" && (
            <CarrierPanel account={account} chainId={chainId} />
          )}
          {activeTab === "buyer" && (
            <BuyerPanel account={account} chainId={chainId} />
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
