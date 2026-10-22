import { apiHandler } from "@/lib/api-handler";
import { requireAdminUser } from "@/lib/session";
import { orderService } from "@/services/order.service";
import { uuidSchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export const POST = apiHandler<{ id: string }>(async (req, { params }) => {
  const user = await requireAdminUser(req);
  return { body: { order: await orderService.retry(user, uuidSchema.parse(params.id)) } };
});
