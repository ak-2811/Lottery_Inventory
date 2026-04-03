import { useState } from 'react'
import Inventory from './pages/Inventory.jsx'
import ActivatePacks from './pages/ActivatePacks.jsx'

function App() {
  const [currentPage, setCurrentPage] = useState('inventory')

  return currentPage === 'inventory' ? (
    <Inventory onNavigate={setCurrentPage} />
  ) : (
    <ActivatePacks onNavigate={setCurrentPage} />
  )
}

export default App
