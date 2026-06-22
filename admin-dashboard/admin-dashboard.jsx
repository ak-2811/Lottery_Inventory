import { useEffect, useMemo, useState } from 'react'
import './styles.css'

const API_BASE_URL = 'http://127.0.0.1:8000/api'
const SALES_REFRESH_INTERVAL = 5000

const navItems = [
  ['Overview', '▦'],
  ['My Stores', '⌂'],
  ['Inventory', '◇'],
  ['Sales', '▥'],
]

const formatCurrency = (value, decimals = 0) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const readLoggedInUser = () => {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
}

function MetricCard({ icon, tone, label, value, detail }) {
  return (
    <article className="metric-card">
      <div className="metric-heading">
        <span className={`metric-icon ${tone}`}>{icon}</span>
      </div>
      <p>{label}</p>
      <strong className="metric-value">{value}</strong>
      <small>{detail}</small>
    </article>
  )
}

function EmptyState({ children }) {
  return <div className="empty-state">{children}</div>
}

export default function AdminDashboard() {
  const loggedInUser = readLoggedInUser()
  const [activeNav, setActiveNav] = useState('Overview')
  const [selectedStore, setSelectedStore] = useState('all')
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [apiData, setApiData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    const elements = [document.documentElement, document.body, document.getElementById('root')]
      .filter(Boolean)
    const previousStyles = elements.map((element) => ({
      element,
      height: element.style.height,
      minHeight: element.style.minHeight,
      overflow: element.style.overflow,
      overflowX: element.style.overflowX,
      overflowY: element.style.overflowY,
    }))

    elements.forEach((element) => {
      element.style.height = 'auto'
      element.style.minHeight = '100%'
      element.style.overflowX = 'hidden'
      element.style.overflowY = 'auto'
    })

    return () => {
      previousStyles.forEach(({ element, height, minHeight, overflow, overflowX, overflowY }) => {
        element.style.height = height
        element.style.minHeight = minHeight
        element.style.overflow = overflow
        element.style.overflowX = overflowX
        element.style.overflowY = overflowY
      })
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const fetchDashboard = async ({ showLoading = false } = {}) => {
      if (showLoading) setLoading(true)

      try {
        const response = await fetch(`${API_BASE_URL}/owner-dashboard/`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          },
          cache: 'no-store',
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Unable to load owner dashboard')
        }

        if (isMounted) {
          setApiData(data)
          setLastUpdated(new Date())
          setError('')
        }
      } catch (requestError) {
        if (isMounted) setError(requestError.message)
      } finally {
        if (isMounted && showLoading) setLoading(false)
      }
    }

    fetchDashboard({ showLoading: true })
    const refreshTimer = window.setInterval(() => {
      fetchDashboard()
    }, SALES_REFRESH_INTERVAL)

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchDashboard()
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      isMounted = false
      window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  const stores = useMemo(
    () =>
      (apiData?.store_wise || []).map((store, index) => ({
        ...store,
        id: store.store_id,
        name: store.store_name,
        initials: store.store_name
          .split(' ')
          .map((word) => word[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        color: ['forest', 'navy', 'rust', 'amber'][index % 4],
      })),
    [apiData],
  )

  const selectedStores = useMemo(
    () =>
      selectedStore === 'all'
        ? stores
        : stores.filter((store) => String(store.id) === String(selectedStore)),
    [selectedStore, stores],
  )

  const totals = useMemo(
    () =>
      selectedStores.reduce(
        (result, store) => ({
          sales: result.sales + Number(store.total_sales || 0),
          activeBoxes: result.activeBoxes + Number(store.active_boxes || 0),
          inactivePacks: result.inactivePacks + Number(store.inactive_packs || 0),
        }),
        { sales: 0, activeBoxes: 0, inactivePacks: 0 },
      ),
    [selectedStores],
  )

  const normalizedSearch = search.trim().toLowerCase()
  const visibleStores = selectedStores.filter((store) =>
    `${store.name} ${store.store_user || ''} ${store.store_email || ''}`
      .toLowerCase()
      .includes(normalizedSearch),
  )

  const ownerName = loggedInUser.name || apiData?.owner_name || loggedInUser.email || 'Owner'
  const firstName = ownerName.trim().split(/\s+/)[0]
  const initials = ownerName
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const openTab = (tab) => {
    setActiveNav(tab)
    setSidebarOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openStore = (storeId) => {
    setSelectedStore(storeId)
    setActiveNav('My Stores')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderStoreRows = (rows, compact = false) => {
    if (!rows.length) return <EmptyState>No stores match your search.</EmptyState>
    const maxSales = Math.max(...stores.map((store) => Number(store.total_sales || 0)), 1)

    return (
      <div className={compact ? 'store-list' : 'store-cards-grid'}>
        {rows.map((store) => (
          <button
            className={compact ? 'store-row' : 'store-detail-card'}
            key={store.id}
            onClick={() => openStore(store.id)}
            type="button"
          >
            <span className={`store-badge ${store.color}`}>{store.initials}</span>
            <span className="store-info">
              <strong>{store.name}</strong>
              <small>Store #{store.id} · Active</small>
            </span>
            <span className="store-result">
              <strong>{formatCurrency(store.total_sales)}</strong>
              <small>Gross sales</small>
            </span>
            {!compact && (
              <span className="store-facts">
                <span><strong>{store.active_boxes || 0}</strong><small>Activated packs</small></span>
                <span><strong>{store.inactive_packs || 0}</strong><small>Inactive packs</small></span>
                <span><strong>{store.store_user || '—'}</strong><small>Store user</small></span>
              </span>
            )}
            <span className="progress">
              <i style={{ width: `${(Number(store.total_sales || 0) / maxSales) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
    )
  }

  const renderActivatedPacks = () => {
    const packs = selectedStores
      .flatMap((store) =>
        (store.activated_packs || []).map((pack) => ({
          ...pack,
          storeId: store.id,
          storeName: store.name,
          storeInitials: store.initials,
          storeColor: store.color,
        })),
      )
      .filter((pack) =>
        `${pack.storeName} ${pack.name} ${pack.gameNum} ${pack.packNum} ${pack.boxNum}`
          .toLowerCase()
          .includes(normalizedSearch),
      )

    if (!packs.length) {
      return <EmptyState>No activated packs match your search.</EmptyState>
    }

    return (
      <article className="panel pack-group">
        <div className="panel-header">
          <div>
            <h2>{selectedStore === 'all' ? 'All stores' : selectedStores[0]?.name}</h2>
            <p>
              {packs.length} activated {packs.length === 1 ? 'pack' : 'packs'}
              {selectedStore === 'all' ? ` across ${selectedStores.length} stores` : ''}
            </p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="packs-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Box</th>
                <th>Game</th>
                <th>Pack number</th>
                <th>Current ticket</th>
                <th>Remaining</th>
                <th>Pack value</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack) => (
                <tr key={`${pack.storeId}-${pack.id}`}>
                  <td>
                    <span className="table-store">
                      <span className={`store-badge ${pack.storeColor}`}>{pack.storeInitials}</span>
                      <strong>{pack.storeName}</strong>
                    </span>
                  </td>
                  <td><span className="box-badge">{pack.boxNum}</span></td>
                  <td>
                    <strong>{pack.name || 'Lottery game'}</strong>
                    <small>Game #{pack.gameNum}</small>
                  </td>
                  <td>{pack.packNum}</td>
                  <td>{pack.currentNum}</td>
                  <td>{Math.max(Number(pack.totalTickets || 0) - Number(pack.currentNum || 0), 0)}</td>
                  <td>{pack.totalValue}</td>
                  <td>{pack.dateUpdated}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    )
  }

  const renderSales = () => {
    if (!visibleStores.length) {
      return <EmptyState>No stores match your search.</EmptyState>
    }

    const salesTotal = visibleStores.reduce(
      (sum, store) => sum + Number(store.total_sales || 0),
      0,
    )
    const topStore = [...visibleStores].sort(
      (first, second) => Number(second.total_sales || 0) - Number(first.total_sales || 0),
    )[0]
    const averageSales = salesTotal / visibleStores.length
    const maxSales = Math.max(...visibleStores.map((store) => Number(store.total_sales || 0)), 1)

    return (
      <>
        <section className="sales-summary-grid" aria-label="Store sales summary">
          <MetricCard
            detail={`Across ${visibleStores.length} selected ${visibleStores.length === 1 ? 'store' : 'stores'}`}
            icon="$"
            label="Combined sales"
            tone="green"
            value={formatCurrency(salesTotal)}
          />
          <MetricCard
            detail={topStore?.name || 'No store data'}
            icon="↗"
            label="Top performing store"
            tone="blue"
            value={formatCurrency(topStore?.total_sales)}
          />
          <MetricCard
            detail="Average recorded sales per store"
            icon="÷"
            label="Average sales"
            tone="amber"
            value={formatCurrency(averageSales)}
          />
        </section>

        <section className="sales-layout">
          <article className="panel sales-comparison-panel">
            <div className="panel-header">
              <div>
                <h2>Store sales comparison</h2>
                <p>Relative sales performance across selected locations</p>
              </div>
            </div>
            <div className="sales-bars">
              {visibleStores.map((store) => (
                <div className="sales-bar-row" key={store.id}>
                  <div className="sales-bar-label">
                    <span className={`store-badge ${store.color}`}>{store.initials}</span>
                    <span>
                      <strong>{store.name}</strong>
                      <small>{formatCurrency(store.total_sales)}</small>
                    </span>
                  </div>
                  <div className="sales-bar-track">
                    <i style={{ width: `${(Number(store.total_sales || 0) / maxSales) * 100}%` }} />
                  </div>
                  <strong className="sales-share">
                    {salesTotal ? ((Number(store.total_sales || 0) / salesTotal) * 100).toFixed(1) : '0.0'}%
                  </strong>
                </div>
              ))}
            </div>
          </article>
        </section>

        <article className="panel sales-table-panel">
          <div className="panel-header">
            <div>
              <h2>Store-wise sales</h2>
              <p>Sales totals and latest daily report for each location</p>
            </div>
          </div>
          <div className="table-scroll">
            <table className="sales-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th>Store user</th>
                  <th>Total sales</th>
                  <th>Contribution</th>
                  <th>Latest daily sales</th>
                  <th>Latest report</th>
                  <th>Activated packs</th>
                </tr>
              </thead>
              <tbody>
                {visibleStores.map((store) => {
                  const latestReport = (store.daily_sales || []).at(-1)
                  return (
                    <tr key={store.id}>
                      <td>
                        <span className="table-store">
                          <span className={`store-badge ${store.color}`}>{store.initials}</span>
                          <span>
                            <strong>{store.name}</strong>
                            <small>Store #{store.id}</small>
                          </span>
                        </span>
                      </td>
                      <td>
                        <strong>{store.store_user || '—'}</strong>
                        <small>{store.store_email || ''}</small>
                      </td>
                      <td><strong className="sales-amount">{formatCurrency(store.total_sales, 2)}</strong></td>
                      <td>
                        <span className="contribution-pill">
                          {salesTotal ? ((Number(store.total_sales || 0) / salesTotal) * 100).toFixed(1) : '0.0'}%
                        </span>
                      </td>
                      <td>{latestReport ? formatCurrency(latestReport.total, 2) : '—'}</td>
                      <td>
                        {latestReport
                          ? new Date(`${latestReport.date}T00:00:00`).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : 'No report'}
                      </td>
                      <td>{store.active_boxes || 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </article>
      </>
    )
  }

  return (
    <div className="admin-dashboard">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div><strong>LuckyDesk</strong><small>Owner Console</small></div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p className="nav-label">Workspace</p>
          {navItems.map(([label, icon]) => (
            <button
              className={`nav-link ${activeNav === label ? 'active' : ''}`}
              key={label}
              onClick={() => openTab(label)}
              type="button"
            >
              <span className="nav-symbol">{icon}</span>
              {label}
              {label === 'My Stores' && <span className="nav-count">{stores.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-help">
          <div className="help-icon">?</div>
          <div><strong>Need help?</strong><span>View owner guide</span></div>
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
            <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <span className="live-status" title={lastUpdated ? `Last updated ${lastUpdated.toLocaleTimeString()}` : 'Connecting'}>
              <i />
              Live
            </span>
            <label className="search-box">
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search stores or packs"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search stores or packs"
                type="search"
                value={search}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button className="profile-button" type="button">
              <span className="avatar">{initials}</span>
              <span className="profile-copy">
                <strong>{ownerName}</strong>
                <small>Store owner</small>
              </span>
            </button>
          </div>
        </header>

        <main>
          <section className="welcome-row">
            <div>
              <p className="eyebrow">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <h1>
                {activeNav === 'Overview' && `Good morning, ${firstName}.`}
                {activeNav === 'My Stores' && 'My stores'}
                {activeNav === 'Inventory' && 'Activated packs'}
                {activeNav === 'Sales' && 'Store-wise sales'}
              </h1>
              <p>
                {activeNav === 'Overview' && 'Here is what is happening across your stores today.'}
                {activeNav === 'My Stores' && 'View sales, users, and inventory status for each location.'}
                {activeNav === 'Inventory' && 'Review activated lottery packs grouped by store.'}
                {activeNav === 'Sales' && 'Compare sales performance across all of your store locations.'}
              </p>
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
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {loading && <EmptyState>Loading dashboard…</EmptyState>}
          {error && <div className="error-state">{error}</div>}

          {!loading && !error && activeNav === 'Overview' && (
            <>
              <section className="metrics-grid" aria-label="Business metrics">
                <MetricCard
                  detail={`Across ${selectedStores.length} store locations`}
                  icon="$"
                  label="Gross sales"
                  tone="green"
                  value={formatCurrency(totals.sales)}
                />
                <MetricCard
                  detail="Currently displayed on store screens"
                  icon="◇"
                  label="Activated packs"
                  tone="blue"
                  value={totals.activeBoxes}
                />
                <MetricCard
                  detail="Available for future activation"
                  icon="□"
                  label="Inactive packs"
                  tone="amber"
                  value={totals.inactivePacks}
                />
                <MetricCard
                  detail="Locations connected to this owner"
                  icon="⌂"
                  label="Stores"
                  tone="violet"
                  value={selectedStores.length}
                />
              </section>

              <section className="dashboard-grid">
                <article className="panel sales-panel">
                  <div className="panel-header">
                    <div>
                      <h2>Sales overview</h2>
                      <p>Combined performance across selected locations</p>
                    </div>
                  </div>
                  <div className="chart-summary">
                    <div><strong>{formatCurrency(totals.sales, 2)}</strong></div>
                    <small>Total gross sales</small>
                  </div>
                  <div className="chart-wrap">
                    <div className="y-axis"><span>$4k</span><span>$3k</span><span>$2k</span><span>$1k</span><span>$0</span></div>
                    <div className="chart" aria-label="Seven-day sales chart">
                      <div className="grid-lines" aria-hidden="true"><i /><i /><i /><i /><i /></div>
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
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}
                      </div>
                    </div>
                  </div>
                </article>

                <article className="panel stores-panel">
                  <div className="panel-header">
                    <div><h2>Store performance</h2><p>Sales contribution</p></div>
                    <button className="text-button" onClick={() => openTab('My Stores')} type="button">View stores →</button>
                  </div>
                  {renderStoreRows(visibleStores, true)}
                </article>
              </section>
            </>
          )}

          {!loading && !error && activeNav === 'My Stores' && renderStoreRows(visibleStores)}
          {!loading && !error && activeNav === 'Inventory' && renderActivatedPacks()}
          {!loading && !error && activeNav === 'Sales' && renderSales()}
        </main>
      </div>

      <button
        aria-label="Close navigation"
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
        type="button"
      />
    </div>
  )
}
