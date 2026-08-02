// WhatsApp Business Platform (Meta Cloud API) — outbound template messages.
//
// INERT UNTIL CONFIGURED: every send is gated by isConfigured(), so with no
// WHATSAPP_* env vars the app behaves exactly as before — nothing is sent and
// nothing throws. Fill the env vars (see docs/whatsapp-setup.md) to switch it on.
//
// Business-initiated WhatsApp messages MUST use a PRE-APPROVED template. The
// TEMPLATES map below is the single source of truth for template name +
// body-variable order — it must match exactly what you submit in Meta's
// dashboard (same name, same language, same number/order of {{n}} variables).

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v21.0";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN || "";
const LANG = process.env.WHATSAPP_TEMPLATE_LANG || "en";
// National numbers (e.g. a 10-digit Indian mobile) get this country code
// prefixed. Digits only, no '+'. Leave unset if customer_phone is always E.164.
const DEFAULT_CC = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || "").replace(
  /\D/g,
  "",
);

/** True once a phone-number id + access token are present. Gates every send. */
export function isConfigured(): boolean {
  return Boolean(PHONE_NUMBER_ID && ACCESS_TOKEN);
}

/**
 * Normalize to WhatsApp's wire format: country code + number, digits only, no
 * '+'. A bare local number gets WHATSAPP_DEFAULT_COUNTRY_CODE prefixed. Returns
 * null when the result isn't a plausible international number (11–15 digits),
 * so callers can skip rather than send to a bad address.
 */
export function toWaNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2); // 00-intl prefix
  // Looks like a national number and we know the country → prefix the CC.
  if (DEFAULT_CC && digits.length <= 10) digits = DEFAULT_CC + digits;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

/** The subset of a delivery row a message needs. */
export interface DeliveryLike {
  customer_name: string | null;
  customer_phone: string | null;
  reference: string | null;
  tracking_token: string;
}

export type WaEvent = "booked" | "en_route" | "delivered";

function trackUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  return base ? `${base}/track/${token}` : `/track/${token}`;
}

/**
 * Template name + ordered body variables per event. Names default to ct_* and
 * can be overridden per-event via env to match whatever you named them in Meta.
 * The params() array order MUST match the {{1}}, {{2}}… order in the approved
 * template body.
 */
export const TEMPLATES: Record<
  WaEvent,
  { name: string; params: (d: DeliveryLike) => string[] }
> = {
  // "Booked — please set your drop-off": {{1}} name, {{2}} reference, {{3}} link
  booked: {
    name: process.env.WHATSAPP_TEMPLATE_BOOKED || "ct_booked",
    params: (d) => [
      d.customer_name || "there",
      d.reference || "your order",
      trackUrl(d.tracking_token),
    ],
  },
  // "On the way": {{1}} name, {{2}} reference, {{3}} live-tracking link
  en_route: {
    name: process.env.WHATSAPP_TEMPLATE_EN_ROUTE || "ct_en_route",
    params: (d) => [
      d.customer_name || "there",
      d.reference || "your order",
      trackUrl(d.tracking_token),
    ],
  },
  // "Delivered": {{1}} name, {{2}} reference
  delivered: {
    name: process.env.WHATSAPP_TEMPLATE_DELIVERED || "ct_delivered",
    params: (d) => [d.customer_name || "there", d.reference || "your order"],
  },
};

export type SendResult = {
  ok: boolean;
  /** Set when we deliberately did nothing (not configured / no phone). */
  skipped?: string;
  /** WhatsApp message id on success. */
  id?: string;
  /** Human-readable failure reason. */
  error?: string;
};

/**
 * Send the pre-approved template for `event` to a delivery's customer. Never
 * throws — returns a SendResult the caller can log. No-ops (ok:false, skipped)
 * when WhatsApp isn't configured or the customer phone can't be normalized.
 */
export async function sendDeliveryMessage(
  event: WaEvent,
  d: DeliveryLike,
): Promise<SendResult> {
  if (!isConfigured()) return { ok: false, skipped: "not_configured" };

  const to = toWaNumber(d.customer_phone);
  if (!to) return { ok: false, skipped: "no_valid_phone" };

  const tpl = TEMPLATES[event];
  const parameters = tpl.params(d).map((text) => ({ type: "text", text }));

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: tpl.name,
      language: { code: LANG },
      ...(parameters.length
        ? { components: [{ type: "body", parameters }] }
        : {}),
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${API_VERSION}/${PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, id: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}
