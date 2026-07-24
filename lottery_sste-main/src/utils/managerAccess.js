const storageKey = (scope) => `managerAccess:${scope}`

export const getManagerAccessToken = (scope) => {
  if (!scope) return ''

  try {
    const rawValue = sessionStorage.getItem(storageKey(scope))
    if (!rawValue) return ''

    const storedValue = JSON.parse(rawValue)
    if (
      storedValue.expiresAt &&
      Date.now() > storedValue.expiresAt
    ) {
      clearManagerAccessToken(scope)
      return ''
    }

    return storedValue.token || ''
  } catch {
    clearManagerAccessToken(scope)
    return ''
  }
}

export const setManagerAccessToken = (
  scope,
  token,
  expiresInSeconds = 900
) => {
  if (!scope || !token) return

  sessionStorage.setItem(
    storageKey(scope),
    JSON.stringify({
      token,
      expiresAt:
        Date.now() + Number(expiresInSeconds || 900) * 1000,
    })
  )
}

export const clearManagerAccessToken = (scope) => {
  if (!scope) return

  sessionStorage.removeItem(storageKey(scope))
}

export const getManagerProtectedHeaders = (
  scope,
  includeContentType = true
) => {
  const token = localStorage.getItem('access_token')
  const managerAccessToken = getManagerAccessToken(scope)
  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Manager-Access-Token': managerAccessToken,
  }

  if (includeContentType) {
    headers['Content-Type'] = 'application/json'
  }

  return headers
}
