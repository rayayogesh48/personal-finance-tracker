import { useEffect, useState } from 'react'

export const ROUTES = ['dashboard', 'transactions', 'income', 'budget', 'debts', 'bills', 'savings', 'cashflow', 'insights', 'groups', 'settings', 'login', 'register', 'forgot', 'reset'] as const
export const AUTH_ROUTES: readonly string[] = ['login', 'register', 'forgot', 'reset']
export type Route = (typeof ROUTES)[number]

/** "#/groups/<id>/members" → ['groups', '<id>', 'members'] */
const segments = () =>
  window.location.hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map(decodeURIComponent)

const read = (): Route => {
  const h = segments()[0] as Route
  return (ROUTES as readonly string[]).includes(h) ? h : 'dashboard'
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(read)
  useEffect(() => {
    const on = () => {
      setRoute((prev) => {
        const next = read()
        if (next !== prev) window.scrollTo({ top: 0 })
        return next
      })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

/** Path parameters after the route, e.g. ['<groupId>', 'members']. */
export function useRouteParams() {
  const [params, setParams] = useState<string[]>(() => segments().slice(1))
  useEffect(() => {
    const on = () => setParams(segments().slice(1))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return params
}

export const go = (r: Route, ...params: string[]) => {
  window.location.hash = `/${[r, ...params].map(encodeURIComponent).join('/')}`
}
