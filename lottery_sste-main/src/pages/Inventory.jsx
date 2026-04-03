import React, { useEffect, useMemo, useState } from 'react'
import '../App.css'
import './inventory.css'
// import heroImg from '../assets/hero.png'

const API_BASE = 'http://127.0.0.1:8000/api'
// const sampleRows = [
//   {
//     id: 1,
//     image: heroImg,
//     name: '50 X',
//     subtitle: 'PREMIUM TIER',
//     game: 'GM-8821',
//     pack: 'PK-445',
//     value: '$5.00',
//     packSize: 60,
//     date: 'Oct 24, 2023',
//   },
//   {
//     id: 2,
//     image: heroImg,
//     name: 'EXTRA PLAY',
//     subtitle: 'FLASH SALE',
//     game: 'GM-9894',
//     pack: 'PK-112',
//     value: '$10.00',
//     packSize: 30,
//     date: 'Oct 22, 2023',
//   },
//   {
//     id: 3,
//     image: heroImg,
//     name: 'LUCKY MATCH DOUBLE',
//     subtitle: 'STANDARD',
//     game: 'GM-7742',
//     pack: 'PK-891',
//     value: '$2.00',
//     packSize: 100,
//     date: 'Oct 20, 2023',
//   },
//   {
//     id: 4,
//     image: heroImg,
//     name: 'GOLD RUSH 7s',
//     subtitle: 'LOW STOCK',
//     game: 'GM-1129',
//     pack: 'PK-883',
//     value: '$20.00',
//     packSize: 15,
//     date: 'Oct 19, 2023',
//   },
//   {
//     id: 5,
//     image: heroImg,
//     name: 'MEGA FORTUNE',
//     subtitle: 'EXCLUSIVE',
//     game: 'GM-5521',
//     pack: 'PK-234',
//     value: '$15.00',
//     packSize: 25,
//     date: 'Oct 18, 2023',
//   },
//   {
//     id: 6,
//     image: heroImg,
//     name: 'LUCKY 7s',
//     subtitle: 'CLASSIC',
//     game: 'GM-6634',
//     pack: 'PK-567',
//     value: '$5.00',
//     packSize: 60,
//     date: 'Oct 17, 2023',
//   },
//   {
//     id: 7,
//     image: heroImg,
//     name: 'DIAMOND PRIZE',
//     subtitle: 'PREMIUM',
//     game: 'GM-7745',
//     pack: 'PK-789',
//     value: '$25.00',
//     packSize: 10,
//     date: 'Oct 16, 2023',
//   },
//   {
//     id: 8,
//     image: heroImg,
//     name: 'JACKPOT PLUS',
//     subtitle: 'HOT ITEM',
//     game: 'GM-8856',
//     pack: 'PK-901',
//     value: '$10.00',
//     packSize: 40,
//     date: 'Oct 15, 2023',
//   },
// ]
export default function Inventory() {
  const [showModal, setShowModal] = useState(false)
  const [modalItems, setModalItems] = useState([])
  const [ticketInput, setTicketInput] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [inventoryRows, setInventoryRows] = useState([])
  const [searchText, setSearchText] = useState('')

  const fetchInventoryRows = async () => {
    try {
      const response = await fetch(`${API_BASE}/books/`)
      if (!response.ok) {
        throw new Error('Failed to fetch inventory books')
      }
      const data = await response.json()
      setInventoryRows(data)
      setModalItems(data)
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    fetchInventoryRows()
  }, [])

  const handleAddClick = async () => {
    setShowModal(true)
    setTicketInput('')
    setErrorMessage('')
    await fetchInventoryRows()
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setTicketInput('')
    setErrorMessage('')
  }

  const handleAddItem = async () => {
    if (!ticketInput.trim()) return

    try {
      setLoading(true)
      setErrorMessage('')

      const response = await fetch(`${API_BASE}/books/add/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw_barcode: ticketInput.trim(),
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add inventory item')
      }

      setModalItems((prev) => [data, ...prev])
      setInventoryRows((prev) => [data, ...prev])
      setTicketInput('')
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteModalItem = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/books/${id}/`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete item')
      }

      setModalItems((prev) => prev.filter(item => item.id !== id))
      setInventoryRows((prev) => prev.filter(item => item.id !== id))
    } catch (error) {
      console.error(error)
    }
  }

  const handleDeleteMainItem = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/books/${id}/`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Failed to delete item')
      }

      setInventoryRows((prev) => prev.filter(item => item.id !== id))
      setModalItems((prev) => prev.filter(item => item.id !== id))
    } catch (error) {
      console.error(error)
    }
  }

  const handleClear = () => {
    setModalItems([])
  }

  const calculateModalTotal = () => {
    return modalItems
      .reduce((sum, item) => {
        const val = parseFloat(String(item.totalValue || '$0').replace('$', '')) || 0
        return sum + val
      }, 0)
      .toFixed(2)
  }

  const filteredRows = useMemo(() => {
    let rows = [...inventoryRows]

    if (activeTab === 'recent') {
      rows = rows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    }

    if (activeTab === 'high') {
      rows = rows.filter((item) => {
        const value = parseFloat(String(item.value || '$0').replace('$', '')) || 0
        return value >= 10
      })
    }

    if (searchText.trim()) {
      const search = searchText.toLowerCase()
      rows = rows.filter((item) =>
        String(item.name || '').toLowerCase().includes(search) ||
        String(item.game || '').toLowerCase().includes(search) ||
        String(item.pack || '').toLowerCase().includes(search)
      )
    }

    return rows
  }, [inventoryRows, activeTab, searchText])

  const totalPackCount = inventoryRows.length

  const totalPackValue = useMemo(() => {
    const total = inventoryRows.reduce((sum, item) => {
      const val = parseFloat(String(item.totalValue || '$0').replace('$', '')) || 0
      return sum + val
    }, 0)

    return total.toFixed(2)
  }, [inventoryRows])

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <h1 className="logo">The Lottery System</h1>
          <p className="logo-subtitle">PREMIUM INVENTORY</p>
        </div>

        <nav className="sidebar-nav">
          <a href="#" className="nav-item active">
            <span className="nav-icon">⊞</span> <span className="nav-label">Dashboard</span>
          </a>
          <a href="#" className="nav-item active-highlight">
            <span className="nav-icon">📦</span> <span className="nav-label">Inventory</span>
          </a>
          <a href="#" className="nav-item">
            <span className="nav-icon">💰</span> <span className="nav-label">Sales</span>
          </a>
          <a href="#" className="nav-item">
            <span className="nav-icon">📊</span> <span className="nav-label">Analytics</span>
          </a>
        </nav>

        <button className="new-collection-btn">
          <span>+</span> <span className="btn-label">New Collection</span>
        </button>

        <div className="sidebar-footer">
          <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a>
          <a href="#" className="sidebar-link">🚪 <span className="link-label">Logout</span></a>
        </div>
      </div>

      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        ☰
      </button>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <input
              type="text"
              className="header-search"
              placeholder="Search Name, Gamer, or Pack#..."
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

        <div className="page-header">
          <div className="page-title">
            <h1>Inventory</h1>
            <p>Managing your luxury digital asset collections</p>
          </div>

          <div className="stats-cards">
            <div className="stat-card">
              <label>TOTAL PACK VALUE</label>
              <div className="stat-value">${totalPackValue}</div>
            </div>
            <div className="stat-card">
              <label>TOTAL PACK COUNT</label>
              <div className="stat-value">{totalPackCount}</div>
            </div>
          </div>

          <button className="add-item-btn" onClick={handleAddClick}>
            ➕ Add Item
          </button>
        </div>

        <div className="tabs">
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Items
          </button>
          <button
            className={`tab ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            Recently Added
          </button>
          <button
            className={`tab ${activeTab === 'high' ? 'active' : ''}`}
            onClick={() => setActiveTab('high')}
          >
            High Value
          </button>
        </div>

        <div className="table-container">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>#</th>
                <th>PREVIEW</th>
                <th>ITEM NAME</th>
                <th>GAME #</th>
                <th>PACK #</th>
                <th>VALUE</th>
                <th>PACK SIZE</th>
                <th>DATE ADDED</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((r, index) => (
                  <tr key={r.id}>
                    <td className="num">{String(index + 1).padStart(2, '0')}</td>
                    <td className="preview">
                      {r.image ? (
                        <img src={r.image} alt={r.name || 'preview'} />
                      ) : (
                        <div>No Image</div>
                      )}
                    </td>
                    <td className="item-name">
                      <div className="item-title">{r.name}</div>
                      <div className="item-subtitle">{r.subtitle}</div>
                    </td>
                    <td>{r.game}</td>
                    <td>{r.pack}</td>
                    <td className="value">{r.value}</td>
                    <td>{r.packSize}</td>
                    <td>{r.date}</td>
                    <td className="actions">
                      <button className="mark-sold-btn">MARK SOLD</button>
                      <button className="delete-btn" onClick={() => handleDeleteMainItem(r.id)}>🗑️</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="no-data">No data</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pagination">
            <span>Showing 1-{filteredRows.length} of {inventoryRows.length} inventory items</span>
            <div className="pagination-controls">
              <button className="page-num active">1</button>
              <button className="page-next">›</button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Add Inventory</h2>
              <button className="modal-close" onClick={handleCloseModal}>✕</button>
            </div>

            <div className="modal-content">
              <div className="modal-input-row">
                <input
                  type="text"
                  className="modal-input"
                  placeholder="enter ticket code, or scan"
                  value={ticketInput}
                  onChange={(e) => setTicketInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                />
                <button className="modal-add-btn" onClick={handleAddItem} disabled={loading}>
                  {loading ? 'Adding...' : 'Add'}
                </button>
              </div>

              {errorMessage && (
                <div style={{ color: 'red', marginBottom: '10px' }}>
                  {errorMessage}
                </div>
              )}

              <div className="modal-summary">
                <span className="modal-total">${calculateModalTotal()}</span>
                <span className="modal-pack">Total pack : {modalItems.length}</span>
                <button className="modal-clear-btn" onClick={handleClear}>Clear</button>
              </div>

              <div className="modal-table-wrap">
                <table className="modal-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Game <span className="sort-icon">⇅</span></th>
                      <th>Pack # <span className="sort-icon">⇅</span></th>
                      <th>Value</th>
                      <th>Total Value</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalItems.length > 0 ? (
                      modalItems.map((item, index) => (
                        <tr key={item.id}>
                          <td className="num">{index + 1}</td>
                          <td>{item.game}</td>
                          <td>{item.pack}</td>
                          <td>{item.value}</td>
                          <td>{item.totalValue}</td>
                          <td className="action">
                            <button onClick={() => handleDeleteModalItem(item.id)}>🗑️</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="no-data">No data</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="modal-footer">
                <button className="modal-cancel-btn" onClick={handleCloseModal}>Cancel</button>
                <button className="modal-ok-btn" onClick={handleCloseModal}>OK</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}