import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import Home from './pages/Home'
import Draft from './pages/Draft'
import MatchHistory from './pages/MatchHistory'
import Data from './pages/Data'
import DevTools from './pages/DevTools'

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
    { index: true, element: <Home /> },
    { path: 'draft', element: <Draft /> },
    { path: 'history', element: <MatchHistory /> },
    { path: 'data', element: <Data /> },
    { path: 'dev', element: <DevTools /> },
  ]}
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)