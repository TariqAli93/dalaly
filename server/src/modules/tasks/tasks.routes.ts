import {
  type FastifyPluginAsync,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import { parseId } from "../../shared/utils/parse-id.js";
import { listAssignees, listTasksPage, patchTask } from "./tasks.repository.js";
import {
  TASK_SOURCES,
  taskPageQuerySchema,
  taskPatchSchema,
} from "./tasks.schema.js";

/** Anyone who may read some kind of follow-up may see who can be assigned. */
async function handlesTasks(request: FastifyRequest, reply: FastifyReply) {
  const keys = request.user?.permissions.map((item) => item.key) ?? [];
  if (
    !keys.includes("followups.read") &&
    !keys.includes("rentals.followups.read")
  )
    return reply
      .code(403)
      .send({ message: "ليست لديك صلاحية تنفيذ هذه العملية." });
}

const sourceSchema = z.enum(TASK_SOURCES);

/**
 * The tasks list reads only the sources the caller may read (each needs its
 * follow-up and record permissions), so it needs nothing more itself; a
 * change is checked against the source's update permission.
 */
export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get("/paged", async (request) =>
    listTasksPage(taskPageQuerySchema.parse(request.query), request.user!),
  );

  app.get("/assignees", { preHandler: handlesTasks }, async () =>
    listAssignees(),
  );

  app.patch("/:source/:id", async (request, reply) => {
    const params = request.params as { source: string; id: string };
    const source = sourceSchema.safeParse(params.source);
    const id = parseId(params.id);
    if (!source.success || !id)
      return reply.code(400).send({ message: "معرف المهمة غير صحيح." });
    const task = await patchTask(
      source.data,
      id,
      taskPatchSchema.parse(request.body),
      request.user!,
    );
    return task ?? reply.code(404).send({ message: "المهمة غير موجودة." });
  });
};
