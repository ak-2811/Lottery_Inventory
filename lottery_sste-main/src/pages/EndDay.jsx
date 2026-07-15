import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../App.css'
import './endShift.css'

const endDayReports = [
  {
    date: 'Jul 16, 2026',
    shifts: [
      {
        id: 'shift-1',
        name: 'Morning Shift',
        time: '08:00 AM - 02:00 PM',
        instantSales: 1845,
        instantCashes: 420,
        onlineSales: 690,
        onlineCashes: 180,
        onlineCancels: 35,
        netSales: 1900,
        games: [
          { boxNum: '01', game: 'Lucky 7', startNum: 14, endNum: 38, value: '$5', total: '$120.00', status: 'Active' },
          { boxNum: '04', game: 'Cash Blast', startNum: 42, endNum: 61, value: '$10', total: '$200.00', status: 'Active' },
        ],
      },
      {
        id: 'shift-2',
        name: 'Evening Shift',
        time: '02:00 PM - 10:00 PM',
        instantSales: 2360,
        instantCashes: 510,
        onlineSales: 845,
        onlineCashes: 230,
        onlineCancels: 55,
        netSales: 2410,
        games: [
          { boxNum: '02', game: 'Gold Rush', startNum: 8, endNum: 31, value: '$20', total: '$480.00', status: 'Active' },
          { boxNum: '06', game: 'Fast Cash', startNum: 70, endNum: 95, value: '$2', total: '$52.00', status: 'Sold' },
        ],
      },
    ],
  },
  {
    date: 'Jul 15, 2026',
    shifts: [
      {
        id: 'shift-3',
        name: 'Morning Shift',
        time: '08:00 AM - 02:00 PM',
        instantSales: 1525,
        instantCashes: 315,
        onlineSales: 580,
        onlineCashes: 145,
        onlineCancels: 20,
        netSales: 1625,
        games: [
          { boxNum: '03', game: 'Mega Money', startNum: 22, endNum: 46, value: '$5', total: '$125.00', status: 'Active' },
          { boxNum: '07', game: 'Triple Win', startNum: 4, endNum: 19, value: '$10', total: '$160.00', status: 'Active' },
        ],
      },
      {
        id: 'shift-4',
        name: 'Evening Shift',
        time: '02:00 PM - 10:00 PM',
        instantSales: 1920,
        instantCashes: 475,
        onlineSales: 740,
        onlineCashes: 210,
        onlineCancels: 40,
        netSales: 1935,
        games: [
          { boxNum: '05', game: 'Lucky Stars', startNum: 38, endNum: 63, value: '$3', total: '$78.00', status: 'Active' },
          { boxNum: '09', game: 'Big Jackpot', startNum: 12, endNum: 24, value: '$30', total: '$390.00', status: 'Sold' },
        ],
      },
    ],
  },
  {
    date: 'Jul 14, 2026',
    shifts: [
      {
        id: 'shift-5',
        name: 'Full Day Shift',
        time: '09:00 AM - 09:00 PM',
        instantSales: 2785,
        instantCashes: 620,
        onlineSales: 915,
        onlineCashes: 255,
        onlineCancels: 65,
        netSales: 2760,
        games: [
          { boxNum: '08', game: 'Cash Wheel', startNum: 11, endNum: 37, value: '$10', total: '$270.00', status: 'Active' },
          { boxNum: '10', game: 'Diamond Draw', startNum: 51, endNum: 75, value: '$5', total: '$125.00', status: 'Active' },
        ],
      },
    ],
  },
]

const moneyFields = ['instantSales', 'instantCashes', 'onlineSales', 'onlineCashes', 'onlineCancels', 'netSales']

export default function EndDay() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedDate, setExpandedDate] = useState(null)

  const selectedReport = endDayReports.find((report) => report.date === expandedDate) || endDayReports[0]

  const dayTotals = useMemo(() => {
    return selectedReport.shifts.reduce((totals, shift) => {
      moneyFields.forEach((field) => {
        totals[field] = (totals[field] || 0) + shift[field]
      })
      return totals
    }, {})
  }, [selectedReport])

  const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`

  const getDateTotal = (report) => {
    return report.shifts.reduce((total, shift) => total + shift.netSales, 0)
  }

  const toggleDate = (date) => {
    setExpandedDate((currentDate) => currentDate === date ? null : date)
  }

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
            className="nav-item"
            onClick={() => navigate('/activate-packs')}
            style={{ background: 'transparent', color: '#666', border: 'none' }}
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
            <h2>End Day</h2>
          </div>
          <div className="header-right">
            <button className="header-btn reload-btn" onClick={() => navigate('/dashboard')}>
              Dashboard
            </button>
          </div>
        </div>

        <div className="end-shift-content end-day-content">
          <div className="end-day-heading">
            <div>
              <span className="end-day-kicker">Daily total</span>
              <h3>{selectedReport.date}</h3>
            </div>
            <div className="end-day-shift-count">{selectedReport.shifts.length} Shifts</div>
          </div>

          <div className="sales-summary">
            <div className="summary-card">
              <label>Instant Sales</label>
              <div className="summary-value">{formatMoney(dayTotals.instantSales)}</div>
            </div>
            <div className="summary-card">
              <label>Instant Cashes</label>
              <div className="summary-value">{formatMoney(dayTotals.instantCashes)}</div>
            </div>
            <div className="summary-card">
              <label>Online Sales</label>
              <div className="summary-value">{formatMoney(dayTotals.onlineSales)}</div>
            </div>
            <div className="summary-card">
              <label>Online Cashes</label>
              <div className="summary-value">{formatMoney(dayTotals.onlineCashes)}</div>
            </div>
            <div className="summary-card">
              <label>Online Cancel</label>
              <div className="summary-value">{formatMoney(dayTotals.onlineCancels)}</div>
            </div>
            <div className="summary-card end-day-total-card">
              <label>Net Day Total</label>
              <div className="summary-value">{formatMoney(dayTotals.netSales)}</div>
            </div>
          </div>

          <div className="sales-by-game-section">
            <h3>Select Date</h3>
            <div className="table-container">
              <table className="details-table end-day-date-table">
                <thead>
                  <tr>
                    <th aria-label="Expand row"></th>
                    <th>Date</th>
                    <th>Shifts</th>
                    <th>Net Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {endDayReports.map((report) => {
                    const isExpanded = report.date === expandedDate

                    return (
                      <React.Fragment key={report.date}>
                        <tr className={isExpanded ? 'active-row' : ''}>
                          <td className="end-day-toggle-cell">
                            <button
                              aria-expanded={isExpanded}
                              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} shifts for ${report.date}`}
                              className={`end-day-toggle-btn ${isExpanded ? 'open' : ''}`}
                              onClick={() => toggleDate(report.date)}
                              type="button"
                            >
                              ▸
                            </button>
                          </td>
                          <td>
                            <button
                              className="end-day-date-button"
                              onClick={() => toggleDate(report.date)}
                              type="button"
                            >
                              {report.date}
                            </button>
                          </td>
                          <td>{report.shifts.length}</td>
                          <td>{formatMoney(getDateTotal(report))}</td>
                          <td>
                            <span className="status-badge active">
                              {isExpanded ? 'Viewing' : 'Closed'}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="end-day-expanded-row">
                            <td colSpan="5">
                              <div className="end-day-expanded-content">
                                <h3>Shifts for {report.date}</h3>
                                <div className="end-day-shift-list">
                                  {report.shifts.map((shift) => (
                                    <section className="end-day-shift-panel" key={shift.id}>
                                      <div className="end-day-shift-header">
                                        <div>
                                          <h4>{shift.name}</h4>
                                          <p>{shift.time}</p>
                                        </div>
                                        <strong>{formatMoney(shift.netSales)}</strong>
                                      </div>

                                      <div className="end-day-shift-metrics">
                                        <span>Instant Sales: {formatMoney(shift.instantSales)}</span>
                                        <span>Instant Cashes: {formatMoney(shift.instantCashes)}</span>
                                        <span>Online Sales: {formatMoney(shift.onlineSales)}</span>
                                        <span>Online Cashes: {formatMoney(shift.onlineCashes)}</span>
                                        <span>Online Cancel: {formatMoney(shift.onlineCancels)}</span>
                                      </div>

                                      <div className="table-container end-day-nested-table">
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
                                            {shift.games.map((detail) => (
                                              <tr key={`${shift.id}-${detail.boxNum}`}>
                                                <td>{detail.boxNum}</td>
                                                <td>{detail.game}</td>
                                                <td>{detail.startNum}</td>
                                                <td>{detail.endNum}</td>
                                                <td>{detail.value}</td>
                                                <td>{detail.total}</td>
                                                <td>
                                                  <span className={`status-badge ${detail.status.toLowerCase()}`}>
                                                    {detail.status}
                                                  </span>
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </section>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
