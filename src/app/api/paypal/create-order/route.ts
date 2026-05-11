import { NextResponse } from "next/server";
import { paypalCreateOrder } from "@/lib/paypal-server";

export async function POST(request: Request) {
  try {
    const pricePro = process.env.PRICE_PRO ?? "2.00";
    const priceMax = process.env.PRICE_MAX ?? "5.00";
    let amount = pricePro;
    let tier: "pro" | "max" = "pro";
    try {
      const body = (await request.json()) as { tier?: "pro" | "max" } | null;
      if (body?.tier === "max") {
        tier = "max";
        amount = priceMax;
      }
    } catch {
      // no body
    }

    const orderId = await paypalCreateOrder(amount);
    return NextResponse.json({ id: orderId, tier, amount });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PayPal create order error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
