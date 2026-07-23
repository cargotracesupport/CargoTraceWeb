// WhatsApp click-to-chat helpers. Opens WhatsApp (the sender's own — no Business
// API, no dedicated number) with the message prefilled; the sender taps send.

/**
 * WhatsApp deep link with the message prefilled. Targets the customer's chat
 * only when the number carries a country code (11–15 digits); a bare local
 * number can't be dialled reliably, so it falls back to WhatsApp's contact
 * picker with the message ready.
 */
export function whatsappUrl(
  phone: string | null | undefined,
  message: string,
): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const text = encodeURIComponent(message);
  if (digits.length >= 11 && digits.length <= 15) {
    return `https://wa.me/${digits}?text=${text}`;
  }
  return `https://wa.me/?text=${text}`;
}

/** The message a customer gets with their tracking link. */
export function trackShareMessage(opts: {
  name?: string | null;
  reference?: string | null;
  url: string;
  needsDropoff?: boolean;
}): string {
  const hi = `Hi${opts.name ? " " + opts.name : ""}`;
  const ref = opts.reference ? ` ${opts.reference}` : "";
  return opts.needsDropoff
    ? `${hi}, your delivery${ref} is booked. Please open this link and set your drop-off location: ${opts.url}`
    : `${hi}, track your delivery${ref} live here: ${opts.url}`;
}
