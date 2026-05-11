/**
 * Server-only PayPal REST helpers. Do not import from client components.
 */

function apiBase(): string {
  const mode = process.env.PAYPAL_MODE?.toLowerCase();
  if (mode === "sandbox") {
    return "https://api-m.sandbox.paypal.com";
  }
  return "https://api-m.paypal.com";
}

function getCredentials(): { clientId: string; secret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const secret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  if (!clientId || !secret) {
    throw new Error("PayPal server credentials are not configured");
  }
  return { clientId, secret };
}

export async function getPayPalAccessToken(): Promise<string> {
  const { clientId, secret } = getCredentials();
  const basic = Buffer.from(`${clientId}:${secret}`, "utf8").toString("base64");
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json()) as { access_token?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description ?? `PayPal auth failed (${res.status})`);
  }
  return data.access_token;
}

export async function paypalCreateOrder(amountUsd: string, currencyCode = "USD"): Promise<string> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${apiBase()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: currencyCode,
            value: amountUsd,
          },
        },
      ],
    }),
  });
  const data = (await res.json()) as { id?: string; message?: string; details?: { description?: string }[] };
  if (!res.ok || !data.id) {
    const msg = data.details?.[0]?.description ?? data.message ?? `create order failed (${res.status})`;
    throw new Error(msg);
  }
  return data.id;
}

export async function paypalCaptureOrder(orderId: string): Promise<{ status: string; id: string }> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${apiBase()}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const data = (await res.json()) as {
    id?: string;
    status?: string;
    message?: string;
    details?: { description?: string }[];
  };
  if (!res.ok) {
    const msg = data.details?.[0]?.description ?? data.message ?? `capture failed (${res.status})`;
    throw new Error(msg);
  }
  const status = data.status ?? "UNKNOWN";
  return { id: data.id ?? orderId, status };
}
