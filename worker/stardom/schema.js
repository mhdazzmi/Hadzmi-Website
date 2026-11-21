/* STARDOM — SQLite schema (Durable Object storage). Run idempotently on every boot.
   All ids are UUID strings; timestamps are epoch milliseconds. */
export const SCHEMA_VERSION = 1;

export const SCHEMA = [
// ---------- Core ----------
`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, auth_uid TEXT UNIQUE, account_id TEXT NOT NULL, created_at INTEGER NOT NULL, last_login INTEGER)`,
`CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('owner','virtual')),
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  avatar TEXT, bio TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
  country TEXT, city TEXT, language TEXT NOT NULL DEFAULT 'en',
  occupation TEXT, industry TEXT, category TEXT, tier TEXT NOT NULL DEFAULT 'fan',
  verified INTEGER NOT NULL DEFAULT 0,
  sim_followers INTEGER NOT NULL DEFAULT 0, sim_following INTEGER NOT NULL DEFAULT 0,
  follower_count INTEGER NOT NULL DEFAULT 0, following_count INTEGER NOT NULL DEFAULT 0, post_count INTEGER NOT NULL DEFAULT 0,
  activity_level REAL NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blocked')),
  ai_status TEXT NOT NULL DEFAULT 'template',
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, last_active INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_accounts_kind ON accounts(kind, status)`,
`CREATE INDEX IF NOT EXISTS idx_accounts_country ON accounts(country)`,
`CREATE INDEX IF NOT EXISTS idx_accounts_industry ON accounts(industry)`,
`CREATE INDEX IF NOT EXISTS idx_accounts_created ON accounts(created_at)`,
`CREATE TABLE IF NOT EXISTS account_personalities (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  traits TEXT NOT NULL DEFAULT '[]', interests TEXT NOT NULL DEFAULT '[]', topics TEXT NOT NULL DEFAULT '[]',
  tone TEXT NOT NULL DEFAULT 'friendly', style TEXT NOT NULL DEFAULT '',
  humor REAL NOT NULL DEFAULT 0.5, friendliness REAL NOT NULL DEFAULT 0.6, confidence REAL NOT NULL DEFAULT 0.5,
  emoji_rate REAL NOT NULL DEFAULT 0.5, initiation REAL NOT NULL DEFAULT 0.2, emotion TEXT NOT NULL DEFAULT 'balanced',
  boundaries TEXT NOT NULL DEFAULT '', preferred_actions TEXT NOT NULL DEFAULT '["like","comment"]',
  updated_at INTEGER)`,
`CREATE TABLE IF NOT EXISTS personality_configs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, config TEXT NOT NULL, builtin INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('post','reel')),
  caption TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', audio TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '[]', ai_desc TEXT,
  like_count INTEGER NOT NULL DEFAULT 0, comment_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0, save_count INTEGER NOT NULL DEFAULT 0, share_count INTEGER NOT NULL DEFAULT 0,
  viral INTEGER NOT NULL DEFAULT 0, comments_off INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_id, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_posts_type ON posts(type, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, idx INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','video')), url TEXT NOT NULL, thumb TEXT,
  width INTEGER, height INTEGER, duration REAL, storage_key TEXT)`,
`CREATE INDEX IF NOT EXISTS idx_post_media_post ON post_media(post_id, idx)`,
`CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('photo','video','text')), text TEXT NOT NULL DEFAULT '', bg TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '', view_count INTEGER NOT NULL DEFAULT 0, reply_count INTEGER NOT NULL DEFAULT 0,
  highlight TEXT, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_stories_author ON stories(author_id, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)`,
`CREATE TABLE IF NOT EXISTS story_media (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, url TEXT NOT NULL, thumb TEXT, duration REAL, storage_key TEXT)`,
`CREATE INDEX IF NOT EXISTS idx_story_media_story ON story_media(story_id)`,
// ---------- Social ----------
`CREATE TABLE IF NOT EXISTS follows (
  follower_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, followee_id), CHECK (follower_id <> followee_id))`,
`CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY (post_id, account_id))`,
`CREATE INDEX IF NOT EXISTS idx_likes_account ON likes(account_id, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  text TEXT NOT NULL, like_count INTEGER NOT NULL DEFAULT 0, ai INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)`,
`CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_id, created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id)`,
`CREATE TABLE IF NOT EXISTS comment_likes (
  comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, PRIMARY KEY (comment_id, account_id))`,
`CREATE TABLE IF NOT EXISTS story_views (
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  liked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY (story_id, viewer_id))`,
`CREATE TABLE IF NOT EXISTS story_replies (
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, message_id TEXT, created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS bookmarks (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL, PRIMARY KEY (post_id))`,
`CREATE TABLE IF NOT EXISTS hashtags (tag TEXT PRIMARY KEY, post_count INTEGER NOT NULL DEFAULT 0, last_used INTEGER)`,
`CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE, tag TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag))`,
`CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags(tag, created_at DESC)`,
`CREATE TABLE IF NOT EXISTS relationships (
  a_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  b_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend','colleague','acquaintance','professional','rival','fan','close_friend')),
  strength REAL NOT NULL DEFAULT 0.3, created_at INTEGER NOT NULL, updated_at INTEGER,
  PRIMARY KEY (a_id, b_id), CHECK (a_id <> b_id))`,
`CREATE INDEX IF NOT EXISTS idx_relationships_b ON relationships(b_id)`,
// ---------- Communication ----------
`CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, peer_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  last_message_at INTEGER, last_preview TEXT NOT NULL DEFAULT '', unread INTEGER NOT NULL DEFAULT 0,
  typing_from INTEGER, typing_until INTEGER, peer_read_at INTEGER, owner_read_at INTEGER,
  bot_streak INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_conversations_last ON conversations(last_message_at DESC)`,
`CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, joined_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, account_id))`,
`CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','story_reply','post_share')),
  text TEXT NOT NULL DEFAULT '', media_url TEXT, ref_post TEXT, ref_story TEXT, story_thumb TEXT,
  ai INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
`CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (message_id, account_id))`,
// ---------- AI ----------
`CREATE TABLE IF NOT EXISTS character_memories (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'fact', content TEXT NOT NULL, keywords TEXT NOT NULL DEFAULT '',
  importance REAL NOT NULL DEFAULT 0.5, source TEXT NOT NULL DEFAULT 'dm', created_at INTEGER NOT NULL, last_used INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_memories_account ON character_memories(account_id, importance DESC)`,
`CREATE TABLE IF NOT EXISTS memory_summaries (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  summary TEXT NOT NULL, through_at INTEGER NOT NULL, message_count INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS ai_interaction_logs (
  id TEXT PRIMARY KEY, task TEXT NOT NULL, account_id TEXT, model TEXT, ok INTEGER NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0, ms INTEGER NOT NULL DEFAULT 0,
  cached INTEGER NOT NULL DEFAULT 0, error TEXT, created_at INTEGER NOT NULL, day TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_ai_logs_day ON ai_interaction_logs(day)`,
`CREATE TABLE IF NOT EXISTS ai_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, created_at INTEGER NOT NULL)`,
// ---------- Simulation ----------
`CREATE TABLE IF NOT EXISTS simulation_events (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, actor_id TEXT, target_id TEXT, post_id TEXT, payload TEXT NOT NULL DEFAULT '{}',
  due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0, dedupe TEXT UNIQUE, error TEXT, created_at INTEGER NOT NULL, done_at INTEGER)`,
`CREATE INDEX IF NOT EXISTS idx_sim_events_due ON simulation_events(status, due_at)`,
`CREATE INDEX IF NOT EXISTS idx_sim_events_done ON simulation_events(done_at)`,
`CREATE TABLE IF NOT EXISTS simulation_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS activity_history (
  id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, verb TEXT NOT NULL, target_id TEXT, post_id TEXT,
  owner_related INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, day TEXT NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_activity_day ON activity_history(day, verb)`,
`CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_history(actor_id, day)`,
`CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_history(created_at DESC)`,
`CREATE TABLE IF NOT EXISTS engagement_statistics (
  day TEXT PRIMARY KEY, likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0,
  follows INTEGER NOT NULL DEFAULT 0, unfollows INTEGER NOT NULL DEFAULT 0, story_views INTEGER NOT NULL DEFAULT 0,
  dms INTEGER NOT NULL DEFAULT 0, saves INTEGER NOT NULL DEFAULT 0, reel_views INTEGER NOT NULL DEFAULT 0,
  actions INTEGER NOT NULL DEFAULT 0, ai_calls INTEGER NOT NULL DEFAULT 0, owner_followers INTEGER)`,
`CREATE TABLE IF NOT EXISTS hourly_engagement (hour INTEGER PRIMARY KEY, likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0)`,
`CREATE TABLE IF NOT EXISTS background_job_logs (
  id TEXT PRIMARY KEY, job TEXT NOT NULL, started_at INTEGER NOT NULL, ms INTEGER NOT NULL DEFAULT 0,
  processed INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, note TEXT)`,
`CREATE INDEX IF NOT EXISTS idx_job_logs_started ON background_job_logs(started_at DESC)`,
`CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, type TEXT NOT NULL, actor_id TEXT, post_id TEXT, comment_id TEXT, story_id TEXT,
  text TEXT NOT NULL DEFAULT '', count INTEGER NOT NULL DEFAULT 1, group_key TEXT,
  is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_notifications_group ON notifications(group_key, is_read)`,
// ---------- Administration ----------
`CREATE TABLE IF NOT EXISTS owner_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
`CREATE TABLE IF NOT EXISTS system_logs (id TEXT PRIMARY KEY, level TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)`,
`CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC)`,
`CREATE TABLE IF NOT EXISTS moderation_logs (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, account_id TEXT, detail TEXT, created_at INTEGER NOT NULL)`,
];
