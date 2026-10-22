import { apiHandler, readJson } from "@/lib/api-handler";
import { requireUser } from "@/lib/session";
import { orderService } from "@/services/order.service";
import { createOrderSchema, idempotencyKeySchema, listOrdersQuerySchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export const GET = apiHandler(async (req) => {
  const user = await requireUser(req);
  const query = listOrdersQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return { body: await orderService.list(user, query) };
});

export const POST = apiHandler(async (req) => {
  const user = await requireUser(req);
  const key = idempotencyKeySchema.parse(req.headers.get("idempotency-key") ?? undefined);
  const input = createOrderSchema.parse(await readJson(req));
  const { order, created } = await orderService.create(user, input, key);
  // 201 for a new order, 200 when an identical request is replayed.
  return { status: created ? 201 : 200, body: { order, idempotentReplay: !created } };
});
