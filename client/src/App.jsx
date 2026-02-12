import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import TeamPage from './pages/TeamPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import DisplayPage from './pages/DisplayPage.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/team" replace />} />
        <Route path="/team" element={<TeamPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/display" element={<DisplayPage />} />
        <Route path="*" element={<Navigate to="/team" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
