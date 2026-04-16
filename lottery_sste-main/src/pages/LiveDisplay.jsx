import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../App.css'
import './liveDisplay.css'

// ─── Ticket image ──────────────────────────────────────────────────────────
// import MILLIONAIRE_BONUS from '../assets/Millionaire_Bonus.png'

// ─── API Configuration ────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:8000/api'
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
const FOOTER_H  = 16
const STUB_H    = 4
const IMG_RATIO = 0.65
const GAP       = 8

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
  const [blinkingPrice, setBlinkingPrice] = useState(null)
  const [luckyTicketIds, setLuckyTicketIds] = useState(new Set())
  const [newTicketIds, setNewTicketIds] = useState(new Set())
  const [endingTicketIds, setEndingTicketIds] = useState(new Set())
  const wrapperRef = useRef(null)
  const [gridStyle, setGridStyle] = useState({})

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
    loadTickets()
  }, [])

  // Listen for blinking ticket requests from Dashboard (via localStorage)
  useEffect(() => {
    // Poll localStorage for changes every 500ms
    const interval = setInterval(() => {
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
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
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
        <div className="ld-banner-side ld-banner-left">
          <span className="ld-lottery-logo ld-mega">⭐ MEGA MILLIONS</span>
          <div className="ld-jackpot-pill ld-jackpot-yellow">
            <div className="ld-jackpot-label">Est. Annuitized Jackpot Now</div>
            <div className="ld-jackpot-amount">$120 MILLION</div>
          </div>
        </div>

        <div className="ld-banner-center">
          <div className="ld-welcome">Welcome To</div>
          <div className="ld-store-name">Global Market #3</div>
        </div>

        <div className="ld-banner-side ld-banner-right">
          <span className="ld-lottery-logo ld-power">POWERBALL ⭐</span>
          <div className="ld-jackpot-pill ld-jackpot-red">
            <div className="ld-jackpot-label">Est. Annuitized Jackpot Now</div>
            <div className="ld-jackpot-amount">$35 MILLION</div>
          </div>
        </div>
      </div>

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
              
              // Check if ticket is NEW based on actual data (current number 0-5)
              const isNewTicketType = ticket.currentNumber >= 0 && ticket.currentNumber <= 5
              
              // Check if ticket is ENDING based on actual data (remaining 0-5)
              const isEndingTicketType = ticket.totalTickets > 0 && (ticket.totalTickets - ticket.currentNumber) >= 0 && (ticket.totalTickets - ticket.currentNumber) <= 5
              
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
              <div key={ticket.id} className={`ld-card ${(isBlinking || isLucky || isNew || isEnding) ? 'ld-card-blinking' : ''}`}>

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
                    background: `linear-gradient(180deg, ${ticket.footerBg} 0%, ${ticket.footerBg}bb 100%)`,
                  }}
                >
                  {isNewTicketType ? (
                    <>
                      <span className="ld-footer-label">NEW TICKET</span>
                      {/* <span className="ld-footer-num">{ticket.currentNumber}</span> */}
                    </>
                  ) : isEndingTicketType ? (
                    <>
                      <span className="ld-footer-label">ENDING TICKET</span>
                      {/* <span className="ld-footer-num">{ticket.totalTickets - ticket.currentNumber}</span> */}
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
        <span>ATTENTION: Lottery purchases are CASH only.</span>
      </div>

    </div>
  )
}
