import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import ActivatePacks from './pages/ActivatePacks.jsx'
import Reports from './pages/Reports.jsx'
import EndShift from './pages/EndShift.jsx'
import LiveDisplay from './pages/LiveDisplay.jsx'
import ManualShift from './pages/ManualEndShift.jsx'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/activate-packs" element={<ActivatePacks />} />
        <Route path="/end-shift" element={<EndShift />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/live-display" element={<LiveDisplay />} />
        <Route path="/manual-shift" element={<ManualShift />} />
      </Routes>
    </Router>
  )
}

export default App
