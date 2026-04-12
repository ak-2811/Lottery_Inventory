import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './auth.css'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Prevent back button navigation on login page
  useEffect(() => {
    // Push a new entry to browser history
    window.history.pushState(null, null, window.location.href)

    const handlePopState = (event) => {
      // Prevent back navigation
      event.preventDefault()
      window.history.pushState(null, null, window.location.href)
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    // For now, static validation - no API call
    if (!email || !password) {
      setError('Please enter both email and password')
      setLoading(false)
      return
    }

    // Static credentials for demo
    if (email === 'admin@lottery.com' && password === 'password123') {
      // Simulate API delay
      setTimeout(() => {
        navigate('/dashboard')
      }, 500)
    } else {
      setError('Invalid email or password')
      setLoading(false)
    }
  }

  const handleSignupRedirect = () => {
    navigate('/signup')
  }

  return (
    <div className="auth-container">
      <div className="auth-background"></div>

      <div className="auth-wrapper">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">🎰</div>
            <h1>The Lottery System</h1>
            <p className="auth-subtitle">Premium Inventory Management</p>
          </div>

          <form onSubmit={handleLogin} className="auth-form">
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                type="email"
                id="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="auth-btn login-btn"
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                className="link-btn"
                onClick={handleSignupRedirect}
                disabled={loading}
              >
                Sign up here
              </button>
            </p>
            <p className="demo-credentials">
              <small>Demo Credentials:<br />Email: admin@lottery.com<br />Password: password123</small>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
