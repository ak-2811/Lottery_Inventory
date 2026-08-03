import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Bar } from 'react-chartjs-2'
import ManagerPinModal from './ManagerPinModal'
import {clearManagerAccessToken} from '../utils/managerAccess'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'
import '../App.css'
import './dashboard.css'
import { API_BASE } from '../config/api.js'
// import { useNavigate } from 'react-router-dom'

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

const formatDateInputValue = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultSalesDateRange = () => {
  const toDate = new Date()
  const fromDate = new Date(toDate)
  fromDate.setDate(toDate.getDate() - 13)

  return {
    from: formatDateInputValue(fromDate),
    to: formatDateInputValue(toDate),
  }
}

const parseDateInputValue = (value, endOfDay = false) => {
  if (!value) return null

  const parsedDate = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return null

  if (endOfDay) {
    parsedDate.setHours(23, 59, 59, 999)
  }

  return parsedDate
}

const formatDateDisplayValue = (value) => {
  const date = parseDateInputValue(value)
  if (!date) return 'Select date'

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  })
}

const getMonthLabel = (date) =>
  date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

const getMonthStart = (date) => new Date(date.getFullYear(), date.getMonth(), 1)

const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1)

const getCalendarDates = (monthDate) => {
  const firstDay = getMonthStart(monthDate)
  const gridStart = new Date(firstDay)
  gridStart.setDate(firstDay.getDate() - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
}

const isDateOutsideBounds = (date, min, max) => {
  const minDate = parseDateInputValue(min)
  const maxDate = parseDateInputValue(max, true)

  return (minDate && date < minDate) || (maxDate && date > maxDate)
}

const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const wrapChartLabel = (label, maxLineLength = 12, maxLines = 3) => {
  if (!label) return ''

  const words = String(label).split(/\s+/).filter(Boolean)
  const lines = []

  words.forEach((word) => {
    const currentLine = lines[lines.length - 1] || ''
    const nextLine = currentLine ? `${currentLine} ${word}` : word

    if (!currentLine || nextLine.length <= maxLineLength) {
      lines[lines.length - 1] = nextLine
    } else {
      lines.push(word)
    }
  })

  if (lines.length <= maxLines) return lines

  const visibleLines = lines.slice(0, maxLines)
  visibleLines[maxLines - 1] = `${visibleLines[maxLines - 1]}...`
  return visibleLines
}

function SalesCalendar({ value, min, max, monthDate, onMonthChange, onSelect, onClose }) {
  const today = new Date()
  const dates = getCalendarDates(monthDate)
  const todayValue = formatDateInputValue(today)
  const canSelectToday = !isDateOutsideBounds(today, min, max)

  return (
    <div className="sales-calendar" role="dialog" aria-label="Choose date">
      <div className="sales-calendar-header">
        <button
          type="button"
          className="sales-calendar-month"
          onClick={() => onMonthChange(getMonthStart(new Date()))}
        >
          {getMonthLabel(monthDate)}
        </button>
        <div className="sales-calendar-nav">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(addMonths(monthDate, -1))}>
            ‹
          </button>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(addMonths(monthDate, 1))}>
            ›
          </button>
        </div>
      </div>

      <div className="sales-calendar-weekdays" aria-hidden="true">
        {weekDays.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      <div className="sales-calendar-grid">
        {dates.map((date) => {
          const dateValue = formatDateInputValue(date)
          const isOutsideMonth = date.getMonth() !== monthDate.getMonth()
          const isSelected = dateValue === value
          const isToday = dateValue === todayValue
          const isDisabled = isDateOutsideBounds(date, min, max)

          return (
            <button
              type="button"
              key={dateValue}
              className={[
                'sales-calendar-day',
                isOutsideMonth ? 'outside-month' : '',
                isSelected ? 'selected' : '',
                isToday ? 'today' : '',
              ].filter(Boolean).join(' ')}
              disabled={isDisabled}
              onClick={() => onSelect(dateValue)}
            >
              {date.getDate()}
            </button>
          )
        })}
      </div>

      <div className="sales-calendar-footer">
        <button type="button" onClick={onClose}>Done</button>
        <button
          type="button"
          disabled={!canSelectToday}
          onClick={() => {
            onMonthChange(getMonthStart(today))
            onSelect(todayValue)
          }}
        >
          Today
        </button>
      </div>
    </div>
  )
}

function SalesDateRangePicker({
  dateRange,
  activeCalendar,
  calendarMonth,
  onOpenCalendar,
  onMonthChange,
  onSelectDate,
  onCloseCalendar,
}) {
  return (
    <div className="sales-range-filter" aria-label="Sales date range">
      <div className="sales-date-field">
        <span>From</span>
        <button
          type="button"
          className="sales-date-trigger"
          aria-haspopup="dialog"
          aria-expanded={activeCalendar === 'from'}
          onClick={() => onOpenCalendar('from')}
        >
          {formatDateDisplayValue(dateRange.from)}
        </button>
        {activeCalendar === 'from' && (
          <SalesCalendar
            value={dateRange.from}
            max={dateRange.to}
            monthDate={calendarMonth}
            onMonthChange={onMonthChange}
            onSelect={(value) => onSelectDate('from', value)}
            onClose={onCloseCalendar}
          />
        )}
      </div>
      <span className="sales-date-divider" aria-hidden="true">to</span>
      <div className="sales-date-field">
        <span>To</span>
        <button
          type="button"
          className="sales-date-trigger"
          aria-haspopup="dialog"
          aria-expanded={activeCalendar === 'to'}
          onClick={() => onOpenCalendar('to')}
        >
          {formatDateDisplayValue(dateRange.to)}
        </button>
        {activeCalendar === 'to' && (
          <SalesCalendar
            value={dateRange.to}
            min={dateRange.from}
            monthDate={calendarMonth}
            onMonthChange={onMonthChange}
            onSelect={(value) => onSelectDate('to', value)}
            onClose={onCloseCalendar}
          />
        )}
      </div>
    </div>
  )
}

const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

const getIsoWeekKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return ''

  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNumber = normalized.getUTCDay() || 7
  normalized.setUTCDate(normalized.getUTCDate() + 4 - dayNumber)
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil((((normalized - yearStart) / 86400000) + 1) / 7)

  return `${normalized.getUTCFullYear()}-${weekNumber}`
}

const getPackCreatedDate = (pack) => {
  const createdDate = new Date(pack.created_at)
  return Number.isNaN(createdDate.getTime()) ? null : createdDate
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [showReportsPin, setShowReportsPin] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [ticketOnScreen, setTicketOnScreen] = useState([])
  const [scanMessage, setScanMessage] = useState('')
  const [topSalesDateRange, setTopSalesDateRange] = useState(getDefaultSalesDateRange)
  const [activeTopSalesCalendar, setActiveTopSalesCalendar] = useState(null)
  const [topSalesCalendarMonth, setTopSalesCalendarMonth] = useState(() => getMonthStart(new Date()))
  const [topSalesMode, setTopSalesMode] = useState('games')
  const [topSalesData, setTopSalesData] = useState({ games: [], ticket_values: [] })
  const [activePackRows, setActivePackRows] = useState([])
  const [inactivePackRows, setInactivePackRows] = useState([])
  const [activatedTodayRows, setActivatedTodayRows] =
  useState([])

const [
  activatedThisWeekRows,
  setActivatedThisWeekRows,
] = useState([])

const [
  activatedThisMonthRows,
  setActivatedThisMonthRows,
] = useState([])
  const [selectedStatList, setSelectedStatList] = useState(null)
  const [packPendingDelete, setPackPendingDelete] = useState(null)
  const [expandedPackIds, setExpandedPackIds] = useState({})
  const topSalesRows = topSalesMode === 'games' ? topSalesData.games : topSalesData.ticket_values
  const topSalesChartMinWidth = Math.max(760, topSalesRows.length * 118)
  const handleOpenReports = () => {
    clearManagerAccessToken('reports')
    setShowReportsPin(true)
  }
  // const dashboardPackLists = useMemo(() => {
  //   const now = new Date()
  //   const todayKey = now.toDateString()
  //   const currentWeekKey = getIsoWeekKey(now)
  //   const currentMonth = now.getMonth()
  //   const currentYear = now.getFullYear()

  //   return {
  //     active_boxes: activePackRows,
  //     activated_today: activePackRows.filter((pack) => getPackCreatedDate(pack)?.toDateString() === todayKey),
  //     activated_this_week: activePackRows.filter((pack) => getIsoWeekKey(getPackCreatedDate(pack)) === currentWeekKey),
  //     activated_this_month: activePackRows.filter((pack) => {
  //       const createdDate = getPackCreatedDate(pack)
  //       return createdDate?.getFullYear() === currentYear && createdDate.getMonth() === currentMonth
  //     }),
  //     inactive_packs: inactivePackRows,
  //   }
  // }, [activePackRows, inactivePackRows])
  const dashboardPackLists = useMemo(
  () => ({
    active_boxes: activePackRows,
    activated_today: activatedTodayRows,
    activated_this_week:
      activatedThisWeekRows,
    activated_this_month:
      activatedThisMonthRows,
    inactive_packs: inactivePackRows,
  }),
  [
    activePackRows,
    activatedTodayRows,
    activatedThisWeekRows,
    activatedThisMonthRows,
    inactivePackRows,
  ]
)
  const selectedPackRows = selectedStatList ? dashboardPackLists[selectedStatList.key] || [] : []
  const toggleExpandedPack = (rowKey) => {
    setExpandedPackIds((current) => ({
      ...current,
      [rowKey]: !current[rowKey],
    }))
  }
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

  const fetchTopSalesData = async () => {
    try {
      const params = new URLSearchParams({
        from: topSalesDateRange.from,
        to: topSalesDateRange.to,
      })
      const res = await axios.get(`${API_BASE}/sales-performance/?${params.toString()}`, {
        headers: getAuthHeaders(),
      })
      setTopSalesData({
        games: res.data.games || [],
        ticket_values: res.data.ticket_values || [],
      })
    } catch (error) {
      console.error('Error fetching top sales data:', error)
      setTopSalesData({ games: [], ticket_values: [] })
    }
  }

  // const fetchDashboardPackLists = async () => {
  //   try {
  //     const [activeRes, inventoryRes] = await Promise.all([
  //       axios.get(`${API_BASE}/activated-books/`, {
  //         headers: getAuthHeaders(),
  //       }),
  //       axios.get(`${API_BASE}/books/`, {
  //         headers: getAuthHeaders(),
  //       }),
  //     ])

  //     setActivePackRows(activeRes.data || [])
  //     setInactivePackRows(
  //       (inventoryRes.data || [])
  //         .filter((book) => !book.is_activated && !book.is_sold)
  //         .map((book) => ({
  //           id: book.id,
  //           boxNum: '-',
  //           image: book.image,
  //           name: book.name,
  //           currentNum: '-',
  //           gameNum: book.game,
  //           packNum: book.pack || book.pack_id,
  //           dateUpdated: book.date,
  //           created_at: book.created_at,
  //         }))
  //     )
  //   } catch (error) {
  //     console.error('Error fetching dashboard pack lists:', error)
  //   }
  // }
  const fetchDashboardPackLists = async () => {
  try {
    const [activeRes, inventoryRes] =
      await Promise.all([
        axios.get(
          `${API_BASE}/activated-books/`,
          {
            headers: getAuthHeaders(),
          }
        ),
        axios.get(`${API_BASE}/books/`, {
          headers: getAuthHeaders(),
        }),
      ])

    setActivePackRows(
      activeRes.data || []
    )

    setInactivePackRows(
      (inventoryRes.data || [])
        .filter(
          (book) =>
            !book.is_activated &&
            !book.is_sold
        )
        .map((book) => ({
          id: book.id,
          boxNum: '-',
          image: book.image,
          name: book.name,
          currentNum: '-',
          gameNum: book.game,
          packNum:
            book.pack || book.pack_id,
          dateUpdated: book.date,
          created_at: book.created_at,
        }))
    )
  } catch (error) {
    console.error(
      'Error fetching dashboard pack lists:',
      error
    )
  }
}

  const handleDeleteInactivePack = async (pack) => {
    try {
      await axios.delete(`${API_BASE}/books/${pack.id}/`, {
        headers: getAuthHeaders(),
      })
      await Promise.all([fetchDashboardStats(), fetchDashboardPackLists()])
      setPackPendingDelete(null)
    } catch (error) {
      console.error('Error deleting inactive pack:', error)
      setScanMessage('Failed to delete inactive pack')
    }
  }

  const ticketTypes = [
    { name: 'New Tickets', icon: '👥' },
    { name: 'Lucky Tickets', icon: '👥' },
    { name: 'Ending Tickets', icon: '👥' },
  ]

  const publishLiveDisplayEvent = async (type, payload = {}) => {
    try {
      await fetch(`${API_BASE}/live-display/events/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ type, payload }),
      })
    } catch (error) {
      console.error('Failed to publish live display event:', error)
    }
  }

  const handleTicketClick = (ticketLabel) => {
    // Store the clicked ticket in localStorage
    localStorage.setItem('blinkingTicketPrice', ticketLabel)
    console.log(`Ticket ${ticketLabel} clicked. Stored in localStorage.`)

    publishLiveDisplayEvent('blink_price', { price: ticketLabel })
    
    // Dispatch a custom event for other windows to listen
    window.dispatchEvent(new CustomEvent('ticketBlinkRequested', { detail: { price: ticketLabel } }))
  }

  const handleTicketTypeClick = (typeName) => {
    if (typeName === 'Lucky Tickets') {
      // Store a special marker for lucky tickets
      localStorage.setItem('luckyTicketsAnimation', 'true')
      console.log('Lucky Tickets clicked - 5 random tickets will animate')
      publishLiveDisplayEvent('lucky_tickets')
      
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
      publishLiveDisplayEvent('new_tickets')
      
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
      publishLiveDisplayEvent('ending_tickets')
      
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

  // const handleEndDay = () => {
  //   navigate('/end-shift')
  // }

  const handleReloadLiveDisplay = () => {
    // Signal LiveDisplay tab/window to perform a one-time hard reload
    localStorage.setItem('reloadLiveDisplay', String(Date.now()))
    publishLiveDisplayEvent('reload_live_display')

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
    clearManagerAccessToken('reports')

    navigate('/login')
  }

  const handleRefreshDashboard = async () => {
    console.log('Dashboard refresh clicked')
    await Promise.all([
      fetchDashboardStats(),
      fetchDashboardPackLists(),
      fetchTicketValues(),
      fetchTopSalesData(),
      // fetchTodayEndShiftStatus(),
    ])
    console.log('Dashboard refreshed')
  }

  const openTopSalesCalendar = (field) => {
    const selectedDate = parseDateInputValue(topSalesDateRange[field])
    setTopSalesCalendarMonth(getMonthStart(selectedDate || new Date()))
    setActiveTopSalesCalendar(field)
  }

  const handleTopSalesDateSelect = (field, value) => {
    setTopSalesDateRange((range) => ({ ...range, [field]: value }))
    setActiveTopSalesCalendar(null)
  }

  // const fetchDashboardStats = async () => {
  //   try {
  //     const res = await axios.get(`${API_BASE}/dashboard-stats/`, {
  //       headers: getAuthHeaders(),
  //     })
  //     setStats(res.data)
  //   } catch (error) {
  //     console.error('Error fetching dashboard stats:', error)
  //   }
  // }
  const fetchDashboardStats = async () => {
  try {
    const res = await axios.get(
      `${API_BASE}/dashboard-stats/`,
      {
        headers: getAuthHeaders(),
      }
    )

    const data = res.data || {}

    setStats({
      instant_sales_today:
        data.instant_sales_today || '0.00',
      active_boxes:
        Number(data.active_boxes) || 0,
      activated_today:
        Number(data.activated_today) || 0,
      activated_this_week:
        Number(data.activated_this_week) || 0,
      activated_this_month:
        Number(data.activated_this_month) || 0,
      inactive_packs:
        Number(data.inactive_packs) || 0,
    })

    setActivePackRows(
      data.active_box_list || []
    )

    setActivatedTodayRows(
      data.activated_today_list || []
    )

    setActivatedThisWeekRows(
      data.activated_this_week_list || []
    )

    setActivatedThisMonthRows(
      data.activated_this_month_list || []
    )
  } catch (error) {
    console.error(
      'Error fetching dashboard stats:',
      error
    )

    setActivatedTodayRows([])
    setActivatedThisWeekRows([])
    setActivatedThisMonthRows([])
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

      await Promise.all([fetchDashboardStats(), fetchDashboardPackLists()])
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
      if (/^\d{12,30}$/.test(scannedValue)) {
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
        if (/^\d{12,30}$/.test(scannedValue)) {
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
    fetchDashboardPackLists()
    fetchTicketValues()
    // fetchTodayEndShiftStatus()
  }, [])

  useEffect(() => {
    fetchTopSalesData()
  }, [topSalesDateRange])

  return (
    <div className={`app-container dashboard-app ${sidebarOpen ? 'sidebar-is-open' : 'sidebar-is-closed'}`}>
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
            onClick={
              handleOpenReports}
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
          {/* <a href="#" className="sidebar-link">❓ <span className="link-label">Help</span></a> */}
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
            {/* <button className="header-btn end-day-btn" onClick={handleEndDay}>End Day</button> */}
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
              <label>Instant Sales </label>
              <div className="stat-value large-value">$ {stats.instant_sales_today}</div>
            </div>
          </div>

          <div className="sales-chart-container top-sales-chart-container">
            <div className="sales-chart-header top-sales-chart-header">
              <div className="top-sales-title">
                <h3>Top Sellers</h3>
                <p>Most sold in selected date range</p>
              </div>
              <div className="top-sales-controls">
                <div className="top-sales-toggle" role="group" aria-label="Top sales view">
                  <button
                    type="button"
                    className={topSalesMode === 'games' ? 'active' : ''}
                    onClick={() => setTopSalesMode('games')}
                  >
                    Games
                  </button>
                  <button
                    type="button"
                    className={topSalesMode === 'ticket_values' ? 'active' : ''}
                    onClick={() => setTopSalesMode('ticket_values')}
                  >
                    Dollar Tickets
                  </button>
                </div>
                <SalesDateRangePicker
                  dateRange={topSalesDateRange}
                  activeCalendar={activeTopSalesCalendar}
                  calendarMonth={topSalesCalendarMonth}
                  onOpenCalendar={openTopSalesCalendar}
                  onMonthChange={setTopSalesCalendarMonth}
                  onSelectDate={handleTopSalesDateSelect}
                  onCloseCalendar={() => setActiveTopSalesCalendar(null)}
                />
              </div>
            </div>
            {topSalesRows.length > 0 ? (
              <div className="sales-chart-scroll">
                <div className="sales-chart-inner" style={{ minWidth: `${topSalesChartMinWidth}px` }}>
                  <Bar
                    data={{
                      labels: topSalesRows.map((item) => wrapChartLabel(item.label)),
                      datasets: [
                        {
                          label: topSalesMode === 'games' ? 'Game Sales ($)' : 'Ticket Value Sales ($)',
                          data: topSalesRows.map((item) => Number(item.total_sales || 0)),
                          backgroundColor: 'rgba(26, 122, 111, 0.72)',
                          borderColor: '#1a7a6f',
                          borderWidth: 1,
                          borderRadius: 8,
                          maxBarThickness: 44,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
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
                            title: function (items) {
                              const row = topSalesRows[items[0]?.dataIndex]
                              return row?.label || ''
                            },
                            label: function (context) {
                              const row = topSalesRows[context.dataIndex]
                              return [
                                `Sales: $${context.parsed.y.toLocaleString()}`,
                                `Tickets: ${Number(row?.tickets_sold || 0).toLocaleString()}`,
                              ]
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
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0,
                            font: {
                              size: 10,
                              weight: '600',
                            },
                            padding: 10,
                          },
                          grid: {
                            display: false,
                          },
                        },
                      },
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="top-sales-empty">No sales found for this date range.</div>
            )}
          </div>

          <div className="stats-grid">
            <button
              type="button"
              className={`stat-box stat-box-button ${selectedStatList?.key === 'active_boxes' ? 'selected' : ''}`}
              onClick={() => setSelectedStatList({ key: 'active_boxes', label: 'Active Boxes' })}
            >
              <label>Active Boxes</label>
              <div className="stat-value">{stats.active_boxes}</div>
            </button>
            <button
              type="button"
              className={`stat-box stat-box-button ${selectedStatList?.key === 'activated_today' ? 'selected' : ''}`}
              onClick={() => setSelectedStatList({ key: 'activated_today', label: 'Activated Today' })}
            >
              <label>Activated Today</label>
              <div className="stat-value">{stats.activated_today}</div>
            </button>
            <button
              type="button"
              className={`stat-box stat-box-button ${selectedStatList?.key === 'activated_this_week' ? 'selected' : ''}`}
              onClick={() => setSelectedStatList({ key: 'activated_this_week', label: 'Activated This Week' })}
            >
              <label>Activated This Week</label>
              <div className="stat-value">{stats.activated_this_week}</div>
            </button>
            <button
              type="button"
              className={`stat-box stat-box-button ${selectedStatList?.key === 'activated_this_month' ? 'selected' : ''}`}
              onClick={() => setSelectedStatList({ key: 'activated_this_month', label: 'Activated This Month' })}
            >
              <label>Activated This Month</label>
              <div className="stat-value">{stats.activated_this_month}</div>
            </button>
            <button
              type="button"
              className={`stat-box stat-box-button ${selectedStatList?.key === 'inactive_packs' ? 'selected' : ''}`}
              onClick={() => setSelectedStatList({ key: 'inactive_packs', label: 'Inactive Packs' })}
            >
              <label>Inactive Packs</label>
              <div className="stat-value">{stats.inactive_packs}</div>
            </button>
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

      {selectedStatList && (
        <div className="dashboard-pack-modal-overlay" onClick={() => setSelectedStatList(null)}>
          <div
            className="dashboard-pack-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-pack-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-pack-list-header">
              <h3 id="dashboard-pack-modal-title">{selectedStatList.label}</h3>
              <button type="button" onClick={() => setSelectedStatList(null)}>Close</button>
            </div>
            <div className="dashboard-table-scroll">
              <table className="dashboard-pack-table">
                <thead>
                  <tr>
                    <th>Box #</th>
                    <th>Image</th>
                    <th>Name</th>
                    <th>Current #</th>
                    <th>Game #</th>
                    <th>Pack #</th>
                    {selectedStatList.key === 'inactive_packs' && <th>Action</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedPackRows.length > 0 ? (
                    selectedPackRows.map((pack) => (
                      <tr key={`${selectedStatList.key}-${pack.id}`}>
                        <td>{pack.boxNum}</td>
                        <td>
                          <div className="dashboard-pack-image">
                            {pack.image ? (
                              <img src={pack.image} alt={pack.name || pack.gameNum} />
                            ) : (
                              '🎰'
                            )}
                          </div>
                        </td>
                        <td>{pack.name || '-'}</td>
                        <td>{pack.currentNum}</td>
                        <td>{pack.gameNum}</td>
                        <td>
                          <button
                            type="button"
                            className={`dashboard-pack-number ${expandedPackIds[`${selectedStatList.key}-${pack.id}`] ? 'expanded' : ''}`}
                            title={pack.packNum}
                            onClick={() => toggleExpandedPack(`${selectedStatList.key}-${pack.id}`)}
                          >
                            {pack.packNum || '-'}
                          </button>
                        </td>
                        {selectedStatList.key === 'inactive_packs' && (
                          <td>
                            <button
                              type="button"
                              className="dashboard-delete-pack-btn"
                              title="Delete inactive pack"
                              aria-label={`Delete inactive pack ${pack.packNum || ''}`.trim()}
                              onClick={() => setPackPendingDelete(pack)}
                            >
                              🗑
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={selectedStatList.key === 'inactive_packs' ? 7 : 6} className="dashboard-no-data">No packs found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {packPendingDelete && (
        <div className="dashboard-confirm-overlay" onClick={() => setPackPendingDelete(null)}>
          <div
            className="dashboard-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dashboard-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="dashboard-confirm-icon">🗑</div>
            <h3 id="dashboard-confirm-title">Delete inactive pack?</h3>
            <p>
              Pack {packPendingDelete.packNum || '-'} will be removed from inventory.
            </p>
            <div className="dashboard-confirm-actions">
              <button
                type="button"
                className="dashboard-confirm-cancel"
                onClick={() => setPackPendingDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="dashboard-confirm-delete"
                onClick={() => handleDeleteInactivePack(packPendingDelete)}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      <ManagerPinModal
          open={showReportsPin}
          scope="reports"
          title="Reports Authorization"
          description="Enter the store's 8-digit managerial PIN to open Reports."
          onClose={() => setShowReportsPin(false)}
          onAuthorized={() => {
            setShowReportsPin(false)
            navigate('/reports')
          }}
        />
    </div>
  )
}
