import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../App.css'
import './inventory.css'
import './activatePacks.css'
import axios from 'axios'
import ManagerPinModal from './ManagerPinModal'
import {getManagerProtectedHeaders, clearManagerAccessToken } from '../utils/managerAccess'
import { API_BASE } from '../config/api.js'

const getBoxSortValue = (boxNum) => {
  const parsed = Number.parseInt(boxNum, 10)
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed
}

const parseCurrency = (value) => (
  parseFloat(String(value || '$0').replace(/[$,]/g, '')) || 0
)

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}
export default function ActivatePacks() {
  const navigate = useNavigate()
  const [showReportsPin, setShowReportsPin] =
  useState(false)
  const [searchText, setSearchText] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [showActivationPin, setShowActivationPin] = useState(false)
  const [scanBarcode, setScanBarcode] = useState('')
  const [reverseMode, setReverseMode] = useState(false)
  const [activatedItems, setActivatedItems] = useState([])
  const [packs, setPacks] = useState([])
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [selectedBox, setSelectedBox] = useState('')
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [moveTargetBox, setMoveTargetBox] = useState('')
  const [selectedMovePack, setSelectedMovePack] = useState(null)
  const [moveError, setMoveError] = useState('')
  const [moveLoading, setMoveLoading] = useState(false)
  const scanInputRef = useRef(null)

  const clearScanInput = () => {
    setScanBarcode('')
    setTimeout(() => scanInputRef.current?.focus(), 0)
  }

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('blinkingTicketPrice')
    localStorage.removeItem('luckyTicketsAnimation')
    localStorage.removeItem('newTicketsAnimation')
    localStorage.removeItem('endingTicketsAnimation')
    localStorage.removeItem('reloadLiveDisplay')
    clearManagerAccessToken('reports')

    navigate('/login')
  }

  const handleOpenReports = () => {
    clearManagerAccessToken('reports')
    setShowReportsPin(true)
  }

  const playBeep = (type) => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();

    if (type === "success") {
      oscillator.frequency.setValueAtTime(800, ctx.currentTime); // higher tone
    } else {
      oscillator.frequency.setValueAtTime(300, ctx.currentTime); // lower tone
    }

    oscillator.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.1);
  };

  const fetchActivatedPacks = async () => {
    try {
      const response = await fetch(`${API_BASE}/activated-books/`, {
        headers: getAuthHeaders(),
      })
      if (!response.ok) {
        throw new Error('Failed to fetch activated packs')
      }
      const data = await response.json()

      const formatted = data.map((item) => ({
        id: item.id,
        image: item.image,
        name: item.name,
        currentNum: item.currentNum || 0,
        lastTicket: item.lastTicket || 0,
        totalTickets: item.totalTickets || 0,
        gameNum: item.gameNum,
        packNum: item.packNum,
        dateUpdated: item.dateUpdated,
        value: item.value,
        totalValue: item.totalValue,
        reversed: item.reversed,
        boxNum: item.boxNum,
      }))

      setPacks(formatted)
      setActivatedItems(formatted)
    } catch (error) {
      console.error(error)
    }
  }

  const handleOpenMoveModal = (pack) => {
    setSelectedMovePack(pack)
    setMoveTargetBox('')
    setMoveError('')
    setShowMoveModal(true)
  }

  const handleCloseMoveModal = () => {
    setShowMoveModal(false)
    setMoveTargetBox('')
    setSelectedMovePack(null)
    setMoveError('')
  }

  const handlePause = async (packId) => {
    try {
      const response = await axios.post(
        `${API_BASE}/pause-pack/${packId}/`,
        {},
        {
          headers: getAuthHeaders(),
        }
      )

      // Tell the Inventory page that its data changed.
      localStorage.setItem(
        'inventoryNeedsRefresh',
        '1'
      )

      setScanMessage(
        response.data?.message ||
        'Pack paused and returned successfully.'
      )

      // Remove immediately from Activate Packs page.
      setPacks((previousPacks) =>
        previousPacks.filter(
          (pack) => pack.id !== packId
        )
      )

      setActivatedItems((previousItems) =>
        previousItems.filter(
          (pack) => pack.id !== packId
        )
      )

      // Confirm the latest backend state.
      await fetchActivatedPacks()
    } catch (error) {
      console.error('Pause failed', error)

      setScanMessage(
        error.response?.data?.error ||
        'Failed to pause pack.'
      )
    }
  }

  const moveBoxOptions = useMemo(() => {
    if (!selectedMovePack) return []

    return [...Array(70)]
      .map((_, i) => String(i + 1))
      .filter((box) => box !== String(selectedMovePack.boxNum))
  }, [selectedMovePack])

  const handleMovePack = async () => {
    if (!selectedMovePack) return

    if (!moveTargetBox) {
      setMoveError('Please select a target box.')
      return
    }

    try {
      setMoveLoading(true)
      setMoveError('')

      const response = await fetch(`${API_BASE}/activated-books/${selectedMovePack.id}/move/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ target_box: moveTargetBox }),
      })

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      let data = {}
      if (contentType.includes('application/json')) {
        data = JSON.parse(rawText)
      } else {
        throw new Error(`Server error (${response.status}).`)
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to move pack')
      }

      setScanMessage(data.message || 'Pack moved successfully')
      handleCloseMoveModal()
      await fetchActivatedPacks()
    } catch (error) {
      setMoveError(error.message || 'Failed to move pack')
    } finally {
      setMoveLoading(false)
    }
  }

  const handleTicketScan = async (rawBarcode) => {
    try {
      const response = await fetch(`${API_BASE}/tickets/scan/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ raw_barcode: rawBarcode }),
      })

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      let data = {}
      if (contentType.includes('application/json')) {
        data = JSON.parse(rawText)
      } else {
        playBeep("error")
        throw new Error(`Server error (${response.status}).`)
      }
      if (response.ok){
        playBeep("Success")
      }

      if (!response.ok) {
        playBeep("error")
        throw new Error(data.error || 'Invalid input')
      }

      setScanMessage(
        data.pack_sold
          ? 'Pack sold successfully and removed from active boxes'
          : `Ticket ${data.ticket_number} scanned successfully`
      )

      await fetchActivatedPacks()
    } catch (error) {
      setScanMessage(error.message || 'Invalid input')
    }
  }

useEffect(() => {
  let buffer = ''
  let timeoutId = null

  const handleGlobalKeyDown = (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase()
    const isTypingInInput =
      tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

    // Skip if modal is open or user is typing in an input
    if (showActivateModal || isTypingInInput) return

    // Still support Enter if scanner sends it
    if (e.key === 'Enter') {
      clearTimeout(timeoutId)
      const scannedValue = buffer.trim()
      console.log('Enter triggered, buffer:', scannedValue)
      if (/^\d{12,30}$/.test(scannedValue)) {
        handleTicketScan(scannedValue)
      }
      buffer = ''
      return
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault()
      buffer += e.key
      console.log('Buffer so far:', buffer)

      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => {
        const scannedValue = buffer.trim()
        console.log('Timeout triggered, buffer:', scannedValue)
        if (/^\d{12,30}$/.test(scannedValue)) {
          handleTicketScan(scannedValue)
        } else if (scannedValue.length > 0) {
          setScanMessage(`Unrecognized format: "${scannedValue}" (${scannedValue.length} chars)`)
        }
        buffer = ''
      }, 100)
    }
  }

  window.addEventListener('keydown', handleGlobalKeyDown)
  return () => {
    window.removeEventListener('keydown', handleGlobalKeyDown)
    clearTimeout(timeoutId)
  }
}, [showActivateModal]) // ✅ only showActivateModal needed — buffer is plain let
  useEffect(() => {
    fetchActivatedPacks()
  }, [])

  const openActivationForm = () => {
    setShowActivateModal(true)
    setScanBarcode('')
    setReverseMode(false)
    setErrorMessage('')
    setSelectedBox('')
  }

  const handleOpenModal = () => {
    setShowActivationPin(true)
  }

  const handleCloseModal = () => {
    clearManagerAccessToken('activation')
    setShowActivateModal(false)
    setScanBarcode('')
    setReverseMode(false)
    setErrorMessage('')
    setSelectedBox('')
  }

  const handleReverseModeChange = (e) => {
    const isEnabled = e.target.checked
    setReverseMode(isEnabled)
    console.log(isEnabled ? 1 : 0)
  }

  const handleActivatePack = async () => {
    const barcodeValue = String(scanBarcode || '').trim()
    const boxValue = String(selectedBox || '').trim()

    if (!barcodeValue) {
      playBeep("error")
      setErrorMessage('Barcode is required.')
      clearScanInput()
      return
    }

    if (!boxValue) {
      playBeep("error")
      setErrorMessage('Box number is required.')
      return
    }

    try {
      setLoading(true)
      setErrorMessage('')

      const response = await fetch(`${API_BASE}/activated-books/activate/`, {
        method: 'POST',
        headers: getManagerProtectedHeaders('activation'),
        body: JSON.stringify({
          raw_barcode: barcodeValue,
          reverse_mode: reverseMode,
          box_num: boxValue,
        }),
      })

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      let data = {}
      if (contentType.includes('application/json')) {
        data = JSON.parse(rawText)
      } else {
        playBeep("error")
        throw new Error(`Server error (${response.status}).`)
      }

      if (response.ok){
        playBeep("success")
      }
      if (!response.ok) {
        playBeep("error")
        throw new Error(data.error || 'Failed to activate pack')
      }

      // clearManagerAccessToken('activation')
      setScanBarcode('')
      setReverseMode(false)
      setSelectedBox('')
      setScanMessage(reverseMode ? 'Sold pack restored successfully' : 'Pack activated successfully')
      localStorage.setItem('inventoryNeedsRefresh', '1')
      await fetchActivatedPacks()
      clearScanInput()
    } catch (error) {
      playBeep("error")
      setErrorMessage(error.message || 'Failed to activate pack')
      clearScanInput()
    } finally {
      setLoading(false)
    }
  }

  const filteredPacks = useMemo(() => {
    return packs
      .filter(pack =>
        String(pack.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
        String(pack.gameNum || '').includes(searchText) ||
        String(pack.packNum || '').includes(searchText)
      )
      .sort((a, b) => getBoxSortValue(a.boxNum) - getBoxSortValue(b.boxNum))
  }, [packs, searchText])

  const totalPackCount = packs.length

  const totalPackValue = useMemo(() => {
    const total = packs.reduce((sum, item) => {
      const ticketValue = parseCurrency(item.value)
      const totalTickets = Number(item.totalTickets) || 0
      const currentCount = Number(item.currentNum) || 0
      const remainingTickets = Math.max(totalTickets - currentCount, 0)

      return sum + (remainingTickets * ticketValue)
    }, 0)

    return total.toFixed(2)
  }, [packs])

  const availableBoxes = useMemo(() => {
    const usedBoxes = new Set(
      packs.map((pack) => String(pack.boxNum))
    )

    return [...Array(70)]
      .map((_, i) => String(i + 1))
      .filter((box) => !usedBoxes.has(box))
  }, [packs])

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
          <button 
            className="nav-item"
            onClick={() => navigate('/dashboard')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">🎯</span> <span className="nav-label">Dashboard</span>
          </button>
          <button
            className="nav-item"
            onClick={() => navigate('/inventory')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">📦</span> <span className="nav-label">Inventory</span>
          </button>
          <button
            className="nav-item"
            onClick={
              handleOpenReports
            }
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">📊</span> <span className="nav-label">Reports</span>
          </button>
          <button 
            className="nav-item active-highlight"
            onClick={() => navigate('/activate-packs')}
            style={{ background: 'transparent', border: 'none', color: '#1a7a6f' }}
          >
            <span className="nav-icon">⏱️</span> <span className="nav-label">Activate Packs</span>
          </button>
          <button 
            className="nav-item"
            onClick={() => window.open('/live-display', '_blank')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">📺</span> <span className="nav-label">Live Display</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          {/* <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a> */}
          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', textAlign: 'left', cursor: 'pointer' }}
          >
            🚪 <span className="link-label">Logout</span>
          </button>
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
{/* 
          <div className="header-right">
            <button className="header-icon">🔔</button>
            <button className="header-icon">⚙️</button>
            <div className="user-profile">
              <span className="user-name">Alex Curator</span>
              <span className="user-role">ADM/ADMINISTRATOR</span>
              <div className="user-avatar">A</div>
            </div>
          </div> */}
        </div>

        <div className="activate-header">
          <div className="activate-title">
            <h1>Activate Packs</h1>
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

          <button className="activate-btn" onClick={handleOpenModal}>Activate</button>
        </div>
        {scanMessage && (
          <div
            style={{
              color:
                scanMessage.toLowerCase().includes('invalid') ||
                scanMessage.toLowerCase().includes('not found') ||
                scanMessage.toLowerCase().includes('already') ||
                scanMessage.toLowerCase().includes('greater')
                  ? 'red'
                  : 'green',
              padding: '10px 28px'
            }}
          >
            {scanMessage}
          </div>
        )}
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
              {filteredPacks.length > 0 ? (
                filteredPacks.map((pack) => (
                  <tr key={pack.id}>
                    <td>{pack.boxNum}</td>
                    <td>
                      <div className="pack-image">
                        {pack.image ? (
                          <img
                            src={pack.image}
                            alt={pack.name}
                            style={{ width: '44px', height: '44px', objectFit: 'contain' }}
                          />
                        ) : (
                          '🎰'
                        )}
                      </div>
                    </td>
                    <td>{pack.name}</td>
                    <td>{pack.currentNum}</td>
                    <td>{pack.gameNum}</td>
                    <td>{pack.packNum}</td>
                    <td>{pack.dateUpdated}</td>
                    <td>
                      <div className="action-links">
                        {/* <a href="#" className="action-link">Move</a> */}
                        <button
                          className="action-link"
                          onClick={() => handleOpenMoveModal(pack)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Move
                        </button>
                        <button className="action-link" onClick={() => handlePause(pack.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>Pause</button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="no-data">No data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showMoveModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Move Pack</h2>
              <button className="modal-close" onClick={handleCloseMoveModal}>✕</button>
            </div>

            <div className="modal-content">
              <div className="activate-modal-content">
                <div className="activate-form-row">
                  <div className="activate-form-group">
                    <label>Current Box</label>
                    <input
                      type="text"
                      value={selectedMovePack ? `Box ${selectedMovePack.boxNum}` : ''}
                      className="activate-input"
                      disabled
                    />

                    <label>Target Box</label>
                    <select
                      value={moveTargetBox}
                      onChange={(e) => setMoveTargetBox(e.target.value)}
                      className="activate-input"
                    >
                      <option value="">Select Box</option>
                      {moveBoxOptions.map((box) => (
                        <option key={box} value={box}>
                          Box {box}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {moveError && (
                  <div style={{ color: 'red', marginBottom: '10px' }}>
                    {moveError}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={handleCloseMoveModal}>
                Cancel
              </button>
              <button className="modal-ok-btn" onClick={handleMovePack} disabled={moveLoading}>
                {moveLoading ? 'Moving...' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ManagerPinModal
        open={showActivationPin}
        scope="activation"
        title="Ticket Activation Authorization"
        description="Enter the store's 8-digit managerial PIN to activate a lottery pack."
        onClose={() => {
          setShowActivationPin(false)
        }}
        onAuthorized={() => {
          setShowActivationPin(false)

          setShowActivateModal(true)
          setScanBarcode('')
          setReverseMode(false)
          setErrorMessage('')
          setSelectedBox('')
        }}
      />
      <ManagerPinModal
        open={showReportsPin}
        scope="reports"
        title="Reports Authorization"
        description="Enter the store's 8-digit managerial PIN to open Reports."
        onClose={() => setShowReportsPin(false)}
        onAuthorized={() => {
          setShowReportsPin(false)
          navigate('/reports')
        }}
        />
      {showActivateModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Activate</h2>
              <button className="modal-close" onClick={handleCloseModal}>✕</button>
            </div>
            <div className="modal-content">
              <div className="activate-modal-content">
                <div className="activate-form-row">
                  <div className="activate-form-group">
                      <label>Box Number</label>
                    <select
                      value={selectedBox}
                      onChange={(e) => setSelectedBox(e.target.value)}
                      className="activate-input"
                    >
                      <option value="">Select Box</option>
                      {availableBoxes.map((box) => (
                        <option key={box} value={box}>
                          Box {box}
                        </option>
                      ))}
                    </select>
                    <label>Scan Barcode</label>
                    <input
                      ref={scanInputRef}
                      type="text"
                      placeholder="eg. Scan the barcode"
                      value={scanBarcode}
                      onChange={(e) => setScanBarcode(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleActivatePack()}
                      className="activate-input"
                      autoFocus
                    />
                    {/* <label>Box Number</label>
                    <select
                      value={selectedBox}
                      onChange={(e) => setSelectedBox(e.target.value)}
                      className="activate-input"
                    >
                      <option value="">Select Box</option>
                      {availableBoxes.map((box) => (
                        <option key={box} value={box}>
                          Box {box}
                        </option>
                      ))}
                    </select> */}
                  </div>

                  <div className="activate-form-group">
                    <label>Reverse Mode</label>
                    <div className={`toggle-switch ${reverseMode ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={reverseMode}
                        onChange={handleReverseModeChange}
                        className="toggle-input"
                      />
                      <span className="toggle-slider"></span>
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <div style={{ color: 'red', marginBottom: '10px' }}>
                    {errorMessage}
                  </div>
                )}

                <div className="activate-summary">
                  <div className="activate-price">
                    <span className="price-label">${totalPackValue}</span>
                    <span className="price-text">Total pack : {activatedItems.length}</span>
                  </div>
                  <button
                    className="activate-clear-btn"
                    onClick={() => {
                      setScanBarcode('')
                      setReverseMode(false)
                      setErrorMessage('')
                    }}
                  >
                    Clear
                  </button>
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
              <button className="modal-cancel-btn" onClick={handleCloseModal}>Cancel</button>
              <button className="modal-ok-btn" onClick={handleActivatePack} disabled={loading}>
                {loading ? 'Saving...' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
