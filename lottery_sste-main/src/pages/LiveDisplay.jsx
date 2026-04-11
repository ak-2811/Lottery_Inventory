import React, { useState, useEffect, useRef, useCallback } from 'react'
import '../App.css'
import './liveDisplay.css'

// ─── Ticket image ──────────────────────────────────────────────────────────
import MILLIONAIRE_BONUS from '../assets/Millionaire_Bonus.png'

// ─── Ticket type catalogue ─────────────────────────────────────────────────
// "count" = number of boxes for that game.
// Box numbers are assigned GLOBALLY (1 → total) across all types in order.
const TICKET_TYPES = [
  // $20 — green footer
  { name: 'Tagnificent Jumbo Bucks', price: '20', count: 3,  footerBg: '#16a34a' },
  { name: '200X',                    price: '20', count: 3,  footerBg: '#16a34a' },

  // $10 — orange footer
  { name: '$100,$200 or $300',       price: '10', count: 5,  footerBg: '#ea580c' },
  { name: '100X',                    price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Millionaire Bonus',       price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Hit $500',                price: '10', count: 3,  footerBg: '#ea580c' },
  { name: 'My Money Maker',          price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Millionaire Bonus v2',    price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Frosty Fortunes',         price: '10', count: 2,  footerBg: '#ea580c' },
  { name: '100X v2',                 price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Hit $500 v2',             price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Winning Spree',           price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Ruby Red Treasures',      price: '10', count: 3,  footerBg: '#ea580c' },
  { name: '100X v3',                 price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Frosty Fortunes v2',      price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Mighty Jumbo Bucks',      price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Hit $500 v3',             price: '10', count: 2,  footerBg: '#ea580c' },
  { name: 'Frosty Fortunes v3',      price: '10', count: 1,  footerBg: '#ea580c' },
  { name: 'Winning Spree v2',        price: '10', count: 1,  footerBg: '#ea580c' },

  // $5 — purple footer
  { name: 'Lucky Match Doubler',     price: '5',  count: 2,  footerBg: '#7c3aed' },
  { name: 'Star Power',              price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: 'My Money Maker $5',       price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: 'Lucky Match Doubler v2',  price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: '$200,000 Extra Play',     price: '5',  count: 2,  footerBg: '#7c3aed' },
  { name: 'Sapphire Surprise',       price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: '50X',                     price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: 'Giant Jumbo Bucks',       price: '5',  count: 1,  footerBg: '#7c3aed' },
  { name: 'Hit $250',                price: '5',  count: 1,  footerBg: '#7c3aed' },

  // $3 — pink footer
  { name: 'Big Loteria',             price: '3',  count: 1,  footerBg: '#db2777' },
  { name: 'Jumbo Bucks $3',          price: '3',  count: 1,  footerBg: '#db2777' },

  // $2 — cyan footer
  { name: '20X',                     price: '2',  count: 2,  footerBg: '#0891b2' },
  { name: 'Triple 33',               price: '2',  count: 1,  footerBg: '#0891b2' },
  { name: 'Quick Cash',              price: '2',  count: 1,  footerBg: '#0891b2' },
  { name: 'Hit $100',                price: '2',  count: 1,  footerBg: '#0891b2' },

  // $1 — red footer
  { name: 'Loose Change',            price: '1',  count: 1,  footerBg: '#dc2626' },
  { name: '10X',                     price: '1',  count: 1,  footerBg: '#dc2626' },
  { name: 'Hit $50',                 price: '1',  count: 1,  footerBg: '#dc2626' },
  { name: 'Junior Jumbo Bucks',      price: '1',  count: 1,  footerBg: '#dc2626' },
  { name: 'Hit $50 v2',             price: '1',  count: 1,  footerBg: '#dc2626' },
  { name: '10X v2',                  price: '1',  count: 1,  footerBg: '#dc2626' },
]

// ─── Build flat ticket list ────────────────────────────────────────────────
// boxNumber is GLOBAL: 1, 2, 3 … total (not reset per game type)
function buildTickets() {
  const list = []
  TICKET_TYPES.forEach((type) => {
    for (let i = 0; i < type.count; i++) {
      list.push({
        id:            list.length + 1,
        boxNumber:     list.length + 1,   // ← sequential 1 → N across all types
        name:          type.name,
        price:         type.price,
        footerBg:      type.footerBg,
        currentNumber: Math.floor(Math.random() * 109) + 1,
      })
    }
  })
  return list
}

// ─── Grid calculation ─────────────────────────────────────────────────────
const FOOTER_H  = 16
const STUB_H    = 4
const IMG_RATIO = 1.05
const GAP       = 3

function computeOptimalCols(N, W, H) {
  if (!W || !H || N === 0) return 12
  let bestCols = 1, bestScore = Infinity

  for (let cols = 1; cols <= N; cols++) {
    const cardW  = (W - GAP * (cols + 1)) / cols
    if (cardW < 40) break
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
  const [tickets]  = useState(buildTickets)
  const wrapperRef = useRef(null)
  const [gridStyle, setGridStyle] = useState({})

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
    const extraPerRow = totalH < H ? (H - totalH) / rows : 0
    const finalCardH  = cardH + extraPerRow

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