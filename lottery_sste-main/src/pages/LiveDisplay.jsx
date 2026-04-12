import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../App.css'
import './liveDisplay.css'

// ─── Ticket image ──────────────────────────────────────────────────────────
import MILLIONAIRE_BONUS from '../assets/Millionaire_Bonus.png'

// ─── API Configuration ────────────────────────────────────────────────────
const API_BASE = 'http://127.0.0.1:8000/api'

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
    const response = await fetch(`${API_BASE}/activated-books/`)
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
  const wrapperRef = useRef(null)
  const [gridStyle, setGridStyle] = useState({})

  // Fetch tickets on component mount
  useEffect(() => {
    const loadTickets = async () => {
      setLoading(true)
      const fetchedTickets = await fetchTicketsFromAPI()
      setTickets(fetchedTickets)
      setLoading(false)
    }
    loadTickets()
  }, [])

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
      overflow:            'hidden',
    })
  }, [tickets.length])

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
            {tickets.map((ticket) => (
              <div key={ticket.id} className="ld-card">

                <div className="ld-card-img">
                  {/* Price tag */}
                  <span className="ld-price-tag">${ticket.price}</span>

                  {/* Lottery ticket image — same image for every card */}
                  <img
                    src={MILLIONAIRE_BONUS}
                    alt={ticket.name}
                    className="ld-img"
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
                  <span className="ld-footer-label">CURRENT NUMBER</span>
                  <span className="ld-footer-num">{ticket.currentNumber}</span>
                </div>

              </div>
            ))}
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
