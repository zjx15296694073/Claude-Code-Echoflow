/**
 * CORS middleware for local desktop app communication
 */

import { H5AccessService } from '../services/h5AccessService.js'

const ALLOWED_ORIGIN_RE =
  /^(?:https?:\/\/(?:localhost|127\.0\.0\.1|tauri\.localhost)(?::\d+)?|tauri:\/\/localhost|asset:\/\/localhost)$/

export function corsHeaders(origin?: string | null): Record<string, string> {
  // Allow localhost origins (http/https) and Tauri WebView origins
  const allowedOrigin =
    origin && ALLOWED_ORIGIN_RE.test(origin) ? origin : 'http://localhost:3000'
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function baseCorsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export type CorsResolution = {
  allowed: boolean
  rejected: boolean
  headers: Record<string, string>
}

export async function resolveCors(
  origin?: string | null,
  requestOrigin?: string | null,
): Promise<CorsResolution> {
  if (!origin) {
    return {
      allowed: true,
      rejected: false,
      headers: corsHeaders(origin),
    }
  }

  if (ALLOWED_ORIGIN_RE.test(origin)) {
    return {
      allowed: true,
      rejected: false,
      headers: corsHeaders(origin),
    }
  }

  if (requestOrigin && origin === requestOrigin) {
    return {
      allowed: true,
      rejected: false,
      headers: {
        ...baseCorsHeaders(),
        'Access-Control-Allow-Origin': origin,
      },
    }
  }

  const h5AccessService = new H5AccessService()
  if (await h5AccessService.isOriginAllowed(origin)) {
    return {
      allowed: true,
      rejected: false,
      headers: {
        ...baseCorsHeaders(),
        'Access-Control-Allow-Origin': origin,
      },
    }
  }

  return {
    allowed: false,
    rejected: true,
    headers: baseCorsHeaders(),
  }
}
