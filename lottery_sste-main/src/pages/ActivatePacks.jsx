import React, { useState } from 'react'
import '../App.css'
import './inventory.css'
import './activatePacks.css'

export default function ActivatePacks({ onNavigate }) {
  const [searchText, setSearchText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [scanBarcode, setScanBarcode] = useState('')
  const [boxNum, setBoxNum] = useState('')
  const [reverseMode, setReverseMode] = useState(false)
  const [activatedItems, setActivatedItems] = useState([])
  const [packs, setPacks] = useState([
    {
      id: 1,
      boxNum: '#1',
      image: '🎰',
      name: 'MAGNIFICENT JUMBO BUCKS',
      currentNum: 4,
      gameNum: 1628,
      packNum: 279132,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 2,
      boxNum: '#2',
      image: '🎰',
      name: 'MAGNIFICENT JUMBO BUCKS',
      currentNum: 29,
      gameNum: 1628,
      packNum: 295636,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 3,
      boxNum: '#3',
      image: '🎰',
      name: 'MAGNIFICENT JUMBO BUCKS',
      currentNum: 23,
      gameNum: 1628,
      packNum: 307700,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 4,
      boxNum: '#4',
      image: '🎲',
      name: '200 X',
      currentNum: 17,
      gameNum: 1665,
      packNum: 145376,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 5,
      boxNum: '#5',
      image: '🎲',
      name: '200 X',
      currentNum: 8,
      gameNum: 1665,
      packNum: 153718,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 6,
      boxNum: '#6',
      image: '🎲',
      name: '200 X',
      currentNum: 20,
      gameNum: 1665,
      packNum: 145372,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 7,
      boxNum: '#7',
      image: '💰',
      name: '$100,$200, OR $300!',
      currentNum: 6,
      gameNum: 1660,
      packNum: 38403,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 8,
      boxNum: '#8',
      image: '💰',
      name: '$100,$200, OR $300!',
      currentNum: 12,
      gameNum: 1660,
      packNum: 129894,
      dateUpdated: 'April 03, 2026',
    },
    {
      id: 9,
      boxNum: '#9',
      image: '💰',
      name: '$100,$200, OR $300!',
      currentNum: 3,
      gameNum: 1660,
      packNum: 142795,
      dateUpdated: 'April 03, 2026',
    },
  ])

  const filteredPacks = packs.filter(pack =>
    pack.name.toLowerCase().includes(searchText.toLowerCase()) ||
    pack.boxNum.toLowerCase().includes(searchText.toLowerCase()) ||
    pack.gameNum.toString().includes(searchText) ||
    pack.packNum.toString().includes(searchText)
  )

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>  
        <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          ☰
        </button>
        <div className="sidebar-header">
          <h1 className="logo">The Lottery System</h1>
          <p className="logo-subtitle">PREMIUM INVENTORY</p>
        </div>
        <nav className="sidebar-nav">
          <a href="#" className="nav-item">
            <span className="nav-icon">⊞</span> <span className="nav-label">Dashboard</span>
          </a>
          <button 
            className="nav-item"
            onClick={() => onNavigate('inventory')}
            style={{ background: 'transparent', color: '#666' }}
          >
            <span className="nav-icon">📦</span> <span className="nav-label">Inventory</span>
          </button>
          <a href="#" className="nav-item">
            <span className="nav-icon">💰</span> <span className="nav-label">Sales</span>
          </a>
          <a href="#" className="nav-item">
            <span className="nav-icon">📊</span> <span className="nav-label">Analytics</span>
          </a>
          <a href="#" className="nav-item active-highlight">
            <span className="nav-icon">⏱️</span> <span className="nav-label">Activate Packs</span>
          </a>
        </nav>
        <div className="sidebar-footer">
          <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a>
          <a href="#" className="sidebar-link">🚪 <span className="link-label">Logout</span></a>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <input
              type="text"
              className="header-search"
              placeholder="Search with Name, Box#, Current#, Game# or Pa..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>

          <div className="header-right">
            <button className="header-icon">🔔</button>
            <button className="header-icon">⚙️</button>
            <div className="user-profile">
              <span className="user-name">Alex Curator</span>
              <span className="user-role">ADM/ADMINISTRATOR</span>
              <div className="user-avatar">A</div>
            </div>
          </div>
        </div>

        <div className="activate-header">
          <div className="activate-title">
            <h1>Activate Packs</h1>
          </div>
          <button className="activate-btn" onClick={() => setShowActivateModal(true)}>Activate</button>
        </div>

        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Box #</th>
                <th>Image</th>
                <th>Name</th>
                <th>Current #</th>
                <th>Game #</th>
                <th>Pack #</th>
                <th>Date Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredPacks.map((pack) => (
                <tr key={pack.id}>
                  <td>{pack.boxNum}</td>
                  <td>
                    <div className="pack-image">{pack.image}</div>
                  </td>
                  <td>{pack.name}</td>
                  <td>{pack.currentNum}</td>
                  <td>{pack.gameNum}</td>
                  <td>{pack.packNum}</td>
                  <td>{pack.dateUpdated}</td>
                  <td>
                    <div className="action-links">
                      <a href="#" className="action-link">Move</a>
                      <a href="#" className="action-link">Pause</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showActivateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Activate</h2>
              <button className="modal-close" onClick={() => setShowActivateModal(false)}>✕</button>
            </div>
            <div className="modal-content">
              <div className="activate-modal-content">
                <div className="activate-form-row">
                  <div className="activate-form-group">
                    <label>Scan Barcode</label>
                    <input
                      type="text"
                      placeholder="eg. Scan the barcode"
                      value={scanBarcode}
                      onChange={(e) => setScanBarcode(e.target.value)}
                      className="activate-input"
                      autoFocus
                    />
                  </div>
                  <div className="activate-form-group">
                    <label>Box #</label>
                    <input
                      type="text"
                      placeholder="eg. any numeric value"
                      value={boxNum}
                      onChange={(e) => setBoxNum(e.target.value)}
                      className="activate-input"
                    />
                  </div>
                  <div className="activate-form-group">
                    <label>Reverse Mode</label>
                    <div className={`toggle-switch ${reverseMode ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={reverseMode}
                        onChange={(e) => setReverseMode(e.target.checked)}
                        className="toggle-input"
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </div>
                </div>

                <div className="activate-summary">
                  <div className="activate-price">
                    <span className="price-label">$0</span>
                    <span className="price-text">Total pack : 0</span>
                  </div>
                  <button className="activate-clear-btn">Clear</button>
                </div>

                <div className="activate-table-wrap">
                  <table className="activate-table">
                    <thead>
                      <tr>
                        <th>Box #</th>
                        <th>Name</th>
                        <th>Pack #</th>
                        <th>Reversed</th>
                        <th>Value</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activatedItems.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="no-data">
                            <div className="no-data-icon">📁</div>
                            <div>No data</div>
                          </td>
                        </tr>
                      ) : (
                        activatedItems.map((item) => (
                          <tr key={item.id}>
                            <td>{item.boxNum}</td>
                            <td>{item.name}</td>
                            <td>{item.packNum}</td>
                            <td>{item.reversed ? 'Yes' : 'No'}</td>
                            <td>{item.value}</td>
                            <td>
                              <button className="activate-delete-btn">✕</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowActivateModal(false)}>Cancel</button>
              <button className="modal-ok-btn">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
