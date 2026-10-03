import { NavLink } from 'react-router-dom'
import AppRoutes from './router'

const navItems = [
  { to: '/joints', label: '榫卯图鉴' },
  { to: '/furniture', label: '家具反查' },
]

export default function App() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-wood-100 bg-wood-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to="/joints" className="group flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-wood-700 text-white shadow-sm">
              <svg aria-hidden="true" viewBox="0 0 48 48" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M7 15h12v-7h10v7h12v10H29v11H19V25H7z" />
                <path d="M19 15v10M29 15v10M19 25h10" />
              </svg>
            </span>
            <span>
              <strong className="block text-base tracking-wide text-wood-900">榫卯结构拆解图鉴</strong>
              <span className="block text-[11px] tracking-[0.2em] text-wood-500">GBMORTISE</span>
            </span>
          </NavLink>
          <nav aria-label="主导航" className="flex items-center gap-2">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }: { isActive: boolean }) => `rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive ? 'bg-wood-700 text-white shadow-sm' : 'text-wood-700 hover:bg-white'
                }`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppRoutes />
      </main>
      <footer className="mt-12 border-t border-wood-100 bg-white/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>榫卯取材于木，合于分寸。</span>
          <span>数据保存在当前浏览器 IndexedDB 中</span>
        </div>
      </footer>
    </div>
  )
}
