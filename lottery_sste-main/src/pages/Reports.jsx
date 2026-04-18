import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../App.css'
import './reports.css'

const API_BASE = 'http://127.0.0.1:8000/api'
// const API_BASE = 'https://lottery.bright-core-solutions.com/api'
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

export default function Reports() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [pageMessage, setPageMessage] = useState('')
  const [detailFormData, setDetailFormData] = useState({
    onlineSales: '',
    instantCashes: '',
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

  // const boxDetails = []
  const [boxDetails, setBoxDetails] = useState([])

  const fetchReportBoxDetails = async (reportId) => {
    try {
      const response = await fetch(`${API_BASE}/reports/${reportId}/box-details/`, {
        headers: getAuthHeaders(),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch box details')
      }

      setBoxDetails(data)
    } catch (error) {
      setPageMessage(error.message || 'Failed to fetch box details')
      setBoxDetails([])
    }
  }

  const formatDisplayDate = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatMoney = (value) => {
    const num = parseFloat(value || 0)
    return `$${num.toFixed(2)}`
  }

  const fetchReports = async () => {
    try {
      setLoading(true)
      setPageMessage('')

      const response = await fetch(`${API_BASE}/reports/`, {
        headers: getAuthHeaders(),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch reports')
      }

      setReports(data)

      if (data.length > 0) {
        const sortedDates = [...data]
          .map((item) => item.report_date)
          .filter(Boolean)
          .sort()

        setStartDate(sortedDates[0] || '')
        setEndDate(sortedDates[sortedDates.length - 1] || '')
      } else {
        setStartDate('')
        setEndDate('')
      }
    } catch (error) {
      setPageMessage(error.message || 'Failed to fetch reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (!report.report_date) return false

      if (startDate && report.report_date < startDate) return false
      if (endDate && report.report_date > endDate) return false

      return true
    })
  }, [reports, startDate, endDate])

  const reportStats = useMemo(() => {
    const totals = filteredReports.reduce(
      (acc, report) => {
        acc.instantSales += parseFloat(report.instantSales || 0)
        acc.instantCashes += parseFloat(report.instantCashes || 0)
        acc.onlineSales += parseFloat(report.onlineSales || 0)
        acc.onlineCashes += parseFloat(report.onlineCashes || 0)
        return acc
      },
      {
        instantSales: 0,
        instantCashes: 0,
        onlineSales: 0,
        onlineCashes: 0,
      }
    )

    return [
      { label: 'Instant Sales', value: formatMoney(totals.instantSales), color: '#1a7a6f' },
      { label: 'Instant Cashes', value: formatMoney(totals.instantCashes), color: '#1a7a6f' },
      { label: 'Online Sales', value: formatMoney(totals.onlineSales), color: '#1a7a6f' },
      { label: 'Online Cashes', value: formatMoney(totals.onlineCashes), color: '#1a7a6f' },
    ]
  }, [filteredReports])

  const handleViewDetail = async (report) => {
    setSelectedReport(report)
    setDetailFormData({
      onlineSales: report.onlineSales ?? '0.00',
      instantCashes: report.instantCashes ?? '0.00',
      onlineCashes: report.onlineCashes ?? '0.00',
      onlineCancels: report.onlineCancels ?? '0.00',
    })
    setIsEditMode(false)
    setShowDetailModal(true)
    await fetchReportBoxDetails(report.id)
  }

  const handleCloseModal = () => {
    setShowDetailModal(false)
    setSelectedReport(null)
    setIsEditMode(false)
    setBoxDetails([])
  }

  const handleInputChange = (field, value) => {
    setDetailFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handleEditClick = () => {
    setIsEditMode(true)
  }

  const handleSaveChanges = async () => {
    if (!selectedReport) return

    try {
      setSaveLoading(true)

      const response = await fetch(`${API_BASE}/reports/${selectedReport.id}/`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          instantCashes: detailFormData.instantCashes,
          onlineSales: detailFormData.onlineSales,
          onlineCashes: detailFormData.onlineCashes,
          onlineCancels: detailFormData.onlineCancels,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save changes')
      }

      setSelectedReport(data)
      setDetailFormData({
        onlineSales: data.onlineSales ?? '0.00',
        instantCashes: data.instantCashes ?? '0.00',
        onlineCashes: data.onlineCashes ?? '0.00',
        onlineCancels: data.onlineCancels ?? '0.00',
      })

      await fetchReports()

      setIsEditMode(false)
      setPageMessage('Report updated successfully.')
    } catch (error) {
      setPageMessage(error.message || 'Failed to save changes')
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDownloadReport = async () => {
    if (!selectedReport) return

    try {
      const response = await fetch(`${API_BASE}/reports/${selectedReport.id}/download/`, {
        headers: getOnlyAuthHeader(),
      })
      if (!response.ok) {
        throw new Error('Failed to download report')
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reports_eod_${selectedReport.report_date}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (error) {
      setPageMessage(error.message || 'Failed to download report')
    }
  }

  const handleRefresh = async () => {
    await fetchReports()
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
            className="nav-item active-highlight"
            onClick={() => navigate('/reports')}
            style={{ background: 'transparent', border: 'none', color: '#1a7a6f' }}
          >
            <span className="nav-icon">📊</span> <span className="nav-label">Reports</span>
          </button>
          <button
            className="nav-item"
            onClick={() => navigate('/activate-packs')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
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
            <h2>Reports</h2>
          </div>

          <div className="header-right">
            <button className="header-btn refresh-btn" title="Reload Screen" onClick={handleRefresh}>↻</button>
            <button className="header-btn more-btn" title="More options">⋯</button>
          </div>
        </div>

        {pageMessage && (
          <div
            style={{
              color:
                pageMessage.toLowerCase().includes('failed') ||
                pageMessage.toLowerCase().includes('error')
                  ? 'red'
                  : 'green',
              padding: '10px 28px'
            }}
          >
            {pageMessage}
          </div>
        )}

        <div className="reports-content">
          <div className="reports-filter">
            <div className="date-range">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="date-input"
              />
              <span className="date-separator">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="date-input"
              />
              <button className="calendar-btn" title="Pick dates">📅</button>
            </div>
          </div>

          <div className="reports-stats">
            {reportStats.map((stat, index) => (
              <div key={index} className="report-stat-card">
                <label>{stat.label}</label>
                <div className="stat-value" style={{ color: stat.color }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          <div className="reports-table-container">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date Created</th>
                  <th>Instant Sales</th>
                  <th>Instant Cashes</th>
                  <th>Online Sales</th>
                  <th>Online Cashes</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((row, index) => (
                  <tr key={row.id}>
                    <td className="row-num">{index + 1}</td>
                    <td>{formatDisplayDate(row.date)}</td>
                    <td>{formatMoney(row.instantSales)}</td>
                    <td>{formatMoney(row.instantCashes)}</td>
                    <td>{formatMoney(row.onlineSales)}</td>
                    <td>{formatMoney(row.onlineCashes)}</td>
                    <td className="action-cell">
                      <button
                        className="view-detail-link"
                        onClick={() => handleViewDetail(row)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        View Detail
                      </button>
                    </td>
                  </tr>
                ))}

                {!loading && filteredReports.length === 0 && (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                      No reports found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showDetailModal && selectedReport && (
            <div className="detail-modal-overlay">
              <div className="detail-modal">
                <div className="detail-modal-header">
                  <h2>Report Details</h2>
                  <button className="modal-close-btn" onClick={handleCloseModal}>✕</button>
                </div>

                <div className="detail-modal-content">
                  <div className="detail-section">
                    <div className="detail-row">
                      <span className="detail-label">Report Date</span>
                      <span className="detail-value">{formatDisplayDate(selectedReport.date)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Instant Sales</span>
                      <span className="detail-value">{formatMoney(selectedReport.instantSales)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Online Sales</span>
                      <span className="detail-value">{formatMoney(selectedReport.onlineSales)}</span>
                    </div>
                  </div>

                  <div className="detail-form-section">
                    <h3>Enter Additional Information</h3>

                    <div className="form-fields-grid">
                      <div className="form-field-card">
                        <label>Online Sales</label>
                        <input
                          type="number"
                          placeholder="$0.00"
                          value={detailFormData.onlineSales}
                          onChange={(e) => handleInputChange('onlineSales', e.target.value)}
                          disabled={!isEditMode}
                          className="form-field-input"
                        />
                      </div>

                      <div className="form-field-card">
                        <label>Instant Cashes</label>
                        <input
                          type="number"
                          placeholder="$0.00"
                          value={detailFormData.instantCashes}
                          onChange={(e) => handleInputChange('instantCashes', e.target.value)}
                          disabled={!isEditMode}
                          className="form-field-input"
                        />
                      </div>

                      <div className="form-field-card">
                        <label>Online Cashes</label>
                        <input
                          type="number"
                          placeholder="$0.00"
                          value={detailFormData.onlineCashes}
                          onChange={(e) => handleInputChange('onlineCashes', e.target.value)}
                          disabled={!isEditMode}
                          className="form-field-input"
                        />
                      </div>

                      <div className="form-field-card">
                        <label>Online Cancel</label>
                        <input
                          type="number"
                          placeholder="$0.00"
                          value={detailFormData.onlineCancels}
                          onChange={(e) => handleInputChange('onlineCancels', e.target.value)}
                          disabled={!isEditMode}
                          className="form-field-input"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="box-details-section">
                    <h3>Box Details</h3>
                    <table className="box-details-table">
                      <thead>
                        <tr>
                          <th>Box #</th>
                          <th>Game</th>
                          <th>Start #</th>
                          <th>End #</th>
                          <th>Value</th>
                          <th>Total</th>
                          <th>Closing Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxDetails.length > 0 ? (
                          boxDetails.map((box) => (
                            <tr key={box.id}>
                              <td>{box.boxNum}</td>
                              <td>{box.game}</td>
                              <td>{box.startNum}</td>
                              <td>{box.endNum}</td>
                              <td>{box.value}</td>
                              <td>{box.total}</td>
                              <td className="status-active">{box.status}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '16px' }}>
                              No box details available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="detail-modal-footer">
                  {isEditMode ? (
                    <button className="btn-save-changes" onClick={handleSaveChanges} disabled={saveLoading}>
                      {saveLoading ? 'Saving...' : 'Save Changes'}
                    </button>
                  ) : (
                    <button className="btn-edit" onClick={handleEditClick}>Edit</button>
                  )}
                  <button className="btn-download" onClick={handleDownloadReport}>Download Report</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}