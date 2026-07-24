import React, { useState } from 'react'
import { API_BASE } from '../config/api.js'
import { setManagerAccessToken } from '../utils/managerAccess'

export default function ManagerPinModal({
  open,
  scope,
  title = 'Manager Authorization',
  description = 'Enter the manager PIN to continue.',
  onClose,
  onAuthorized,
}) {
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSubmit = async (event) => {
    event.preventDefault()

    try {
      setLoading(true)
      setMessage('')

      const token = localStorage.getItem('access_token')
      const response = await fetch(`${API_BASE}/manager-pin/verify/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin, scope }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to verify manager PIN')
      }

      setManagerAccessToken(
        scope,
        data.accessToken,
        data.expiresIn
      )
      setPin('')
      onAuthorized?.(data)
    } catch (error) {
      setMessage(error.message || 'Failed to verify manager PIN')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.overlay}>
      <form style={styles.modal} onSubmit={handleSubmit}>
        <div style={styles.header}>
          <h2 style={styles.title}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            style={styles.closeButton}
          >
            ×
          </button>
        </div>

        <p style={styles.description}>{description}</p>

        <input
          autoFocus
          inputMode="numeric"
          maxLength={8}
          pattern="[0-9]{8}"
          placeholder="8-digit PIN"
          style={styles.input}
          type="password"
          value={pin}
          onChange={(event) =>
            setPin(event.target.value.replace(/\D/g, '').slice(0, 8))
          }
        />

        {message && <p style={styles.message}>{message}</p>}

        <div style={styles.actions}>
          <button
            type="button"
            onClick={onClose}
            style={styles.cancelButton}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || pin.length !== 8}
            style={{
              ...styles.submitButton,
              opacity: loading || pin.length !== 8 ? 0.65 : 1,
            }}
          >
            {loading ? 'Verifying...' : 'Continue'}
          </button>
        </div>
      </form>
    </div>
  )
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(10, 20, 22, 0.48)',
  },
  modal: {
    width: 'min(440px, 100%)',
    padding: 24,
    borderRadius: 12,
    background: '#ffffff',
    boxShadow: '0 24px 60px rgba(15, 35, 35, 0.22)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: {
    margin: 0,
    color: '#17201f',
    fontSize: 24,
    fontWeight: 800,
  },
  closeButton: {
    width: 36,
    height: 36,
    border: 'none',
    borderRadius: 8,
    background: '#f2f7f6',
    color: '#263b39',
    cursor: 'pointer',
    fontSize: 24,
    lineHeight: 1,
  },
  description: {
    margin: '16px 0 18px',
    color: '#6f7f7c',
    fontSize: 15,
    lineHeight: 1.5,
  },
  input: {
    width: '100%',
    padding: '14px 16px',
    border: '1px solid #dbe8e5',
    borderRadius: 10,
    color: '#14211f',
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: 2,
    outline: 'none',
  },
  message: {
    margin: '12px 0 0',
    color: '#d33a35',
    fontSize: 14,
    fontWeight: 700,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    padding: '11px 18px',
    border: '1px solid #dbe8e5',
    borderRadius: 9,
    background: '#ffffff',
    color: '#263b39',
    cursor: 'pointer',
    fontWeight: 700,
  },
  submitButton: {
    padding: '11px 20px',
    border: 'none',
    borderRadius: 9,
    background: '#1a7a6f',
    color: '#ffffff',
    cursor: 'pointer',
    fontWeight: 800,
  },
}
