import type { ProductBrief, ProductEvent } from '../types'

declare global {
  interface Window {
    pendo?: {
      initialize: (config: Record<string, unknown>) => void
      track?: (eventName: string, metadata?: Record<string, unknown>) => void
    }
  }
}

const NOVUS_APP_ID = import.meta.env.VITE_NOVUS_PUBLIC_APP_ID as string | undefined
const visitorKey = 'launchpilot.visitorId'
let installStarted = false
let scriptLoaded = false
let scriptFailed = false
const eventQueue: Array<{ eventName: string; metadata?: Record<string, unknown> }> = []

function getVisitorId() {
  const stored = window.localStorage.getItem(visitorKey)
  if (stored) {
    return stored
  }

  const created = `visitor-${crypto.randomUUID()}`
  window.localStorage.setItem(visitorKey, created)
  return created
}

function getAccountId(brief: ProductBrief) {
  return `workspace-${brief.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

function flushEventQueue() {
  if (!window.pendo?.track) {
    return
  }

  while (eventQueue.length > 0) {
    const queued = eventQueue.shift()
    if (queued) {
      window.pendo.track(queued.eventName, queued.metadata)
    }
  }
}

export function isNovusConfigured() {
  return Boolean(NOVUS_APP_ID && NOVUS_APP_ID.trim().length > 0)
}

export function initializeNovus(brief: ProductBrief) {
  if (!isNovusConfigured() || window.pendo || installStarted) {
    return {
      configured: isNovusConfigured(),
      initialized: Boolean(window.pendo),
    }
  }

  installStarted = true
  const script = document.createElement('script')
  script.async = true
  script.src = `https://cdn.pendo.io/agent/static/${NOVUS_APP_ID}/pendo.js`
  script.onload = () => {
    scriptLoaded = true
    window.pendo?.initialize({
      visitor: {
        id: getVisitorId(),
        product: brief.name,
        role: 'launchpilot-user',
      },
      account: {
        id: getAccountId(brief),
        name: brief.name,
      },
    })
    flushEventQueue()
  }
  script.onerror = () => {
    scriptFailed = true
  }
  document.head.appendChild(script)

  return {
    configured: true,
    initialized: false,
  }
}

export function sendNovusEvent(eventName: string, metadata?: Record<string, unknown>) {
  if (window.pendo?.track) {
    window.pendo.track(eventName, metadata)
    return 'novus-sent' as const
  }

  if (isNovusConfigured() && !scriptFailed) {
    eventQueue.push({ eventName, metadata })
    return 'queued' as const
  }

  return 'local' as const
}

export function getNovusDiagnostics(brief: ProductBrief) {
  return {
    configured: isNovusConfigured(),
    installStarted,
    scriptLoaded,
    scriptFailed,
    agentReady: Boolean(window.pendo?.track),
    queueDepth: eventQueue.length,
    visitorId: typeof window === 'undefined' ? 'server' : getVisitorId(),
    accountId: getAccountId(brief),
    installUrl: NOVUS_APP_ID
      ? `https://cdn.pendo.io/agent/static/${NOVUS_APP_ID}/pendo.js`
      : 'missing VITE_NOVUS_PUBLIC_APP_ID',
  }
}

export function createProductEvent(
  eventName: string,
  detail: string,
  metadata?: Record<string, unknown>,
): ProductEvent {
  return {
    id: crypto.randomUUID(),
    event: eventName,
    timestamp: new Date().toISOString(),
    detail,
    source: sendNovusEvent(eventName, metadata),
  }
}
