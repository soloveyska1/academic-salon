import AsyncStorage from '@react-native-async-storage/async-storage';
import { DocStats } from '../types/document';

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://bibliosaloon.ru';
const CLIENT_ID_KEY = '@bibliosaloon_client_id';

/**
 * Generate or retrieve a persistent client ID from AsyncStorage.
 */
export async function getClientId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;

    const id = generateId();
    await AsyncStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    // Fallback if storage fails
    return generateId();
  }
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 24; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Fetch stats for multiple documents in a single request.
 * POST /api/doc-stats/batch
 */
export async function fetchBatchStats(
  files: string[],
  clientId: string,
): Promise<Record<string, DocStats>> {
  const response = await fetch(`${BASE_URL}/api/doc-stats/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files, clientId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch batch stats: ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error('Batch stats request failed');
  }

  return data.stats as Record<string, DocStats>;
}

/**
 * Record a view or download event.
 * POST /api/doc-stats/event
 */
export async function recordEvent(
  file: string,
  action: 'view' | 'download',
  clientId: string,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/api/doc-stats/event`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, action, clientId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to record event: ${response.status}`);
  }
}

/**
 * Set a reaction (like/dislike/clear) on a document.
 * POST /api/doc-stats/reaction
 * @param reaction -1 (dislike), 0 (clear), 1 (like)
 */
export async function setReaction(
  file: string,
  reaction: number,
  clientId: string,
): Promise<DocStats> {
  const response = await fetch(`${BASE_URL}/api/doc-stats/reaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, reaction, clientId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to set reaction: ${response.status}`);
  }

  const data = await response.json();
  if (!data.ok) {
    throw new Error('Reaction request failed');
  }

  return data.stat as DocStats;
}
