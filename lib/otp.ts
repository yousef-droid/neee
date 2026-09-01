import type { Order, OtpEntry } from "./types";

// Appends a new code/message to the order's history — used by both the
// polling route and the webhook, which can otherwise both try to record the
// same incoming message. Skips the append if it's the same code+message we
// already have on top (a repeat poll of the same message), so the customer
// sees one entry per real message, not one per poll.
export function appendOtpEntry(
  order: Order,
  code: string | null | undefined,
  message: string | null | undefined,
  receivedAt?: string | null
): OtpEntry[] {
  const history = order.otpHistory || [];
  if (!code && !message) return history;

  const last = history[history.length - 1];
  if (last && last.code === (code ?? null) && last.message === (message ?? null)) {
    return history;
  }

  return [...history, { code: code ?? null, message: message ?? null, receivedAt: receivedAt || new Date().toISOString() }];
}
