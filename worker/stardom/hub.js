/* =========================================================
   STARDOM — Durable Object "StardomHub"
   One SQLite database holds the whole private universe. All routes are owner-only:
   the main Worker verifies the Firebase owner token before forwarding here.
   Modules: profile, posts/media, social graph, interactions, stories, messaging,
   notifications, analytics, administration. Simulation lives in sim.js, AI in ai.js.
   ========================================================= */
import { DurableObject } from 'cloudflare:workers';
import { SCHEMA } from './schema.js';
import { uuid, now, rnd, pick, chance, clamp, parseJSON, HttpError, fail, json, cleanText, extractTags, keywords, jakartaDay, jakartaHour, TZ_OFFSET, MENTION_RE } from './util.js';
import { buildPersona, initialPlan, CATEGORIES, INDUSTRY_KEYS, ARCHETYPES, ARCHETYPE_KEYS, COUNTRIES, REGIONS, categoryFor, avatarUrl } from './population.js';
import { gemini, TASKS, personaBlock, SAFETY_RULES } from './ai.js';
import * as SIM from './sim.js';

export const DEFAULT_SETTINGS = {
  sim_running: true,
  intensity: 1.0,               // global activity multiplier (0.2–3)
  daily_action_limit: 2500,     // max simulated actions per day (all accounts)
  per_account_daily_limit: 40,  // max actions per virtual account per day
  like_rate: 1.0,               // average like activity multiplier
  comment_rate: 1.0,            // comment frequency multiplier
  follower_growth: 1.0,         // new followers per day multiplier (base ≈ 18/day)
  viral_probability: 0.06,      // chance an owner post becomes a viral moment
  bot_interaction: 1.0,         // bot-to-bot activity multiplier
  dm_per_day: 3,                // max autonomous DMs started by characters per day
  story_reply_rate: 1.0,
  peak_hours: [12, 19, 20, 21],
  timezone_offset_min: 420,     // Asia/Jakarta
  auto_grow: true,              // generate new fans automatically when the audience is saturated
  max_population: 5000,
  ai_enabled: true,
  ai_comment_share: 0.55,       // share of comments on owner posts written by AI (rest are templates)
  ai_bot_share: 0.08,           // share of bot-to-bot comments written by AI
  ai_creativity: 0.95,          // temperature
  ai_daily_limit: 400,          // max AI requests per day
  ai_monthly_limit: 8000,
  ai_vision: true,              // let AI look at owner photos to write relevant comments
  reply_while_paused: true,     // characters still answer DMs while the simulation is paused
  boundaries: 'Keep conversations friendly and platonic. Do not ask for personal data.',
  notif: { like: true, comment: true, reply: true, follow: true, mention: true, story: true, dm: true, recommendation: true, bot: true, milestone: true },
};

const MEDIA_RE = /^\/api\/stardom\/media\/[a-z0-9-]{20,80}$/;
const EXT_IMG_RE = /^https:\/\/(picsum\.photos|fastly\.picsum\.photos|api\.dicebear\.com)\//;

export class StardomHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.lastAct = new Map();
    ctx.blockConcurrencyWhile(async () => { this.migrate(); this.loadSettings(); });
  }

  // ---------------- DB helpers ----------------
  q(sql, ...a) { return this.sql.exec(sql, ...a.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)).toArray(); }
  one(sql, ...a) { return this.q(sql, ...a)[0] || null; }
  val(sql, ...a) { const r = this.one(sql, ...a); return r ? Object.values(r)[0] : null; }
  run(sql, ...a) { this.sql.exec(sql, ...a.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)); }
  tx(fn) { return this.ctx.storage.transactionSync(fn); }
  inList(ids) { return ids.map(() => '?').join(',') || 'NULL'; }

  migrate() {
    for (const s of SCHEMA) this.sql.exec(s);
  }
  loadSettings() {
    const cfg = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    for (const r of this.q('SELECT key, value FROM simulation_settings')) cfg[r.key] = parseJSON(r.value, cfg[r.key]);
    this.cfg = cfg;
  }
  setSetting(key, value) {
    this.run('INSERT INTO simulation_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', key, JSON.stringify(value), now());
    this.cfg[key] = value;
  }
  ownerSetting(key, fb) { const r = this.one('SELECT value FROM owner_settings WHERE key=?', key); return r ? parseJSON(r.value, fb) : fb; }
  setOwnerSetting(key, v) { this.run('INSERT INTO owner_settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at', key, JSON.stringify(v), now()); }
  log(level, message) { this.run('INSERT INTO system_logs(id,level,message,created_at) VALUES(?,?,?,?)', uuid(), level, String(message).slice(0, 500), now()); }
  get tzOff() { return (Number(this.cfg.timezone_offset_min) || 420) * 60000; }
  day(t = now()) { return jakartaDay(t, this.tzOff); }
  hour(t = now()) { return jakartaHour(t, this.tzOff); }
  get ownerId() { if (!this._ownerId) { const r = this.one("SELECT id FROM accounts WHERE kind='owner' LIMIT 1"); this._ownerId = r && r.id; } return this._ownerId; }
  owner() { return this.one('SELECT * FROM accounts WHERE id=?', this.ownerId); }
  account(id) { return this.one('SELECT * FROM accounts WHERE id=?', id); }
  personality(id) {
    const p = this.one('SELECT * FROM account_personalities WHERE account_id=?', id);
    if (!p) return null;
    for (const k of ['traits', 'interests', 'topics', 'preferred_actions']) p[k] = parseJSON(p[k], []);
    return p;
  }

  // ---------------- Init ----------------
  ensureInit(uid) {
    if (this.ownerId) {
      if (uid) this.run('UPDATE users SET last_login=? WHERE auth_uid=?', now(), uid);
      return;
    }
    const t = now();
    this.tx(() => {
      const id = uuid();
      this.run(`INSERT INTO accounts(id,kind,username,display_name,avatar,bio,country,city,language,occupation,industry,category,tier,verified,created_at,last_active)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, 'owner', 'you', 'Your Name', avatarUrl('stardom-owner', 'notionists'),
        'Welcome to my universe ✨', 'Indonesia', 'Jakarta', 'en', 'Public Figure', 'Creators', 'owner', 'owner', 1, t, t);
      this.run('INSERT INTO users(id,auth_uid,account_id,created_at,last_login) VALUES(?,?,?,?,?)', uuid(), uid || null, id, t, t);
      this._ownerId = id;
      for (const [name, a] of Object.entries(ARCHETYPES)) this.run('INSERT OR IGNORE INTO personality_configs(id,name,config,builtin,created_at) VALUES(?,?,?,1,?)', uuid(), name, JSON.stringify(a), t);
      this.run('INSERT OR IGNORE INTO collections(id,name,created_at) VALUES(?,?,?)', uuid(), 'Favourites', t);
      const created = this.generateAccounts(initialPlan(400), { followOwner: 0.42, initial: true });
      SIM.seedWorld(this, created);
      this.log('info', `Universe created with ${created.length} virtual accounts`);
    });
    this.ensureAlarm(5000);
  }

  /** Create personas (+ personality, relationships, follows). Returns created account rows. */
  generateAccounts(plan, { followOwner = 0.3, initial = false } = {}) {
    const taken = new Set(this.q('SELECT username FROM accounts').map(r => r.username.toLowerCase()));
    const t = now();
    const created = [];
    for (const opts of plan) {
      const p = buildPersona(opts, taken);
      const createdAt = initial ? t - Math.floor(rnd() * 400 * 86400000) : t;
      this.run(`INSERT INTO accounts(id,kind,username,display_name,avatar,bio,country,city,language,occupation,industry,category,tier,verified,sim_followers,sim_following,activity_level,ai_status,created_at,last_active)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.id, 'virtual', p.username, p.display_name, p.avatar, p.bio, p.country, p.city, p.language, p.occupation, p.industry, p.category, p.tier, p.verified, p.sim_followers, p.sim_following, p.activity_level, 'template', createdAt, t - Math.floor(rnd() * 3 * 86400000));
      const P = p.personality;
      this.run(`INSERT INTO account_personalities(account_id,archetype,description,traits,interests,topics,tone,style,humor,friendliness,confidence,emoji_rate,initiation,emotion,boundaries,preferred_actions,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, p.id, P.archetype, P.description, JSON.stringify(P.traits), JSON.stringify(P.interests), JSON.stringify(P.topics), P.tone, P.style, P.humor, P.friendliness, P.confidence, P.emoji_rate, P.initiation, P.emotion, P.boundaries, JSON.stringify(P.preferred_actions), t);
      created.push(p);
    }
    SIM.wireAccounts(this, created, followOwner);
    return created;
  }

  // ---------------- Counters / primitives (shared by API & simulation) ----------------
  follow(a, b, t = now()) {
    if (a === b) return false;
    const before = this.sql.exec('INSERT OR IGNORE INTO follows(follower_id,followee_id,created_at) VALUES(?,?,?)', a, b, t).rowsWritten;
    if (!before) return false;
    this.run('UPDATE accounts SET following_count=following_count+1 WHERE id=?', a);
    this.run('UPDATE accounts SET follower_count=follower_count+1 WHERE id=?', b);
    return true;
  }
  unfollow(a, b) {
    const n = this.sql.exec('DELETE FROM follows WHERE follower_id=? AND followee_id=?', a, b).rowsWritten;
    if (!n) return false;
    this.run('UPDATE accounts SET following_count=MAX(0,following_count-1) WHERE id=?', a);
    this.run('UPDATE accounts SET follower_count=MAX(0,follower_count-1) WHERE id=?', b);
    return true;
  }
  like(postId, accId, t = now()) {
    const n = this.sql.exec('INSERT OR IGNORE INTO likes(post_id,account_id,created_at) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=?)', postId, accId, t, postId).rowsWritten;
    if (!n) return false;
    this.run('UPDATE posts SET like_count=like_count+1 WHERE id=?', postId);
    return true;
  }
  unlike(postId, accId) {
    const n = this.sql.exec('DELETE FROM likes WHERE post_id=? AND account_id=?', postId, accId).rowsWritten;
    if (n) this.run('UPDATE posts SET like_count=MAX(0,like_count-1) WHERE id=?', postId);
    return !!n;
  }
  addComment(postId, authorId, text, parentId = null, ai = 0, t = now()) {
    const post = this.one('SELECT id FROM posts WHERE id=?', postId);
    if (!post) return null;
    const id = uuid();
    this.run('INSERT INTO comments(id,post_id,author_id,parent_id,text,ai,created_at) VALUES(?,?,?,?,?,?,?)', id, postId, authorId, parentId, text, ai ? 1 : 0, t);
    this.run('UPDATE posts SET comment_count=comment_count+1 WHERE id=?', postId);
    return id;
  }
  bumpStat(field, n = 1, t = now()) {
    const d = this.day(t);
    this.run(`INSERT INTO engagement_statistics(day,${field}) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET ${field}=${field}+excluded.${field}`, d, n);
  }
  bumpHour(field, t = now()) {
    this.run(`INSERT INTO hourly_engagement(hour,${field}) VALUES(?,1) ON CONFLICT(hour) DO UPDATE SET ${field}=${field}+1`, this.hour(t));
  }
  activity(actor, verb, target, postId, ownerRelated, t = now()) {
    this.run('INSERT INTO activity_history(id,actor_id,verb,target_id,post_id,owner_related,created_at,day) VALUES(?,?,?,?,?,?,?,?)', uuid(), actor, verb, target || null, postId || null, ownerRelated ? 1 : 0, t, this.day(t));
    this.run('UPDATE accounts SET last_active=? WHERE id=?', t, actor);
    this.lastAct.set(actor, t);
  }
  /** Create (or group) a notification for the owner, honouring notification settings. */
  notify(type, { actor, post, comment, story, text = '', group } = {}) {
    const n = this.cfg.notif || {};
    const settingKey = { like: 'like', comment_like: 'like', comment: 'comment', reply: 'reply', follow: 'follow', mention: 'mention', story_view: 'story', story_reply: 'story', story_like: 'story', dm: 'dm', recommendation: 'recommendation', bot: 'bot', milestone: 'milestone', follow_back: 'follow' }[type] || type;
    if (n[settingKey] === false) return;
    const t = now();
    if (group) {
      const g = this.one('SELECT id FROM notifications WHERE group_key=? AND is_read=0 AND created_at>? ORDER BY created_at DESC LIMIT 1', group, t - 86400000);
      if (g) { this.run('UPDATE notifications SET count=count+1, actor_id=?, created_at=?, text=? WHERE id=?', actor || null, t, text, g.id); return; }
    }
    this.run('INSERT INTO notifications(id,type,actor_id,post_id,comment_id,story_id,text,group_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)', uuid(), type, actor || null, post || null, comment || null, story || null, text, group || null, t);
  }
  relation(a, b) {
    return this.one('SELECT type, strength FROM relationships WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?) ORDER BY strength DESC LIMIT 1', a, b, b, a);
  }
  strengthen(a, b, delta, type) {
    const r = this.one('SELECT a_id,b_id,strength,type FROM relationships WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?) LIMIT 1', a, b, b, a);
    const t = now();
    if (r) {
      let s = clamp(r.strength + delta, 0, 1), ty = r.type;
      if (b === this.ownerId || a === this.ownerId) ty = s > 0.75 ? 'close_friend' : s > 0.5 ? 'friend' : ty === 'fan' && s > 0.35 ? 'acquaintance' : ty;
      this.run('UPDATE relationships SET strength=?, type=?, updated_at=? WHERE a_id=? AND b_id=?', s, ty, t, r.a_id, r.b_id);
    } else {
      this.run('INSERT OR IGNORE INTO relationships(a_id,b_id,type,strength,created_at,updated_at) VALUES(?,?,?,?,?,?)', a, b, type || 'acquaintance', clamp(0.15 + delta, 0, 1), t, t);
    }
  }
  setHashtags(postId, text, t = now()) {
    const old = this.q('SELECT tag FROM post_hashtags WHERE post_id=?', postId).map(r => r.tag);
    for (const tag of old) this.run('UPDATE hashtags SET post_count=MAX(0,post_count-1) WHERE tag=?', tag);
    this.run('DELETE FROM post_hashtags WHERE post_id=?', postId);
    const tags = extractTags(text);
    for (const tag of tags) {
      this.run('INSERT INTO post_hashtags(post_id,tag,created_at) VALUES(?,?,?)', postId, tag, t);
      this.run('INSERT INTO hashtags(tag,post_count,last_used) VALUES(?,1,?) ON CONFLICT(tag) DO UPDATE SET post_count=post_count+1, last_used=excluded.last_used', tag, t);
    }
    return tags;
  }
  todayActions() { return this.val('SELECT actions FROM engagement_statistics WHERE day=?', this.day()) || 0; }

  // ---------------- AI gateway (cost control + logging) ----------------
  aiUsage() {
    const d = this.day();
    return {
      today: this.val('SELECT COUNT(*) FROM ai_interaction_logs WHERE day=? AND cached=0', d) || 0,
      month: this.val('SELECT COUNT(*) FROM ai_interaction_logs WHERE day>=? AND cached=0', d.slice(0, 8) + '01') || 0,
    };
  }
  aiAvailable() {
    if (!this.cfg.ai_enabled || !this.env.GEMINI_API_KEY) return false;
    const u = this.aiUsage();
    return u.today < this.cfg.ai_daily_limit && u.month < this.cfg.ai_monthly_limit;
  }
  async aiCall(task, ctx, { accountId, image, cacheKey } = {}) {
    if (!this.aiAvailable()) return null;
    const T = TASKS[task];
    const t0 = now();
    if (cacheKey) {
      const c = this.one('SELECT value FROM ai_cache WHERE key=? AND created_at>?', cacheKey, t0 - 30 * 86400000);
      if (c) { this.run('INSERT INTO ai_interaction_logs(id,task,account_id,model,ok,cached,created_at,day) VALUES(?,?,?,?,1,1,?,?)', uuid(), task, accountId || null, 'cache', t0, this.day(t0)); return parseJSON(c.value, null); }
    }
    try {
      const out = await gemini({ key: this.env.GEMINI_API_KEY, tier: T.tier, modelOverride: this.env.GEMINI_MODEL && T.tier === 'standard' ? this.env.GEMINI_MODEL : null,
        system: SAFETY_RULES + (this.cfg.boundaries ? '\nOwner boundaries: ' + this.cfg.boundaries : ''), prompt: T.prompt(ctx), schema: T.schema,
        temperature: clamp(Number(this.cfg.ai_creativity) || 0.9, 0, 1.6), image, maxTokens: T.maxTokens });
      this.run('INSERT INTO ai_interaction_logs(id,task,account_id,model,ok,tokens_in,tokens_out,ms,created_at,day) VALUES(?,?,?,?,1,?,?,?,?,?)', uuid(), task, accountId || null, out.model, out.usage.in, out.usage.out, now() - t0, t0, this.day(t0));
      this.bumpStat('ai_calls');
      if (cacheKey) this.run('INSERT OR REPLACE INTO ai_cache(key,value,created_at) VALUES(?,?,?)', cacheKey, JSON.stringify(out.data), t0);
      return out.data;
    } catch (e) {
      this.run('INSERT INTO ai_interaction_logs(id,task,account_id,model,ok,ms,error,created_at,day) VALUES(?,?,?,?,0,?,?,?,?)', uuid(), task, accountId || null, null, now() - t0, String(e.message || e).slice(0, 300), t0, this.day(t0));
      return null;
    }
  }
  memoriesFor(accId, queryText, n = 6) {
    const kw = new Set(keywords(queryText));
    const rows = this.q('SELECT id, content, keywords, importance, created_at FROM character_memories WHERE account_id=? ORDER BY importance DESC, created_at DESC LIMIT 80', accId);
    const t = now();
    const scored = rows.map(r => {
      const overlap = r.keywords.split(' ').filter(k => kw.has(k)).length;
      return { r, s: overlap * 1.5 + r.importance + Math.max(0, 1 - (t - r.created_at) / (60 * 86400000)) * 0.5 };
    }).sort((a, b) => b.s - a.s).slice(0, n);
    if (scored.length) this.run(`UPDATE character_memories SET last_used=? WHERE id IN (${this.inList(scored)})`, t, ...scored.map(x => x.r.id));
    return scored.map(x => x.r.content);
  }
  addMemory(accId, kind, content, importance, source = 'dm') {
    content = cleanText(content, 240);
    if (!content) return;
    const exists = this.one('SELECT id FROM character_memories WHERE account_id=? AND lower(content)=lower(?)', accId, content);
    if (exists) return;
    this.run('INSERT INTO character_memories(id,account_id,kind,content,keywords,importance,source,created_at) VALUES(?,?,?,?,?,?,?,?)', uuid(), accId, kind || 'fact', content, keywords(content, 20).join(' '), clamp(Number(importance) || 0.5, 0, 1), source, now());
    const n = this.val('SELECT COUNT(*) FROM character_memories WHERE account_id=?', accId);
    if (n > 60) this.run('DELETE FROM character_memories WHERE id IN (SELECT id FROM character_memories WHERE account_id=? ORDER BY importance ASC, created_at ASC LIMIT ?)', accId, n - 60);
  }

  // ---------------- Alarm (background simulation) ----------------
  ensureAlarm(inMs = 60000) {
    return this.ctx.storage.getAlarm().then(cur => {
      const at = now() + inMs;
      if (!cur || cur > at) return this.ctx.storage.setAlarm(at);
    });
  }
  async alarm() {
    let next = 60000;
    try { next = await SIM.tick(this); }
    catch (e) { console.error('stardom tick', e && e.stack || e); this.log('error', 'tick failed: ' + (e && e.message)); }
    if (next != null) await this.ctx.storage.setAlarm(now() + Math.max(1000, next));
  }

  // ---------------- HTTP ----------------
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\/stardom/, '').replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();
    try {
      const uid = request.headers.get('X-Stardom-Uid') || '';
      if (path === '/tick') { await this.ensureAlarm(this.cfg.sim_running ? 60000 : 3600000); return json({ ok: true }); }
      this.ensureInit(uid);
      for (const [m, re, fn] of this.routes()) {
        if (m !== method) continue;
        const match = re.exec(path);
        if (!match) continue;
        const body = method === 'GET' || method === 'DELETE' ? {} : await request.json().catch(() => ({}));
        const out = await fn.call(this, { params: match.slice(1), body, query: url.searchParams, url });
        return json(out === undefined ? { ok: true } : out);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      if (!(e instanceof HttpError)) console.error('stardom', e && e.stack || e);
      return json({ error: e.message || 'Internal error' }, e.status || 500);
    }
  }

  routes() {
    if (this._routes) return this._routes;
    const R = (m, p, fn) => [m, new RegExp('^' + p.replace(/:id/g, '([A-Za-z0-9._-]+)') + '$'), fn];
    this._routes = [
      R('GET', '/bootstrap', this.apiBootstrap), R('GET', '/sync', this.apiSync),
      R('PATCH', '/me', this.apiEditMe),
      R('GET', '/feed', this.apiFeed),
      R('POST', '/posts', this.apiCreatePost), R('GET', '/posts/:id', this.apiGetPost), R('PATCH', '/posts/:id', this.apiEditPost), R('DELETE', '/posts/:id', this.apiDeletePost),
      R('POST', '/posts/:id/like', this.apiLikePost), R('POST', '/posts/:id/save', this.apiSavePost), R('GET', '/posts/:id/likers', this.apiLikers),
      R('GET', '/posts/:id/comments', this.apiComments), R('POST', '/posts/:id/comments', this.apiAddComment), R('POST', '/posts/:id/share', this.apiSharePost),
      R('DELETE', '/comments/:id', this.apiDeleteComment), R('POST', '/comments/:id/like', this.apiLikeComment),
      R('GET', '/drafts', this.apiDrafts), R('POST', '/drafts', this.apiSaveDraft), R('DELETE', '/drafts/:id', this.apiDeleteDraft),
      R('GET', '/u/:id', this.apiProfile), R('GET', '/u/:id/posts', this.apiProfilePosts), R('GET', '/u/:id/followers', this.apiFollowers), R('GET', '/u/:id/following', this.apiFollowing),
      R('POST', '/u/:id/follow', this.apiFollow), R('GET', '/u/:id/highlights', this.apiHighlights), R('GET', '/u/:id/mutuals', this.apiMutuals),
      R('GET', '/stories', this.apiStoryTray), R('GET', '/stories/u/:id', this.apiUserStories), R('POST', '/stories', this.apiCreateStory),
      R('POST', '/stories/:id/view', this.apiViewStory), R('GET', '/stories/:id/viewers', this.apiStoryViewers), R('POST', '/stories/:id/reply', this.apiReplyStory),
      R('POST', '/stories/:id/highlight', this.apiHighlightStory), R('DELETE', '/stories/:id', this.apiDeleteStory), R('GET', '/stories/archive', this.apiStoryArchive),
      R('GET', '/explore', this.apiExplore), R('GET', '/search', this.apiSearch), R('GET', '/tags/:id', this.apiTag), R('GET', '/directory', this.apiDirectory),
      R('GET', '/reels', this.apiReels), R('POST', '/reels/:id/view', this.apiReelView),
      R('GET', '/notifications', this.apiNotifications), R('POST', '/notifications/read', this.apiNotifRead), R('POST', '/notifications/clear', this.apiNotifClear),
      R('GET', '/conversations', this.apiConversations), R('POST', '/conversations', this.apiOpenConversation), R('GET', '/conversations/:id', this.apiMessages),
      R('POST', '/conversations/:id/messages', this.apiSendMessage), R('POST', '/messages/:id/react', this.apiReact),
      R('GET', '/saved', this.apiSaved), R('GET', '/collections', this.apiCollections), R('POST', '/collections', this.apiCreateCollection), R('DELETE', '/collections/:id', this.apiDeleteCollection),
      R('GET', '/insights', this.apiInsights),
      R('GET', '/admin/overview', this.apiAdminOverview), R('GET', '/admin/settings', this.apiAdminSettings), R('PATCH', '/admin/settings', this.apiAdminSaveSettings),
      R('POST', '/admin/sim', this.apiAdminSim), R('POST', '/admin/generate', this.apiAdminGenerate), R('POST', '/admin/import', this.apiAdminImport),
      R('GET', '/admin/accounts', this.apiAdminAccounts), R('GET', '/admin/accounts/:id', this.apiAdminAccount), R('PATCH', '/admin/accounts/:id', this.apiAdminEditAccount),
      R('DELETE', '/admin/accounts/:id', this.apiAdminDeleteAccount), R('DELETE', '/admin/accounts/:id/memory', this.apiAdminResetMemory), R('POST', '/admin/accounts/:id/memory', this.apiAdminAddMemory),
      R('DELETE', '/admin/memory/:id', this.apiAdminDeleteMemory), R('GET', '/admin/events', this.apiAdminEvents), R('GET', '/admin/logs', this.apiAdminLogs),
      R('GET', '/admin/export', this.apiAdminExport),
    ];
    return this._routes;
  }

  // ---------------- Serializers ----------------
  pubAccount(a, ctx = {}) {
    if (!a) return null;
    const virtual = a.kind === 'virtual';
    const out = {
      id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar, bio: a.bio, website: a.website, verified: !!a.verified,
      virtual, country: a.country, city: a.city, occupation: a.occupation, industry: a.industry, category: a.category, language: a.language, tier: a.tier,
      followers: virtual ? a.sim_followers + a.follower_count : a.follower_count,
      following: virtual ? Math.max(a.sim_following, a.following_count) : a.following_count,
      posts: a.post_count, last_active: a.last_active, status: a.status, created_at: a.created_at, is_private: !!a.is_private,
    };
    if (ctx.relations !== false && virtual && this.ownerId) {
      out.is_following = !!this.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', this.ownerId, a.id);
      out.follows_you = !!this.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', a.id, this.ownerId);
    }
    return out;
  }
  mini(a) { return a ? { id: a.id, username: a.username, display_name: a.display_name, avatar: a.avatar, verified: !!a.verified, virtual: a.kind === 'virtual', last_active: a.last_active } : null; }
  accountsById(ids) {
    const u = [...new Set(ids.filter(Boolean))];
    const map = {};
    for (let i = 0; i < u.length; i += 90) {
      const chunk = u.slice(i, i + 90);
      for (const a of this.q(`SELECT id,kind,username,display_name,avatar,verified,last_active FROM accounts WHERE id IN (${this.inList(chunk)})`, ...chunk)) map[a.id] = a;
    }
    return map;
  }
  postsOut(rows, { previews = true } = {}) {
    if (!rows.length) return [];
    const ids = rows.map(r => r.id), oid = this.ownerId;
    const media = {}, liked = new Set(), saved = new Set(), pv = {};
    for (const m of this.q(`SELECT * FROM post_media WHERE post_id IN (${this.inList(ids)}) ORDER BY idx`, ...ids)) (media[m.post_id] = media[m.post_id] || []).push({ kind: m.kind, url: m.url, thumb: m.thumb, width: m.width, height: m.height, duration: m.duration });
    for (const r of this.q(`SELECT post_id FROM likes WHERE account_id=? AND post_id IN (${this.inList(ids)})`, oid, ...ids)) liked.add(r.post_id);
    for (const r of this.q(`SELECT post_id FROM bookmarks WHERE post_id IN (${this.inList(ids)})`, ...ids)) saved.add(r.post_id);
    const authorIds = rows.map(r => r.author_id);
    let likerIds = [];
    if (previews) {
      for (const id of ids) {
        const c = this.q('SELECT id, author_id, text FROM comments WHERE post_id=? AND parent_id IS NULL ORDER BY like_count DESC, created_at DESC LIMIT 2', id);
        const l = this.one('SELECT account_id FROM likes WHERE post_id=? AND account_id<>? ORDER BY created_at DESC LIMIT 1', id, oid);
        pv[id] = { c, l: l && l.account_id };
        c.forEach(x => authorIds.push(x.author_id)); if (l) likerIds.push(l.account_id);
      }
    }
    const acc = this.accountsById(authorIds.concat(likerIds));
    return rows.map(r => ({
      id: r.id, type: r.type, author: this.mini(acc[r.author_id]), caption: r.caption, location: r.location, audio: r.audio,
      created_at: r.created_at, likes: r.like_count, comments: r.comment_count, views: r.view_count, saves: r.save_count, shares: r.share_count,
      viral: !!r.viral, comments_off: !!r.comments_off, liked: liked.has(r.id), saved: saved.has(r.id), media: media[r.id] || [],
      preview: previews && pv[r.id] ? { comments: pv[r.id].c.map(c => ({ id: c.id, text: c.text, author: this.mini(acc[c.author_id]) })), liked_by: this.mini(acc[pv[r.id].l]) } : null,
    }));
  }

  // ---------------- Bootstrap / sync ----------------
  apiBootstrap() {
    const o = this.owner();
    return { owner: this.pubAccount(o), settings: { sim_running: !!this.cfg.sim_running, ai_enabled: !!this.cfg.ai_enabled, ai_ready: !!this.env.GEMINI_API_KEY }, counts: this.unreadCounts(), categories: CATEGORIES, countries: COUNTRIES, industries: INDUSTRY_KEYS, archetypes: ARCHETYPE_KEYS, server_time: now() };
  }
  unreadCounts() {
    return { notifications: this.val('SELECT COUNT(*) FROM notifications WHERE is_read=0') || 0, messages: this.val('SELECT COUNT(*) FROM conversations WHERE unread>0') || 0 };
  }
  apiSync({ query }) {
    const since = Number(query.get('since') || 0);
    const fresh = since ? this.q('SELECT * FROM notifications WHERE created_at>? ORDER BY created_at DESC LIMIT 5', since) : [];
    const msgs = since ? this.q(`SELECT m.id, m.text, m.kind, m.created_at, m.conversation_id, m.sender_id FROM messages m WHERE m.created_at>? AND m.sender_id<>? ORDER BY m.created_at DESC LIMIT 3`, since, this.ownerId) : [];
    const acc = this.accountsById(fresh.map(n => n.actor_id).concat(msgs.map(m => m.sender_id)));
    return { counts: this.unreadCounts(), now: now(), sim_running: !!this.cfg.sim_running,
      notifications: fresh.map(n => this.notifOut(n, acc)), messages: msgs.map(m => ({ id: m.id, text: m.text, kind: m.kind, conversation_id: m.conversation_id, created_at: m.created_at, sender: this.mini(acc[m.sender_id]) })) };
  }

  // ---------------- Profile ----------------
  apiEditMe({ body }) {
    const o = this.owner();
    const username = body.username != null ? cleanText(body.username, 30).toLowerCase() : o.username;
    if (!/^[a-z0-9._]{2,30}$/.test(username)) fail(400, 'Username can only use letters, numbers, dots and underscores (2–30).');
    if (username !== o.username && this.one('SELECT 1 AS x FROM accounts WHERE username=? AND id<>?', username, o.id)) fail(409, 'That username is taken in this universe.');
    const avatar = body.avatar != null ? String(body.avatar) : o.avatar;
    if (avatar && !MEDIA_RE.test(avatar) && !EXT_IMG_RE.test(avatar)) fail(400, 'Invalid avatar');
    let website = body.website != null ? cleanText(body.website, 200) : o.website;
    if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
    this.run('UPDATE accounts SET username=?, display_name=?, bio=?, website=?, avatar=?, is_private=?, city=?, country=? WHERE id=?', username,
      cleanText(body.display_name != null ? body.display_name : o.display_name, 40) || username, cleanText(body.bio != null ? body.bio : o.bio, 300),
      website, avatar, body.is_private != null ? (body.is_private ? 1 : 0) : o.is_private,
      cleanText(body.city != null ? body.city : o.city, 60), cleanText(body.country != null ? body.country : o.country, 60), o.id);
    if (body.interests) this.setOwnerSetting('interests', [].concat(body.interests).map(s => cleanText(s, 30).toLowerCase()).filter(Boolean).slice(0, 12));
    return { owner: this.pubAccount(this.owner()) };
  }
  findAccount(ref) {
    return this.one('SELECT * FROM accounts WHERE id=? OR username=?', ref, ref) || fail(404, 'Account not found');
  }
  apiProfile({ params }) {
    const a = this.findAccount(params[0]);
    const out = this.pubAccount(a);
    const hasStory = this.one('SELECT id FROM stories WHERE author_id=? AND expires_at>? LIMIT 1', a.id, now());
    out.has_story = !!hasStory;
    if (hasStory) out.story_seen = !this.one('SELECT s.id FROM stories s WHERE s.author_id=? AND s.expires_at>? AND NOT EXISTS (SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.viewer_id=?) LIMIT 1', a.id, now(), this.ownerId);
    out.reels = this.val("SELECT COUNT(*) FROM posts WHERE author_id=? AND type='reel'", a.id) || 0;
    if (a.kind === 'virtual') {
      const p = this.personality(a.id);
      out.personality = p ? { archetype: p.archetype, traits: p.traits, interests: p.interests, tone: p.tone } : null;
      const rel = this.relation(a.id, this.ownerId);
      out.relationship = rel ? rel.type : 'none';
      out.mutuals = this.q(`SELECT a.* FROM follows f JOIN accounts a ON a.id=f.follower_id WHERE f.followee_id=? AND f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id=?) LIMIT 3`, a.id, this.ownerId).map(x => this.mini(x));
      out.mutual_count = this.val('SELECT COUNT(*) FROM follows f WHERE f.followee_id=? AND f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id=?)', a.id, this.ownerId) || 0;
      out.conversation_id = (this.one('SELECT id FROM conversations WHERE peer_id=?', a.id) || {}).id || null;
    } else {
      out.interests = this.ownerSetting('interests', []);
    }
    return { account: out };
  }
  apiProfilePosts({ params, query }) {
    const a = this.findAccount(params[0]);
    const tab = query.get('tab') || 'posts', before = Number(query.get('before') || 0) || 9e15;
    let rows;
    if (tab === 'reels') rows = this.q("SELECT * FROM posts WHERE author_id=? AND type='reel' AND created_at<? ORDER BY created_at DESC LIMIT 30", a.id, before);
    else if (tab === 'tagged') rows = this.q("SELECT p.* FROM posts p JOIN comments c ON c.post_id=p.id WHERE c.text LIKE ? AND p.author_id<>? AND p.created_at<? GROUP BY p.id ORDER BY p.created_at DESC LIMIT 30", '%@' + a.username + '%', a.id, before);
    else rows = this.q('SELECT * FROM posts WHERE author_id=? AND created_at<? ORDER BY created_at DESC LIMIT 30', a.id, before);
    return { posts: this.postsOut(rows, { previews: false }) };
  }
  listAccounts(sql, args, query) {
    const offset = Math.max(0, Number(query.get('offset') || 0));
    const rows = this.q(sql + ' LIMIT 50 OFFSET ?', ...args, offset);
    const ids = rows.map(r => r.id);
    const following = new Set(ids.length ? this.q(`SELECT followee_id FROM follows WHERE follower_id=? AND followee_id IN (${this.inList(ids)})`, this.ownerId, ...ids).map(r => r.followee_id) : []);
    return { accounts: rows.map(r => Object.assign(this.mini(r), { occupation: r.occupation, country: r.country, is_following: following.has(r.id), is_owner: r.kind === 'owner' })), next: rows.length === 50 ? offset + 50 : null };
  }
  apiFollowers({ params, query }) {
    const a = this.findAccount(params[0]); const s = '%' + (query.get('q') || '') + '%';
    return this.listAccounts('SELECT a.* FROM follows f JOIN accounts a ON a.id=f.follower_id WHERE f.followee_id=? AND (a.username LIKE ? OR a.display_name LIKE ?) ORDER BY f.created_at DESC', [a.id, s, s], query);
  }
  apiFollowing({ params, query }) {
    const a = this.findAccount(params[0]); const s = '%' + (query.get('q') || '') + '%';
    return this.listAccounts('SELECT a.* FROM follows f JOIN accounts a ON a.id=f.followee_id WHERE f.follower_id=? AND (a.username LIKE ? OR a.display_name LIKE ?) ORDER BY f.created_at DESC', [a.id, s, s], query);
  }
  apiMutuals({ params, query }) {
    const a = this.findAccount(params[0]);
    return this.listAccounts('SELECT a.* FROM follows f JOIN accounts a ON a.id=f.follower_id WHERE f.followee_id=? AND f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id=?)', [a.id, this.ownerId], query);
  }
  apiFollow({ params }) {
    const a = this.findAccount(params[0]);
    if (a.kind === 'owner') fail(400, 'You cannot follow yourself');
    if (a.status === 'blocked') fail(400, 'This account is blocked');
    const o = this.ownerId;
    let following;
    if (this.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', o, a.id)) { this.unfollow(o, a.id); following = false; }
    else { this.follow(o, a.id); following = true; SIM.onOwnerFollow(this, a); }
    return { following, account: this.pubAccount(this.account(a.id)) };
  }

  // ---------------- Feed ----------------
  ownerInterestVector() {
    if (this._ivec && this._ivecAt > now() - 60000) return this._ivec;
    const v = {};
    const add = (topics, w) => parseJSON(topics, []).forEach(t => { v[t] = (v[t] || 0) + w; });
    for (const r of this.q('SELECT p.topics FROM likes l JOIN posts p ON p.id=l.post_id WHERE l.account_id=? ORDER BY l.created_at DESC LIMIT 150', this.ownerId)) add(r.topics, 1);
    for (const r of this.q('SELECT topics FROM posts WHERE author_id=? ORDER BY created_at DESC LIMIT 40', this.ownerId)) add(r.topics, 1.5);
    for (const t of this.ownerSetting('interests', [])) v[t] = (v[t] || 0) + 3;
    const max = Math.max(1, ...Object.values(v));
    for (const k in v) v[k] /= max;
    this._ivec = v; this._ivecAt = now();
    return v;
  }
  apiFeed({ query }) {
    const mode = query.get('mode') || 'foryou', o = this.ownerId;
    const cursor = query.get('cursor');
    if (mode === 'following' || mode === 'latest') {
      const before = Number(cursor || 0) || 9e15;
      const rows = mode === 'following'
        ? this.q("SELECT p.* FROM posts p WHERE p.created_at<? AND (p.author_id=? OR p.author_id IN (SELECT followee_id FROM follows WHERE follower_id=?)) AND p.author_id IN (SELECT id FROM accounts WHERE status<>'blocked') ORDER BY p.created_at DESC LIMIT 12", before, o, o)
        : this.q("SELECT p.* FROM posts p JOIN accounts a ON a.id=p.author_id WHERE p.created_at<? AND a.status<>'blocked' ORDER BY p.created_at DESC LIMIT 12", before);
      return { posts: this.postsOut(rows), cursor: rows.length === 12 ? String(rows[rows.length - 1].created_at) : null };
    }
    // For You: personalised ranking of recent posts (deterministic for a stable, consistent timeline)
    const offset = Number(cursor || 0) || 0;
    const t = now();
    const followed = new Set(this.q('SELECT followee_id FROM follows WHERE follower_id=?', o).map(r => r.followee_id));
    const rel = {};
    for (const r of this.q('SELECT a_id, b_id, strength FROM relationships WHERE a_id=? OR b_id=?', o, o)) rel[r.a_id === o ? r.b_id : r.a_id] = r.strength;
    const interacted = {};
    for (const r of this.q('SELECT p.author_id, COUNT(*) AS n FROM likes l JOIN posts p ON p.id=l.post_id WHERE l.account_id=? GROUP BY p.author_id', o)) interacted[r.author_id] = r.n;
    const iv = this.ownerInterestVector();
    const cand = this.q("SELECT p.* FROM posts p JOIN accounts a ON a.id=p.author_id WHERE p.created_at>? AND a.status<>'blocked' ORDER BY p.created_at DESC LIMIT 400", t - 21 * 86400000);
    const seenOwn = this.q('SELECT post_id FROM likes WHERE account_id=?', o);
    const likedSet = new Set(seenOwn.map(r => r.post_id));
    const scored = cand.map(p => {
      const ageH = (t - p.created_at) / 3600000;
      const recency = Math.pow(ageH + 2, -0.85);
      const fol = p.author_id === o ? 2.2 : followed.has(p.author_id) ? 1.6 : 0.55;
      const topics = parseJSON(p.topics, []);
      const interest = topics.reduce((s, x) => s + (iv[x] || 0), 0);
      const social = 1 + (rel[p.author_id] || 0) * 1.5 + Math.min(1, (interacted[p.author_id] || 0) / 10);
      const engagement = 1 + Math.log10(1 + p.like_count + p.comment_count * 3) * 0.35;
      const seen = likedSet.has(p.id) ? 0.6 : 1;
      // deterministic jitter so the order is stable between refreshes
      const h = parseInt(p.id.replace(/-/g, '').slice(0, 6), 16) / 0xffffff;
      return { p, s: recency * fol * (1 + interest * 0.8) * social * engagement * seen * (0.9 + h * 0.2) };
    }).sort((a, b) => b.s - a.s);
    // avoid more than 2 consecutive posts from the same author
    const ordered = [], deferred = [];
    for (const x of scored) {
      const last = ordered.slice(-2);
      if (last.length === 2 && last.every(y => y.p.author_id === x.p.author_id)) deferred.push(x); else ordered.push(x);
    }
    const all = ordered.concat(deferred).map(x => x.p);
    const page = all.slice(offset, offset + 10);
    return { posts: this.postsOut(page), cursor: offset + 10 < all.length ? String(offset + 10) : null };
  }

  // ---------------- Posts ----------------
  validMedia(list, max = 10) {
    if (!Array.isArray(list) || !list.length) fail(400, 'Add at least one photo or video');
    return list.slice(0, max).map(m => {
      if (!MEDIA_RE.test(String(m.url || ''))) fail(400, 'Invalid media');
      if (m.thumb && !MEDIA_RE.test(String(m.thumb))) fail(400, 'Invalid thumbnail');
      return { kind: m.kind === 'video' ? 'video' : 'image', url: m.url, thumb: m.thumb || null, width: Math.round(Number(m.width) || 0) || null, height: Math.round(Number(m.height) || 0) || null, duration: Number(m.duration) || null };
    });
  }
  apiCreatePost({ body }) {
    const type = body.type === 'reel' ? 'reel' : 'post';
    const media = this.validMedia(body.media, type === 'reel' ? 1 : 10);
    if (type === 'reel' && media[0].kind !== 'video') fail(400, 'A reel needs a video');
    const caption = cleanText(body.caption, 2200), location = cleanText(body.location, 100), audio = cleanText(body.audio, 100);
    const id = uuid(), t = now(), o = this.ownerId;
    const tags = extractTags(caption);
    const topics = [...new Set(tags.concat(keywords(caption + ' ' + location, 12)))].slice(0, 15);
    this.tx(() => {
      this.run('INSERT INTO posts(id,author_id,type,caption,location,audio,topics,comments_off,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', id, o, type, caption, location, audio, JSON.stringify(topics), body.comments_off ? 1 : 0, t, t);
      media.forEach((m, i) => this.run('INSERT INTO post_media(id,post_id,idx,kind,url,thumb,width,height,duration,storage_key) VALUES(?,?,?,?,?,?,?,?,?,?)', uuid(), id, i, m.kind, m.url, m.thumb, m.width, m.height, m.duration, m.url.split('/').pop()));
      this.run('UPDATE accounts SET post_count=post_count+1, last_active=? WHERE id=?', t, o);
      this.setHashtags(id, caption, t);
      if (body.draft_id) this.run('DELETE FROM drafts WHERE id=?', body.draft_id);
    });
    const result = SIM.onOwnerPost(this, id);
    this.ctx.waitUntil(SIM.enrichPost(this, id).catch(e => console.error('enrich', e)));
    this.ensureAlarm(3000);
    return { post: this.postsOut([this.one('SELECT * FROM posts WHERE id=?', id)])[0], simulation: result };
  }
  ownPost(id) {
    const p = this.one('SELECT * FROM posts WHERE id=?', id) || fail(404, 'Post not found');
    if (p.author_id !== this.ownerId) fail(403, 'You can only change your own posts');
    return p;
  }
  apiGetPost({ params }) {
    const p = this.one('SELECT * FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    return { post: this.postsOut([p])[0] };
  }
  apiEditPost({ params, body }) {
    const p = this.ownPost(params[0]);
    const caption = body.caption != null ? cleanText(body.caption, 2200) : p.caption;
    const location = body.location != null ? cleanText(body.location, 100) : p.location;
    this.tx(() => {
      this.run('UPDATE posts SET caption=?, location=?, comments_off=?, updated_at=? WHERE id=?', caption, location, body.comments_off != null ? (body.comments_off ? 1 : 0) : p.comments_off, now(), p.id);
      if (caption !== p.caption) this.setHashtags(p.id, caption);
    });
    return { post: this.postsOut([this.one('SELECT * FROM posts WHERE id=?', p.id)])[0] };
  }
  async apiDeletePost({ params }) {
    const p = this.ownPost(params[0]);
    const keys = this.q('SELECT url, thumb FROM post_media WHERE post_id=?', p.id).flatMap(m => [m.url, m.thumb]).filter(Boolean).map(u => 'stardom/' + u.split('/').pop());
    this.tx(() => {
      this.setHashtags(p.id, '');
      this.run('DELETE FROM notifications WHERE post_id=?', p.id);
      this.run("UPDATE simulation_events SET status='skipped', done_at=? WHERE post_id=? AND status='pending'", now(), p.id);
      this.run('DELETE FROM posts WHERE id=?', p.id); // cascades media, likes, comments, bookmarks, hashtags
      this.run('UPDATE accounts SET post_count=MAX(0,post_count-1) WHERE id=?', this.ownerId);
    });
    if (this.env.FILES && keys.length) this.ctx.waitUntil(this.env.FILES.delete(keys).catch(() => {}));
    return { ok: true };
  }
  apiLikePost({ params, body }) {
    const p = this.one('SELECT * FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    const o = this.ownerId;
    const want = body.like != null ? !!body.like : !this.one('SELECT 1 AS x FROM likes WHERE post_id=? AND account_id=?', p.id, o);
    if (want) { if (this.like(p.id, o) && p.author_id !== o) { this.strengthen(p.author_id, o, 0.01, 'fan'); this._ivec = null; } }
    else this.unlike(p.id, o);
    const r = this.one('SELECT like_count FROM posts WHERE id=?', p.id);
    return { liked: want, likes: r.like_count };
  }
  apiSavePost({ params, body }) {
    const p = this.one('SELECT id, author_id FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    const exists = this.one('SELECT post_id FROM bookmarks WHERE post_id=?', p.id);
    let collection = body.collection_id || null;
    if (collection && !this.one('SELECT id FROM collections WHERE id=?', collection)) collection = null;
    if (exists && body.save !== true) { this.run('DELETE FROM bookmarks WHERE post_id=?', p.id); this.run('UPDATE posts SET save_count=MAX(0,save_count-1) WHERE id=?', p.id); return { saved: false }; }
    if (exists) { this.run('UPDATE bookmarks SET collection_id=? WHERE post_id=?', collection, p.id); return { saved: true }; }
    this.run('INSERT INTO bookmarks(post_id,collection_id,created_at) VALUES(?,?,?)', p.id, collection, now());
    this.run('UPDATE posts SET save_count=save_count+1 WHERE id=?', p.id);
    return { saved: true };
  }
  apiLikers({ params, query }) {
    return this.listAccounts('SELECT a.* FROM likes l JOIN accounts a ON a.id=l.account_id WHERE l.post_id=? ORDER BY l.created_at DESC', [params[0]], query);
  }
  apiComments({ params }) {
    const p = this.one('SELECT * FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    const rows = this.q('SELECT * FROM comments WHERE post_id=? ORDER BY created_at ASC LIMIT 600', p.id);
    const acc = this.accountsById(rows.map(r => r.author_id).concat([p.author_id]));
    const liked = new Set(rows.length ? this.q(`SELECT comment_id FROM comment_likes WHERE account_id=? AND comment_id IN (SELECT id FROM comments WHERE post_id=?)`, this.ownerId, p.id).map(r => r.comment_id) : []);
    const out = rows.map(r => ({ id: r.id, parent_id: r.parent_id, text: r.text, created_at: r.created_at, likes: r.like_count, liked: liked.has(r.id), ai: !!r.ai, author: this.mini(acc[r.author_id]), by_author: r.author_id === p.author_id }));
    return { comments: out, post: { id: p.id, caption: p.caption, author: this.mini(acc[p.author_id]), created_at: p.created_at, comments_off: !!p.comments_off } };
  }
  apiAddComment({ params, body }) {
    const p = this.one('SELECT * FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    if (p.comments_off && p.author_id !== this.ownerId) fail(403, 'Comments are turned off');
    const text = cleanText(body.text, 1000);
    if (!text) fail(400, 'Write something first');
    let parent = body.parent_id ? this.one('SELECT * FROM comments WHERE id=? AND post_id=?', body.parent_id, p.id) : null;
    if (parent && parent.parent_id) parent = this.one('SELECT * FROM comments WHERE id=?', parent.parent_id) || parent; // one level of threading
    const id = this.addComment(p.id, this.ownerId, text, parent ? parent.id : null);
    SIM.onOwnerComment(this, p, id, text, parent);
    this.ensureAlarm(4000);
    const c = this.one('SELECT * FROM comments WHERE id=?', id);
    return { comment: { id, parent_id: c.parent_id, text, created_at: c.created_at, likes: 0, liked: false, author: this.mini(this.owner()), by_author: p.author_id === this.ownerId } };
  }
  apiDeleteComment({ params }) {
    const c = this.one('SELECT c.*, p.author_id AS post_author FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?', params[0]) || fail(404, 'Comment not found');
    if (c.author_id !== this.ownerId && c.post_author !== this.ownerId) fail(403, 'You can delete your own comments or comments on your posts');
    this.tx(() => {
      const n = 1 + (this.val('SELECT COUNT(*) FROM comments WHERE parent_id=?', c.id) || 0);
      this.run('DELETE FROM comments WHERE id=?', c.id);
      this.run('UPDATE posts SET comment_count=MAX(0,comment_count-?) WHERE id=?', n, c.post_id);
      this.run('DELETE FROM notifications WHERE comment_id=?', c.id);
      if (c.author_id !== this.ownerId) this.run('INSERT INTO moderation_logs(id,action,account_id,detail,created_at) VALUES(?,?,?,?,?)', uuid(), 'delete_comment', c.author_id, c.text.slice(0, 200), now());
    });
    return { ok: true };
  }
  apiLikeComment({ params }) {
    const c = this.one('SELECT * FROM comments WHERE id=?', params[0]) || fail(404, 'Comment not found');
    const o = this.ownerId;
    if (this.one('SELECT 1 AS x FROM comment_likes WHERE comment_id=? AND account_id=?', c.id, o)) {
      this.run('DELETE FROM comment_likes WHERE comment_id=? AND account_id=?', c.id, o);
      this.run('UPDATE comments SET like_count=MAX(0,like_count-1) WHERE id=?', c.id);
      return { liked: false, likes: Math.max(0, c.like_count - 1) };
    }
    this.run('INSERT INTO comment_likes(comment_id,account_id,created_at) VALUES(?,?,?)', c.id, o, now());
    this.run('UPDATE comments SET like_count=like_count+1 WHERE id=?', c.id);
    if (c.author_id !== o) this.strengthen(c.author_id, o, 0.015, 'fan');
    return { liked: true, likes: c.like_count + 1 };
  }
  apiSharePost({ params, body }) {
    const p = this.one('SELECT * FROM posts WHERE id=?', params[0]) || fail(404, 'Post not found');
    const to = [].concat(body.to || []).slice(0, 10);
    const sent = [];
    for (const peer of to) {
      const conv = this.conversationWith(peer);
      if (!conv) continue;
      this.insertMessage(conv, this.ownerId, { kind: 'post_share', text: cleanText(body.text, 500), ref_post: p.id });
      SIM.scheduleDmReply(this, conv.id);
      sent.push(conv.id);
    }
    if (sent.length) { this.run('UPDATE posts SET share_count=share_count+? WHERE id=?', sent.length, p.id); this.ensureAlarm(3000); }
    return { sent: sent.length };
  }
  apiDrafts() {
    return { drafts: this.q('SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 50').map(d => Object.assign({ id: d.id, created_at: d.created_at, updated_at: d.updated_at }, parseJSON(d.payload, {}))) };
  }
  apiSaveDraft({ body }) {
    const payload = { type: body.type === 'reel' ? 'reel' : 'post', caption: cleanText(body.caption, 2200), location: cleanText(body.location, 100), audio: cleanText(body.audio, 100), media: this.validMedia(body.media, 10) };
    const id = body.id && this.one('SELECT id FROM drafts WHERE id=?', body.id) ? body.id : uuid();
    this.run('INSERT INTO drafts(id,payload,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at', id, JSON.stringify(payload), now(), now());
    return { id };
  }
  apiDeleteDraft({ params }) { this.run('DELETE FROM drafts WHERE id=?', params[0]); }

  // ---------------- Stories ----------------
  storyOut(s, media) {
    return { id: s.id, kind: s.kind, text: s.text, bg: s.bg, caption: s.caption, created_at: s.created_at, expires_at: s.expires_at, views: s.view_count, replies: s.reply_count, highlight: s.highlight, media: media || null };
  }
  apiStoryTray() {
    const t = now(), o = this.ownerId;
    const rows = this.q(`SELECT s.author_id, MAX(s.created_at) AS latest, COUNT(*) AS n,
        SUM(CASE WHEN EXISTS(SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.viewer_id=?) THEN 1 ELSE 0 END) AS seen
      FROM stories s JOIN accounts a ON a.id=s.author_id
      WHERE s.expires_at>? AND a.status='active' AND (s.author_id=? OR s.author_id IN (SELECT followee_id FROM follows WHERE follower_id=?))
      GROUP BY s.author_id ORDER BY latest DESC LIMIT 60`, o, t, o, o);
    const acc = this.accountsById(rows.map(r => r.author_id));
    const tray = rows.map(r => ({ account: this.mini(acc[r.author_id]), latest: r.latest, count: r.n, seen: r.seen >= r.n, own: r.author_id === o }))
      .sort((a, b) => (b.own - a.own) || (a.seen - b.seen) || (b.latest - a.latest));
    return { tray, owner_has_story: tray.some(x => x.own) };
  }
  apiUserStories({ params }) {
    const a = this.findAccount(params[0]);
    const rows = this.q('SELECT * FROM stories WHERE author_id=? AND expires_at>? ORDER BY created_at ASC', a.id, now());
    const media = {};
    if (rows.length) for (const m of this.q(`SELECT * FROM story_media WHERE story_id IN (${this.inList(rows)})`, ...rows.map(r => r.id))) media[m.story_id] = { kind: m.kind, url: m.url, thumb: m.thumb, duration: m.duration };
    const seen = new Set(rows.length ? this.q(`SELECT story_id FROM story_views WHERE viewer_id=? AND story_id IN (${this.inList(rows)})`, this.ownerId, ...rows.map(r => r.id)).map(r => r.story_id) : []);
    return { account: this.mini(a), stories: rows.map(s => Object.assign(this.storyOut(s, media[s.id]), { seen: seen.has(s.id) })) };
  }
  apiCreateStory({ body }) {
    const kind = ['photo', 'video', 'text'].includes(body.kind) ? body.kind : 'text';
    const t = now(), id = uuid();
    let media = null;
    if (kind !== 'text') {
      if (!MEDIA_RE.test(String(body.url || ''))) fail(400, 'Invalid media');
      media = { kind: kind === 'video' ? 'video' : 'image', url: body.url, thumb: MEDIA_RE.test(String(body.thumb || '')) ? body.thumb : null, duration: Number(body.duration) || null };
    }
    const text = cleanText(body.text, 300);
    if (kind === 'text' && !text) fail(400, 'Write something for your story');
    this.tx(() => {
      this.run('INSERT INTO stories(id,author_id,kind,text,bg,caption,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)', id, this.ownerId, kind, text, cleanText(body.bg, 200), cleanText(body.caption, 300), t, t + 86400000);
      if (media) this.run('INSERT INTO story_media(id,story_id,kind,url,thumb,duration,storage_key) VALUES(?,?,?,?,?,?,?)', uuid(), id, media.kind, media.url, media.thumb, media.duration, media.url.split('/').pop());
    });
    SIM.onOwnerStory(this, id);
    this.ensureAlarm(5000);
    return { story: this.storyOut(this.one('SELECT * FROM stories WHERE id=?', id), media) };
  }
  apiViewStory({ params }) {
    const s = this.one('SELECT * FROM stories WHERE id=?', params[0]) || fail(404, 'Story not found');
    if (s.author_id === this.ownerId) return { ok: true };
    const n = this.sql.exec('INSERT OR IGNORE INTO story_views(story_id,viewer_id,created_at) VALUES(?,?,?)', s.id, this.ownerId, now()).rowsWritten;
    if (n) this.run('UPDATE stories SET view_count=view_count+1 WHERE id=?', s.id);
    return { ok: true };
  }
  apiStoryViewers({ params, query }) {
    const s = this.one('SELECT * FROM stories WHERE id=?', params[0]) || fail(404, 'Story not found');
    if (s.author_id !== this.ownerId) fail(403, 'Only your own story viewers are visible');
    const r = this.listAccounts('SELECT a.*, v.liked FROM story_views v JOIN accounts a ON a.id=v.viewer_id WHERE v.story_id=? ORDER BY v.liked DESC, v.created_at DESC', [s.id], query);
    r.total = s.view_count;
    return r;
  }
  apiReplyStory({ params, body }) {
    const s = this.one('SELECT * FROM stories WHERE id=?', params[0]) || fail(404, 'Story not found');
    if (s.author_id === this.ownerId) fail(400, 'You cannot reply to your own story');
    const text = cleanText(body.text, 1000);
    if (!text) fail(400, 'Write a reply');
    const conv = this.conversationWith(s.author_id) || fail(400, 'Cannot message this account');
    const thumb = (this.one('SELECT thumb, url FROM story_media WHERE story_id=?', s.id) || {});
    const mid = this.insertMessage(conv, this.ownerId, { kind: 'story_reply', text, ref_story: s.id, story_thumb: thumb.thumb || thumb.url || null });
    this.run('INSERT INTO story_replies(id,story_id,account_id,message_id,created_at) VALUES(?,?,?,?,?)', uuid(), s.id, this.ownerId, mid, now());
    this.run('UPDATE stories SET reply_count=reply_count+1 WHERE id=?', s.id);
    SIM.scheduleDmReply(this, conv.id);
    this.ensureAlarm(3000);
    return { conversation_id: conv.id };
  }
  apiHighlightStory({ params, body }) {
    const s = this.one('SELECT * FROM stories WHERE id=? AND author_id=?', params[0], this.ownerId) || fail(404, 'Story not found');
    const name = body.name == null ? null : cleanText(body.name, 30) || 'Highlights';
    this.run('UPDATE stories SET highlight=? WHERE id=?', name, s.id);
    return { highlight: name };
  }
  apiDeleteStory({ params }) {
    const s = this.one('SELECT * FROM stories WHERE id=? AND author_id=?', params[0], this.ownerId) || fail(404, 'Story not found');
    const m = this.one('SELECT url, thumb FROM story_media WHERE story_id=?', s.id);
    this.run('DELETE FROM notifications WHERE story_id=?', s.id);
    this.run('DELETE FROM stories WHERE id=?', s.id);
    if (m && this.env.FILES) this.ctx.waitUntil(this.env.FILES.delete([m.url, m.thumb].filter(Boolean).map(u => 'stardom/' + u.split('/').pop())).catch(() => {}));
  }
  apiHighlights({ params }) {
    const a = this.findAccount(params[0]);
    const rows = this.q('SELECT s.*, m.url, m.thumb, m.kind AS mkind, m.duration FROM stories s LEFT JOIN story_media m ON m.story_id=s.id WHERE s.author_id=? AND s.highlight IS NOT NULL ORDER BY s.created_at ASC', a.id);
    const groups = {};
    for (const s of rows) (groups[s.highlight] = groups[s.highlight] || []).push(this.storyOut(s, s.url ? { kind: s.mkind, url: s.url, thumb: s.thumb, duration: s.duration } : null));
    return { highlights: Object.entries(groups).map(([name, stories]) => ({ name, stories })) };
  }
  apiStoryArchive() {
    const rows = this.q('SELECT s.*, m.url, m.thumb, m.kind AS mkind, m.duration FROM stories s LEFT JOIN story_media m ON m.story_id=s.id WHERE s.author_id=? ORDER BY s.created_at DESC LIMIT 200', this.ownerId);
    return { stories: rows.map(s => this.storyOut(s, s.url ? { kind: s.mkind, url: s.url, thumb: s.thumb, duration: s.duration } : null)) };
  }

  // ---------------- Explore / search ----------------
  apiExplore({ query }) {
    const t = now(), o = this.ownerId;
    const iv = this.ownerInterestVector();
    const posts = this.q("SELECT p.* FROM posts p JOIN accounts a ON a.id=p.author_id WHERE p.author_id<>? AND a.status='active' AND p.created_at>? ORDER BY p.created_at DESC LIMIT 300", o, t - 30 * 86400000)
      .map(p => { const topics = parseJSON(p.topics, []); const h = parseInt(p.id.slice(0, 6), 16) / 0xffffff;
        return { p, s: (1 + topics.reduce((s, x) => s + (iv[x] || 0), 0)) * (1 + Math.log10(1 + p.like_count + 3 * p.comment_count)) * Math.pow((t - p.created_at) / 3600000 + 6, -0.35) * (0.8 + h * 0.4) }; })
      .sort((a, b) => b.s - a.s).slice(0, Number(query.get('limit') || 45)).map(x => x.p);
    const suggested = this.q(`SELECT a.* FROM accounts a WHERE a.kind='virtual' AND a.status='active' AND a.tier<>'fan' AND a.id NOT IN (SELECT followee_id FROM follows WHERE follower_id=?) ORDER BY (a.id IN (SELECT follower_id FROM follows WHERE followee_id=?)) DESC, a.sim_followers DESC LIMIT 60`, o, o);
    const pickS = suggested.sort((a, b) => (b.sim_followers * (0.5 + (parseInt(b.id.slice(0, 4), 16) / 65535))) - (a.sim_followers * (0.5 + (parseInt(a.id.slice(0, 4), 16) / 65535)))).slice(0, 12);
    const trending = this.q('SELECT tag, COUNT(*) AS n FROM post_hashtags WHERE created_at>? GROUP BY tag ORDER BY n DESC LIMIT 12', t - 7 * 86400000);
    const newest = this.q("SELECT * FROM accounts WHERE kind='virtual' AND status='active' AND tier<>'fan' ORDER BY created_at DESC LIMIT 10");
    const popular = this.q("SELECT * FROM accounts WHERE kind='virtual' AND status='active' ORDER BY sim_followers DESC LIMIT 10");
    return { posts: this.postsOut(posts, { previews: false }), suggested: pickS.map(a => this.pubAccount(a)), trending, newest: newest.map(a => this.pubAccount(a, { relations: false })), popular: popular.map(a => this.pubAccount(a)), categories: CATEGORIES, countries: COUNTRIES, industries: INDUSTRY_KEYS };
  }
  apiSearch({ query }) {
    const raw = cleanText(query.get('q'), 60);
    const type = query.get('type') || 'all';
    const country = query.get('country') || '', industry = query.get('industry') || '', sort = query.get('sort') || 'relevance';
    const out = {};
    if (raw.startsWith('#') || type === 'tags') {
      const tq = raw.replace(/^#/, '').toLowerCase();
      out.tags = this.q('SELECT tag, post_count FROM hashtags WHERE tag LIKE ? ORDER BY post_count DESC LIMIT 20', tq + '%');
      if (raw.startsWith('#')) return out;
    }
    const like = '%' + raw.replace(/^@/, '') + '%';
    let where = "kind='virtual' AND status<>'blocked'", args = [];
    if (raw) { where += ' AND (username LIKE ? OR display_name LIKE ? OR occupation LIKE ? OR country LIKE ? OR city LIKE ? OR id IN (SELECT account_id FROM account_personalities WHERE interests LIKE ?))'; args.push(like, like, like, like, like, like); }
    if (country) { where += ' AND country=?'; args.push(country); }
    if (industry) { where += ' AND industry=?'; args.push(industry); }
    const order = sort === 'followers' ? 'sim_followers DESC' : sort === 'newest' ? 'created_at DESC' : sort === 'active' ? 'last_active DESC' : `(username LIKE ?) DESC, (tier<>'fan') DESC, sim_followers DESC`;
    if (sort === 'relevance') args.push(raw.replace(/^@/, '') + '%');
    out.accounts = this.q(`SELECT * FROM accounts WHERE ${where} ORDER BY ${order} LIMIT 40`, ...args).map(a => this.pubAccount(a));
    if (type === 'all' && raw) out.tags = this.q('SELECT tag, post_count FROM hashtags WHERE tag LIKE ? ORDER BY post_count DESC LIMIT 8', raw.replace(/^#/, '').toLowerCase() + '%');
    return out;
  }
  apiTag({ params, query }) {
    const tag = params[0].toLowerCase();
    const sort = query.get('sort') || 'top';
    const rows = this.q(`SELECT p.* FROM post_hashtags h JOIN posts p ON p.id=h.post_id WHERE h.tag=? ORDER BY ${sort === 'recent' ? 'p.created_at DESC' : '(p.like_count + 3*p.comment_count) DESC'} LIMIT 60`, tag);
    return { tag, count: this.val('SELECT post_count FROM hashtags WHERE tag=?', tag) || 0, posts: this.postsOut(rows, { previews: false }) };
  }
  apiDirectory({ query }) {
    const cat = query.get('category') || '';
    const sort = query.get('sort') || 'followers';
    const offset = Math.max(0, Number(query.get('offset') || 0));
    const c = CATEGORIES.find(x => x.key === cat);
    let where = "kind='virtual' AND status<>'blocked' AND tier<>'fan'", args = [];
    if (c) {
      if (c.region) { const R = REGIONS[c.region]; const cs = [].concat(R.country); where += ` AND country IN (${this.inList(cs)}) AND industry IN (${this.inList(c.industries)})`; args.push(...cs, ...c.industries); }
      else { where += ` AND industry IN (${this.inList(c.industries)})`; args.push(...c.industries); }
    } else if (cat === 'community') where = "kind='virtual' AND status<>'blocked' AND tier='fan'";
    const order = sort === 'newest' ? 'created_at DESC' : sort === 'active' ? 'last_active DESC' : sort === 'name' ? 'display_name ASC' : 'sim_followers DESC';
    const rows = this.q(`SELECT * FROM accounts WHERE ${where} ORDER BY ${order} LIMIT 40 OFFSET ?`, ...args, offset);
    const counts = {};
    for (const k of CATEGORIES) {
      if (k.region) { const cs = [].concat(REGIONS[k.region].country); counts[k.key] = this.val(`SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND tier<>'fan' AND country IN (${this.inList(cs)}) AND industry IN (${this.inList(k.industries)})`, ...cs, ...k.industries); }
      else counts[k.key] = this.val(`SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND tier<>'fan' AND industry IN (${this.inList(k.industries)})`, ...k.industries);
    }
    counts.community = this.val("SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND tier='fan'");
    return { accounts: rows.map(a => this.pubAccount(a)), categories: CATEGORIES.concat([{ key: 'community', label: 'Community & Fans' }]), counts, next: rows.length === 40 ? offset + 40 : null };
  }

  // ---------------- Reels ----------------
  apiReels({ query }) {
    const offset = Number(query.get('cursor') || 0) || 0;
    const t = now(), iv = this.ownerInterestVector();
    const rows = this.q("SELECT p.* FROM posts p JOIN accounts a ON a.id=p.author_id WHERE p.type='reel' AND a.status<>'blocked' ORDER BY p.created_at DESC LIMIT 200")
      .map(p => ({ p, s: (1 + parseJSON(p.topics, []).reduce((s, x) => s + (iv[x] || 0), 0)) * (1 + Math.log10(1 + p.like_count + p.view_count / 20)) * Math.pow((t - p.created_at) / 3600000 + 4, -0.4) * (p.author_id === this.ownerId ? 1.3 : 1) }))
      .sort((a, b) => b.s - a.s).map(x => x.p);
    const page = rows.slice(offset, offset + 8);
    return { reels: this.postsOut(page, { previews: false }), cursor: offset + 8 < rows.length ? String(offset + 8) : null };
  }
  apiReelView({ params }) {
    this.run("UPDATE posts SET view_count=view_count+1 WHERE id=? AND type='reel' AND author_id<>?", params[0], this.ownerId);
    return { ok: true };
  }

  // ---------------- Notifications ----------------
  notifOut(n, acc) {
    const out = { id: n.id, type: n.type, text: n.text, count: n.count, read: !!n.is_read, created_at: n.created_at, actor: this.mini(acc[n.actor_id]), post_id: n.post_id, comment_id: n.comment_id, story_id: n.story_id };
    return out;
  }
  apiNotifications({ query }) {
    const type = query.get('type') || '';
    const before = Number(query.get('before') || 0) || 9e15;
    const types = { likes: ['like', 'comment_like', 'story_like'], comments: ['comment', 'reply', 'mention'], follows: ['follow', 'follow_back', 'recommendation'], stories: ['story_view', 'story_reply', 'story_like'], messages: ['dm'], system: ['milestone', 'bot'] }[type];
    const rows = types
      ? this.q(`SELECT * FROM notifications WHERE type IN (${this.inList(types)}) AND created_at<? ORDER BY created_at DESC LIMIT 40`, ...types, before)
      : this.q('SELECT * FROM notifications WHERE created_at<? ORDER BY created_at DESC LIMIT 40', before);
    const acc = this.accountsById(rows.map(r => r.actor_id));
    const postIds = rows.map(r => r.post_id).filter(Boolean);
    const thumbs = {};
    if (postIds.length) for (const m of this.q(`SELECT post_id, COALESCE(thumb,url) AS t, kind FROM post_media WHERE idx=0 AND post_id IN (${this.inList(postIds)})`, ...postIds)) thumbs[m.post_id] = m.t;
    const storyIds = rows.map(r => r.story_id).filter(Boolean);
    if (storyIds.length) for (const m of this.q(`SELECT story_id, COALESCE(thumb,url) AS t FROM story_media WHERE story_id IN (${this.inList(storyIds)})`, ...storyIds)) thumbs['s:' + m.story_id] = m.t;
    const following = new Set(this.q('SELECT followee_id FROM follows WHERE follower_id=?', this.ownerId).map(r => r.followee_id));
    return { notifications: rows.map(n => Object.assign(this.notifOut(n, acc), { thumb: thumbs[n.post_id] || thumbs['s:' + n.story_id] || null, following: following.has(n.actor_id) })), cursor: rows.length === 40 ? String(rows[rows.length - 1].created_at) : null };
  }
  apiNotifRead({ body }) {
    if (Array.isArray(body.ids) && body.ids.length) this.run(`UPDATE notifications SET is_read=1 WHERE id IN (${this.inList(body.ids)})`, ...body.ids.slice(0, 200));
    else this.run('UPDATE notifications SET is_read=1 WHERE is_read=0');
    return { counts: this.unreadCounts() };
  }
  apiNotifClear() { this.run('DELETE FROM notifications'); return { counts: this.unreadCounts() }; }

  // ---------------- Messages ----------------
  conversationWith(peerId) {
    const a = this.account(peerId);
    if (!a || a.kind !== 'virtual' || a.status === 'blocked') return null;
    let c = this.one('SELECT * FROM conversations WHERE peer_id=?', a.id);
    if (!c) {
      const id = uuid(), t = now();
      this.run('INSERT INTO conversations(id,peer_id,created_at) VALUES(?,?,?)', id, a.id, t);
      this.run('INSERT INTO conversation_participants(conversation_id,account_id,joined_at) VALUES(?,?,?),(?,?,?)', id, this.ownerId, t, id, a.id, t);
      c = this.one('SELECT * FROM conversations WHERE id=?', id);
    }
    return c;
  }
  insertMessage(conv, senderId, { kind = 'text', text = '', media_url = null, ref_post = null, ref_story = null, story_thumb = null, ai = 0 }, t = now()) {
    const id = uuid();
    const fromOwner = senderId === this.ownerId;
    this.run('INSERT INTO messages(id,conversation_id,sender_id,kind,text,media_url,ref_post,ref_story,story_thumb,ai,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)', id, conv.id, senderId, kind, text, media_url, ref_post, ref_story, story_thumb, ai ? 1 : 0, t);
    const preview = kind === 'image' ? (fromOwner ? 'You sent a photo' : 'Sent a photo') : kind === 'post_share' ? (fromOwner ? 'You shared a post' : 'Shared a post') : kind === 'story_reply' ? (fromOwner ? 'You replied to their story' : 'Replied to your story') : text;
    if (fromOwner) this.run('UPDATE conversations SET last_message_at=?, last_preview=?, owner_read_at=?, bot_streak=0 WHERE id=?', t, preview.slice(0, 120), t, conv.id);
    else {
      this.run('UPDATE conversations SET last_message_at=?, last_preview=?, unread=unread+1, typing_from=NULL, typing_until=NULL, bot_streak=bot_streak+1 WHERE id=?', t, preview.slice(0, 120), conv.id);
      this.bumpStat('dms', 1, t);
    }
    return id;
  }
  apiConversations({ query }) {
    const s = query.get('q') ? '%' + query.get('q') + '%' : null;
    const rows = s
      ? this.q('SELECT c.* FROM conversations c JOIN accounts a ON a.id=c.peer_id WHERE c.last_message_at IS NOT NULL AND (a.username LIKE ? OR a.display_name LIKE ?) ORDER BY c.last_message_at DESC LIMIT 100', s, s)
      : this.q('SELECT * FROM conversations WHERE last_message_at IS NOT NULL ORDER BY last_message_at DESC LIMIT 100');
    const acc = this.accountsById(rows.map(r => r.peer_id));
    const t = now();
    const suggestions = this.q(`SELECT a.* FROM accounts a JOIN follows f ON f.followee_id=a.id AND f.follower_id=? WHERE a.status='active' AND a.id NOT IN (SELECT peer_id FROM conversations WHERE last_message_at IS NOT NULL) ORDER BY a.last_active DESC LIMIT 12`, this.ownerId);
    return { conversations: rows.map(c => ({ id: c.id, peer: this.mini(acc[c.peer_id]), last_message_at: c.last_message_at, preview: c.last_preview, unread: c.unread, typing: !!(c.typing_from && c.typing_from <= t && c.typing_until > t) })), suggestions: suggestions.map(a => this.mini(a)) };
  }
  apiOpenConversation({ body }) {
    const c = this.conversationWith(body.peer_id) || fail(400, 'Cannot message this account');
    return { id: c.id };
  }
  apiMessages({ params, query }) {
    const c = this.one('SELECT * FROM conversations WHERE id=?', params[0]) || fail(404, 'Conversation not found');
    const after = Number(query.get('after') || 0), before = Number(query.get('before') || 0) || 9e15;
    const rows = after
      ? this.q('SELECT * FROM messages WHERE conversation_id=? AND created_at>? ORDER BY created_at ASC LIMIT 100', c.id, after)
      : this.q('SELECT * FROM (SELECT * FROM messages WHERE conversation_id=? AND created_at<? ORDER BY created_at DESC LIMIT 60) ORDER BY created_at ASC', c.id, before);
    const ids = rows.map(r => r.id);
    const reactions = {};
    if (ids.length) for (const r of this.q(`SELECT * FROM message_reactions WHERE message_id IN (${this.inList(ids)})`, ...ids)) (reactions[r.message_id] = reactions[r.message_id] || []).push({ emoji: r.emoji, by: r.account_id === this.ownerId ? 'me' : 'them' });
    const posts = {};
    const refIds = rows.map(r => r.ref_post).filter(Boolean);
    if (refIds.length) for (const p of this.postsOut(this.q(`SELECT * FROM posts WHERE id IN (${this.inList(refIds)})`, ...refIds), { previews: false })) posts[p.id] = p;
    if (c.unread || !after) this.run('UPDATE conversations SET unread=0, owner_read_at=? WHERE id=?', now(), c.id);
    const t = now();
    const peer = this.account(c.peer_id);
    return {
      conversation: { id: c.id, peer: Object.assign(this.mini(peer), { occupation: peer.occupation }), peer_read_at: c.peer_read_at && c.peer_read_at <= t ? c.peer_read_at : 0, typing: !!(c.typing_from && c.typing_from <= t && c.typing_until > t) },
      messages: rows.map(m => ({ id: m.id, mine: m.sender_id === this.ownerId, kind: m.kind, text: m.text, media_url: m.media_url, story_thumb: m.story_thumb, ref_story: m.ref_story, post: m.ref_post ? posts[m.ref_post] || { deleted: true } : null, created_at: m.created_at, reactions: reactions[m.id] || [] })),
      has_more: !after && rows.length === 60,
    };
  }
  apiSendMessage({ params, body }) {
    const c = this.one('SELECT * FROM conversations WHERE id=?', params[0]) || fail(404, 'Conversation not found');
    const peer = this.account(c.peer_id);
    if (!peer || peer.status === 'blocked') fail(400, 'This account is blocked');
    const text = cleanText(body.text, 2000);
    const media = body.media_url && MEDIA_RE.test(String(body.media_url)) ? body.media_url : null;
    if (!text && !media) fail(400, 'Empty message');
    const id = this.insertMessage(c, this.ownerId, { kind: media ? 'image' : 'text', text, media_url: media });
    SIM.scheduleDmReply(this, c.id);
    this.ensureAlarm(2000);
    const m = this.one('SELECT * FROM messages WHERE id=?', id);
    return { message: { id, mine: true, kind: m.kind, text: m.text, media_url: m.media_url, created_at: m.created_at, reactions: [] } };
  }
  apiReact({ params, body }) {
    const m = this.one('SELECT * FROM messages WHERE id=?', params[0]) || fail(404, 'Message not found');
    const emoji = cleanText(body.emoji, 8);
    const cur = this.one('SELECT emoji FROM message_reactions WHERE message_id=? AND account_id=?', m.id, this.ownerId);
    if (!emoji || (cur && cur.emoji === emoji)) this.run('DELETE FROM message_reactions WHERE message_id=? AND account_id=?', m.id, this.ownerId);
    else this.run('INSERT INTO message_reactions(message_id,account_id,emoji,created_at) VALUES(?,?,?,?) ON CONFLICT(message_id,account_id) DO UPDATE SET emoji=excluded.emoji', m.id, this.ownerId, emoji, now());
    return { ok: true };
  }

  // ---------------- Saved ----------------
  apiSaved({ query }) {
    const col = query.get('collection');
    const rows = col ? this.q('SELECT p.* FROM bookmarks b JOIN posts p ON p.id=b.post_id WHERE b.collection_id=? ORDER BY b.created_at DESC LIMIT 120', col)
      : this.q('SELECT p.* FROM bookmarks b JOIN posts p ON p.id=b.post_id ORDER BY b.created_at DESC LIMIT 120');
    return { posts: this.postsOut(rows, { previews: false }) };
  }
  apiCollections() {
    const rows = this.q('SELECT c.*, (SELECT COUNT(*) FROM bookmarks b WHERE b.collection_id=c.id) AS n, (SELECT COALESCE(m.thumb,m.url) FROM bookmarks b JOIN post_media m ON m.post_id=b.post_id AND m.idx=0 WHERE b.collection_id=c.id ORDER BY b.created_at DESC LIMIT 1) AS cover FROM collections c ORDER BY c.created_at');
    const all = this.one('SELECT COUNT(*) AS n, (SELECT COALESCE(m.thumb,m.url) FROM bookmarks b JOIN post_media m ON m.post_id=b.post_id AND m.idx=0 ORDER BY b.created_at DESC LIMIT 1) AS cover FROM bookmarks');
    return { all, collections: rows.map(r => ({ id: r.id, name: r.name, count: r.n, cover: r.cover })) };
  }
  apiCreateCollection({ body }) {
    const name = cleanText(body.name, 40) || fail(400, 'Name required');
    const id = uuid();
    this.run('INSERT INTO collections(id,name,created_at) VALUES(?,?,?) ON CONFLICT(name) DO NOTHING', id, name, now());
    return { id: (this.one('SELECT id FROM collections WHERE name=?', name) || {}).id };
  }
  apiDeleteCollection({ params }) { this.run('DELETE FROM collections WHERE id=?', params[0]); }

  // ---------------- Insights ----------------
  apiInsights({ query }) {
    const days = clamp(Number(query.get('days') || 30), 7, 365);
    const t = now(), o = this.owner();
    const fromDay = this.day(t - (days - 1) * 86400000), prevFrom = this.day(t - (2 * days - 1) * 86400000);
    const stats = this.q('SELECT * FROM engagement_statistics WHERE day>=? ORDER BY day', fromDay);
    const prev = this.one('SELECT COALESCE(SUM(likes),0) AS likes, COALESCE(SUM(comments),0) AS comments, COALESCE(SUM(follows),0) AS follows, COALESCE(SUM(unfollows),0) AS unfollows, COALESCE(SUM(story_views),0) AS story_views FROM engagement_statistics WHERE day>=? AND day<?', prevFrom, fromDay);
    const cur = stats.reduce((s, r) => { for (const k of ['likes', 'comments', 'follows', 'unfollows', 'story_views', 'dms', 'saves', 'reel_views']) s[k] = (s[k] || 0) + (r[k] || 0); return s; }, {});
    const totals = this.one('SELECT COUNT(*) AS posts, COALESCE(SUM(like_count),0) AS likes, COALESCE(SUM(comment_count),0) AS comments, COALESCE(SUM(save_count),0) AS saves, COALESCE(SUM(view_count),0) AS views FROM posts WHERE author_id=?', o.id);
    const series = [];
    const byDay = Object.fromEntries(stats.map(r => [r.day, r]));
    let followers = o.follower_count;
    const follSeries = [];
    for (let i = 0; i < days; i++) {
      const d = this.day(t - i * 86400000), r = byDay[d] || {};
      follSeries.unshift({ day: d, followers });
      followers -= (r.follows || 0) - (r.unfollows || 0);
    }
    for (let i = days - 1; i >= 0; i--) { const d = this.day(t - i * 86400000), r = byDay[d] || {}; series.push({ day: d, likes: r.likes || 0, comments: r.comments || 0, follows: r.follows || 0, unfollows: r.unfollows || 0, story_views: r.story_views || 0 }); }
    const top = this.postsOut(this.q('SELECT * FROM posts WHERE author_id=? ORDER BY (like_count + 3*comment_count + 2*save_count) DESC LIMIT 6', o.id), { previews: false });
    const active = this.q(`SELECT actor_id, COUNT(*) AS n FROM activity_history WHERE owner_related=1 AND day>=? GROUP BY actor_id ORDER BY n DESC LIMIT 10`, fromDay);
    const acc = this.accountsById(active.map(r => r.actor_id));
    const byHourPosts = {};
    for (const p of this.q('SELECT created_at, like_count, comment_count FROM posts WHERE author_id=?', o.id)) { const h = this.hour(p.created_at); const b = byHourPosts[h] = byHourPosts[h] || { posts: 0, eng: 0 }; b.posts++; b.eng += p.like_count + p.comment_count; }
    const audienceHours = this.q('SELECT hour, likes, comments FROM hourly_engagement ORDER BY hour');
    const countries = this.q("SELECT a.country, COUNT(*) AS n FROM follows f JOIN accounts a ON a.id=f.follower_id WHERE f.followee_id=? GROUP BY a.country ORDER BY n DESC LIMIT 8", o.id);
    const er = o.follower_count && totals.posts ? ((totals.likes + totals.comments) / totals.posts) / o.follower_count * 100 : 0;
    return {
      simulated: true, days, followers: o.follower_count, totals, engagement_rate: Math.round(er * 100) / 100,
      period: cur, previous: prev, series, follower_series: follSeries, top_posts: top,
      active_followers: active.map(r => Object.assign(this.mini(acc[r.actor_id]) || {}, { interactions: r.n })),
      best_hours: Object.entries(byHourPosts).map(([h, v]) => ({ hour: +h, posts: v.posts, avg: Math.round(v.eng / v.posts) })).sort((a, b) => a.hour - b.hour),
      audience_hours: audienceHours, countries,
    };
  }

  // ---------------- Owner Control Center ----------------
  apiAdminOverview() {
    const t = now(), d = this.day();
    const c = this.one(`SELECT
      (SELECT COUNT(*) FROM accounts WHERE kind='virtual') AS total,
      (SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND status='active') AS active,
      (SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND status='inactive') AS inactive,
      (SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND status='blocked') AS blocked,
      (SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND last_active>?) AS online,
      (SELECT COUNT(*) FROM posts) AS posts,
      (SELECT COUNT(*) FROM posts WHERE author_id=?) AS owner_posts,
      (SELECT COUNT(*) FROM simulation_events WHERE status='pending') AS pending,
      (SELECT COUNT(*) FROM simulation_events WHERE status='failed' AND done_at>?) AS failed24,
      (SELECT COUNT(*) FROM character_memories) AS memories`, t - 3600000, this.ownerId, t - 86400000);
    const today = this.one('SELECT * FROM engagement_statistics WHERE day=?', d) || {};
    const lastJob = this.one('SELECT * FROM background_job_logs ORDER BY started_at DESC LIMIT 1');
    const usage = this.aiUsage();
    return { counts: c, owner_followers: this.owner().follower_count, today, ai: Object.assign(usage, { enabled: !!this.cfg.ai_enabled, key: !!this.env.GEMINI_API_KEY, available: this.aiAvailable(), daily_limit: this.cfg.ai_daily_limit, monthly_limit: this.cfg.ai_monthly_limit }),
      sim: { running: !!this.cfg.sim_running, last_tick: lastJob && lastJob.started_at, actions_today: today.actions || 0, daily_limit: this.cfg.daily_action_limit },
      status: !this.cfg.sim_running ? 'paused' : (lastJob && t - lastJob.started_at < 5 * 60000) ? 'healthy' : 'idle' };
  }
  apiAdminSettings() { return { settings: this.cfg, defaults: DEFAULT_SETTINGS, archetypes: this.q('SELECT name, config, builtin FROM personality_configs ORDER BY name').map(r => ({ name: r.name, builtin: !!r.builtin, config: parseJSON(r.config, {}) })) }; }
  apiAdminSaveSettings({ body }) {
    const num = (k, a, b) => { if (body[k] != null) this.setSetting(k, clamp(Number(body[k]) || 0, a, b)); };
    num('intensity', 0.1, 5); num('daily_action_limit', 0, 50000); num('per_account_daily_limit', 1, 500); num('like_rate', 0, 5); num('comment_rate', 0, 5);
    num('follower_growth', 0, 10); num('viral_probability', 0, 1); num('bot_interaction', 0, 5); num('dm_per_day', 0, 50); num('story_reply_rate', 0, 5);
    num('ai_comment_share', 0, 1); num('ai_bot_share', 0, 1); num('ai_creativity', 0, 1.6); num('ai_daily_limit', 0, 20000); num('ai_monthly_limit', 0, 500000);
    num('max_population', 50, 50000); num('timezone_offset_min', -720, 840);
    for (const k of ['ai_enabled', 'auto_grow', 'ai_vision', 'reply_while_paused']) if (body[k] != null) this.setSetting(k, !!body[k]);
    if (Array.isArray(body.peak_hours)) this.setSetting('peak_hours', body.peak_hours.map(Number).filter(h => h >= 0 && h < 24).slice(0, 24));
    if (body.boundaries != null) this.setSetting('boundaries', cleanText(body.boundaries, 600));
    if (body.notif && typeof body.notif === 'object') this.setSetting('notif', Object.assign({}, this.cfg.notif, Object.fromEntries(Object.entries(body.notif).map(([k, v]) => [k, !!v]))));
    if (body.preset && body.preset.name) {
      const name = cleanText(body.preset.name, 40);
      const base = ARCHETYPES[body.preset.base] || ARCHETYPES['Warm Supporter'];
      const conf = Object.assign({}, base, { tone: cleanText(body.preset.tone || base.tone, 200), humor: clamp(+body.preset.humor || base.humor, 0, 1), friendliness: clamp(+body.preset.friendliness || base.friendliness, 0, 1), traits: [].concat(body.preset.traits || base.traits).map(s => cleanText(s, 30)).slice(0, 6) });
      this.run('INSERT INTO personality_configs(id,name,config,builtin,created_at) VALUES(?,?,?,0,?) ON CONFLICT(name) DO UPDATE SET config=excluded.config', uuid(), name, JSON.stringify(conf), now());
    }
    this.ensureAlarm(5000);
    return this.apiAdminSettings();
  }
  async apiAdminSim({ body }) {
    const a = body.action;
    const t = now();
    if (a === 'pause') { this.setSetting('sim_running', false); this.setOwnerSetting('paused_at', t); this.log('info', 'Simulation paused'); }
    else if (a === 'start' || a === 'resume') {
      const pausedAt = this.ownerSetting('paused_at', null);
      if (!this.cfg.sim_running && pausedAt) SIM.shiftQueue(this, t - pausedAt); // no burst of overdue activity after a pause
      this.setSetting('sim_running', true); this.setOwnerSetting('paused_at', null); this.log('info', 'Simulation resumed');
      await this.ensureAlarm(1000);
    } else if (a === 'clear_queue') {
      this.run("UPDATE simulation_events SET status='skipped', done_at=? WHERE status='pending'", t); this.log('warn', 'Event queue cleared');
    } else if (a === 'run_now') {
      await this.ensureAlarm(500);
    } else if (a === 'reset_world') {
      if (body.confirm !== 'RESET') fail(400, 'Type RESET to confirm');
      SIM.resetWorld(this);
    } else if (a === 'reset_settings') {
      this.run('DELETE FROM simulation_settings'); this.loadSettings();
    } else fail(400, 'Unknown action');
    return this.apiAdminOverview();
  }
  apiAdminGenerate({ body }) {
    const count = clamp(Math.round(Number(body.count) || 10), 1, 500);
    const total = this.val("SELECT COUNT(*) FROM accounts WHERE kind='virtual'");
    if (total + count > this.cfg.max_population) fail(400, `Population limit is ${this.cfg.max_population}. Raise it in settings first.`);
    const plan = Array.from({ length: count }, () => ({
      country: body.country || undefined, industry: body.industry || undefined, archetype: body.personality || undefined,
      activity: body.activity != null && body.activity !== '' ? Number(body.activity) : undefined,
      tier: body.tier || (body.industry === 'Community' ? 'fan' : undefined),
    }));
    let created;
    this.tx(() => { created = this.generateAccounts(plan, { followOwner: clamp(Number(body.follow_owner != null ? body.follow_owner : 0.35), 0, 1) }); });
    SIM.seedPostsFor(this, created.filter(p => p.tier !== 'fan'));
    this.log('info', `Generated ${created.length} accounts`);
    if (created.some(p => p.tier !== 'fan')) this.notify('recommendation', { actor: created.find(p => p.tier !== 'fan').id, text: 'New personalities just joined STARDOM' });
    return { created: created.length, accounts: created.slice(0, 50).map(p => ({ id: p.id, username: p.username, display_name: p.display_name, avatar: p.avatar, occupation: p.occupation, country: p.country })) };
  }
  apiAdminImport({ body }) {
    const list = Array.isArray(body.accounts) ? body.accounts.slice(0, 500) : fail(400, 'accounts[] required');
    const plan = list.map(x => ({ country: x.country, industry: x.industry, archetype: x.archetype || x.personality, activity: x.activity_level, tier: x.tier }));
    let created;
    this.tx(() => {
      created = this.generateAccounts(plan, { followOwner: 0.3 });
      created.forEach((p, i) => {
        const x = list[i] || {};
        const uname = x.username ? cleanText(x.username, 30).toLowerCase().replace(/[^a-z0-9._]/g, '') : '';
        if (uname && !this.one('SELECT 1 AS y FROM accounts WHERE username=?', uname)) this.run('UPDATE accounts SET username=? WHERE id=?', uname, p.id);
        if (x.display_name) this.run('UPDATE accounts SET display_name=? WHERE id=?', cleanText(x.display_name, 40), p.id);
        if (x.bio) this.run('UPDATE accounts SET bio=? WHERE id=?', cleanText(x.bio, 300), p.id);
        if (x.occupation) this.run('UPDATE accounts SET occupation=? WHERE id=?', cleanText(x.occupation, 60), p.id);
        if (x.description) this.run('UPDATE account_personalities SET description=? WHERE account_id=?', cleanText(x.description, 800) + ' (Fictional persona.)', p.id);
        if (Array.isArray(x.interests)) this.run('UPDATE account_personalities SET interests=? WHERE account_id=?', JSON.stringify(x.interests.map(s => cleanText(s, 30).toLowerCase()).slice(0, 10)), p.id);
      });
    });
    return { created: created.length };
  }
  apiAdminAccounts({ query }) {
    const s = '%' + (query.get('q') || '') + '%', st = query.get('status') || '';
    const offset = Math.max(0, Number(query.get('offset') || 0));
    const rows = this.q(`SELECT a.*, p.archetype FROM accounts a LEFT JOIN account_personalities p ON p.account_id=a.id WHERE a.kind='virtual' AND (a.username LIKE ? OR a.display_name LIKE ? OR a.occupation LIKE ? OR a.country LIKE ?) ${st ? 'AND a.status=?' : ''} ORDER BY a.created_at DESC LIMIT 50 OFFSET ?`, s, s, s, s, ...(st ? [st] : []), offset);
    return { accounts: rows.map(a => Object.assign(this.pubAccount(a, { relations: false }), { archetype: a.archetype, activity_level: a.activity_level, ai_status: a.ai_status })), total: this.val("SELECT COUNT(*) FROM accounts WHERE kind='virtual'"), next: rows.length === 50 ? offset + 50 : null };
  }
  apiAdminAccount({ params }) {
    const a = this.findAccount(params[0]);
    if (a.kind !== 'virtual') fail(400, 'Not a virtual account');
    const rels = this.q('SELECT r.*, CASE WHEN r.a_id=? THEN r.b_id ELSE r.a_id END AS other FROM relationships r WHERE r.a_id=? OR r.b_id=? ORDER BY r.strength DESC LIMIT 30', a.id, a.id, a.id);
    const acc = this.accountsById(rels.map(r => r.other));
    return {
      account: Object.assign(this.pubAccount(a), { activity_level: a.activity_level, ai_status: a.ai_status }),
      personality: this.personality(a.id),
      memories: this.q('SELECT * FROM character_memories WHERE account_id=? ORDER BY importance DESC, created_at DESC', a.id),
      summary: this.one('SELECT * FROM memory_summaries WHERE account_id=?', a.id),
      relationships: rels.map(r => ({ type: r.type, strength: Math.round(r.strength * 100) / 100, account: r.other === this.ownerId ? Object.assign(this.mini(this.owner()), { is_owner: true }) : this.mini(acc[r.other]) })),
      activity: this.q('SELECT verb, created_at, post_id, target_id FROM activity_history WHERE actor_id=? ORDER BY created_at DESC LIMIT 30', a.id),
      ai_calls: this.val('SELECT COUNT(*) FROM ai_interaction_logs WHERE account_id=?', a.id),
    };
  }
  apiAdminEditAccount({ params, body }) {
    const a = this.findAccount(params[0]);
    if (a.kind !== 'virtual') fail(400, 'Not a virtual account');
    if (body.status && ['active', 'inactive', 'blocked'].includes(body.status)) {
      this.run('UPDATE accounts SET status=? WHERE id=?', body.status, a.id);
      this.run('INSERT INTO moderation_logs(id,action,account_id,detail,created_at) VALUES(?,?,?,?,?)', uuid(), 'status:' + body.status, a.id, '', now());
      if (body.status !== 'active') this.run("UPDATE simulation_events SET status='skipped', done_at=? WHERE actor_id=? AND status='pending'", now(), a.id);
      if (body.status === 'blocked') { this.unfollow(a.id, this.ownerId); this.unfollow(this.ownerId, a.id); }
    }
    if (body.activity_level != null) this.run('UPDATE accounts SET activity_level=? WHERE id=?', clamp(+body.activity_level, 0.01, 1), a.id);
    for (const k of ['display_name', 'bio', 'occupation', 'city', 'country']) if (body[k] != null) this.run(`UPDATE accounts SET ${k}=? WHERE id=?`, cleanText(body[k], k === 'bio' ? 300 : 60), a.id);
    if (body.verified != null) this.run('UPDATE accounts SET verified=? WHERE id=?', body.verified ? 1 : 0, a.id);
    const p = body.personality;
    if (p && typeof p === 'object') {
      const cur = this.personality(a.id);
      if (p.archetype && ARCHETYPES[p.archetype] && p.archetype !== cur.archetype) {
        const A = ARCHETYPES[p.archetype];
        this.run('UPDATE account_personalities SET archetype=?, tone=?, traits=?, humor=?, friendliness=?, confidence=?, emoji_rate=?, initiation=?, emotion=? WHERE account_id=?', p.archetype, A.tone, JSON.stringify(A.traits), A.humor, A.friendliness, A.confidence, A.emoji, A.initiation, A.emotion, a.id);
      }
      for (const k of ['description', 'tone', 'style', 'boundaries', 'emotion']) if (p[k] != null) this.run(`UPDATE account_personalities SET ${k}=? WHERE account_id=?`, cleanText(p[k], 800), a.id);
      for (const k of ['humor', 'friendliness', 'confidence', 'emoji_rate', 'initiation']) if (p[k] != null) this.run(`UPDATE account_personalities SET ${k}=? WHERE account_id=?`, clamp(+p[k], 0, 1), a.id);
      for (const k of ['traits', 'interests']) if (Array.isArray(p[k])) this.run(`UPDATE account_personalities SET ${k}=? WHERE account_id=?`, JSON.stringify(p[k].map(s => cleanText(s, 30).toLowerCase()).filter(Boolean).slice(0, 10)), a.id);
      if (p.language && ['en', 'id', 'ms', 'ko'].includes(p.language)) this.run('UPDATE accounts SET language=? WHERE id=?', p.language, a.id);
      this.run('UPDATE account_personalities SET updated_at=? WHERE account_id=?', now(), a.id);
    }
    return this.apiAdminAccount({ params: [a.id] });
  }
  apiAdminDeleteAccount({ params }) {
    const a = this.findAccount(params[0]);
    if (a.kind !== 'virtual') fail(400, 'Only virtual accounts can be deleted');
    SIM.deleteAccounts(this, [a.id]);
    return { ok: true };
  }
  apiAdminResetMemory({ params }) {
    const a = this.findAccount(params[0]);
    this.run('DELETE FROM character_memories WHERE account_id=?', a.id);
    this.run('DELETE FROM memory_summaries WHERE account_id=?', a.id);
    return { ok: true };
  }
  apiAdminAddMemory({ params, body }) {
    const a = this.findAccount(params[0]);
    this.addMemory(a.id, body.kind || 'fact', body.content, body.importance != null ? body.importance : 0.7, 'owner');
    return this.apiAdminAccount({ params: [a.id] });
  }
  apiAdminDeleteMemory({ params }) { this.run('DELETE FROM character_memories WHERE id=?', params[0]); }
  apiAdminEvents({ query }) {
    const st = query.get('status') || 'pending';
    const rows = st === 'pending' ? this.q("SELECT * FROM simulation_events WHERE status='pending' ORDER BY due_at ASC LIMIT 80")
      : this.q('SELECT * FROM simulation_events WHERE status=? ORDER BY done_at DESC LIMIT 80', st);
    const acc = this.accountsById(rows.map(r => r.actor_id));
    const byType = this.q("SELECT type, COUNT(*) AS n FROM simulation_events WHERE status='pending' GROUP BY type");
    return { events: rows.map(e => { const p = parseJSON(e.payload, {}); return { id: e.id, type: e.type, status: e.status, due_at: e.due_at, done_at: e.done_at, attempts: e.attempts, error: e.error, actor: this.mini(acc[e.actor_id]), remaining: Array.isArray(p.items) ? p.items.length : null }; }), by_type: byType };
  }
  apiAdminLogs() {
    return {
      system: this.q('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT 60'),
      jobs: this.q('SELECT * FROM background_job_logs ORDER BY started_at DESC LIMIT 40'),
      ai: this.q('SELECT task, model, ok, ms, tokens_in, tokens_out, cached, error, created_at FROM ai_interaction_logs ORDER BY created_at DESC LIMIT 60'),
      moderation: this.q('SELECT * FROM moderation_logs ORDER BY created_at DESC LIMIT 40'),
    };
  }
  apiAdminExport() {
    return { exported_at: now(), accounts: this.q("SELECT a.username, a.display_name, a.bio, a.country, a.city, a.language, a.occupation, a.industry, a.tier, a.activity_level, p.archetype, p.description, p.interests FROM accounts a JOIN account_personalities p ON p.account_id=a.id WHERE a.kind='virtual' LIMIT 5000").map(r => Object.assign(r, { interests: parseJSON(r.interests, []) })) };
  }
}
