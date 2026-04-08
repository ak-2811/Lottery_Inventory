import { useState } from 'react'
import Dashboard from './pages/Dashboard.jsx'
import Inventory from './pages/Inventory.jsx'
import ActivatePacks from './pages/ActivatePacks.jsx'

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard')

  return currentPage === 'dashboard' ? (
    <Dashboard onNavigate={setCurrentPage} />
  ) : currentPage === 'inventory' ? (
    <Inventory onNavigate={setCurrentPage} />
  ) : (
    <ActivatePacks onNavigate={setCurrentPage} />
  )
}

export default App
