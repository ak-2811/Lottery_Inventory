import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import '../App.css'
import './dashboard.css'
// import { useNavigate } from 'react-router-dom'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
)

const API_BASE = 'http://127.0.0.1:8000/api'

export default function Dashboard() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ticketOnScreen, setTicketOnScreen] = useState([])
  const [scannerBuffer, setScannerBuffer] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [dailySalesData, setDailySalesData] = useState([])

  const [stats, setStats] = useState({
    instant_sales_today: '0.00',
    active_boxes: 0,
    activated_today: 0,
    activated_this_week: 0,
    activated_this_month: 0,
    inactive_packs: 0,
  })

  const fetchTicketValues = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ticket-values/`)
      setTicketOnScreen(res.data)
    } catch (error) {
      console.error('Error fetching ticket values:', error)
    }
  }

  const fetchDailySalesData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/daily-sales/`)
      setDailySalesData(res.data)
    } catch (error) {
      console.error('Error fetching daily sales data:', error)
      // Fallback data for development with actual dates (last 7 days)
      const today = new Date()
      const fallbackData = []
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        fallbackData.push({
          date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          sales: Math.floor(Math.random() * 3000) + 1000
        })
      }
      setDailySalesData(fallbackData)
    }
  }

  const ticketTypes = [
    { name: 'New Tickets', icon: '👥' },
    { name: 'Lucky Tickets', icon: '👥' },
    { name: 'Ending Tickets', icon: '👥' },
  ]

  const handleEndShift = async () => {
    try {
      await axios.post('http://127.0.0.1:8000/api/end-shift/')
      navigate('/reports')
    } catch (error) {
      console.error('Error ending shift:', error)
      setScanMessage('Failed to end shift')
    }
  }
  const fetchDashboardStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/dashboard-stats/`)
      setStats(res.data)
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    }
  }

  const handleTicketScan = async (rawBarcode) => {
    try {
      const response = await fetch(`${API_BASE}/tickets/scan/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_barcode: rawBarcode }),
      })

      const contentType = response.headers.get('content-type') || ''
      const rawText = await response.text()

      let data = {}
      if (contentType.includes('application/json')) {
        data = JSON.parse(rawText)
      } else {
        throw new Error(`Server error (${response.status}). Check Django console.`)
      }

      if (!response.ok) {
        throw new Error(data.error || 'Invalid input')
      }

      setScanMessage(
        data.pack_sold
          ? 'Pack sold successfully and removed from active boxes'
          : `Ticket ${data.ticket_number} scanned successfully`
      )

      await fetchDashboardStats()
    } catch (error) {
      setScanMessage(error.message || 'Invalid input')
    }
  }

  useEffect(() => {
    let timeoutId = null

    const handleGlobalKeyDown = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase()
      const isTypingInInput =
        tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

      if (isTypingInInput) return

      if (e.key === 'Enter') {
        const scannedValue = scannerBuffer.trim()

        if (/^\d{12,16}$/.test(scannedValue)) {
          handleTicketScan(scannedValue)
        }

        setScannerBuffer('')
        return
      }

      if (/^\d$/.test(e.key)) {
        setScannerBuffer((prev) => prev + e.key)

        clearTimeout(timeoutId)
        timeoutId = setTimeout(() => {
          setScannerBuffer('')
        }, 300)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      clearTimeout(timeoutId)
    }
  }, [scannerBuffer])

  useEffect(() => {
    fetchDashboardStats()
    fetchTicketValues()
    fetchDailySalesData()
  }, [])

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
            className="nav-item active-highlight"
            onClick={() => navigate('/dashboard')}
            style={{ background: 'transparent', border: 'none', color: '#1a7a6f' }}
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
          <a href="#" className="sidebar-link">🚪 <span className="link-label">Logout</span></a>
        </div>
      </div>

      <div className="main-content">
        <div className="header">
          <div className="header-left">
            <h2>Dashboard</h2>
          </div>

          <div className="header-right">
            <button
              className="header-btn refresh-btn"
              title="Reload Screen"
              onClick={fetchDashboardStats}
            >
              ↻
            </button>
            <button
              className="header-btn reload-btn"
              onClick={fetchDashboardStats}
            >
              Reload Screen
            </button>
            <button className="header-btn manage-btn">Manage Current Shift</button>
            {/* <button className="header-btn end-btn">End Shift</button> */}
            <button className="header-btn end-btn" onClick={handleEndShift}>End Shift</button>
          </div>
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

        <div className="dashboard-content">
          <div className="stats-grid">
            <div className="stat-box large">
              <label>Instant Sales ( Today )</label>
              <div className="stat-value large-value">$ {stats.instant_sales_today}</div>
            </div>
          </div>

          {/* Daily Sales Line Graph */}
          <div className="sales-chart-container">
            <h3 style={{ marginBottom: '20px', color: '#333' }}>Daily Sales Trend</h3>
            {dailySalesData.length > 0 && (
              <Line
                data={{
                  labels: dailySalesData.map((item) => item.date),
                  datasets: [
                    {
                      label: 'Sales ($)',
                      data: dailySalesData.map((item) => item.sales),
                      borderColor: '#1a7a6f',
                      backgroundColor: 'rgba(26, 122, 111, 0.1)',
                      borderWidth: 2,
                      fill: true,
                      tension: 0.4,
                      pointRadius: 5,
                      pointBackgroundColor: '#1a7a6f',
                      pointBorderColor: '#fff',
                      pointBorderWidth: 2,
                      pointHoverRadius: 7,
                    },
                  ],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: true,
                  plugins: {
                    legend: {
                      display: true,
                      position: 'top',
                      labels: {
                        color: '#333',
                        font: { size: 12, weight: 'bold' },
                      },
                    },
                    tooltip: {
                      backgroundColor: 'rgba(0,0,0,0.8)',
                      padding: 12,
                      callbacks: {
                        label: function (context) {
                          return `Sales: $${context.parsed.y.toLocaleString()}`;
                        },
                      },
                    },
                  },
                  scales: {
                    y: {
                      beginAtZero: true,
                      ticks: {
                        callback: function (value) {
                          return '$' + value.toLocaleString();
                        },
                        color: '#666',
                      },
                      grid: {
                        color: 'rgba(200, 200, 200, 0.1)',
                      },
                    },
                    x: {
                      ticks: {
                        color: '#666',
                      },
                      grid: {
                        color: 'rgba(200, 200, 200, 0.1)',
                      },
                    },
                  },
                }}
              />
            )}
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <label>Active Boxes</label>
              <div className="stat-value">{stats.active_boxes}</div>
            </div>
            <div className="stat-box">
              <label>Activated Today</label>
              <div className="stat-value">{stats.activated_today}</div>
            </div>
            <div className="stat-box">
              <label>Activated This Week</label>
              <div className="stat-value">{stats.activated_this_week}</div>
            </div>
            <div className="stat-box">
              <label>Activated This Month</label>
              <div className="stat-value">{stats.activated_this_month}</div>
            </div>
            <div className="stat-box">
              <label>Inactive Packs</label>
              <div className="stat-value">{stats.inactive_packs}</div>
            </div>
          </div>

          <div className="tickets-section">
            <h3>
              Tickets on Screen
              <span className="subtitle">Click on any ticket to display on screen</span>
            </h3>
            <div className="tickets-grid">
              {ticketOnScreen.map((ticket, index) => (
                <button key={index} className="ticket-btn" title={`Display ${ticket.label}`}>
                  <span className="ticket-icon">💵</span>
                  <span className="ticket-label">{ticket.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="tickets-section">
            <h3>
              Tickets Types
              <span className="subtitle">Click on any ticket to display on screen</span>
            </h3>
            <div className="ticket-types-grid">
              {ticketTypes.map((type, index) => (
                <button key={index} className="ticket-type-btn" title={`Display ${type.name}`}>
                  <span className="ticket-type-icon">{type.icon}</span>
                  <span className="ticket-type-label">{type.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}