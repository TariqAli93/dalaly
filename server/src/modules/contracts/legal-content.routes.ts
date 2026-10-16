import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { requirePermission } from "../auth/auth.hooks.js";
import { DOCUMENT_VARIABLES } from "./docx.engine.js";
import {
  formulationInput,
  listFormulations,
  saveFormulation,
  deleteFormulation,
  copyFormulation,
  defaultFormulation,
  restoreFormulations,
  importFormulation,
} from "./formulations.service.js";
const id = (req: FastifyRequest) =>
  z.object({ id: z.coerce.number().int().positive() }).parse(req.params).id;
const anyPermission =
  (...keys: string[]) =>
  async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user?.permissions.some((p) => keys.includes(p.key)))
      return reply
        .code(403)
        .send({ message: "ليست لديك صلاحية تنفيذ هذه العملية." });
  };
export const legalContentRoutes: FastifyPluginAsync = async (app) => {
  const read = requirePermission("legal_content.read");
  const edit = anyPermission("legal_content.manage", "legal_content.propose");
  const publish = anyPermission(
    "legal_content.manage",
    "legal_content.publish",
  );
  app.get("/formulations", { preHandler: read }, listFormulations);
  app.get("/variables", { preHandler: read }, () =>
    DOCUMENT_VARIABLES.filter(
      (v) =>
        ![
          "legal_formulation",
          "additional_conditions",
          "assets_summary",
          "parties_summary",
          "agreement_terms",
          "witnesses",
          "office_role",
        ].includes(v),
    ),
  );
  app.post("/formulations", { preHandler: edit }, async (req, reply) =>
    reply
      .code(201)
      .send(
        await saveFormulation(formulationInput.parse(req.body), req.user!.id),
      ),
  );
  app.put("/formulations/:id", { preHandler: edit }, (req) =>
    saveFormulation(formulationInput.parse(req.body), req.user!.id, id(req)),
  );
  app.delete(
    "/formulations/:id",
    { preHandler: requirePermission("legal_content.delete") },
    (req) => deleteFormulation(id(req), req.user!.id),
  );
  app.post("/formulations/:id/copy", { preHandler: edit }, (req) =>
    copyFormulation(id(req), req.user!.id),
  );
  app.post("/formulations/:id/default", { preHandler: publish }, (req) =>
    defaultFormulation(id(req), req.user!.id),
  );
  app.post("/formulations/restore", { preHandler: publish }, (req) =>
    restoreFormulations(
      req.user!.id,
      z
        .object({ contract_type: z.enum(["sale", "rental"]) })
        .strict()
        .parse(req.body).contract_type,
    ),
  );
  app.post("/formulations/import", { preHandler: edit }, (req) => {
    const input = z
      .object({
        filename: z.string().min(1).max(255),
        data: z.string().max(17 * 1024 * 1024),
      })
      .strict()
      .parse(req.body);
    return importFormulation(input.filename, input.data);
  });
};
