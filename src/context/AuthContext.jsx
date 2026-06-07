import { createContext, useContext, useState, useEffect } from 'react'

const Ctx = createContext(null)
const KEY = 'cgheven_auth'
const PWD = import.meta.env.VITE_DASHBOARD_PASSWORD || 'cgheven2024'

export function AuthProvider({ children }) {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(KEY) === 'true' } catch { return false }
  })

  function login(password) {
    if (password === PWD) {
      localStorage.setItem(KEY, 'true')
      setAuthed(true)
      return true
    }
    return false
  }

  function logout() {
    localStorage.removeItem(KEY)
    setAuthed(false)
  }

  return <Ctx.Provider value={{ authed, login, logout }}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)
