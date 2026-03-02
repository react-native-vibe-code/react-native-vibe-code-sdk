// @ts-nocheck
import * as __fd_glob_24 from "../content/docs/packages/visual-edits.mdx?collection=docs"
import * as __fd_glob_23 from "../content/docs/packages/ui.mdx?collection=docs"
import * as __fd_glob_22 from "../content/docs/packages/starter-kit.mdx?collection=docs"
import * as __fd_glob_21 from "../content/docs/packages/sandbox.mdx?collection=docs"
import * as __fd_glob_20 from "../content/docs/packages/restore.mdx?collection=docs"
import * as __fd_glob_19 from "../content/docs/packages/remix.mdx?collection=docs"
import * as __fd_glob_18 from "../content/docs/packages/pusher.mdx?collection=docs"
import * as __fd_glob_17 from "../content/docs/packages/publish.mdx?collection=docs"
import * as __fd_glob_16 from "../content/docs/packages/prompt-engine.mdx?collection=docs"
import * as __fd_glob_15 from "../content/docs/packages/payments.mdx?collection=docs"
import * as __fd_glob_14 from "../content/docs/packages/integrations.mdx?collection=docs"
import * as __fd_glob_13 from "../content/docs/packages/error-manager.mdx?collection=docs"
import * as __fd_glob_12 from "../content/docs/packages/database.mdx?collection=docs"
import * as __fd_glob_11 from "../content/docs/packages/convex.mdx?collection=docs"
import * as __fd_glob_10 from "../content/docs/packages/code-editor.mdx?collection=docs"
import * as __fd_glob_9 from "../content/docs/packages/chat.mdx?collection=docs"
import * as __fd_glob_8 from "../content/docs/packages/auth.mdx?collection=docs"
import * as __fd_glob_7 from "../content/docs/packages/agent.mdx?collection=docs"
import * as __fd_glob_6 from "../content/docs/deployment/vercel.mdx?collection=docs"
import * as __fd_glob_5 from "../content/docs/deployment/environment.mdx?collection=docs"
import * as __fd_glob_4 from "../content/docs/deployment/blob-storage.mdx?collection=docs"
import * as __fd_glob_3 from "../content/docs/index.mdx?collection=docs"
import { default as __fd_glob_2 } from "../content/docs/packages/meta.json?collection=docs"
import { default as __fd_glob_1 } from "../content/docs/deployment/meta.json?collection=docs"
import { default as __fd_glob_0 } from "../content/docs/meta.json?collection=docs"
import { server } from 'fumadocs-mdx/runtime/server';
import type * as Config from '../source.config';

const create = server<typeof Config, import("fumadocs-mdx/runtime/types").InternalTypeConfig & {
  DocData: {
  }
}>({"doc":{"passthroughs":["extractedReferences"]}});

export const docs = await create.docs("docs", "content/docs", {"meta.json": __fd_glob_0, "deployment/meta.json": __fd_glob_1, "packages/meta.json": __fd_glob_2, }, {"index.mdx": __fd_glob_3, "deployment/blob-storage.mdx": __fd_glob_4, "deployment/environment.mdx": __fd_glob_5, "deployment/vercel.mdx": __fd_glob_6, "packages/agent.mdx": __fd_glob_7, "packages/auth.mdx": __fd_glob_8, "packages/chat.mdx": __fd_glob_9, "packages/code-editor.mdx": __fd_glob_10, "packages/convex.mdx": __fd_glob_11, "packages/database.mdx": __fd_glob_12, "packages/error-manager.mdx": __fd_glob_13, "packages/integrations.mdx": __fd_glob_14, "packages/payments.mdx": __fd_glob_15, "packages/prompt-engine.mdx": __fd_glob_16, "packages/publish.mdx": __fd_glob_17, "packages/pusher.mdx": __fd_glob_18, "packages/remix.mdx": __fd_glob_19, "packages/restore.mdx": __fd_glob_20, "packages/sandbox.mdx": __fd_glob_21, "packages/starter-kit.mdx": __fd_glob_22, "packages/ui.mdx": __fd_glob_23, "packages/visual-edits.mdx": __fd_glob_24, });