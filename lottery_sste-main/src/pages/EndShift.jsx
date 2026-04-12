import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../App.css'
import './endShift.css'

const API_BASE = 'http://127.0.0.1:8000/api'

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

  const fetchTodayReport = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_BASE}/reports/`)
      const reports = response.data
      
      if (reports.length > 0) {
        // Get today's report (last one)
        const todayReport = reports[reports.length - 1]
        setReport(todayReport)
        setFormData({
          instantCashes: todayReport.instantCashes ?? '',
          onlineSales: todayReport.onlineSales ?? '',
          onlineCashes: todayReport.onlineCashes ?? '',
          onlineCancels: todayReport.onlineCancels ?? '',
        })
        
        // Fetch box details
        await fetchBoxDetails(todayReport.id)
      }
    } catch (error) {
      console.error('Error fetching report:', error)
      setMessage('Failed to load end shift data')
    } finally {
      setLoading(false)
    }
  }

  const fetchBoxDetails = async (reportId) => {
    try {
      const response = await axios.get(`${API_BASE}/reports/${reportId}/box-details/`)
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

  const handleMarkSold = async (inventoryBookId) => {
    try {
      setMessage('')

      const response = await fetch(`${API_BASE}/inventory-books/${inventoryBookId}/mark-sold/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to mark pack as sold')
      }

      setMessage('Pack marked as sold successfully!')
      
      // Refresh box details
      if (report) {
        await fetchBoxDetails(report.id)
      }
    } catch (error) {
      console.error('Error marking sold:', error)
      setMessage(error.message || 'Failed to mark pack as sold')
    }
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
      })

      setReport(response.data)
      setMessage('Report saved successfully! Logging out...')
      
      // Mark as logged out to prevent back navigation
      setIsLoggedOut(true)

      // Clear any stored user data (tokens, user info, etc.)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      localStorage.removeItem('authData')
      sessionStorage.clear()
      
      // Clear browser history and redirect
      setTimeout(() => {
        // Push login page to history to prevent going back to end-shift
        window.history.pushState(null, null, '/login')
        navigate('/login', { replace: true })
      }, 1500)
    } catch (error) {
      console.error('Error saving report:', error)
      setMessage('Failed to save report')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleCancel = () => {
    navigate('/dashboard')
  }

  useEffect(() => {
    fetchTodayReport()
  }, [])

  // Prevent browser back button after logout
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

  const formatMoney = (value) => {
    const num = parseFloat(value || 0)
    return `$${num.toFixed(2)}`
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
          <a href="#" className="sidebar-link">🚪 <span className="link-label">Logout</span></a>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <h2>End Shift</h2>
          </div>
          <div className="header-right">
            <button className="header-btn get-report-btn" onClick={handleSave} disabled={saveLoading}>
              {saveLoading ? 'Saving...' : 'Get Report'}
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
          {/* Sales Summary Cards */}
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

          {/* Sales by Game and Pack */}
          <div className="sales-by-game-section">
            <h3>Sales by Game and Pack #</h3>
            
            {/* Active Items */}
            {boxDetails.filter(d => (d.closing_status || 'Active').toLowerCase() === 'active').length > 0 && (
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
                    {boxDetails
                      .filter(d => (d.closing_status || 'Active').toLowerCase() === 'active')
                      .map((detail, index) => (
                        <tr key={index} className="active-row">
                          <td>
                            <span className="box-number">{detail.box_num || '-'}</span>
                          </td>
                          <td>{detail.lottery_name || '-'}</td>
                          <td>{detail.start_num || 0}</td>
                          <td>{detail.current_num || 0}</td>
                          <td>{formatMoney(detail.ticket_value || 0)}</td>
                          <td>{formatMoney(detail.total_amount || 0)}</td>
                          <td className="actions">
                            <button
                              className="mark-sold-text"
                              onClick={() => handleMarkSold(detail.inventory_book)}
                            >
                              Mark Sold
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Sold Items */}
            {boxDetails.filter(d => (d.closing_status || 'Active').toLowerCase() === 'sold').length > 0 && (
              <>
                <div className="sold-section-header">Sold Items</div>
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
                      {boxDetails
                        .filter(d => (d.closing_status || 'Active').toLowerCase() === 'sold')
                        .map((detail, index) => (
                          <tr key={index} className="sold-row">
                            <td>
                              <span className="box-number">{detail.box_num || '-'}</span>
                            </td>
                            <td>{detail.lottery_name || '-'}</td>
                            <td>{detail.start_num || 0}</td>
                            <td>{detail.current_num || 0}</td>
                            <td>{formatMoney(detail.ticket_value || 0)}</td>
                            <td>{formatMoney(detail.total_amount || 0)}</td>
                            <td>
                              <span className={`status-badge ${(detail.closing_status || 'active').toLowerCase()}`}>
                                {detail.closing_status || 'Active'}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {boxDetails.length === 0 && (
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
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                        No box details available
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Action Buttons */}
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
    </div>
  )
}
