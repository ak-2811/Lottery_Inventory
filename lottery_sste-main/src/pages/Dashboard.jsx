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

// const API_BASE = 'http://127.0.0.1:8000/api'
const API_BASE = 'https://lottery.bright-core-solutions.com/api'
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ticketOnScreen, setTicketOnScreen] = useState([])
  const [scannerBuffer, setScannerBuffer] = useState('')
  const [scanMessage, setScanMessage] = useState('')
  const [dailySalesData, setDailySalesData] = useState([])
  // const [isEndShiftClosed, setIsEndShiftClosed] = useState(false)

  const [stats, setStats] = useState({
    instant_sales_today: '0.00',
    active_boxes: 0,
    activated_today: 0,
    activated_this_week: 0,
    activated_this_month: 0,
    inactive_packs: 0,
  })

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

  const fetchTicketValues = async () => {
    try {
      const res = await axios.get(`${API_BASE}/ticket-values/`, {
        headers: getAuthHeaders(),
      })
      setTicketOnScreen(res.data)
    } catch (error) {
      console.error('Error fetching ticket values:', error)
    }
  }

  // const fetchTodayEndShiftStatus = async () => {
  //   try {
  //     const response = await fetch(`${API_BASE}/reports/today-status/`, {
  //       headers: getAuthHeaders(),
  //     })
  //     const data = await response.json()
  //     if (response.ok) {
  //       setIsEndShiftClosed(data.is_closed)
  //     }
  //   } catch (error) {
  //     console.error('Failed to fetch end shift status', error)
  //   }
  // }

  const fetchDailySalesData = async () => {
    try {
      const res = await axios.get(`${API_BASE}/daily-sales/`, {
        headers: getAuthHeaders(),
      })
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

  const handleTicketClick = (ticketLabel) => {
    // Store the clicked ticket in localStorage
    localStorage.setItem('blinkingTicketPrice', ticketLabel)
    console.log(`Ticket ${ticketLabel} clicked. Stored in localStorage.`)
    
    // Dispatch a custom event for other windows to listen
    window.dispatchEvent(new CustomEvent('ticketBlinkRequested', { detail: { price: ticketLabel } }))
  }

  const handleTicketTypeClick = (typeName) => {
    if (typeName === 'Lucky Tickets') {
      // Store a special marker for lucky tickets
      localStorage.setItem('luckyTicketsAnimation', 'true')
      console.log('Lucky Tickets clicked - 5 random tickets will animate')
      
      // Dispatch a custom event
      window.dispatchEvent(new CustomEvent('luckyTicketsRequested', { detail: { type: 'luckyTickets' } }))
      
      // Clear after 5 seconds
      setTimeout(() => {
        localStorage.removeItem('luckyTicketsAnimation')
      }, 5000)
    } else if (typeName === 'New Tickets') {
      // Store a special marker for new tickets (current number 0-5)
      localStorage.setItem('newTicketsAnimation', 'true')
      console.log('New Tickets clicked - tickets with current number 0-5 will animate')
      
      // Dispatch a custom event
      window.dispatchEvent(new CustomEvent('newTicketsRequested', { detail: { type: 'newTickets' } }))
      
      // Clear after 5 seconds
      setTimeout(() => {
        localStorage.removeItem('newTicketsAnimation')
      }, 5000)
    } else if (typeName === 'Ending Tickets') {
      // Store a special marker for ending tickets (total - current is 0-5)
      localStorage.setItem('endingTicketsAnimation', 'true')
      console.log('Ending Tickets clicked - tickets with total-current 0-5 will animate')
      
      // Dispatch a custom event
      window.dispatchEvent(new CustomEvent('endingTicketsRequested', { detail: { type: 'endingTickets' } }))
      
      // Clear after 5 seconds
      setTimeout(() => {
        localStorage.removeItem('endingTicketsAnimation')
      }, 5000)
    }
  }

  const handleEndShift = async () => {
    // try {
    //   await axios.post(`${API_BASE}/end-shift/`, {}, {
    //   headers: getAuthHeaders(),
    // })
    navigate('/end-shift')
    // } catch (error) {
    //   console.error('Error ending shift:', error)
    //   setScanMessage('Failed to end shift')
    // }
  }

  const handleReloadLiveDisplay = () => {
    // Signal LiveDisplay tab/window to perform a one-time hard reload
    localStorage.setItem('reloadLiveDisplay', String(Date.now()))

    // Keep Dashboard stats fresh as well
    fetchDashboardStats()
  }

  const handleLogout = () => {
    // Logout should only clear auth/session state and redirect
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('blinkingTicketPrice')
    localStorage.removeItem('luckyTicketsAnimation')
    localStorage.removeItem('newTicketsAnimation')
    localStorage.removeItem('endingTicketsAnimation')
    localStorage.removeItem('reloadLiveDisplay')

    navigate('/login')
  }

  const handleRefreshDashboard = async () => {
    console.log('Dashboard refresh clicked')
    await Promise.all([
      fetchDashboardStats(),
      fetchTicketValues(),
      fetchDailySalesData(),
      // fetchTodayEndShiftStatus(),
    ])
    console.log('Dashboard refreshed')
  }

  const fetchDashboardStats = async () => {
    try {
      const res = await axios.get(`${API_BASE}/dashboard-stats/`, {
        headers: getAuthHeaders(),
      })
      setStats(res.data)
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
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

      if(response.ok){
        playBeep("success")
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

      await fetchDashboardStats()
    } catch (error) {
      playBeep("error")
      setScanMessage(error.message || 'Invalid input')
    }
  }

  // useEffect(() => {
  //   let timeoutId = null

  //   const handleGlobalKeyDown = (e) => {
  //     const tag = document.activeElement?.tagName?.toLowerCase()
  //     const isTypingInInput =
  //       tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

  //     if (isTypingInInput) return

  //     if (e.key === 'Enter') {
  //       const scannedValue = scannerBuffer.trim()

  //       if (/^\d{12,16}$/.test(scannedValue)) {
  //         handleTicketScan(scannedValue)
  //       }

  //       setScannerBuffer('')
  //       return
  //     }

  //     if (/^\d$/.test(e.key)) {
  //       setScannerBuffer((prev) => prev + e.key)

  //       clearTimeout(timeoutId)
  //       timeoutId = setTimeout(() => {
  //         setScannerBuffer('')
  //       }, 300)
  //     }
  //   }

  //   window.addEventListener('keydown', handleGlobalKeyDown)
  //   return () => {
  //     window.removeEventListener('keydown', handleGlobalKeyDown)
  //     clearTimeout(timeoutId)
  //   }
  // }, [scannerBuffer])
  useEffect(() => {
  let buffer = ''
  let timeoutId = null

  const handleGlobalKeyDown = (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase()
    const isTypingInInput =
      tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

    if (isTypingInInput) return

    // Still support Enter if scanner sends it
    if (e.key === 'Enter') {
      clearTimeout(timeoutId)
      const scannedValue = buffer.trim()
      console.log('Enter triggered, buffer:', scannedValue)
      if (/^\d{12,16}$/.test(scannedValue)) {
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
        if (/^\d{12,16}$/.test(scannedValue)) {
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
}, []) // ✅ empty deps — buffer is plain let, no stale closure

  useEffect(() => {
    fetchDashboardStats()
    fetchTicketValues()
    fetchDailySalesData()
    // fetchTodayEndShiftStatus()
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
          <button
            className="nav-item"
            onClick={() => window.open('/hor-live-display', '_blank')}
            style={{ background: 'transparent', color: '#666', border: 'none' }}
          >
            <span className="nav-icon">🖥️</span> <span className="nav-label">Horizontal Live Display</span>
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
            <h2>Dashboard</h2>
          </div>

          <div className="header-right">
            <button
              className="header-btn refresh-btn"
              title="Reload Screen"
              onClick={handleRefreshDashboard}
            >
              ↻
            </button>
            <button
              className="header-btn reload-btn"
              onClick={handleReloadLiveDisplay}
            >
              Reload Screen
            </button>
            {/* <button className="header-btn manage-btn">Manage Current Shift</button> */}
            {/* <button className="header-btn manage-btn" onClick={() => navigate('/manual-shift')}>Manual End Shift</button> */}
            <button className="header-btn end-btn" onClick={handleEndShift}>End Shift</button>
            {/* <button className="header-btn end-btn" onClick={handleEndShift} disabled={isEndShiftClosed}>End Shift</button> */}
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
                      label: 'Total Sales ($)',
                      data: dailySalesData.map((item) => item.total),
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
                          return `Total Sales: $${context.parsed.y.toLocaleString()}`;
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
                <button key={index} className="ticket-btn" title={`Display ${ticket.label}`} onClick={() => handleTicketClick(ticket.label)}>
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
                <button key={index} className="ticket-type-btn" title={`Display ${type.name}`} onClick={() => handleTicketTypeClick(type.name)}>
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