"use server";

import { sendMessage } from "@/app/api/chat/route";
import { getUser } from "@/auth/stack-auth";
import { appsTable, appUsers } from "@/db/schema";
import { db, withDatabaseRetry } from "@/lib/db";
import { freestyle } from "@/lib/freestyle";
import { templates } from "@/lib/templates";
import { memory } from "@/mastra/agents/builder";

export async function createApp({
  initialMessage,
  templateId,
}: {
  initialMessage?: string;
  templateId: string;
}) {
  const requestId = crypto.randomUUID().slice(0, 8);
  console.time(`get user ${requestId}`);
  const user = await getUser();
  console.timeEnd(`get user ${requestId}`);

  if (!templates[templateId]) {
    throw new Error(
      `Template ${templateId} not found. Available templates: ${Object.keys(templates).join(", ")}`
    );
  }

  console.time(`git ${requestId}`);
  const repo = await freestyle.createGitRepository({
    name: "Unnamed App",
    public: true,
    source: {
      type: "git",
      url: templates[templateId].repo,
    },
  });
  await freestyle.grantGitPermission({
    identityId: user.freestyleIdentity,
    repoId: repo.repoId,
    permission: "write",
  });

  const token = await freestyle.createGitAccessToken({
    identityId: user.freestyleIdentity,
  });

  console.timeEnd(`git ${requestId}`);

  console.time(`dev server ${requestId}`);
  const { mcpEphemeralUrl } = await freestyle.requestDevServer({
    repoId: repo.repoId,
  });
  console.timeEnd(`dev server ${requestId}`);

  console.time(`database: create app ${requestId}`);
  const app = await withDatabaseRetry(async () => {
    return await db.transaction(async (tx) => {
      const appInsertion = await tx
        .insert(appsTable)
        .values({
          gitRepo: repo.repoId,
          name: initialMessage,
        })
        .returning();

      await tx
        .insert(appUsers)
        .values({
          appId: appInsertion[0].id,
          userId: user.userId,
          permissions: "admin",
          freestyleAccessToken: token.token,
          freestyleAccessTokenId: token.id,
          freestyleIdentity: user.freestyleIdentity,
        })
        .returning();

      return appInsertion[0];
    });
  });
  console.timeEnd(`database: create app ${requestId}`);

  console.time(`mastra: create thread ${requestId}`);
  await withDatabaseRetry(async () => {
    await memory.createThread({
      threadId: app.id,
      resourceId: app.id,
    });
  });
  console.timeEnd(`mastra: create thread ${requestId}`);

  if (initialMessage) {
    console.time(`send initial message ${requestId}`);
    await sendMessage(app.id, mcpEphemeralUrl, {
      id: crypto.randomUUID(),
      parts: [
        {
          text: initialMessage,
          type: "text",
        },
      ],
      role: "user",
    });
    console.timeEnd(`send initial message ${requestId}`);
  }

  return app;
}
