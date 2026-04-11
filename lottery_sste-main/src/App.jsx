import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import ActivatePacks from './pages/ActivatePacks.jsx'
import Reports from './pages/Reports.jsx'
import LiveDisplay from './pages/LiveDisplay.jsx'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/activate-packs" element={<ActivatePacks />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/live-display" element={<LiveDisplay />} />
      </Routes>
    </Router>
  )
}

export default App
