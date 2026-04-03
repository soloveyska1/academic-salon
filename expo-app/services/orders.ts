import { OrderRequest } from '../types/document';

const BASE_URL = 'https://bibliosaloon.ru';

/**
 * Submit a custom work order.
 * POST /api/order
 */
export async function submitOrder(
  order: OrderRequest,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const response = await fetch(`${BASE_URL}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });

  const data = await response.json();

  if (!response.ok) {
    // The API returns error details in the response body
    const errorMessage =
      typeof data.detail === 'string'
        ? data.detail
        : data.detail?.error || 'Order submission failed';
    return { ok: false, error: errorMessage };
  }

  return { ok: true, message: data.message };
}
