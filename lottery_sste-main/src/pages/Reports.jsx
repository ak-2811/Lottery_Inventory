import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../App.css'
import './reports.css'

export default function Reports() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [startDate, setStartDate] = useState('2026/04/01')
  const [endDate, setEndDate] = useState('2026/04/11')
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedReport, setSelectedReport] = useState(null)
  const [isEditMode, setIsEditMode] = useState(false)
  const [detailFormData, setDetailFormData] = useState({
    onlineSales: '',
    instantCashes: '',
    onlineCashes: '',
    onlineCancel: '',
  })

  const reportStats = [
    { label: 'Instant Sales', value: '$33,613', color: '#1a7a6f' },
    { label: 'Instant Cashes', value: '$20,884', color: '#1a7a6f' },
    { label: 'Online Sales', value: '$13,215', color: '#1a7a6f' },
    { label: 'Online Cashes', value: '$5,124', color: '#1a7a6f' },
    { label: 'Reg Cash', value: '$20,808', color: '#1a7a6f' },
  ]

  const reportData = [
    { id: 1, date: 'April 10, 2026', instantSales: 3124, instantCashes: 1386, onlineSales: 1309, onlineCashes: 126, cashInReg: 2921 },
    { id: 2, date: 'April 09, 2026', instantSales: 2583, instantCashes: 1465, onlineSales: 897, onlineCashes: 296, cashInReg: 1719 },
    { id: 3, date: 'April 08, 2026', instantSales: 2898, instantCashes: 1446, onlineSales: 1198.5, onlineCashes: 625, cashInReg: 2025.5 },
    { id: 4, date: 'April 07, 2026', instantSales: 2916, instantCashes: 1321, onlineSales: 951.5, onlineCashes: 102, cashInReg: 2444.5 },
    { id: 5, date: 'April 06, 2026', instantSales: 2878, instantCashes: 1849, onlineSales: 1422.5, onlineCashes: 135, cashInReg: 2316.5 },
    { id: 6, date: 'April 05, 2026', instantSales: 1293, instantCashes: 633, onlineSales: 769.5, onlineCashes: 44, cashInReg: 1385.5 },
    { id: 7, date: 'April 04, 2026', instantSales: 3234, instantCashes: 2924, onlineSales: 1795, onlineCashes: 757, cashInReg: 1348 },
    { id: 8, date: 'April 03, 2026', instantSales: 4884, instantCashes: 3531, onlineSales: 852, onlineCashes: 1129, cashInReg: 1076 },
    { id: 9, date: 'April 02, 2026', instantSales: 2911, instantCashes: 2224, onlineSales: 1364, onlineCashes: 1211, cashInReg: 840 },
    { id: 10, date: 'April 01, 2026', instantSales: 3147, instantCashes: 1512, onlineSales: 1524, onlineCashes: 357, cashInReg: 2802 },
    { id: 11, date: 'March 31, 2026', instantSales: 3745, instantCashes: 2593, onlineSales: 1120.5, onlineCashes: 342, cashInReg: 1930.5 },
  ]

  const boxDetails = [
    { id: 1, boxNum: '#1', game: 'MAGNIFICENT JUMBO BUCKS - 307701', startNum: 18, endNum: 23, value: '$20', total: '$100', status: 'Active' },
    { id: 2, boxNum: '#2', game: 'MAGNIFICENT JUMBO BUCKS - 279133', startNum: 1, endNum: 5, value: '$20', total: '$80', status: 'Active' },
    { id: 3, boxNum: '#3', game: 'MAGNIFICENT JUMBO BUCKS - 279130', startNum: 16, endNum: 19, value: '$20', total: '$60', status: 'Active' },
    { id: 4, boxNum: '#4', game: '200 X - 131618', startNum: 20, endNum: 22, value: '$20', total: '$40', status: 'Active' },
    { id: 5, boxNum: '#5', game: '200 X - 160919', startNum: 5, endNum: 13, value: '$20', total: '$160', status: 'Active' },
  ]

  const handleViewDetail = (report) => {
    setSelectedReport(report)
    setDetailFormData({
      onlineSales: report.onlineSales,
      instantCashes: report.instantCashes,
      onlineCashes: report.onlineCashes,
      onlineCancel: 0,
    })
    setIsEditMode(false)
    setShowDetailModal(true)
  }

  const handleCloseModal = () => {
    setShowDetailModal(false)
    setSelectedReport(null)
    setIsEditMode(false)
  }

  const handleInputChange = (field, value) => {
    setDetailFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleEditClick = () => {
    setIsEditMode(true)
  }

  const handleSaveChanges = () => {
    // TODO: Implement save functionality
    alert('Changes saved successfully!')
    setIsEditMode(false)
  }

  const handleDownloadReport = () => {
    // TODO: Implement download functionality
    alert('Download functionality to be implemented')
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
        </nav>
        <div className="sidebar-footer">
          <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a>
          <a href="#" className="sidebar-link">🚪 <span className="link-label">Logout</span></a>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <h2>Reports</h2>
          </div>

          <div className="header-right">
            <button className="header-btn refresh-btn" title="Reload Screen">↻</button>
            <button className="header-btn more-btn" title="More options">⋯</button>
          </div>
        </div>

        <div className="reports-content">
          <div className="reports-filter">
            <div className="date-range">
              <input 
                type="date" 
                value={startDate.replace(/\//g, '-')} 
                onChange={(e) => setStartDate(e.target.value.replace(/-/g, '/'))}
                className="date-input"
              />
              <span className="date-separator">—</span>
              <input 
                type="date" 
                value={endDate.replace(/\//g, '-')} 
                onChange={(e) => setEndDate(e.target.value.replace(/-/g, '/'))}
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
                  <th>Cash In Reg</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row) => (
                  <tr key={row.id}>
                    <td className="row-num">{row.id}</td>
                    <td>{row.date}</td>
                    <td>{row.instantSales}</td>
                    <td>{row.instantCashes}</td>
                    <td>{row.onlineSales}</td>
                    <td>{row.onlineCashes}</td>
                    <td>{row.cashInReg}</td>
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
                      <span className="detail-value">{selectedReport.date}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Instant Sales</span>
                      <span className="detail-value">${selectedReport.instantSales}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Online Sales</span>
                      <span className="detail-value">${selectedReport.onlineSales}</span>
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
                          value={detailFormData.onlineCancel}
                          onChange={(e) => handleInputChange('onlineCancel', e.target.value)}
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
                        {boxDetails.map((box) => (
                          <tr key={box.id}>
                            <td>{box.boxNum}</td>
                            <td>{box.game}</td>
                            <td>{box.startNum}</td>
                            <td>{box.endNum}</td>
                            <td>{box.value}</td>
                            <td>{box.total}</td>
                            <td className="status-active">{box.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="detail-modal-footer">
                  {isEditMode ? (
                    <button className="btn-save-changes" onClick={handleSaveChanges}>Save Changes</button>
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
