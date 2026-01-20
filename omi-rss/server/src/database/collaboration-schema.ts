import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, index, uniqueIndex, primaryKey } from 'drizzle-orm/pg-core';
import { users, folders, articles } from './schema';

// Collaboration sessions
export const collaborationSessions = pgTable('collaboration_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  hostUserId: uuid('host_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // reading, annotation, discussion
  articleId: uuid('article_id').references(() => articles.id, { onDelete: 'cascade' }),
  participants: jsonb('participants').default([]).notNull(), // Array of user IDs
  isActive: boolean('is_active').default(true).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    folderIdx: index('collab_sessions_folder_idx').on(table.folderId),
    hostIdx: index('collab_sessions_host_idx').on(table.hostUserId),
    activeIdx: index('collab_sessions_active_idx').on(table.isActive),
    articleIdx: index('collab_sessions_article_idx').on(table.articleId),
  };
});

// Collaboration annotations
export const collaborationAnnotations = pgTable('collaboration_annotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => collaborationSessions.id, { onDelete: 'cascade' }),
  articleId: uuid('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(), // highlight, comment, reaction
  content: text('content'),
  data: jsonb('data').default({}), // { color, emoji, range: { start, end, paragraphIndex } }
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    sessionIdx: index('collab_annotations_session_idx').on(table.sessionId),
    articleIdx: index('collab_annotations_article_idx').on(table.articleId),
    userIdx: index('collab_annotations_user_idx').on(table.userId),
  };
});

// Collaboration presence
export const collaborationPresence = pgTable('collaboration_presence', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull(), // online, idle, offline
  currentArticleId: uuid('current_article_id').references(() => articles.id, { onDelete: 'set null' }),
  lastActivity: timestamp('last_activity').defaultNow().notNull(),
  metadata: jsonb('metadata').default({}), // cursor position, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => {
  return {
    pk: primaryKey({ columns: [table.userId, table.folderId] }),
    folderIdx: index('collab_presence_folder_idx').on(table.folderId),
    statusIdx: index('collab_presence_status_idx').on(table.status),
  };
});

