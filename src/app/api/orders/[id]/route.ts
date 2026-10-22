import { apiHandler } from "@/lib/api-handler";
import { requireUser } from "@/lib/session";
import { orderService } from "@/services/order.service";
import { uuidSchema } from "@/validation/order.schemas";

export const dynamic = "force-dynamic";

export const GET = apiHandler<{ id: string }>(async (req, { params }) => {
  const user = await requireUser(req);
  return { body: await orderService.getDetail(user, uuidSchema.parse(params.id)) };
});
