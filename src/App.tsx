import { Outlet, NavLink } from 'react-router-dom'

export default function App(){
  return (
    <div className='min-h-screen grid grid-rows-[auto,1fr,auto]'>
      <nav className='sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur'>
        <div className='mx-auto max-w-6xl px-4 py-3 flex items-center justify-between'>
          <div className='text-xl font-semibold'>HOTS Draft</div>
          <div className='flex items-center gap-2 text-sm'>
            <NavLink to='/' className='navlink'>Home</NavLink>
            <NavLink to='/draft' className='navlink'>Draft</NavLink>
            <NavLink to='/history' className='navlink'>Match History</NavLink>
            <NavLink to='/data' className='navlink'>Data</NavLink>
            <NavLink to='/dev' className='navlink'>Dev Tools</NavLink>
          </div>
        </div>
      </nav>
      <main className='mx-auto w-full max-w-6xl p-4'>
        <Outlet />
      </main>
      <footer className='border-t border-neutral-800 p-4 text-center text-xs text-neutral-400'>
        © 2025 HOTS Draft — v0.1.0
      </footer>
    </div>
  )
}