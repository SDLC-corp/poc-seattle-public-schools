import { useEffect, useSyncExternalStore } from 'react'
import { API_BASE } from './api'

// Shared unread-notification count for the top-bar bell and the sidebar badge.
// The Notifications page pushes fresh counts after every change; otherwise it's polled.
const POLL_MS = 60000

let count = null
const listeners = new Set()
const emit = () => listeners.forEach((l) => l())

export function setUnreadCount(n) {
  if (typeof n === 'number' && n !== count) {
    count = n
    emit()
  }
}

export function refreshUnreadCount() {
  return fetch(`${API_BASE}/notifications/summary`)
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => { if (s) setUnreadCount(s.counts.unread) })
    .catch(() => { /* backend down: keep the last known count */ })
}

const subscribe = (l) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

let pollers = 0
let timer = null

export function useUnreadCount() {
  useEffect(() => {
    pollers += 1
    if (pollers === 1) {
      refreshUnreadCount()
      timer = setInterval(refreshUnreadCount, POLL_MS)
    }
    return () => {
      pollers -= 1
      if (pollers === 0) clearInterval(timer)
    }
  }, [])
  return useSyncExternalStore(subscribe, () => count)
}
