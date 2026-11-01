import Stats from './pages/Stats'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import CoursePage from './pages/CoursePage'
import SetPage from './pages/SetPage'
import EditCards from './pages/EditCards'
import ImportPage from './pages/ImportPage'
import SearchPage from './pages/SearchPage'
import SettingsPage from './pages/SettingsPage'
import Review from './pages/Review'
import Learn from './pages/Learn'
import Flashcards from './pages/Flashcards'
import Quiz from './pages/Quiz'
import DiagramEditor from './pages/DiagramEditor'
import PracticeExam from './pages/PracticeExam'

const NAV = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/search', label: 'Search', icon: '⌕' },
  { to: '/stats', label: 'Stats', icon: '▥' },
  { to: '/import', label: 'Import', icon: '⇪' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function App() {
  return (
    <HashRouter>
      <header className="topbar">
        <NavLink to="/" className="brand">
          Study Cards
        </NavLink>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/course/:id" element={<CoursePage />} />
          <Route path="/set/:id" element={<SetPage />} />
          <Route path="/set/:id/edit" element={<EditCards />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/study/review" element={<Review />} />
          <Route path="/study/learn" element={<Learn />} />
          <Route path="/study/flashcards" element={<Flashcards />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/exam" element={<PracticeExam />} />
          <Route path="/set/:id/diagram" element={<DiagramEditor />} />
          <Route path="/set/:id/diagram/:group" element={<DiagramEditor />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className="tab">
            <span className="tab-icon" aria-hidden>
              {n.icon}
            </span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </HashRouter>
  )
}
