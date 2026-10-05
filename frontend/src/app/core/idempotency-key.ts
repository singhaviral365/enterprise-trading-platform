/** A fresh idempotency key for one order attempt (the contract wants 8 to 100 characters). */
export function newIdempotencyKey(): string {
  return `ord-${crypto.randomUUID()}`;
}
