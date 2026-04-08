import React, { useState } from 'react'
import '../App.css'
import './dashboard.css'

export default function Dashboard({ onNavigate }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const ticketOnScreen = [
    { value: '$1', label: '$1' },
    { value: '$2', label: '$2' },
    { value: '$3', label: '$3' },
    { value: '$5', label: '$5' },
    { value: '$7', label: '$7' },
    { value: '$10', label: '$10' },
    { value: '$20', label: '$20' },
    { value: '$25', label: '$25' },
    { value: '$30', label: '$30' },
    { value: '$50', label: '$50' },
  ]

  const ticketTypes = [
    { name: 'New Tickets', icon: '👥' },
    { name: 'Lucky Tickets', icon: '👥' },
    { name: 'Ending Tickets', icon: '👥' },
  ]

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
            <button className="header-btn refresh-btn" title="Reload Screen">↻</button>
            <button className="header-btn reload-btn">Reload Screen</button>
            <button className="header-btn manage-btn">Manage Current Shift</button>
            <button className="header-btn end-btn">End Shift</button>
          </div>
        </div>

        <div className="dashboard-content">
          <div className="stats-grid">
            <div className="stat-box large">
              <label>Instant Sales ( Today )</label>
              <div className="stat-value large-value">$ 240</div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-box">
              <label>Active Boxes</label>
              <div className="stat-value">53</div>
            </div>
            <div className="stat-box">
              <label>Activated Today</label>
              <div className="stat-value">0</div>
            </div>
            <div className="stat-box">
              <label>Activated This Week</label>
              <div className="stat-value">3</div>
            </div>
            <div className="stat-box">
              <label>Activated This Month</label>
              <div className="stat-value">49</div>
            </div>
            <div className="stat-box">
              <label>Inactive Packs</label>
              <div className="stat-value">96</div>
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
