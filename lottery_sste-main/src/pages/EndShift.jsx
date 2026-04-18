import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import './endShift.css'

// const API_BASE = 'http://127.0.0.1:8000/api'
const API_BASE = 'https://lottery.bright-core-solutions.com/api'
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

const getOnlyAuthHeader = () => {
  const token = localStorage.getItem('access_token')
  return {
    Authorization: `Bearer ${token}`,
  }
}

export default function EndShift() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [report, setReport] = useState(null)
  const [boxDetails, setBoxDetails] = useState([])
  const [loading, setLoading] = useState(true)
  const [saveLoading, setSaveLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [isLoggedOut, setIsLoggedOut] = useState(false)

  const [formData, setFormData] = useState({
    instantCashes: '',
    onlineSales: '',
    onlineCashes: '',
    onlineCancels: '',
  })

  const handleLogout = () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('blinkingTicketPrice')
    localStorage.removeItem('luckyTicketsAnimation')
    localStorage.removeItem('newTicketsAnimation')
    localStorage.removeItem('endingTicketsAnimation')
    localStorage.removeItem('reloadLiveDisplay')

    navigate('/login')
  }

  const formatMoney = (value) => {
    const num = parseFloat(value || 0)
    return `$${num.toFixed(2)}`
  }

  const fetchTodayReport = async () => {
    try {
      setLoading(true)
      setMessage('')

      const response = await axios.get(`${API_BASE}/reports/today/`, {
        headers: getAuthHeaders(),
      })
      const todayReport = response.data

      setReport(todayReport)
      setFormData({
        instantCashes: todayReport.instantCashes ?? '',
        onlineSales: todayReport.onlineSales ?? '',
        onlineCashes: todayReport.onlineCashes ?? '',
        onlineCancels: todayReport.onlineCancels ?? '',
      })

      await fetchBoxDetails(todayReport.id)
    } catch (error) {
      console.error('Error fetching today report:', error)
      setMessage(error.response?.data?.error || 'Failed to load end shift data')
    } finally {
      setLoading(false)
    }
  }

  const fetchBoxDetails = async (reportId) => {
    try {
      const response = await axios.get(`${API_BASE}/reports/${reportId}/box-details/`, {
        headers: getAuthHeaders(),
      })
      setBoxDetails(response.data)
    } catch (error) {
      console.error('Error fetching box details:', error)
      setBoxDetails([])
    }
  }

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleSave = async () => {
    if (!report) return

    try {
      setSaveLoading(true)
      setMessage('')

      const response = await axios.put(`${API_BASE}/reports/${report.id}/`, {
        instantCashes: formData.instantCashes,
        onlineSales: formData.onlineSales,
        onlineCashes: formData.onlineCashes,
        onlineCancels: formData.onlineCancels,
        }, {
        headers: getAuthHeaders(),
      })

      setReport(response.data)
      setMessage('Report saved successfully! Logging out...')

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
      console.error('Error saving report:', error)
      setMessage(error.response?.data?.error || 'Failed to save report')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDownloadReport = async () => {
    if (!report) return

    try {
      const response = await fetch(`${API_BASE}/reports/${report.id}/download/`, {
        headers: getOnlyAuthHeader(),
      })
      if (!response.ok) {
        throw new Error('Failed to download report')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reports_eod_${report.report_date}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setMessage(error.message || 'Failed to download report')
    }
  }

  const handleCancel = () => {
    navigate('/dashboard')
  }

  useEffect(() => {
    fetchTodayReport()
  }, [])

  useEffect(() => {
    if (!isLoggedOut) return

    const handlePopState = (event) => {
      event.preventDefault()
      window.history.pushState(null, null, '/login')
      navigate('/login', { replace: true })
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
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
            onClick={() => navigate('/reports')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">📊</span> <span className="nav-label">Reports</span>
          </button>
          <button
            className="nav-item active-highlight"
            onClick={() => navigate('/activate-packs')}
            style={{ background: 'transparent', color: '#1a7a6f', border: 'none' }}
          >
            <span className="nav-icon">⏱️</span> <span className="nav-label">Activate Packs</span>
          </button>
          <button
            className="nav-item"
            onClick={() => window.open('/live-display', '_blank')}
            style={{ background: 'transparent', color: '#666', border: 'none' }}
          >
            <span className="nav-icon">📺</span> <span className="nav-label">Live Display</span>
          </button>
        </nav>
        <div className="sidebar-footer">
          <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a>
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
            <h2>End Shift</h2>
          </div>
          <div className="header-right">
            <button className="header-btn get-report-btn" onClick={handleDownloadReport}>
              Get Report
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              color: message.toLowerCase().includes('failed') ? 'red' : 'green',
              padding: '10px 28px',
              fontWeight: 'bold'
            }}
          >
            {message}
          </div>
        )}

        <div className="end-shift-content">
          <div className="sales-summary">
            <div className="summary-card">
              <label>Instant Sales</label>
              <div className="summary-value">{formatMoney(report?.instantSales || 0)}</div>
            </div>
            <div className="summary-card">
              <label>Instant Cashes</label>
              <input
                type="number"
                value={formData.instantCashes}
                onChange={(e) => handleInputChange('instantCashes', e.target.value)}
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
                onChange={(e) => handleInputChange('onlineSales', e.target.value)}
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
                onChange={(e) => handleInputChange('onlineCashes', e.target.value)}
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
                onChange={(e) => handleInputChange('onlineCancels', e.target.value)}
                placeholder="Enter value"
                step="0.01"
                min="0"
              />
            </div>
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
                          <span className={`status-badge ${(detail.status || 'Active').toLowerCase()}`}>
                            {detail.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
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
          <button className="btn btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button className="btn btn-save" onClick={handleSave} disabled={saveLoading}>
            {saveLoading ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      </div>
    </div>
  )
}