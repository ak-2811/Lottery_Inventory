import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../App.css'
import './liveDisplay.css'

// ─── Ticket image ──────────────────────────────────────────────────────────
// import MILLIONAIRE_BONUS from '../assets/Millionaire_Bonus.png'

// ─── API Configuration ────────────────────────────────────────────────────
const API_BASE = 'https://lottery.bright-core-solutions.com/api'
// const API_BASE = 'http://127.0.0.1:8000/api'
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token')
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

// ─── Price to footer color mapping ─────────────────────────────────────────
const PRICE_COLOR_MAP = {
  '20': '#16a34a',  // green
  '10': '#ea580c',  // orange
  '5':  '#7c3aed',  // purple
  '3':  '#db2777',  // pink
  '2':  '#0891b2',  // cyan
  '1':  '#dc2626',  // red
}

// ─── Fetch current user from API ───────────────────────────────────────────
async function fetchCurrentUser() {
  try {
    const response = await fetch(`${API_BASE}/current-user/`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      throw new Error('Failed to fetch current user')
    }
    const data = await response.json()
    return data.first_name || data.username || 'User'
  } catch (error) {
    console.error('Error fetching current user:', error)
    return 'User'
  }
}

// ─── Fetch activated packs from API and build ticket list ──────────────────
async function fetchTicketsFromAPI() {
  try {
    const response = await fetch(`${API_BASE}/activated-books/`, {
      headers: getAuthHeaders(),
    })
    if (!response.ok) {
      throw new Error('Failed to fetch activated packs')
    }
    const data = await response.json()
    
    // Transform API data into ticket format sorted by boxNum
    const tickets = data
      .sort((a, b) => parseInt(a.boxNum) - parseInt(b.boxNum))
      .map((item) => ({
        id:            item.id,
        boxNumber:     parseInt(item.boxNum),
        name:          item.name,
        price:         String(item.value),
        footerBg:      PRICE_COLOR_MAP[String(item.value)] || '#16a34a',
        currentNumber: item.currentNum || 0,
        totalTickets:  item.totalTickets || 0,
        imageUrl:      item.image || null,
      }))
    
    return tickets
  } catch (error) {
    console.error('Error fetching tickets:', error)
    return [] // Return empty array on error
  }
}

// ─── Grid calculation ─────────────────────────────────────────────────────
const FOOTER_H  = 14
const STUB_H    = 3
const IMG_RATIO = 0.95
const GAP       = 6

function computeOptimalCols(N, W, H) {
  if (!W || !H || N === 0) return 12
  let bestCols = 1, bestScore = Infinity

  // Test columns from 1 up to min(N, 12) - but also consider screen width
  const maxCols = Math.min(N, 12)
  
  for (let cols = 1; cols <= maxCols; cols++) {
    const cardW  = (W - GAP * (cols + 1)) / cols
    // Ensure minimum card width for readability
    if (cardW < 50) break
    
    const rows   = Math.ceil(N / cols)
    const cardH  = cardW * IMG_RATIO + FOOTER_H + STUB_H
    const totalH = cardH * rows + GAP * (rows + 1)

    const diff  = H - totalH
    const score = diff >= 0 ? diff * diff : diff * diff * 0.2

    if (score < bestScore) { bestScore = score; bestCols = cols }
  }
  return bestCols
}

// ─── Component ────────────────────────────────────────────────────────────
export default function LiveDisplay() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentUserName, setCurrentUserName] = useState('Loading...')
  const [blinkingPrice, setBlinkingPrice] = useState(null)
  const [luckyTicketIds, setLuckyTicketIds] = useState(new Set())
  const [newTicketIds, setNewTicketIds] = useState(new Set())
  const [endingTicketIds, setEndingTicketIds] = useState(new Set())
  const [scanFlipTicketIds, setScanFlipTicketIds] = useState(new Set())
  const wrapperRef = useRef(null)
  const ticketsRef = useRef([])
  const [gridStyle, setGridStyle] = useState({})
  const [scanMessage, setScanMessage] = useState('')
  const lastLiveEventAtRef = useRef(Date.now() / 1000)
  const liveEventPollBusyRef = useRef(false)

  useEffect(() => {
    ticketsRef.current = tickets
  }, [tickets])

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

  const triggerScanFlip = useCallback((ticketId) => {
    if (!ticketId) return

    setScanFlipTicketIds((prev) => {
      const next = new Set(prev)
      next.add(ticketId)
      return next
    })

    setTimeout(() => {
      setScanFlipTicketIds((prev) => {
        const next = new Set(prev)
        next.delete(ticketId)
        return next
      })
    }, 900)
  }, [])

  const findScannedTicketId = useCallback((previousTickets, nextTickets, scanData) => {
    if (!previousTickets.length || !nextTickets.length) return null

    const nextMap = new Map(nextTickets.map((ticket) => [ticket.id, ticket]))
    const changedTickets = previousTickets
      .map((prevTicket) => {
        const nextTicket = nextMap.get(prevTicket.id)
        if (!nextTicket) return null

        if (nextTicket.currentNumber !== prevTicket.currentNumber) {
          return nextTicket
        }

        return null
      })
      .filter(Boolean)

    if (changedTickets.length === 1) return changedTickets[0].id

    if (changedTickets.length > 1 && typeof scanData?.current_count === 'number') {
      const exactMatch = changedTickets.find(
        (ticket) => ticket.currentNumber === scanData.current_count
      )
      if (exactMatch) return exactMatch.id
      return changedTickets[0].id
    }

    if (typeof scanData?.current_count === 'number') {
      const fallbackMatch = nextTickets.find(
        (ticket) => ticket.currentNumber === scanData.current_count
      )
      if (fallbackMatch) return fallbackMatch.id
    }

    return null
  }, [])

  const findChangedTicketIds = useCallback((previousTickets, nextTickets) => {
    if (!previousTickets.length || !nextTickets.length) return []

    const previousMap = new Map(previousTickets.map((ticket) => [ticket.id, ticket]))

    return nextTickets
      .filter((nextTicket) => {
        const prevTicket = previousMap.get(nextTicket.id)
        if (!prevTicket) return false
        return nextTicket.currentNumber !== prevTicket.currentNumber
      })
      .map((ticket) => ticket.id)
  }, [])

  const handleTicketScan = async (rawBarcode) => {
    try {
      const response = await fetch(`${API_BASE}/tickets/scan/`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ raw_barcode: rawBarcode }),
      })

      const data = await response.json()
      
      if (response.ok) {
        playBeep("success");
      }

      if (!response.ok) {
        playBeep("error");
        throw new Error(data.error || 'Invalid input')
      }

      setScanMessage(
        (data.is_sold || data.pack_sold)
          ? 'Pack sold successfully'
          : `Ticket ${data.ticket_number} scanned successfully`
      )

      const previousTickets = ticketsRef.current
      const refreshedTickets = await silentRefreshTickets({ animateChanges: false })
      const scannedTicketId = findScannedTicketId(previousTickets, refreshedTickets || [], data)
      if (scannedTicketId) {
        triggerScanFlip(scannedTicketId)
      }

      setTimeout(() => {
        setScanMessage('')
      }, 2000)
    } catch (error) {
      playBeep("error");
      setScanMessage(error.message || 'Invalid input')

      setTimeout(() => {
        setScanMessage('')
      }, 2000)
    }
  }

  // Fetch tickets on component mount
  useEffect(() => {
    const loadTickets = async () => {
      setLoading(true)
      const fetchedTickets = await fetchTicketsFromAPI()
      console.log('Fetched tickets from API:', fetchedTickets.map(t => ({ id: t.id, price: t.price, boxNumber: t.boxNumber, currentNumber: t.currentNumber, totalTickets: t.totalTickets })))
      setTickets(fetchedTickets)
      console.log('Loaded tickets:', fetchedTickets.map(t => ({ id: t.id, price: t.price, boxNumber: t.boxNumber })))
      setLoading(false)
    }
    
    // Load user name from API
    const loadUserName = async () => {
      const userName = await fetchCurrentUser()
      setCurrentUserName(userName)
    }
    
    loadTickets()
    loadUserName()
  }, [])

  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     loadTickets()
  //   }, 30000) // every 30 sec

  //   return () => clearInterval(interval)
  // }, [loadTickets])

  // Add this alongside your existing loadTickets function:
  const silentRefreshTickets = useCallback(async ({ animateChanges = true } = {}) => {
    const previousTickets = ticketsRef.current
    const fetchedTickets = await fetchTicketsFromAPI()

    if (animateChanges && previousTickets.length > 0) {
      const changedTicketIds = findChangedTicketIds(previousTickets, fetchedTickets)
      changedTicketIds.forEach((ticketId) => triggerScanFlip(ticketId))
    }

    setTickets(fetchedTickets) // updates data without touching loading state
    return fetchedTickets
  }, [findChangedTicketIds, triggerScanFlip])

// Then uncomment and update the interval useEffect:
useEffect(() => {
  const interval = setInterval(() => {
    silentRefreshTickets() // no loading spinner, no flash
  }, 2000)

  return () => clearInterval(interval)
}, [silentRefreshTickets])

  useEffect(() => {
    const pollLiveEvents = async () => {
      if (liveEventPollBusyRef.current) return
      liveEventPollBusyRef.current = true

      try {
        const response = await fetch(
          `${API_BASE}/live-display/events/?since=${lastLiveEventAtRef.current}`,
          {
            headers: getAuthHeaders(),
          }
        )

        if (!response.ok) {
          throw new Error('Failed to fetch live events')
        }

        const data = await response.json()
        const events = Array.isArray(data?.events) ? data.events : []

        events.forEach((event) => {
          const eventType = event?.type
          const payload = event?.payload || {}

          if (eventType === 'blink_price' && payload?.price) {
            localStorage.setItem('blinkingTicketPrice', payload.price)
          } else if (eventType === 'lucky_tickets') {
            localStorage.setItem('luckyTicketsAnimation', 'true')
          } else if (eventType === 'new_tickets') {
            localStorage.setItem('newTicketsAnimation', 'true')
          } else if (eventType === 'ending_tickets') {
            localStorage.setItem('endingTicketsAnimation', 'true')
          } else if (eventType === 'reload_live_display') {
            localStorage.setItem('reloadLiveDisplay', String(Date.now()))
          }

          if (typeof event?.created_at === 'number') {
            lastLiveEventAtRef.current = Math.max(lastLiveEventAtRef.current, event.created_at)
          }
        })

        if (typeof data?.server_time === 'number') {
          lastLiveEventAtRef.current = Math.max(lastLiveEventAtRef.current, data.server_time)
        }
      } catch (error) {
        console.error('Error polling live display events:', error)
      } finally {
        liveEventPollBusyRef.current = false
      }
    }

    const interval = setInterval(pollLiveEvents, 700)
    pollLiveEvents()

    return () => clearInterval(interval)
  }, [])

  // useEffect(() => {
  //   let timeoutId = null

  //   const handleGlobalKeyDown = (e) => {
  //     const tag = document.activeElement?.tagName?.toLowerCase()
  //     const isTypingInInput =
  //       tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable

  //     if (isTypingInInput) return

  //     if (e.key === 'Enter') {
  //       const scannedValue = scannerBuffer.trim()

  //       if (/^\d{10,20}$/.test(scannedValue)) {
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
  // }, [scannerBuffer, loadTickets])

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
      if (/^\d{10,20}$/.test(scannedValue)) {
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
        if (/^\d{10,20}$/.test(scannedValue)) {
          handleTicketScan(scannedValue)
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

  // Listen for blinking ticket requests from Dashboard (via localStorage)
  useEffect(() => {
    // Poll localStorage for changes every 500ms
    const interval = setInterval(() => {
      // Check for explicit hard reload request from Dashboard
      const reloadLiveDisplay = localStorage.getItem('reloadLiveDisplay')
      if (reloadLiveDisplay) {
        localStorage.removeItem('reloadLiveDisplay')
        window.location.reload()
        return
      }

      // Check for lucky tickets animation
      const luckyTicketsFlag = localStorage.getItem('luckyTicketsAnimation')
      if (luckyTicketsFlag && luckyTicketIds.size === 0 && tickets.length > 0) {
        // Select 5 random tickets
        const randomIds = new Set()
        const availableIndices = Array.from({ length: tickets.length }, (_, i) => i)
        
        for (let i = 0; i < Math.min(5, tickets.length); i++) {
          const randomIndex = Math.floor(Math.random() * availableIndices.length)
          randomIds.add(tickets[availableIndices[randomIndex]].id)
          availableIndices.splice(randomIndex, 1)
        }
        
        console.log(`Lucky Tickets animation triggered for 5 random tickets:`, Array.from(randomIds))
        setLuckyTicketIds(randomIds)
        
        // Clear after 5 seconds
        setTimeout(() => {
          setLuckyTicketIds(new Set())
          localStorage.removeItem('luckyTicketsAnimation')
          console.log('Cleared lucky tickets animation')
        }, 5000)
      }

      // Check for new tickets animation
      const newTicketsFlag = localStorage.getItem('newTicketsAnimation')
      if (newTicketsFlag && newTicketIds.size === 0 && tickets.length > 0) {
        // Select tickets with currentNumber between 0-5
        const newIds = new Set()
        
        tickets.forEach(ticket => {
          if (ticket.currentNumber >= 0 && ticket.currentNumber <= 5) {
            newIds.add(ticket.id)
          }
        })
        
        console.log(`New Tickets animation triggered for ${newIds.size} tickets with current number 0-5:`, Array.from(newIds))
        setNewTicketIds(newIds)
        
        // Clear after 5 seconds
        setTimeout(() => {
          setNewTicketIds(new Set())
          localStorage.removeItem('newTicketsAnimation')
          console.log('Cleared new tickets animation')
        }, 5000)
      }

      // Check for ending tickets animation
      const endingTicketsFlag = localStorage.getItem('endingTicketsAnimation')
      if (endingTicketsFlag && endingTicketIds.size === 0 && tickets.length > 0) {
        // Select tickets where (total - current) is between 0-5
        const endingIds = new Set()
        
        tickets.forEach(ticket => {
          // Calculate remaining tickets: total - current
          if (ticket.totalTickets !== undefined && ticket.totalTickets > 0) {
            const remaining = ticket.totalTickets - ticket.currentNumber
            if (remaining >= 0 && remaining <= 5) {
              endingIds.add(ticket.id)
            }
          }
        })
        
        console.log(`Ending Tickets animation triggered for ${endingIds.size} tickets with total-current 0-5:`, Array.from(endingIds))
        setEndingTicketIds(endingIds)
        
        // Clear after 5 seconds
        setTimeout(() => {
          setEndingTicketIds(new Set())
          localStorage.removeItem('endingTicketsAnimation')
          console.log('Cleared ending tickets animation')
        }, 5000)
      }

      const storedPrice = localStorage.getItem('blinkingTicketPrice')
      if (storedPrice && storedPrice !== blinkingPrice) {
        const priceNumber = storedPrice.replace('$', '').trim()
        console.log(`Detected blink price change in localStorage: ${priceNumber}`)
        setBlinkingPrice(priceNumber)
        
        // Clear after 5 seconds
        setTimeout(() => {
          setBlinkingPrice(null)
          localStorage.removeItem('blinkingTicketPrice')
          console.log('Cleared blinking price')
        }, 5000)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [blinkingPrice, luckyTicketIds, newTicketIds, endingTicketIds, tickets])

  const recalculate = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return

    const W    = el.clientWidth
    const H    = el.clientHeight
    const N    = tickets.length
    const cols = computeOptimalCols(N, W, H)
    const rows = Math.ceil(N / cols)

    const cardW       = (W - GAP * (cols + 1)) / cols
    const cardH       = cardW * IMG_RATIO + FOOTER_H + STUB_H
    const totalH      = cardH * rows + GAP * (rows + 1)
    
    // Ensure all content fits in viewport - scale down if needed
    let finalCardH = cardH
    if (totalH > H) {
      // Scale down card height to fit all rows
      const scaleFactor = (H - GAP * (rows + 1)) / (cardH * rows)
      finalCardH = cardH * scaleFactor
    }

    setGridStyle({
      display:             'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows:    `repeat(${rows}, ${finalCardH.toFixed(2)}px)`,
      gap:                 `${GAP}px`,
      padding:             `${GAP}px`,
      width:               '100%',
      height:              '100%',
      boxSizing:           'border-box',
      overflow:            'visible',
    })
    
    // Log blinking state
    console.log(`Current blinking price: ${blinkingPrice}`)
  }, [tickets.length, blinkingPrice])

  useEffect(() => {
    recalculate()
    const ro = new ResizeObserver(recalculate)
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [recalculate])

  return (
    <div className="ld-root">

      {/* ══ TOP BANNER ══════════════════════════════════════════════════ */}
      <div className="ld-banner">
        <div className="ld-banner-center">
          <div className="ld-welcome">Welcome To</div>
          <div className="ld-store-name">{currentUserName}</div>
        </div>

      
      </div>
      {scanMessage && (
        <div
          style={{
            position: 'absolute',
            top: '85px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 999,
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            whiteSpace: 'nowrap',
          }}
        >
          {scanMessage}
        </div>
      )}
      {/* ══ TICKET GRID ═════════════════════════════════════════════════ */}
      <div className="ld-grid-wrapper" ref={wrapperRef}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
            <p style={{ color: 'white', fontSize: '18px' }}>Loading tickets...</p>
          </div>
        ) : (
          <div style={gridStyle}>
            {tickets.map((ticket) => {
              // Extract just the numeric value from ticket.price (e.g., "$10.00" -> "10")
              const ticketPriceNumber = ticket.price.replace(/\$|\.00/g, '').trim()
              
              // Check if this ticket should blink by price
              const isBlinking = blinkingPrice && ticketPriceNumber === blinkingPrice
              
              // Check if this ticket should vibrate (lucky tickets)
              const isLucky = luckyTicketIds.has(ticket.id)
              
              // Check if this ticket should vibrate (new tickets - current number 0-5)
              const isNew = newTicketIds.has(ticket.id)
              
              // Check if this ticket should vibrate (ending tickets - remaining 0-5)
              const isEnding = endingTicketIds.has(ticket.id)

              // Scan highlight animation for the exact box that changed
              const isScanFlipping = scanFlipTicketIds.has(ticket.id)
              
              // Check if ticket is NEW based on actual data (current number 0-5)
              const isNewTicketType = ticket.currentNumber >= 0 && ticket.currentNumber <= 5
              
              // Check if ticket is ENDING based on actual data (remaining 0-5)
              const isEndingTicketType = ticket.totalTickets > 0 && (ticket.totalTickets - ticket.currentNumber) >= 0 && (ticket.totalTickets - ticket.currentNumber) <= 5

              // Footer color by ticket status
              const statusFooterColor = isNewTicketType
                ? '#2563eb' // blue for NEW TICKET
                : isEndingTicketType
                  ? '#dc2626' // red for ENDING TICKET
                  : '#16a34a' // green for CURRENT NUMBER
              
              if (blinkingPrice) {
                console.log(`Comparing: ticket.price="${ticket.price}" extracted="${ticketPriceNumber}" vs blinkingPrice="${blinkingPrice}" => Match: ${isBlinking}`)
              }
              if (isBlinking) {
                console.log(`✅ APPLYING VIBRATION to ticket with price: ${ticket.price}, boxNumber: ${ticket.boxNumber}`)
              }
              if (isLucky) {
                console.log(`✨ APPLYING LUCKY ANIMATION to ticket ID: ${ticket.id}, boxNumber: ${ticket.boxNumber}`)
              }
              if (isNew) {
                console.log(`🆕 APPLYING NEW TICKET ANIMATION to ticket ID: ${ticket.id}, currentNumber: ${ticket.currentNumber}`)
              }
              if (isEnding) {
                console.log(`⏳ APPLYING ENDING TICKET ANIMATION to ticket ID: ${ticket.id}, remaining: ${ticket.totalTickets - ticket.currentNumber}`)
              }
              return (
              <div key={ticket.id} className={`ld-card ${(isBlinking || isLucky || isNew || isEnding) ? 'ld-card-blinking' : ''} ${isScanFlipping ? 'ld-card-scan-flip' : ''}`}>

                <div className="ld-card-img">
                  {/* Price tag */}
                  <span className="ld-price-tag">${ticket.price}</span>

                  {/* Lottery ticket image — same image for every card */}
                  <img
                    src={ticket.imageUrl || '/placeholder-ticket.png'}
                    alt={ticket.name}
                    className="ld-img"
                    onError={(e) => {
                      e.target.onerror = null
                      e.target.src = '/placeholder-ticket.png'
                    }}
                  />

                  {/* BOX badge with GLOBAL sequential number */}
                  <span className="ld-box-badge">BOX {ticket.boxNumber}</span>
                </div>

                <div
                  className="ld-card-footer"
                  style={{
                    background: `linear-gradient(180deg, ${statusFooterColor} 0%, ${statusFooterColor}bb 100%)`,
                  }}
                >
                  {isNewTicketType ? (
                    <>
                      <span className="ld-footer-label">NEW TICKET</span>
                      <span className="ld-footer-num">{ticket.currentNumber}</span>
                    </>
                  ) : isEndingTicketType ? (
                    <>
                      <span className="ld-footer-label">ENDING TICKET</span>
                      <span className="ld-footer-num">{ticket.currentNumber}</span>
                    </>
                  ) : (
                    <>
                      <span className="ld-footer-label">CURRENT NUMBER</span>
                      <span className="ld-footer-num">{ticket.currentNumber}</span>
                    </>
                  )}
                </div>

              </div>
            )
            })}
          </div>
        )}
      </div>

      {/* ══ BOTTOM TICKER ═══════════════════════════════════════════════ */}
      <div className="ld-ticker">
        <span>⚠ ATTENTION: Must be 18 years of age or older to play.</span>
        <span className="ld-ticker-url">www.digitallotterysystem.com v3.20.0</span>
        <span>ATTENTION: Lottery purchases are CASH/DEBIT CARDS only.</span>
      </div>

    </div>
  )
}
