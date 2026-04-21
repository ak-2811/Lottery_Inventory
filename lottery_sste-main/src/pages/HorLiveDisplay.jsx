import React from 'react'
import LiveDisplay from './LiveDisplay.jsx'
import './horLiveDisplay.css'

export default function HorLiveDisplay() {
  return (
    <div className="hor-live-shell" data-layout="horizontal-tv">
      <LiveDisplay />
    </div>
  )
}
