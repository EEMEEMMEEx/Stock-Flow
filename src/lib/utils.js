import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function toSafeFileToken(value) {
  return String(value || 'DOC').replace(/[\\/:*?"<>|]/g, '-')
}

// Checkout order statuses allowed to issue post-approval documents (a checkout
// order transitions from 'pending' to 'active' once approved and dispensed).
export const CHECKOUT_DISPATCH_STATUSES = ['active', 'partial_returned', 'overdue', 'completed']
