import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { BarChart2, Eye, EyeOff, AlertCircle } from 'lucide-react'

export default function Login() {
  const { login } = useAuth()
  const [pwd,  setPwd]  = useState('')
  const [show, setShow] = useState(false)
  const [err,  setErr]  = useState('')
  const [loading, setLoading] = useState(false)

  function handle(e) {
    e.preventDefault()
    setLoading(true)
    setErr('')
    setTimeout(() => {
      if (!login(pwd)) {
        setErr('Wrong password. Try again.')
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--bg-900)' }}>
      <div className="w-full max-w-sm ani-up">

        <div className="flex flex-col items-center mb-8">
          <div style={{ width: 52, height: 52, background: '#6366f1', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <BarChart2 size={26} color="#fff" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: 'var(--text-1)', marginBottom: 4 }}>CGHEVEN Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Enter password to continue</p>
        </div>

        <div className="card">
          <form onSubmit={handle}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text-3)', display: 'block', marginBottom: 6, letterSpacing: '.04em', textTransform: 'uppercase' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={show ? 'text' : 'password'}
                  value={pwd}
                  onChange={e => setPwd(e.target.value)}
                  placeholder="Enter dashboard password"
                  required
                  style={{
                    width: '100%', padding: '10px 40px 10px 14px',
                    background: 'var(--bg-800)', border: `1px solid ${err ? 'var(--red)' : 'var(--border)'}`,
                    borderRadius: 8, color: 'var(--text-1)', fontSize: 13,
                    outline: 'none', fontFamily: 'DM Sans, sans-serif',
                    transition: 'border-color .2s',
                  }}
                  onFocus={e => { if (!err) e.target.style.borderColor = '#6366f1' }}
                  onBlur={e => { e.target.style.borderColor = err ? 'var(--red)' : 'var(--border)' }}
                />
                <button
                  type="button"
                  onClick={() => setShow(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}
                >
                  {show ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {err && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 11, color: 'var(--red)' }}>
                  <AlertCircle size={12} /> {err}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !pwd}
              style={{
                width: '100%', padding: '10px', background: loading || !pwd ? 'var(--bg-400)' : '#6366f1',
                border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500,
                cursor: loading || !pwd ? 'not-allowed' : 'pointer', transition: 'background .2s',
                fontFamily: 'DM Sans, sans-serif',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--text-3)' }}>
          Internal analytics dashboard · CGHEVEN
        </p>
      </div>
    </div>
  )
}
