import { relations, type InferSelectModel } from 'drizzle-orm'
import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  primaryKey,
  varchar,
  json,
  jsonb,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { CONFIG } from '@react-native-vibe-code/config'

// Better Auth compatible user table
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Custom fields for our app
  isFragmentsUser: boolean('is_fragments_user').default(true),
})

// Better Auth compatible session table
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

// Better Auth compatible account table
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

// Better Auth compatible verification table
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Teams table for our app functionality
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  tier: text('tier').default('free'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Junction table for user-team relationships
export const usersTeams = pgTable(
  'users_teams',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    isDefault: boolean('is_default').default(false),
    createdAt: timestamp('created_at').defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.teamId] }),
  }),
)

// Projects table for sandbox sessions
export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  title: text('title').notNull(), // Fantasy compound name for app (e.g., "swift-mountain")
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
  chatId: uuid('chat_id').references(() => chat.id, { onDelete: 'cascade' }),
  sandboxId: text('sandbox_id'), // E2B sandbox ID
  sandboxUrl: text('sandbox_url'), // The server URL when running
  ngrokUrl: text('ngrok_url'), // The ngrok URL for external access
  deployedUrl: text('deployed_url'), // Deployed web application URL (pages.dev fallback)
  customDomainUrl: text('custom_domain_url'), // Custom domain URL (e.g., project.capsulethis.app)
  cloudflareProjectName: text('cloudflare_project_name'), // Cloudflare Pages project name for redeployment
  serverReady: boolean('server_ready').default(false), // Whether server is ready
  serverStatus: text('server_status').default('closed'), // 'running', 'closed'
  template: text('template').notNull(), // Template type (react-native-expo, etc.)
  status: text('status').notNull().default('active'), // active, paused, completed
  conversationId: text('conversation_id'), // Claude Code conversation ID
  githubRepo: text('github_repo'), // GitHub repository name for recreation
  isPublic: boolean('is_public').default(true), // Whether project is publicly accessible (public by default, paid users can make private)
  forkedFrom: uuid('forked_from').references((): AnyPgColumn => projects.id, { onDelete: 'set null' }), // Original project if this is a fork
  forkCount: text('fork_count').default('0'), // Number of times this project has been forked
  screenshotMobile: text('screenshot_mobile'), // Mobile view screenshot URL/path
  screenshotDesktop: text('screenshot_desktop'), // Desktop view screenshot URL/path
  // Mobile app compatibility fields
  sandboxStatus: text('sandbox_status'), // 'active', 'paused', 'destroyed' - E2B sandbox status
  sshActive: boolean('ssh_active').default(false), // Whether SSH access is enabled
  isPublished: boolean('is_published').default(false), // Published to mobile app marketplace
  iconUrl: text('icon_url'), // App icon URL for mobile
  githubSHA: text('github_sha'), // Latest commit SHA from GitHub
  staticBundleUrl: text('static_bundle_url'), // Vercel Blob base URL for static bundle
  // Convex backend integration fields
  convexProject: json('convex_project'), // JSON storing connection state: {kind: 'connected' | 'connecting' | 'failed', ...}
  convexDevRunning: boolean('convex_dev_running').default(false), // Whether convex dev is running in sandbox
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Subscriptions table for Polar integration
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  customerId: text('customer_id'), // Polar customer ID
  currentPlan: text('current_plan').default('free'), // free, start, pro, senior
  subscriptionId: text('subscription_id'), // Polar subscription ID
  productId: text('product_id'), // Polar product ID
  checkoutId: text('checkout_id'), // Last checkout ID
  status: text('status').default('inactive'), // active, inactive, cancelled, past_due
  subscribedAt: timestamp('subscribed_at'),
  cancelledAt: timestamp('cancelled_at'),
  expiresAt: timestamp('expires_at'),
  messageLimit: text('message_limit').default(CONFIG.FREE_PLAN_MESSAGE_LIMIT.toString()), // Monthly message limit
  resetDate: timestamp('reset_date'), // Next reset date (1st of month)
  metadata: json('metadata'), // Additional Polar data
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Convex project credentials table
export const convexProjectCredentials = pgTable('convex_project_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  mode: text('mode').notNull().default('oauth'), // 'oauth' (user's account) or 'managed' (platform-managed)
  teamSlug: text('team_slug'), // Convex team slug (nullable for legacy records)
  projectSlug: text('project_slug'), // Convex project slug (nullable for legacy records)
  deploymentUrl: text('deployment_url'), // Deployment URL (e.g., https://xxx.convex.cloud)
  deploymentName: text('deployment_name'), // Deployment name (e.g., team-slug:project-slug:dev)
  adminKey: text('admin_key'), // Admin key for API access (nullable for legacy records)
  accessToken: text('access_token'), // OAuth access token for refreshing (only for oauth mode)
  // Legacy columns - preserved for existing data
  tenantId: text('tenant_id'),
  flyAppName: text('fly_app_name'),
  instanceSecret: text('instance_secret'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Commits table for tracking git commits and static bundles
export const commits = pgTable('commits', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  githubSHA: text('github_sha').notNull(), // Git commit SHA
  userMessage: text('user_message').notNull(), // User's prompt that triggered this commit
  bundleUrl: text('bundle_url'), // Vercel Blob URL for this commit's bundle
  createdAt: timestamp('created_at').defaultNow(),
})

// Prompt messages table for tracking monthly usage
export const promptMessages = pgTable('prompt_messages', {
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  month: text('month').notNull(), // Format: YYYY-MM (e.g., "2025-08")
  usageCount: text('usage_count').default('0'), // Number of messages used this month
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  // Primary key on userId and month combination
  pk: primaryKey({ columns: [table.userId, table.month] }),
}))

// Conversations table for Claude Code interactions
export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' }),
  claudeConversationId: text('claude_conversation_id').notNull(), // Claude Code SDK conversation ID
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  status: text('status').notNull().default('active'), // active, completed, error
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Conversation messages table
export const conversationMessages = pgTable('conversation_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  conversationId: uuid('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(), // user, assistant
  content: text('content').notNull(),
  timestamp: timestamp('timestamp').notNull().defaultNow(),
  metadata: text('metadata'), // JSON string for additional data like file operations
})

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: text('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
})

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
})

// Relations
export const userRelations = relations(user, ({ many, one }) => ({
  sessions: many(session),
  accounts: many(account),
  usersTeams: many(usersTeams),
  projects: many(projects),
  conversations: many(conversations),
  chats: many(chat),
  subscription: one(subscriptions),
  promptMessages: many(promptMessages),
  twitterLink: one(twitterLinks),
  privacyPolicies: many(privacyPolicies),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}))

export const teamsRelations = relations(teams, ({ many }) => ({
  usersTeams: many(usersTeams),
  projects: many(projects),
}))

export const usersTeamsRelations = relations(usersTeams, ({ one }) => ({
  user: one(user, {
    fields: [usersTeams.userId],
    references: [user.id],
  }),
  team: one(teams, {
    fields: [usersTeams.teamId],
    references: [teams.id],
  }),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(user, {
    fields: [projects.userId],
    references: [user.id],
  }),
  team: one(teams, {
    fields: [projects.teamId],
    references: [teams.id],
  }),
  chat: one(chat, {
    fields: [projects.chatId],
    references: [chat.id],
  }),
  conversations: many(conversations),
  commits: many(commits),
  convexCredentials: one(convexProjectCredentials, {
    fields: [projects.id],
    references: [convexProjectCredentials.projectId],
  }),
}))

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [conversations.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [conversations.userId],
      references: [user.id],
    }),
    messages: many(conversationMessages),
  }),
)

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversationId],
      references: [conversations.id],
    }),
  }),
)

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(user, {
    fields: [subscriptions.userId],
    references: [user.id],
  }),
}))

export const promptMessagesRelations = relations(promptMessages, ({ one }) => ({
  user: one(user, {
    fields: [promptMessages.userId],
    references: [user.id],
  }),
}))

export const commitsRelations = relations(commits, ({ one }) => ({
  project: one(projects, {
    fields: [commits.projectId],
    references: [projects.id],
  }),
}))

export const convexProjectCredentialsRelations = relations(
  convexProjectCredentials,
  ({ one }) => ({
    project: one(projects, {
      fields: [convexProjectCredentials.projectId],
      references: [projects.id],
    }),
    user: one(user, {
      fields: [convexProjectCredentials.userId],
      references: [user.id],
    }),
  }),
)

export const chatRelations = relations(chat, ({ one, many }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(message),
}))

export const messageRelations = relations(message, ({ one }) => ({
  chat: one(chat, {
    fields: [message.chatId],
    references: [chat.id],
  }),
}))

// Twitter account linking table for X-Bot
export const twitterLinks = pgTable('twitter_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  twitterUserId: text('twitter_user_id').notNull().unique(), // Twitter numeric user ID
  twitterUsername: text('twitter_username').notNull(), // Twitter @handle (without @)
  linkedAt: timestamp('linked_at').defaultNow(),
})

// X-Bot replies table for tracking which mentions have been replied to
export const xBotReplies = pgTable('x_bot_replies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tweetId: text('tweet_id').notNull().unique(), // The mention tweet ID we replied to
  replyTweetId: text('reply_tweet_id'), // Our final reply tweet ID
  authorId: text('author_id'), // The author who mentioned us
  authorUsername: text('author_username'), // Twitter @handle of the mentioning user
  tweetText: text('tweet_text'), // Original tweet text (for debugging)
  status: text('status').notNull().default('pending'), // pending, generating, replied, failed, skipped
  errorMessage: text('error_message'), // Error message if failed
  // New fields for app generation tracking
  projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }), // Link to created project
  imageUrls: json('image_urls'), // Array of downloaded image blob URLs
  isAppRequest: boolean('is_app_request').default(false), // AI classification result
  appDescription: text('app_description'), // Extracted app description from AI classification
  generationStatus: text('generation_status'), // 'pending', 'generating', 'completed', 'failed'
  // First reply ("creating your app") tracking
  firstReplyTweetId: text('first_reply_tweet_id'), // Tweet ID of the "creating your app" reply
  firstReplyContent: text('first_reply_content'), // Content of the first reply
  firstRepliedAt: timestamp('first_replied_at'), // When the first reply was sent
  // Final reply ("app is ready") tracking
  replyContent: text('reply_content'), // What we replied with (final reply)
  repliedAt: timestamp('replied_at'), // When we sent the final reply
  createdAt: timestamp('created_at').defaultNow(),
})

// X-Bot state table for tracking polling state (lastTweetId)
export const xBotState = pgTable('x_bot_state', {
  id: text('id').primaryKey().default('default'), // Single row with id='default'
  lastTweetId: text('last_tweet_id'), // Last processed tweet ID for since_id
  updatedAt: timestamp('updated_at').defaultNow(),
})

// Privacy policies table for iOS app policy generator
export const privacyPolicies = pgTable('privacy_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  appName: text('app_name').notNull(),
  companyName: text('company_name'),
  answers: jsonb('answers').notNull(), // Full questionnaire answers
  generatedPolicy: text('generated_policy'), // Markdown output
  nutritionLabel: jsonb('nutrition_label'), // Apple nutrition label data
  status: text('status').default('draft'), // 'draft' | 'completed'
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

// X-Bot relations
export const twitterLinksRelations = relations(twitterLinks, ({ one }) => ({
  user: one(user, {
    fields: [twitterLinks.userId],
    references: [user.id],
  }),
}))

export const xBotRepliesRelations = relations(xBotReplies, ({ one }) => ({
  project: one(projects, {
    fields: [xBotReplies.projectId],
    references: [projects.id],
  }),
}))

export const privacyPoliciesRelations = relations(privacyPolicies, ({ one }) => ({
  user: one(user, {
    fields: [privacyPolicies.userId],
    references: [user.id],
  }),
}))

export type User = typeof user.$inferSelect
export type Team = typeof teams.$inferSelect
export type UserTeam = typeof usersTeams.$inferSelect
export type Project = typeof projects.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type ConversationMessage = typeof conversationMessages.$inferSelect
export type Subscription = typeof subscriptions.$inferSelect
export type PromptMessage = typeof promptMessages.$inferSelect
export type Commit = typeof commits.$inferSelect
export type ConvexProjectCredential = typeof convexProjectCredentials.$inferSelect
export type TwitterLink = typeof twitterLinks.$inferSelect
export type XBotReply = typeof xBotReplies.$inferSelect
export type XBotState = typeof xBotState.$inferSelect
export type PrivacyPolicy = typeof privacyPolicies.$inferSelect
