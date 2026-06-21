import { useMemo, useState } from 'react'
import './styles.css'

const stores = [
  {
    id: 'downtown',
    initials: 'DM',
    name: 'Downtown Market',
    number: '001',
    sales: 8240,
    lotterySales: 5684,
    inventory: 112,
    inventoryValue: 18840,
    openShifts: 2,
    change: 14.2,
    color: 'forest',
  },
  {
    id: 'riverside',
    initials: 'RE',
    name: 'Riverside Express',
    number: '002',
    sales: 6105,
    lotterySales: 4098,
    inventory: 96,
    inventoryValue: 16120,
    openShifts: 2,
    change: 9.8,
    color: 'navy',
  },
  {
    id: 'oak',
    initials: 'OS',
    name: 'Oak Street Mart',
    number: '003',
    sales: 4297,
    lotterySales: 2698,
    inventory: 76,
    inventoryValue: 12960,
    openShifts: 1,
    change: -2.1,
    color: 'rust',
  },
]

const inventoryItems = [
  {
    id: 1,
    storeId: 'downtown',
    game: 'Money Multiplier',
    gameNumber: '2481',
    store: 'Downtown Market',
    status: 'Low stock',
    statusClass: 'low',
    remaining: 2,
    value: 600,
    color: 'green',
  },
  {
    id: 2,
    storeId: 'riverside',
    game: 'Lucky 7s',
    gameNumber: '1178',
    store: 'Riverside Express',
    status: 'Low stock',
    statusClass: 'low',
    remaining: 3,
    value: 900,
    color: 'blue',
  },
  {
    id: 3,
    storeId: 'oak',
    game: 'Cash Bonanza',
    gameNumber: '3044',
    store: 'Oak Street Mart',
    status: 'Reorder',
    statusClass: 'urgent',
    remaining: 1,
    value: 300,
    color: 'amber',
  },
  {
    id: 4,
    storeId: 'downtown',
    game: 'Diamond Dollars',
    gameNumber: '2095',
    store: 'Downtown Market',
    status: 'Review',
    statusClass: 'check',
    remaining: 4,
    value: 1200,
    color: 'violet',
  },
]

const activity = [
  {
    id: 1,
    type: 'success',
    icon: '✓',
    title: 'Shift closed successfully',
    text: 'Maria closed register 2 at Downtown Market.',
    time: '12 minutes ago',
  },
  {
    id: 2,
    type: 'warning',
    icon: '!',
    title: 'Inventory running low',
    text: 'Cash Bonanza has 1 pack remaining at Oak Street.',
    time: '34 minutes ago',
  },
  {
    id: 3,
    type: 'info',
    icon: '↗',
    title: 'New daily sales high',
    text: 'Riverside Express crossed $6,000 in daily sales.',
    time: '1 hour ago',
  },
  {
    id: 4,
    type: 'neutral',
    icon: '+',
    title: 'Pack activated',
    text: 'James activated pack #592041 at Downtown Market.',
    time: '2 hours ago',
  },
]

const periodMultipliers = {
  today: 1,
  week: 6.54,
  month: 27.2,
}

const navItems = [
  ['Overview', '▦'],
  ['My Stores', '⌂'],
  ['Inventory', '◇'],
  ['Sales', '▥'],
  ['Reports', '▤'],
]

const managementItems = [
  ['Team', '♙'],
  ['Settings', '⚙'],
]

const formatCurrency = (value, decimals = 0) =>
  value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

function MetricCard({ icon, tone, trend, trendTone, label, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span className={`metric-icon ${tone}`}>{icon}</span>
        <span className={`trend ${trendTone}`}>{trend}</span>
      </div>
      <p>{label}</p>
      <strong className="metric-value">{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

export default function AdminDashboard() {
  const [selectedStore, setSelectedStore] = useState('all')
  const [period, setPeriod] = useState('today')
  const [search, setSearch] = useState('')
  const [activeNav, setActiveNav] = useState('Overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [showToast, setShowToast] = useState(false)

  const selectedStores = useMemo(
    () =>
      selectedStore === 'all'
        ? stores
        : stores.filter((store) => store.id === selectedStore),
    [selectedStore],
  )

  const totals = useMemo(
    () =>
      selectedStores.reduce(
        (result, store) => ({
          sales: result.sales + store.sales,
          lotterySales: result.lotterySales + store.lotterySales,
          inventory: result.inventory + store.inventory,
          inventoryValue: result.inventoryValue + store.inventoryValue,
          openShifts: result.openShifts + store.openShifts,
        }),
        {
          sales: 0,
          lotterySales: 0,
          inventory: 0,
          inventoryValue: 0,
          openShifts: 0,
        },
      ),
    [selectedStores],
  )

  const multiplier = periodMultipliers[period]
  const normalizedSearch = search.trim().toLowerCase()

  const visibleStores = selectedStores.filter((store) =>
    store.name.toLowerCase().includes(normalizedSearch),
  )

  const visibleInventory = inventoryItems.filter((item) => {
    const matchesStore = selectedStore === 'all' || item.storeId === selectedStore
    const matchesSearch = `${item.game} ${item.store}`
      .toLowerCase()
      .includes(normalizedSearch)
    return matchesStore && matchesSearch
  })

  const handleExport = () => {
    setShowToast(true)
    window.setTimeout(() => setShowToast(false), 2800)
  }

  const selectStore = (storeId) => {
    setSelectedStore(storeId)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="admin-dashboard">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>LuckyDesk</strong>
            <small>Owner Console</small>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map(([label, icon]) => (
            <button
              className={`nav-link ${activeNav === label ? 'active' : ''}`}
              key={label}
              onClick={() => {
                setActiveNav(label)
                setSidebarOpen(false)
              }}
              type="button"
            >
              <span className="nav-symbol">{icon}</span>
              {label}
              {label === 'My Stores' && <span className="nav-count">3</span>}
            </button>
          ))}

          <p className="nav-label nav-label-spaced">Management</p>
          {managementItems.map(([label, icon]) => (
            <button
              className={`nav-link ${activeNav === label ? 'active' : ''}`}
              key={label}
              onClick={() => {
                setActiveNav(label)
                setSidebarOpen(false)
              }}
              type="button"
            >
              <span className="nav-symbol">{icon}</span>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <div>
            <strong>Need help?</strong>
            <span>View owner guide</span>
          </div>
          <span aria-hidden="true">↗</span>
        </div>
      </aside>

      <div className="page">
        <header className="topbar">
          <button
            aria-label="Open navigation"
            className="icon-button menu-button"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            ☰
          </button>

          <div className="topbar-title">
            <span>Owner dashboard</span>
            <strong>{selectedStore === 'all' ? 'All stores' : selectedStores[0].name}</strong>
          </div>

          <div className="topbar-actions">
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search stores or games"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stores or games"
                type="search"
                value={search}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button notification-button" aria-label="Notifications" type="button">
              ♢
              <span />
            </button>
            <button className="profile-button" type="button">
              <span className="avatar">AM</span>
              <span className="profile-copy">
                <strong>Alex Morgan</strong>
                <small>Store owner</small>
              </span>
              <span className="chevron">⌄</span>
            </button>
          </div>
        </header>

        <main>
          <section className="welcome-row">
            <div>
              <p className="eyebrow">Sunday, June 21</p>
              <h1>Good morning, Alex.</h1>
              <p>Here is what is happening across your stores today.</p>
            </div>
            <div className="page-actions">
              <label className="control-select">
                <span aria-hidden="true">⌂</span>
                <select
                  aria-label="Select store"
                  onChange={(event) => setSelectedStore(event.target.value)}
                  value={selectedStore}
                >
                  <option value="all">All stores</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-select">
                <span aria-hidden="true">□</span>
                <select
                  aria-label="Select period"
                  onChange={(event) => setPeriod(event.target.value)}
                  value={period}
                >
                  <option value="today">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                </select>
              </label>
              <button className="primary-button" onClick={handleExport} type="button">
                ↓ Export report
              </button>
            </div>
          </section>

          <section className="metrics-grid" aria-label="Business metrics">
            <MetricCard
              detail="vs. $16,580 last period"
              icon="$"
              label="Gross sales"
              tone="green"
              trend="↗ 12.4%"
              trendTone="positive"
              value={formatCurrency(totals.sales * multiplier)}
            />
            <MetricCard
              detail="66.9% of total sales"
              icon="◫"
              label="Lottery sales"
              tone="blue"
              trend="↗ 8.1%"
              trendTone="positive"
              value={formatCurrency(totals.lotterySales * multiplier)}
            />
            <MetricCard
              detail={`${formatCurrency(totals.inventoryValue)} total value`}
              icon="◇"
              label="Active inventory"
              tone="amber"
              trend="18 low"
              trendTone="warning"
              value={`${totals.inventory} packs`}
            />
            <MetricCard
              detail={`Across ${selectedStores.length} store locations`}
              icon="◷"
              label="Open shifts"
              tone="violet"
              trend="2 pending"
              trendTone="neutral"
              value={totals.openShifts}
            />
          </section>

          <section className="dashboard-grid">
            <article className="panel sales-panel">
              <div className="panel-header">
                <div>
                  <h2>Sales overview</h2>
                  <p>Combined performance across selected locations</p>
                </div>
                <div className="legend">
                  <span><i className="legend-dot primary" />This period</span>
                  <span><i className="legend-dot muted" />Previous</span>
                </div>
              </div>
              <div className="chart-summary">
                <div>
                  <strong>{formatCurrency(totals.sales * multiplier, 2)}</strong>
                  <span className="trend positive">↗ 12.4%</span>
                </div>
                <small>Total gross sales</small>
              </div>
              <div className="chart-wrap">
                <div className="y-axis">
                  <span>$4k</span><span>$3k</span><span>$2k</span><span>$1k</span><span>$0</span>
                </div>
                <div className="chart" aria-label="Seven-day sales chart">
                  <div className="grid-lines" aria-hidden="true">
                    <i /><i /><i /><i /><i />
                  </div>
                  <svg className="line-chart" viewBox="0 0 700 220" preserveAspectRatio="none" aria-hidden="true">
                    <defs>
                      <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#286b5d" stopOpacity=".18" />
                        <stop offset="100%" stopColor="#286b5d" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path className="area-path" d="M0,150 L116,128 L233,141 L350,83 L466,105 L583,58 L700,76 L700,220 L0,220 Z" />
                    <path className="previous-path" d="M0,174 L116,145 L233,155 L350,122 L466,132 L583,106 L700,118" />
                    <path className="current-path" d="M0,150 L116,128 L233,141 L350,83 L466,105 L583,58 L700,76" />
                  </svg>
                  <div className="x-axis">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="panel stores-panel">
              <div className="panel-header">
                <div>
                  <h2>Store performance</h2>
                  <p>Sales contribution today</p>
                </div>
                <button className="text-button" type="button">View details →</button>
              </div>
              <div className="store-list">
                {visibleStores.map((store) => {
                  const maxSales = Math.max(...stores.map((item) => item.sales))
                  return (
                    <button
                      className="store-row"
                      key={store.id}
                      onClick={() => selectStore(store.id)}
                      type="button"
                    >
                      <span className={`store-badge ${store.color}`}>{store.initials}</span>
                      <span className="store-info">
                        <strong>{store.name}</strong>
                        <small>Store #{store.number} · Open</small>
                      </span>
                      <span className="store-result">
                        <strong>{formatCurrency(store.sales)}</strong>
                        <small className={store.change >= 0 ? 'up' : 'down'}>
                          {store.change >= 0 ? '↗' : '↘'} {Math.abs(store.change)}%
                        </small>
                      </span>
                      <span className="progress">
                        <i style={{ width: `${(store.sales / maxSales) * 100}%` }} />
                      </span>
                    </button>
                  )
                })}
              </div>
            </article>
          </section>

          <section className="dashboard-grid lower-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <h2>Inventory attention</h2>
                  <p>Packs requiring action across your stores</p>
                </div>
                <button className="text-button" type="button">View inventory →</button>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Game</th>
                      <th>Store</th>
                      <th>Status</th>
                      <th>Remaining</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleInventory.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className={`game-dot ${item.color}`} />
                          <strong>{item.game}</strong>
                          <small>#{item.gameNumber}</small>
                        </td>
                        <td>{item.store}</td>
                        <td><span className={`status ${item.statusClass}`}>{item.status}</span></td>
                        <td>{item.remaining} packs</td>
                        <td>{formatCurrency(item.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>

            <article className="panel activity-panel">
              <div className="panel-header">
                <div>
                  <h2>Recent activity</h2>
                  <p>Latest updates from every location</p>
                </div>
                <button className="icon-button more-button" aria-label="More options" type="button">•••</button>
              </div>
              <div className="activity-list">
                {activity.map((item) => (
                  <div className="activity-item" key={item.id}>
                    <span className={`activity-icon ${item.type}`}>{item.icon}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.text}</p>
                      <small>{item.time}</small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        </main>
      </div>

      <button
        aria-label="Close navigation"
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        type="button"
      />

      <div className={`toast ${showToast ? 'show' : ''}`} role="status">
        <span>✓</span>
        <div>
          <strong>Report ready</strong>
          <small>Static example report prepared.</small>
        </div>
      </div>
    </div>
  )
}
