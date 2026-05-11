import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import { nextMonthlyExpiry } from "@/lib/plan-server";
import { paypalCaptureOrder } from "@/lib/paypal-server";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Sign in required to save your membership after payment." },
        { status: 401 }
      );
    }

    const body = (await request.json()) as {
      orderID?: string;
      tier?: "pro" | "max";
    };
    const orderID = body?.orderID;
    const tier = body?.tier === "max" ? "max" : "pro";

    if (!orderID || typeof orderID !== "string") {
      return NextResponse.json({ error: "Missing orderID" }, { status: 400 });
    }

    const result = await paypalCaptureOrder(orderID);
    if (String(result.status).toUpperCase() !== "COMPLETED") {
      return NextResponse.json(
        { error: `Payment not completed (status: ${result.status})` },
        { status: 400 }
      );
    }

    const userId = session.user.id;
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    const planExpiresAt = nextMonthlyExpiry(existing?.planExpiresAt ?? null);

    await prisma.user.update({
      where: { id: userId },
      data: {
        plan: tier,
        planExpiresAt,
      },
    });

    return NextResponse.json({
      ok: true,
      orderId: result.id,
      status: result.status,
      planExpiresAt: planExpiresAt.toISOString(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "PayPal capture error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
