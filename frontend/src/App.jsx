import { useState } from 'react'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard/Dashboard'

function App() {
  const [activeId, setActiveId] = useState('dashboard')

  return (
    <AppLayout activeId={activeId} onSelect={setActiveId}>
      {activeId === 'dashboard' && <Dashboard />}
    </AppLayout>
  )
}

export default App
