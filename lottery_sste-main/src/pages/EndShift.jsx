import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import './endShift.css'
import ManagerPinModal from './ManagerPinModal'
import {
  clearManagerAccessToken,
} from '../utils/managerAccess'
import { API_BASE } from '../config/api.js'

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export default function EndShift() {
  const navigate = useNavigate()

  const [showReportsPin, setShowReportsPin] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [report, setReport] = useState(null)
  const [boxDetails, setBoxDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoggedOut, setIsLoggedOut] = useState(false)
  const [scanMessage, setScanMessage] = useState('')

  const [verificationActive, setVerificationActive] = useState(false)
  const [verificationComplete, setVerificationComplete] = useState(false)
  const [verificationLoading, setVerificationLoading] = useState(false)
  const [missingBoxes, setMissingBoxes] = useState([])
  const [verificationSummary, setVerificationSummary] = useState({
    totalBoxes: 0,
    verifiedBoxes: 0,
    remainingBoxes: 0,
  })

  const [formData, setFormData] = useState({
    instantCashes: '',
    onlineSales: '',
    onlineCashes: '',
    onlineCancels: '',
  })

  const playBeep = (type) => {
    try {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext

      if (!AudioContextClass) return

      const ctx = new AudioContextClass()
      const oscillator = ctx.createOscillator()

      oscillator.frequency.setValueAtTime(
        type === 'success' ? 800 : 300,
        ctx.currentTime
      )

      oscillator.connect(ctx.destination)
      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.1)
    } catch (error) {
      console.warn('Unable to play scanner sound:', error)
    }
  }

  const formatMoney = (value) => {
    const num = parseFloat(value || 0)
    return `$${num.toFixed(2)}`
  }

  const applyVerificationData = (data = {}) => {
    const totalBoxes = Number(
      data.totalBoxes ?? data.totalVerificationBoxes ?? 0
    )

    const remainingBoxes = Number(
      data.remainingBoxes ?? data.remainingVerificationBoxes ?? 0
    )

    const verifiedBoxes = Number(
      data.verifiedBoxes ??
        data.verifiedVerificationBoxes ??
        Math.max(totalBoxes - remainingBoxes, 0)
    )

    setVerificationActive(Boolean(data.verificationActive))
    setVerificationComplete(
      Boolean(data.complete ?? data.verificationComplete)
    )
    setVerificationSummary({
      totalBoxes,
      verifiedBoxes,
      remainingBoxes,
    })
    setMissingBoxes(data.missingBoxes || [])
  }

  const fetchTodayReport = async (resetForm = true) => {
    try {
      setMessage('')

      const response = await axios.get(`${API_BASE}/end-shift/`, {
        headers: getAuthHeaders(),
      })

      const preview = response.data || {}

      setReport(preview)
      setBoxDetails(preview.boxDetails || [])

      if (resetForm) {
        setFormData({
          instantCashes: preview.instantCashes ?? '',
          onlineSales: preview.onlineSales ?? '',
          onlineCashes: preview.onlineCashes ?? '',
          onlineCancels: preview.onlineCancels ?? '',
        })
      }

      if (preview.verificationActive) {
        applyVerificationData(preview)
      }
    } catch (error) {
      console.error('Error fetching end shift preview:', error)
      setMessage(
        error.response?.data?.error ||
          'Failed to load end shift data'
      )
    }
  }

  const fetchVerificationStatus = async () => {
    try {
      const response = await axios.get(
        `${API_BASE}/end-shift/verification/status/`,
        {
          headers: getAuthHeaders(),
        }
      )

      applyVerificationData(response.data || {})
    } catch (error) {
      console.error('Failed to load verification status:', error)
    }
  }

  const handleStartVerification = async () => {
    try {
      setVerificationLoading(true)
      setScanMessage('')
      setMessage('')

      const response = await axios.post(
        `${API_BASE}/end-shift/verification/start/`,
        {},
        {
          headers: getAuthHeaders(),
        }
      )

      const data = response.data || {}
      const totalBoxes = Number(data.totalBoxes) || 0

      setVerificationActive(totalBoxes > 0)
      setVerificationComplete(totalBoxes === 0)
      setVerificationSummary({
        totalBoxes,
        verifiedBoxes: 0,
        remainingBoxes: Number(data.remainingBoxes) || totalBoxes,
      })
      setMissingBoxes(data.expectedBoxes || [])

      if (totalBoxes === 0) {
        playBeep('success')
        setScanMessage(
          'There are no active boxes to verify. You can save the shift report.'
        )
      } else {
        setScanMessage(
          `Verification started. Scan from Box ${
            data.expectedBoxes?.[0]?.boxNum || '1'
          }. ${totalBoxes} boxes must be verified.`
        )
      }
    } catch (error) {
      playBeep('error')
      setScanMessage(
        error.response?.data?.error ||
          'Failed to start ticket verification.'
      )
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleCompleteVerification = async () => {
    try {
      setVerificationLoading(true)
      setScanMessage('')

      const response = await axios.post(
        `${API_BASE}/end-shift/verification/complete/`,
        {},
        {
          headers: getAuthHeaders(),
        }
      )

      const data = response.data || {}
      const remainingBoxes = Number(data.remainingBoxes) || 0

      setMissingBoxes(data.missingBoxes || [])
      setVerificationSummary((previous) => ({
        ...previous,
        remainingBoxes,
        verifiedBoxes: data.complete
          ? previous.totalBoxes
          : Math.max(previous.totalBoxes - remainingBoxes, 0),
      }))

      if (data.complete) {
        playBeep('success')
        setVerificationActive(false)
        setVerificationComplete(true)
        setScanMessage('All active ticket boxes were verified successfully.')
      } else {
        playBeep('error')
        setVerificationComplete(false)
        setScanMessage(
          'Some boxes were not verified. Scan those boxes or mark their packs sold.'
        )
      }
    } catch (error) {
      playBeep('error')
      setScanMessage(
        error.response?.data?.error ||
          'Failed to complete ticket verification.'
      )
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleVerificationMarkSold = async (missingBox) => {
    try {
      setVerificationLoading(true)
      setScanMessage('')

      const response = await axios.post(
        `${API_BASE}/inventory-books/${missingBox.inventoryBookId}/mark-sold/`,
        {},
        {
          headers: getAuthHeaders(),
        }
      )

      playBeep('success')

      await Promise.all([
        fetchTodayReport(false),
        fetchVerificationStatus(),
      ])

      setScanMessage(
        response.data?.message ||
          `Box ${missingBox.boxNum} was marked sold and resolved.`
      )
    } catch (error) {
      playBeep('error')
      setScanMessage(
        error.response?.data?.error ||
          'Failed to mark this pack sold.'
      )
    } finally {
      setVerificationLoading(false)
    }
  }

  const handleManualEndShiftScan = async (rawBarcode) => {
    try {
      setScanMessage('')

      const response = await fetch(`${API_BASE}/end-shift/scan/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ raw_barcode: rawBarcode }),
      })

      const data = await response.json()

      if (!response.ok) {
        playBeep('error')
        throw new Error(data.error || 'Invalid input')
      }

      playBeep('success')

      setReport((previous) => ({
        ...(previous || {}),
        instantSales:
          data.instantSales ||
          previous?.instantSales ||
          '0.00',
      }))

      setBoxDetails(data.boxDetails || [])

      if (data.verificationActive) {
        const remainingBoxes = Number(
          data.remainingVerificationBoxes
        ) || 0

        setVerificationActive(true)
        setVerificationComplete(
          Boolean(data.verificationComplete)
        )
        setMissingBoxes(data.missingBoxes || [])
        setVerificationSummary((previous) => ({
          ...previous,
          remainingBoxes,
          verifiedBoxes: Math.max(
            previous.totalBoxes - remainingBoxes,
            0
          ),
        }))

        setScanMessage(
          `Box ${data.scannedBoxNum} verified. ` +
            `${remainingBoxes} box${remainingBoxes === 1 ? '' : 'es'} remaining.`
        )
      } else {
        setScanMessage(
          data.delta_count === 0
            ? 'No change. Current number already matched.'
            : `Updated current number to ${data.current_count}.`
        )
      }
    } catch (error) {
      playBeep('error')
      console.error('Error scanning on end shift page:', error)
      setScanMessage(error.message || 'Invalid input')
    }
  }

  useEffect(() => {
    let buffer = ''
    let timeoutId = null

    const processBuffer = () => {
      const scannedValue = buffer.trim()
      buffer = ''

      if (!scannedValue) return

      console.log('Processing scanner buffer:', scannedValue)

      if (/^\d{11,30}$/.test(scannedValue)) {
        handleManualEndShiftScan(scannedValue)
      } else {
        setScanMessage(
          `Unrecognized format: "${scannedValue}" (${scannedValue.length} characters)`
        )
      }
    }

    const handleGlobalKeyDown = (event) => {
      const activeElement = document.activeElement
      const tag = activeElement?.tagName?.toLowerCase()
      const isTypingInInput =
        tag === 'input' ||
        tag === 'textarea' ||
        activeElement?.isContentEditable

      if (isTypingInInput) return

      if (event.key === 'Enter') {
        event.preventDefault()
        clearTimeout(timeoutId)
        processBuffer()
        return
      }

      if (/^\d$/.test(event.key)) {
        event.preventDefault()
        buffer += event.key

        clearTimeout(timeoutId)
        timeoutId = setTimeout(processBuffer, 120)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      clearTimeout(timeoutId)
    }
  }, [])

  const handleInputChange = (field, value) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const handleSave = async () => {
    if (
      verificationActive &&
      !verificationComplete
    ) {
      playBeep('error')

      setMessage(
        'Ticket verification has already started. ' +
        'Complete the verification before saving the shift report.'
      )

      return
    }

    try {
      setSaveLoading(true)
      setMessage('')

      const response = await axios.post(
        `${API_BASE}/end-shift/save/`,
        {
          instantCashes: formData.instantCashes,
          onlineSales: formData.onlineSales,
          onlineCashes: formData.onlineCashes,
          onlineCancels: formData.onlineCancels,
        },
        {
          headers: getAuthHeaders(),
        }
      )

      const data = response.data
      setReport(data.report || null)

      if (data.email_error) {
        playBeep('error')
        setMessage(
          data.message ||
            'Report saved, but email failed to send.'
        )
        return
      }

      setMessage(
        data.message ||
          'Report saved successfully! Logging out...'
      )

      setIsLoggedOut(true)

      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      localStorage.removeItem('authData')
      sessionStorage.clear()

      setTimeout(() => {
        window.history.pushState(null, null, '/login')
        navigate('/login', { replace: true })
      }, 1500)
    } catch (error) {
      playBeep('error')
      console.error('Error saving report:', error)
      setMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          'Failed to save report'
      )
    } finally {
      setSaveLoading(false)
    }
  }

  const handleOpenReports = () => {
    clearManagerAccessToken('reports')
    setShowReportsPin(true)
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

  const handleCancel = () => {
    navigate('/dashboard')
  }

  useEffect(() => {
    const loadPage = async () => {
      setLoading(true)
      setScanMessage('')

      await Promise.all([
        fetchTodayReport(true),
        fetchVerificationStatus(),
      ])

      setLoading(false)
    }

    loadPage()
  }, [])

  useEffect(() => {
    if (!isLoggedOut) return

    const handlePopState = (event) => {
      event.preventDefault()
      window.history.pushState(null, null, '/login')
      navigate('/login', { replace: true })
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isLoggedOut, navigate])

  if (loading) {
    return (
      <div className="app-container">
        <div className="main-content">
          <div style={{ padding: '40px', textAlign: 'center' }}>
            <p>Loading end shift data...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <button
          className="sidebar-toggle"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
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
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
            }}
          >
            <span className="nav-icon">🎯</span>{' '}
            <span className="nav-label">Dashboard</span>
          </button>

          <button
            className="nav-item"
            onClick={() => navigate('/inventory')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
            }}
          >
            <span className="nav-icon">📦</span>{' '}
            <span className="nav-label">Inventory</span>
          </button>

          <button
            className="nav-item"
            onClick={handleOpenReports}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
            }}
          >
            <span className="nav-icon">📊</span>{' '}
            <span className="nav-label">Reports</span>
          </button>

          <button
            className="nav-item active-highlight"
            onClick={() => navigate('/activate-packs')}
            style={{
              background: 'transparent',
              color: '#1a7a6f',
              border: 'none',
            }}
          >
            <span className="nav-icon">⏱️</span>{' '}
            <span className="nav-label">Activate Packs</span>
          </button>

          <button
            className="nav-item"
            onClick={() => window.open('/live-display', '_blank')}
            style={{
              background: 'transparent',
              color: '#666',
              border: 'none',
            }}
          >
            <span className="nav-icon">📺</span>{' '}
            <span className="nav-label">Live Display</span>
          </button>

          <button
            className="nav-item"
            onClick={() => window.open('/hor-live-display', '_blank')}
            style={{
              background: 'transparent',
              color: '#666',
              border: 'none',
            }}
          >
            <span className="nav-icon">🖥️</span>{' '}
            <span className="nav-label">Horizontal Live Display</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="sidebar-link"
            onClick={handleLogout}
            style={{
              background: 'transparent',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            🚪 <span className="link-label">Logout</span>
          </button>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <h2>End Shift</h2>
          </div>
        </div>

        {message && (
          <div
            style={{
              color:
                message.toLowerCase().includes('failed') ||
                message.toLowerCase().includes('verify')
                  ? 'red'
                  : 'green',
              padding: '10px 28px',
              fontWeight: 'bold',
            }}
          >
            {message}
          </div>
        )}

        {scanMessage && (
          <div
            style={{
              color:
                scanMessage.toLowerCase().includes('invalid') ||
                scanMessage.toLowerCase().includes('not found') ||
                scanMessage.toLowerCase().includes('failed') ||
                scanMessage.toLowerCase().includes('missing') ||
                scanMessage.toLowerCase().includes('not verified')
                  ? 'red'
                  : 'green',
              padding: '10px 28px',
              fontWeight: 'bold',
            }}
          >
            {scanMessage}
          </div>
        )}

        <div className="end-shift-content">
          <div className="sales-summary">
            <div className="summary-card">
              <label>Instant Sales</label>
              <div className="summary-value">
                {formatMoney(report?.instantSales || 0)}
              </div>
            </div>

            <div className="summary-card">
              <label>Instant Cashes</label>
              <input
                type="number"
                value={formData.instantCashes}
                onChange={(event) =>
                  handleInputChange('instantCashes', event.target.value)
                }
                placeholder="Enter value"
                step="0.01"
                min="0"
              />
            </div>

            <div className="summary-card">
              <label>Online Sales</label>
              <input
                type="number"
                value={formData.onlineSales}
                onChange={(event) =>
                  handleInputChange('onlineSales', event.target.value)
                }
                placeholder="Enter value"
                step="0.01"
                min="0"
              />
            </div>

            <div className="summary-card">
              <label>Online Cashes</label>
              <input
                type="number"
                value={formData.onlineCashes}
                onChange={(event) =>
                  handleInputChange('onlineCashes', event.target.value)
                }
                placeholder="Enter value"
                step="0.01"
                min="0"
              />
            </div>

            <div className="summary-card">
              <label>Online Cancel</label>
              <input
                type="number"
                value={formData.onlineCancels}
                onChange={(event) =>
                  handleInputChange('onlineCancels', event.target.value)
                }
                placeholder="Enter value"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          <div className="verification-panel">
            <div className="verification-header">
              <div>
                <h3>
                  Verify All Active Tickets
                </h3>
                <p>
                  Start at Box 1 and scan every active ticket through the last active box.
                </p>
              </div>

              <div className="verification-actions">
                <button
                  type="button"
                  className="verification-btn verification-btn-secondary"
                  disabled={verificationLoading || verificationActive}
                  onClick={handleStartVerification}
                >
                  {verificationLoading && !verificationActive
                    ? 'Please Wait...'
                    : verificationComplete
                      ? 'Restart Verification'
                      : 'Verify All Tickets'}
                </button>

                {verificationActive && (
                  <button
                    type="button"
                    className="verification-btn verification-btn-primary"
                    disabled={verificationLoading}
                    onClick={handleCompleteVerification}
                  >
                    {verificationLoading
                      ? 'Checking...'
                      : 'Complete Verification'}
                  </button>
                )}
              </div>
            </div>

            {(verificationActive || verificationComplete) && (
              <div className="verification-metrics">
                <span className="verification-metric">
                  <small>Total Boxes</small>
                  <strong>{verificationSummary.totalBoxes}</strong>
                </span>
                <span className="verification-metric verified">
                  <small>Verified</small>
                  <strong>{verificationSummary.verifiedBoxes}</strong>
                </span>
                <span
                  className={`verification-metric ${verificationSummary.remainingBoxes > 0 ? 'remaining' : 'verified'}`}
                >
                  <small>Remaining</small>
                  <strong>{verificationSummary.remainingBoxes}</strong>
                </span>
              </div>
            )}

            {verificationComplete && (
              <div className="verification-success">
                Verification complete. The shift report can now be saved.
              </div>
            )}

            {missingBoxes.length > 0 && (
              <div className="verification-missing">
                <h4>
                  Boxes Not Yet Verified
                </h4>

                <div className="verification-table-wrap">
                  <table className="details-table verification-table">
                    <thead>
                      <tr>
                        <th>Box #</th>
                        <th>Game</th>
                        <th>Pack #</th>
                        <th>Current #</th>
                        <th>Required Action</th>
                      </tr>
                    </thead>

                    <tbody>
                      {missingBoxes.map((missingBox) => (
                        <tr key={missingBox.inventoryBookId}>
                          <td>{missingBox.boxNum}</td>
                          <td>{missingBox.game}</td>
                          <td>{missingBox.packNum}</td>
                          <td>{missingBox.currentNum}</td>
                          <td>
                            <div className="verification-required-action">
                              <span>Scan this ticket or</span>
                              <button
                                type="button"
                                className="verification-btn verification-btn-small"
                                disabled={verificationLoading}
                                onClick={() =>
                                  handleVerificationMarkSold(missingBox)
                                }
                              >
                                Mark Sold
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="sales-by-game-section">
            <h3>Sales by Game and Pack #</h3>

            <div className="table-container">
              <table className="details-table">
                <thead>
                  <tr>
                    <th>Box #</th>
                    <th>Game</th>
                    <th>Start #</th>
                    <th>End #</th>
                    <th>Value</th>
                    <th>Total</th>
                    <th>Current Status</th>
                    <th>Verification</th>
                  </tr>
                </thead>

                <tbody>
                  {boxDetails.length > 0 ? (
                    boxDetails.map((detail) => (
                      <tr key={detail.id}>
                        <td>{detail.boxNum}</td>
                        <td>{detail.game}</td>
                        <td>{detail.startNum}</td>
                        <td>{detail.endNum}</td>
                        <td>{detail.value}</td>
                        <td>{detail.total}</td>
                        <td>
                          <span
                            className={`status-badge ${(
                              detail.status || 'Active'
                            ).toLowerCase()}`}
                          >
                            {detail.status || 'Active'}
                          </span>
                        </td>
                        <td>
                          {detail.status !== 'Active' ? (
                            <span style={{ color: '#666' }}>Resolved</span>
                          ) : detail.verificationResolved ? (
                            <span
                              style={{
                                color: '#16856f',
                                fontWeight: 'bold',
                              }}
                            >
                              ✓ Verified
                            </span>
                          ) : verificationActive ? (
                            <span
                              style={{
                                color: '#c62828',
                                fontWeight: 'bold',
                              }}
                            >
                              Pending
                            </span>
                          ) : (
                            <span style={{ color: '#666' }}>Not started</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan="8"
                        style={{
                          textAlign: 'center',
                          padding: '20px',
                        }}
                      >
                        No box details available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="end-shift-actions">
          <button
            className="btn btn-cancel"
            onClick={handleCancel}
          >
            Cancel
          </button>

          <button
            className="btn btn-save"
            onClick={handleSave}
            disabled={
              saveLoading ||
              isLoggedOut ||
              (
                verificationActive &&
                !verificationComplete
              )
            }
            title={
              verificationActive &&
              !verificationComplete
                ? (
                    'Complete the ticket verification ' +
                    'before saving the shift report.'
                  )
                : ''
            }
          >
            {saveLoading
              ? 'Saving...'
              : 'Save Shift Report'}
          </button>
        </div>

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
      </div>
    </div>
  )
}
