import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import '../App.css'
import './reports.css'
import ManagerPinModal from './ManagerPinModal'
import { getManagerAccessToken, getManagerProtectedHeaders, clearManagerAccessToken } from '../utils/managerAccess'
import { API_BASE } from '../config/api.js'

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
  const [searchParams] = useSearchParams()
  const storeId = searchParams.get('store_id') || ''
  const storeName = searchParams.get('store_name') || ''
  const isAdminStoreReport = Boolean(storeId)
  const storeQuery = storeId ? `?store_id=${encodeURIComponent(storeId)}` : ''
  const [reportsAuthorized, setReportsAuthorized] = useState(
    () => isAdminStoreReport || Boolean(getManagerAccessToken('reports'))
  )

  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)

  const [detailFormData, setDetailFormData] = useState({
    instantCashes: '',
    onlineSales: '',
    onlineCashes: '',
    onlineCancels: '',
  })

  const [pageMessage, setPageMessage] = useState('')
  const [showDetailModal, setShowDetailModal] = useState(false)

  // The selected daily cumulative report row.
  const [selectedDailyReport, setSelectedDailyReport] =
    useState(null)

  // The selected shift ID from the dropdown.
  const [selectedShiftId, setSelectedShiftId] =
    useState('')

  // Complete selected shift information.
  const [selectedShiftReport, setSelectedShiftReport] =
    useState(null)

  const [boxDetails, setBoxDetails] = useState([])

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

  const handleSaveChanges = async () => {
    if (!selectedShiftReport) return

    try {
      setSaveLoading(true)
      setPageMessage('')

      const response = await fetch(
        `${API_BASE}/shift-reports/${selectedShiftReport.id}/update/${storeQuery}`,
        {
          method: 'PUT',
          headers: isAdminStoreReport
            ? getAuthHeaders()
            : getManagerProtectedHeaders('reports'),
          body: JSON.stringify({
            instantCashes: detailFormData.instantCashes,
            onlineSales: detailFormData.onlineSales,
            onlineCashes: detailFormData.onlineCashes,
            onlineCancels: detailFormData.onlineCancels,
          }),
        }
      )

      const data = await response.json()

      if (response.status === 403 && !isAdminStoreReport) {
        setReportsAuthorized(false)
      }

      if (!response.ok) {
        throw new Error(
          data.error || 'Failed to update shift report'
        )
      }

      const updatedReport = data.report

      setSelectedShiftReport(updatedReport)
      setBoxDetails(updatedReport.boxDetails || [])

      setDetailFormData({
        instantCashes:
          updatedReport.instantCashes ?? '0.00',
        onlineSales:
          updatedReport.onlineSales ?? '0.00',
        onlineCashes:
          updatedReport.onlineCashes ?? '0.00',
        onlineCancels:
          updatedReport.onlineCancels ?? '0.00',
      })

      setIsEditMode(false)

      // Refresh cumulative daily rows.
      await fetchReports()

      setPageMessage(
        data.message ||
        'Shift report updated successfully.'
      )
    } catch (error) {
      setPageMessage(
        error.message ||
        'Failed to update shift report'
      )
    } finally {
      setSaveLoading(false)
    }
  }
  const formatDisplayDate = (value) => {
    if (!value) return ''

    const date = new Date(`${value}T00:00:00`)

    if (Number.isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const formatDateTime = (value) => {
    if (!value) return '-'

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const formatMoney = (value) => {
    const number = parseFloat(value || 0)

    return `$${number.toFixed(2)}`
  }

  const fetchReports = async () => {
    try {
      setLoading(true)
      setPageMessage('')

      const params = new URLSearchParams()
      if (storeId) params.set('store_id', storeId)

      const response = await fetch(
        `${API_BASE}/reports/${
          params.toString()
            ? `?${params.toString()}`
            : ''
        }`,
        {
          headers: isAdminStoreReport
            ? getAuthHeaders()
            : getManagerProtectedHeaders(
                'reports'
              ),
        }
      )

      const data = await response.json()

      if (response.status === 403 && !isAdminStoreReport) {
        setReportsAuthorized(false)
      }

      if (!response.ok) {
        throw new Error(
          data.error || 'Failed to fetch reports'
        )
      }

      setReports(data)

      if (data.length > 0) {
        const sortedDates = data
          .map((item) => item.report_date)
          .filter(Boolean)
          .sort()

        setStartDate(sortedDates[0] || '')
        setEndDate(
          sortedDates[sortedDates.length - 1] || ''
        )
      } else {
        setStartDate('')
        setEndDate('')
      }
    } catch (error) {
      setPageMessage(
        error.message || 'Failed to fetch reports'
      )
    } finally {
      setLoading(false)
    }
  }

  const fetchShiftReport = async (shiftId) => {
    if (!shiftId) {
      setSelectedShiftReport(null)
      setBoxDetails([])
      return
    }

    try {
      setDetailLoading(true)
      setPageMessage('')

      const response = await fetch(
        `${API_BASE}/shift-reports/${shiftId}/${storeQuery}`,
        {
          headers: isAdminStoreReport
            ? getAuthHeaders()
            : getManagerProtectedHeaders('reports'),
        }
      )

      const data = await response.json()

      if (response.status === 403 && !isAdminStoreReport) {
        setReportsAuthorized(false)
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
          'Failed to fetch shift report details'
        )
      }

      setSelectedShiftReport(data)
      setBoxDetails(data.boxDetails || [])
      setDetailFormData({
      instantCashes: data.instantCashes ?? '0.00',
      onlineSales: data.onlineSales ?? '0.00',
      onlineCashes: data.onlineCashes ?? '0.00',
      onlineCancels: data.onlineCancels ?? '0.00',
    })

    setIsEditMode(false)
    } catch (error) {
      setPageMessage(
        error.message ||
        'Failed to fetch shift report details'
      )

      setSelectedShiftReport(null)
      setBoxDetails([])
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => {
    if (isAdminStoreReport) {
      setReportsAuthorized(true)
    }
  }, [isAdminStoreReport])

  useEffect(() => {
    if (reportsAuthorized) {
      fetchReports()
    }
  }, [storeId, reportsAuthorized])

  const filteredReports = useMemo(() => {
    return reports.filter((report) => {
      if (!report.report_date) return false

      if (
        startDate &&
        report.report_date < startDate
      ) {
        return false
      }

      if (
        endDate &&
        report.report_date > endDate
      ) {
        return false
      }

      return true
    })
  }, [reports, startDate, endDate])

  const reportStats = useMemo(() => {
    const totals = filteredReports.reduce(
      (accumulator, report) => {
        accumulator.instantSales += parseFloat(
          report.instantSales || 0
        )

        accumulator.instantCashes += parseFloat(
          report.instantCashes || 0
        )

        accumulator.onlineSales += parseFloat(
          report.onlineSales || 0
        )

        accumulator.onlineCashes += parseFloat(
          report.onlineCashes || 0
        )

        accumulator.onlineCancels += parseFloat(
          report.onlineCancels || 0
        )

        return accumulator
      },
      {
        instantSales: 0,
        instantCashes: 0,
        onlineSales: 0,
        onlineCashes: 0,
        onlineCancels: 0,
      }
    )

    return [
      {
        label: 'Instant Sales',
        value: formatMoney(totals.instantSales),
      },
      {
        label: 'Instant Cashes',
        value: formatMoney(totals.instantCashes),
      },
      {
        label: 'Online Sales',
        value: formatMoney(totals.onlineSales),
      },
      {
        label: 'Online Cashes',
        value: formatMoney(totals.onlineCashes),
      },
      {
        label: 'Online Cancels',
        value: formatMoney(totals.onlineCancels),
      },
    ]
  }, [filteredReports])

  const handleInputChange = (field, value) => {
    setDetailFormData((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handleViewDetail = async (dailyReport) => {
    setSelectedDailyReport(dailyReport)
    setSelectedShiftReport(null)
    setBoxDetails([])
    setPageMessage('')
    setShowDetailModal(true)

    const shifts = dailyReport.shifts || []

    // When only one shift exists, select it automatically.
    if (shifts.length === 1) {
      const onlyShiftId = String(shifts[0].id)

      setSelectedShiftId(onlyShiftId)
      await fetchShiftReport(onlyShiftId)
      return
    }

    // More than one shift:
    // show the selector and wait for user selection.
    setSelectedShiftId('')
  }

  const handleShiftSelection = async (event) => {
    const shiftId = event.target.value

    setSelectedShiftId(shiftId)
    setSelectedShiftReport(null)
    setBoxDetails([])
    setIsEditMode(false)

    if (shiftId) {
      await fetchShiftReport(shiftId)
    }
  }

  const handleCloseModal = () => {
    setShowDetailModal(false)
    setSelectedDailyReport(null)
    setSelectedShiftId('')
    setSelectedShiftReport(null)
    setBoxDetails([])
    setIsEditMode(false)

    setDetailFormData({
      instantCashes: '',
      onlineSales: '',
      onlineCashes: '',
      onlineCancels: '',
    })
  }

  const handleDownloadReport = async () => {
    if (!selectedShiftReport) return

    try {
      const response = await fetch(
        `${API_BASE}/shift-reports/${selectedShiftReport.id}/download/${storeQuery}`,
        {
          headers: isAdminStoreReport
            ? getOnlyAuthHeader()
            : getManagerProtectedHeaders('reports', false),
        }
      )

      if (response.status === 403 && !isAdminStoreReport) {
        setReportsAuthorized(false)
      }

      if (!response.ok) {
        throw new Error(
          'Failed to download shift report'
        )
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)

      const downloadLink = document.createElement('a')

      downloadLink.href = url
      downloadLink.download =
        `shift_report_` +
        `${selectedShiftReport.report_date}_` +
        `shift_${selectedShiftReport.shiftNumber}.pdf`

      document.body.appendChild(downloadLink)
      downloadLink.click()
      downloadLink.remove()

      window.URL.revokeObjectURL(url)
    } catch (error) {
      setPageMessage(
        error.message ||
        'Failed to download shift report'
      )
    }
  }

  const handleRefresh = async () => {
    await fetchReports()
  }

  if (!reportsAuthorized && !isAdminStoreReport) {
    return (
      <ManagerPinModal
        open
        scope="reports"
        title="Reports Authorization"
        description="Enter the store's 8-digit managerial PIN to view Reports."
        onClose={() => navigate('/dashboard')}
        onAuthorized={() => {
          setReportsAuthorized(true)
        }}
      />
    )
  }

  return (
    <div className={`app-container ${isAdminStoreReport ? 'reports-admin-mode' : ''}`}>
      {!isAdminStoreReport && (
        <div
          className={`sidebar ${
            sidebarOpen ? 'open' : 'closed'
          }`}
        >
          <button
            className="sidebar-toggle"
            onClick={() =>
              setSidebarOpen(!sidebarOpen)
            }
          >
            ☰
          </button>

          <div className="sidebar-header">
            <h1 className="logo">
              The Lottery System
            </h1>

            <p className="logo-subtitle">
              PREMIUM INVENTORY
            </p>
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
              <span className="nav-icon">🎯</span>
              <span className="nav-label">
                Dashboard
              </span>
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
              <span className="nav-icon">📦</span>
              <span className="nav-label">
                Inventory
              </span>
            </button>

            <button
              className="nav-item active-highlight"
              onClick={() => navigate('/reports')}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#1a7a6f',
              }}
            >
              <span className="nav-icon">📊</span>
              <span className="nav-label">
                Reports
              </span>
            </button>

            <button
              className="nav-item"
              onClick={() =>
                navigate('/activate-packs')
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: '#666',
              }}
            >
              <span className="nav-icon">⏱️</span>
              <span className="nav-label">
                Activate Packs
              </span>
            </button>

            <button
              className="nav-item"
              onClick={() =>
                window.open(
                  '/live-display',
                  '_blank'
                )
              }
              style={{
                background: 'transparent',
                border: 'none',
                color: '#666',
              }}
            >
              <span className="nav-icon">📺</span>
              <span className="nav-label">
                Live Display
              </span>
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
              🚪
              <span className="link-label">
                Logout
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <h2>{storeName ? `${storeName} Reports` : 'Reports'}</h2>
          </div>

          <div className="header-right">
            {isAdminStoreReport && (
              <button
                className="header-btn reports-back-btn"
                onClick={() => navigate('/admin-dashboard?tab=my-stores')}
                type="button"
              >
                Back to Home
              </button>
            )}
            <button
              className="header-btn refresh-btn"
              title="Reload Screen"
              onClick={handleRefresh}
            >
              ↻
            </button>
          </div>
        </div>

        {pageMessage && (
          <div
            style={{
              color:
                pageMessage
                  .toLowerCase()
                  .includes('failed') ||
                pageMessage
                  .toLowerCase()
                  .includes('error')
                  ? 'red'
                  : 'green',
              padding: '10px 28px',
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
                onChange={(event) =>
                  setStartDate(event.target.value)
                }
                className="date-input"
              />

              <span className="date-separator">
                —
              </span>

              <input
                type="date"
                value={endDate}
                onChange={(event) =>
                  setEndDate(event.target.value)
                }
                className="date-input"
              />
            </div>
          </div>

          <div className="reports-stats">
            {reportStats.map((stat) => (
              <div
                key={stat.label}
                className="report-stat-card"
              >
                <label>{stat.label}</label>

                <div
                  className="stat-value"
                  style={{ color: '#1a7a6f' }}
                >
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
                  <th>Date</th>
                  <th>Shifts</th>
                  <th>Instant Sales</th>
                  <th>Instant Cashes</th>
                  <th>Online Sales</th>
                  <th>Online Cashes</th>
                  <th>Online Cancels</th>
                  <th style={{ textAlign: 'center' }}>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredReports.map(
                  (report, index) => (
                    <tr key={report.id}>
                      <td className="row-num">
                        {index + 1}
                      </td>

                      <td>
                        {formatDisplayDate(
                          report.report_date
                        )}
                      </td>

                      <td>
                        {report.shiftsCount}
                      </td>

                      <td>
                        {formatMoney(
                          report.instantSales
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          report.instantCashes
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          report.onlineSales
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          report.onlineCashes
                        )}
                      </td>

                      <td>
                        {formatMoney(
                          report.onlineCancels
                        )}
                      </td>

                      <td className="action-cell">
                        <button
                          className="view-detail-link"
                          onClick={() =>
                            handleViewDetail(report)
                          }
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          View Detail
                        </button>
                      </td>
                    </tr>
                  )
                )}

                {!loading &&
                  filteredReports.length === 0 && (
                    <tr>
                      <td
                        colSpan="9"
                        style={{
                          textAlign: 'center',
                          padding: '20px',
                        }}
                      >
                        No reports found
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>

          {showDetailModal &&
            selectedDailyReport && (
              <div className="detail-modal-overlay">
                <div className="detail-modal">
                  <div className="detail-modal-header">
                    <div>
                      <h2>Report Details</h2>

                      <div
                        style={{
                          marginTop: '4px',
                          color: '#666',
                        }}
                      >
                        {formatDisplayDate(
                          selectedDailyReport.report_date
                        )}
                      </div>
                    </div>

                    <button
                      className="modal-close-btn"
                      onClick={handleCloseModal}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="detail-modal-content">
                    <div className="detail-section">
                      <div className="detail-row">
                        <span className="detail-label">
                          Daily Instant Sales
                        </span>

                        <span className="detail-value">
                          {formatMoney(
                            selectedDailyReport.instantSales
                          )}
                        </span>
                      </div>

                      <div className="detail-row">
                        <span className="detail-label">
                          Total Shifts
                        </span>

                        <span className="detail-value">
                          {
                            selectedDailyReport.shiftsCount
                          }
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        margin: '20px 0',
                      }}
                    >
                      <label
                        htmlFor="shift-selector"
                        style={{
                          display: 'block',
                          fontWeight: '600',
                          marginBottom: '8px',
                        }}
                      >
                        Select Shift
                      </label>

                      <select
                        id="shift-selector"
                        value={selectedShiftId}
                        onChange={handleShiftSelection}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          border:
                            '1px solid #d1d5db',
                          borderRadius: '8px',
                          fontSize: '15px',
                          background: '#fff',
                        }}
                      >
                        {selectedDailyReport
                          .shiftsCount > 1 && (
                          <option value="">
                            Choose a shift
                          </option>
                        )}

                        {(
                          selectedDailyReport.shifts ||
                          []
                        ).map((shift) => (
                          <option
                            key={shift.id}
                            value={shift.id}
                          >
                            {shift.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {detailLoading && (
                      <div
                        style={{
                          textAlign: 'center',
                          padding: '30px',
                        }}
                      >
                        Loading shift details...
                      </div>
                    )}

                    {!detailLoading &&
                      !selectedShiftReport &&
                      selectedDailyReport
                        .shiftsCount > 1 && (
                        <div
                          style={{
                            textAlign: 'center',
                            padding: '30px',
                            color: '#666',
                          }}
                        >
                          Select a shift to view its
                          report.
                        </div>
                      )}

                    {!detailLoading &&
                      selectedShiftReport && (
                        <>
                          <div className="detail-section">
                            <div className="detail-row">
                              <span className="detail-label">
                                Shift
                              </span>

                              <span className="detail-value">
                                Shift{' '}
                                {
                                  selectedShiftReport.shiftNumber
                                }
                              </span>
                            </div>

                            <div className="detail-row">
                              <span className="detail-label">
                                Started
                              </span>

                              <span className="detail-value">
                                {formatDateTime(
                                  selectedShiftReport.shiftStartedAt
                                )}
                              </span>
                            </div>

                            <div className="detail-row">
                              <span className="detail-label">
                                Ended
                              </span>

                              <span className="detail-value">
                                {formatDateTime(
                                  selectedShiftReport.shiftEndedAt
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="detail-form-section">
                            <h3>Shift Values</h3>

                            <div className="form-fields-grid">
                              <div className="form-field-card">
                                <label>Instant Sales</label>

                                <input
                                  type="number"
                                  value={selectedShiftReport.instantSales ?? '0.00'}
                                  disabled
                                  className="form-field-input"
                                />
                              </div>

                              <div className="form-field-card">
                                <label>Instant Cashes</label>

                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={detailFormData.instantCashes}
                                  onChange={(event) =>
                                    handleInputChange(
                                      'instantCashes',
                                      event.target.value
                                    )
                                  }
                                  disabled={!isEditMode}
                                  className="form-field-input"
                                />
                              </div>

                              <div className="form-field-card">
                                <label>Online Sales</label>

                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={detailFormData.onlineSales}
                                  onChange={(event) =>
                                    handleInputChange(
                                      'onlineSales',
                                      event.target.value
                                    )
                                  }
                                  disabled={!isEditMode}
                                  className="form-field-input"
                                />
                              </div>

                              <div className="form-field-card">
                                <label>Online Cashes</label>

                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={detailFormData.onlineCashes}
                                  onChange={(event) =>
                                    handleInputChange(
                                      'onlineCashes',
                                      event.target.value
                                    )
                                  }
                                  disabled={!isEditMode}
                                  className="form-field-input"
                                />
                              </div>

                              <div className="form-field-card">
                                <label>Online Cancels</label>

                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={detailFormData.onlineCancels}
                                  onChange={(event) =>
                                    handleInputChange(
                                      'onlineCancels',
                                      event.target.value
                                    )
                                  }
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
                                  <th>
                                    Closing Status
                                  </th>
                                </tr>
                              </thead>

                              <tbody>
                                {boxDetails.length >
                                0 ? (
                                  boxDetails.map(
                                    (box) => (
                                      <tr key={box.id}>
                                        <td>
                                          {box.boxNum}
                                        </td>

                                        <td>
                                          {box.game}
                                        </td>

                                        <td>
                                          {box.startNum}
                                        </td>

                                        <td>
                                          {box.endNum}
                                        </td>

                                        <td>
                                          {box.value}
                                        </td>

                                        <td>
                                          {box.total}
                                        </td>

                                        <td
                                          className={`status-${(
                                            box.status ||
                                            'active'
                                          ).toLowerCase()}`}
                                        >
                                          {box.status}
                                        </td>
                                      </tr>
                                    )
                                  )
                                ) : (
                                  <tr>
                                    <td
                                      colSpan="7"
                                      style={{
                                        textAlign:
                                          'center',
                                        padding:
                                          '16px',
                                      }}
                                    >
                                      No box details
                                      available
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                  </div>

                  <div className="detail-modal-footer">
                    {selectedShiftReport && (
                      <>
                        {isEditMode ? (
                          <>
                            <button
                              className="btn-save-changes"
                              onClick={handleSaveChanges}
                              disabled={saveLoading}
                            >
                              {saveLoading
                                ? 'Saving...'
                                : 'Save Changes'}
                            </button>

                            <button
                              className="btn-edit"
                              onClick={() => {
                                setIsEditMode(false)

                                setDetailFormData({
                                  instantCashes:
                                    selectedShiftReport.instantCashes ??
                                    '0.00',
                                  onlineSales:
                                    selectedShiftReport.onlineSales ??
                                    '0.00',
                                  onlineCashes:
                                    selectedShiftReport.onlineCashes ??
                                    '0.00',
                                  onlineCancels:
                                    selectedShiftReport.onlineCancels ??
                                    '0.00',
                                })
                              }}
                              disabled={saveLoading}
                            >
                              Cancel Edit
                            </button>
                          </>
                        ) : (
                          <button
                            className="btn-edit"
                            onClick={() => setIsEditMode(true)}
                          >
                            Edit
                          </button>
                        )}

                        <button
                          className="btn-download"
                          onClick={handleDownloadReport}
                          disabled={isEditMode || saveLoading}
                        >
                          Download Shift Report
                        </button>
                      </>
                    )}

                    <button
                      className="btn-edit"
                      onClick={handleCloseModal}
                      disabled={saveLoading}
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
