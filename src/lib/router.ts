import { useEffect, useState } from 'react'

export const ROUTES = ['dashboard', 'transactions', 'income', 'budget', 'debts', 'bills', 'savings', 'cashflow', 'insights', 'settings', 'login', 'register', 'forgot', 'reset'] as const
export const AUTH_ROUTES: readonly string[] = ['login', 'register', 'forgot', 'reset']
export type Route = (typeof ROUTES)[number]

const read = (): Route => {
  const h = window.location.hash.replace(/^#\/?/, '') as Route
  return (ROUTES as readonly string[]).includes(h) ? h : 'dashboard'
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => {
      setRoute(read())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export const go = (r: Route) => {
  window.location.hash = `/${r}`
}
