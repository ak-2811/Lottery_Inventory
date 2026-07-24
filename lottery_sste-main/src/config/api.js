const DEFAULT_API_BASE_URL = 'https://lottery-sste-backend.vercel.app/api'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
export const API_BASE = API_BASE_URL
