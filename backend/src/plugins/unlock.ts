import fp from "fastify-plugin";
import type {
  ProjectDoc,
  UnlockTokenPayload,
  WorkspaceMeta,
} from "@restify/shared";

export default fp(async function unlockPlugin(app) {
  app.decorate(
    "issueUnlockToken",
    async (payload: Omit<UnlockTokenPayload, "exp">) => {
      return app.jwt.sign(payload, {
        expiresIn: `${app.config.unlockTtlMinutes}m`,
      });
    },
  );

  app.decorate("readUnlockToken", async (_request) => null);

  // Workspace and project password protection has been removed.
  app.decorate(
    "assertWorkspaceUnlocked",
    async (_request, _workspace: WorkspaceMeta) => undefined,
  );

  app.decorate(
    "assertProjectUnlocked",
    async (_request, _project: ProjectDoc, _workspace?: WorkspaceMeta) =>
      undefined,
  );
});