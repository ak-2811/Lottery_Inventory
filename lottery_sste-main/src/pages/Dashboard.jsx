import React, { useEffect, useState } from 'react'
import axios from 'axios'
import '../App.css'
import './dashboard.css'

export default function Dashboard({ onNavigate }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ticketOnScreen, setTicketOnScreen] = useState([])

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
      const res = await axios.get('http://127.0.0.1:8000/api/ticket-values/')
      setTicketOnScreen(res.data)
    } catch (error) {
      console.error('Error fetching ticket values:', error)
    }
  }

  const ticketTypes = [
    { name: 'New Tickets', icon: '👥' },
    { name: 'Lucky Tickets', icon: '👥' },
    { name: 'Ending Tickets', icon: '👥' },
  ]

  const fetchDashboardStats = async () => {
    try {
      const res = await axios.get('http://127.0.0.1:8000/api/dashboard-stats/')
      setStats(res.data)
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    }
  }

  useEffect(() => {
    fetchDashboardStats()
  }, [])

  useEffect(() => {
    fetchDashboardStats()
    fetchTicketValues()
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
            onClick={() => onNavigate('dashboard')}
            style={{ background: 'transparent', border: 'none', color: '#1a7a6f' }}
          >
            <span className="nav-icon">⊞</span> <span className="nav-label">Dashboard</span>
          </button>
          <button 
            className="nav-item"
            onClick={() => onNavigate('inventory')}
            style={{ background: 'transparent', border: 'none', color: '#666' }}
          >
            <span className="nav-icon">📦</span> <span className="nav-label">Inventory</span>
          </button>
          <a href="#" className="nav-item">
            <span className="nav-icon">💰</span> <span className="nav-label">Sales</span>
          </a>
          <a href="#" className="nav-item">
            <span className="nav-icon">📊</span> <span className="nav-label">Analytics</span>
          </a>
          <button 
            className="nav-item"
            onClick={() => onNavigate('activate')}
            style={{ background: 'transparent', color: '#666', border: 'none' }}
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
            <button className="header-btn end-btn">End Shift</button>
          </div>
        </div>

        <div className="dashboard-content">
          <div className="stats-grid">
            <div className="stat-box large">
              <label>Instant Sales ( Today )</label>
              <div className="stat-value large-value">$ {stats.instant_sales_today}</div>
            </div>
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