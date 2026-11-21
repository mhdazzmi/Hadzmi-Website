/* =========================================================
   STARDOM — Autonomous simulation engine
   - Lightweight actions (likes, views, follows) are probabilistic and never call AI.
   - High-volume actions are grouped into "waves" (one queue row holding many timed actions)
     to keep database writes low. Everything visible is backed by a stored record.
   - AI is used for contextual comments, DMs, story replies and memory summaries only.
   ========================================================= */
import { uuid, now, rnd, pick, chance, clamp, parseJSON, lognormal, expDelay, weightedSample, keywords, extractTags, randInt, shuffle } from './util.js';
import { templateComment, templateReply, botCaption, storyText, STORY_BGS, templateDm } from './text.js';
import { personaBlock } from './ai.js';
import { initialPlan } from './population.js';

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const HOUR_CURVE = [0.55, 0.35, 0.22, 0.16, 0.15, 0.25, 0.5, 0.78, 0.9, 0.92, 0.92, 1, 1.2, 1.12, 0.95, 0.92, 1, 1.1, 1.2, 1.38, 1.5, 1.5, 1.25, 0.85];
const REACTIVE = new Set(['dm_reply', 'summarize']);
const AI_PER_TICK = 8;

export function hourWeight(hub, t = now()) {
  const h = hub.hour(t);
  return HOUR_CURVE[h] * ((hub.cfg.peak_hours || []).includes(h) ? 1.3 : 1);
}
function poisson(lambda) {
  if (lambda <= 0) return 0;
  if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * (rnd() * 2 - 1)));
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
/** Human-like reaction delay: most people react within the hour, some hours or days later. */
function reactionDelay(activity = 0.5) {
  const r = rnd(), fast = 1.4 - activity;
  if (r < 0.55) return expDelay(22 * MIN * fast) + 20000;
  if (r < 0.87) return expDelay(3 * HOUR * fast) + 5 * MIN;
  return 6 * HOUR + rnd() * 42 * HOUR;
}
const overlap = (a, b) => { const s = new Set(a || []); let n = 0; for (const x of b || []) if (s.has(x)) n++; return n; };

export function enqueue(hub, type, { actor = null, target = null, post = null, payload = {}, due = now(), ttl = 3 * DAY, dedupe = null } = {}) {
  hub.run('INSERT OR IGNORE INTO simulation_events(id,type,actor_id,target_id,post_id,payload,due_at,expires_at,dedupe,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    uuid(), type, actor, target, post, JSON.stringify(payload), Math.round(due), Math.round(due + ttl), dedupe, now());
}
function budgetOk(hub, actorId) {
  if (hub.todayActions() >= hub.cfg.daily_action_limit) return false;
  if (!actorId) return true;
  const n = hub.val('SELECT COUNT(*) FROM activity_history WHERE actor_id=? AND day=?', actorId, hub.day());
  return n < hub.cfg.per_account_daily_limit;
}
function active(hub, id) { const a = hub.one('SELECT status FROM accounts WHERE id=?', id); return a && a.status === 'active'; }
function countAction(hub, t) { hub.bumpStat('actions', 1, t); }

// ============ Population wiring ============
export function wireAccounts(hub, created, followOwner) {
  const t = now(), oid = hub.ownerId;
  const stars = hub.q("SELECT a.id, a.industry, a.country, a.tier, p.interests FROM accounts a JOIN account_personalities p ON p.account_id=a.id WHERE a.kind='virtual' AND a.tier<>'fan' AND a.status='active'")
    .map(s => Object.assign(s, { interests: parseJSON(s.interests, []) }));
  for (const p of created) {
    if (p.tier === 'fan') {
      const cand = stars.filter(s => s.id !== p.id).map(s => ({ s, w: (1 + overlap(s.interests, p.interests)) * (s.country === p.country ? 2 : 1) * (s.tier === 'megastar' ? 3 : s.tier === 'star' ? 1.6 : 1) }));
      for (const x of weightedSample(cand, randInt(6, 24))) hub.follow(p.id, x.s.id, t);
    } else {
      const peers = stars.filter(s => s.id !== p.id).map(s => ({ s, w: (s.industry === p.industry ? 3 : 1) * (s.country === p.country ? 2.5 : 1) * (1 + overlap(s.interests, p.interests) * 0.5) }));
      for (const x of weightedSample(peers, randInt(2, 6))) {
        const s = x.s;
        const type = chance(0.03) ? 'rival' : s.industry === p.industry ? (chance(0.5) ? 'colleague' : 'professional') : s.country === p.country ? (chance(0.6) ? 'friend' : 'acquaintance') : 'acquaintance';
        hub.run('INSERT OR IGNORE INTO relationships(a_id,b_id,type,strength,created_at,updated_at) VALUES(?,?,?,?,?,?)', p.id, s.id, type, Math.round((type === 'friend' ? 0.5 + rnd() * 0.4 : type === 'rival' ? 0.2 : 0.2 + rnd() * 0.4) * 100) / 100, t, t);
        if (type !== 'rival' || chance(0.5)) { hub.follow(p.id, s.id, t); if (type === 'friend' || type === 'colleague' || chance(0.4)) hub.follow(s.id, p.id, t); }
      }
      for (const x of weightedSample(peers, randInt(2, 8))) hub.follow(p.id, x.s.id, t);
    }
    // Relationship with the owner
    const followP = p.tier === 'fan' ? followOwner : followOwner * 0.55;
    if (oid && chance(followP)) {
      hub.follow(p.id, oid, t - Math.floor(rnd() * 20 * DAY));
      const friend = p.tier !== 'fan' && chance(0.25);
      hub.run('INSERT OR IGNORE INTO relationships(a_id,b_id,type,strength,created_at,updated_at) VALUES(?,?,?,?,?,?)', p.id, oid, friend ? 'friend' : 'fan', friend ? 0.5 + rnd() * 0.2 : 0.08 + rnd() * 0.27, t, t);
    }
  }
}

function botMedia(seed, n) {
  const shape = pick([[1080, 1350], [1080, 1350], [1080, 1080], [1080, 1350], [1080, 720]]);
  return Array.from({ length: n }, (_, i) => ({ kind: 'image', url: `https://picsum.photos/seed/${seed}${i}/${shape[0]}/${shape[1]}`, thumb: `https://picsum.photos/seed/${seed}${i}/${Math.round(shape[0] / 2.4)}/${Math.round(shape[1] / 2.4)}`, width: shape[0], height: shape[1] }));
}

/** Create a post for a virtual account. backfill=true writes engagement immediately (initial world). */
export function createBotPost(hub, acc, t = now(), { backfill = false } = {}) {
  const per = hub.personality(acc.id) || { interests: [] };
  const { caption } = botCaption(acc, per.interests);
  const reel = chance(0.14);
  const id = uuid();
  const media = reel ? botMedia(id.slice(0, 8), 1).map(m => Object.assign(m, { url: m.url.replace(/\/\d+\/\d+$/, '/1080/1920'), thumb: m.thumb.replace(/\/\d+\/\d+$/, '/450/800'), width: 1080, height: 1920 })) : botMedia(id.slice(0, 8), chance(0.22) ? randInt(2, 4) : 1);
  const topics = [...new Set(extractTags(caption).concat(per.interests.slice(0, 3)))];
  hub.run('INSERT INTO posts(id,author_id,type,caption,location,audio,topics,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', id, acc.id, reel ? 'reel' : 'post', caption, chance(0.35) ? acc.city : '', reel ? `Original audio · ${acc.username}` : '', JSON.stringify(topics), t, t);
  media.forEach((m, i) => hub.run('INSERT INTO post_media(id,post_id,idx,kind,url,thumb,width,height) VALUES(?,?,?,?,?,?,?,?)', uuid(), id, i, m.kind, m.url, m.thumb, m.width, m.height));
  hub.run('UPDATE accounts SET post_count=post_count+1, last_active=MAX(COALESCE(last_active,0),?) WHERE id=?', t, acc.id);
  hub.setHashtags(id, caption, t);
  // Audience: in-universe followers, plus interested non-followers
  const followers = hub.q("SELECT a.id, a.activity_level, p.interests FROM follows f JOIN accounts a ON a.id=f.follower_id JOIN account_personalities p ON p.account_id=a.id WHERE f.followee_id=? AND a.status='active' AND a.kind='virtual'", acc.id);
  const rate = clamp(0.25 * (hub.cfg.bot_interaction || 1) * lognormal(0, 0.35), 0.03, 0.9);
  const likers = followers.filter(f => chance(rate * (0.5 + f.activity_level) * (1 + overlap(parseJSON(f.interests, []), topics) * 0.3)));
  const ownerFollows = !!hub.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', hub.ownerId, acc.id);
  if (backfill) {
    const span = Math.max(60000, now() - t);
    for (const l of likers) hub.like(id, l.id, t + Math.min(span, reactionDelay(l.activity_level)));
    for (const c of weightedSample(likers.map(l => ({ l, w: 1 })), Math.round(likers.length * 0.06) + (chance(0.5) ? 1 : 0))) {
      const a = hub.one('SELECT language FROM accounts WHERE id=?', c.l.id); const pc = hub.personality(c.l.id);
      hub.addComment(id, c.l.id, templateComment(a.language, pc, topics), null, 0, t + Math.min(span, reactionDelay(c.l.activity_level)));
    }
    if (reel) hub.run('UPDATE posts SET view_count=? WHERE id=?', Math.round(likers.length * (6 + rnd() * 10)), id);
  } else {
    if (likers.length) enqueue(hub, 'like_wave', { post: id, payload: { items: likers.map(l => [l.id, t + reactionDelay(l.activity_level)]).sort((a, b) => a[1] - b[1]), owner: false }, due: t + 20000, ttl: 3 * DAY });
    const nc = Math.round(likers.length * 0.06 * (hub.cfg.comment_rate || 1)) + (likers.length && chance(0.5) ? 1 : 0);
    for (const c of weightedSample(likers.map(l => ({ l, w: 1 })), nc)) enqueue(hub, 'comment_bot', { actor: c.l.id, post: id, due: t + reactionDelay(c.l.activity_level) + 2 * MIN, payload: { ai: chance(hub.cfg.ai_bot_share || 0) } });
    if (reel) enqueue(hub, 'counter_wave', { post: id, payload: { table: 'posts', field: 'view_count', remaining: Math.round(likers.length * (6 + rnd() * 10)), per: 8 }, due: t + MIN, ttl: 3 * DAY });
    // A close friend of the owner sometimes mentions the owner
    const rel = hub.relation(acc.id, hub.ownerId);
    if (rel && rel.strength > 0.5 && chance(0.12)) enqueue(hub, 'mention_owner', { actor: acc.id, post: id, due: t + 3 * MIN + rnd() * 30 * MIN });
    if (ownerFollows) countAction(hub, t);
  }
  return id;
}

function createBotStory(hub, acc, t = now()) {
  const id = uuid();
  const photo = chance(0.6);
  hub.run('INSERT INTO stories(id,author_id,kind,text,bg,caption,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)', id, acc.id, photo ? 'photo' : 'text', photo ? (chance(0.4) ? storyText(acc.language) : '') : storyText(acc.language), photo ? '' : pick(STORY_BGS), '', t, t + DAY);
  if (photo) hub.run('INSERT INTO story_media(id,story_id,kind,url,thumb) VALUES(?,?,?,?,?)', uuid(), id, 'image', `https://picsum.photos/seed/st${id.slice(0, 8)}/1080/1920`, `https://picsum.photos/seed/st${id.slice(0, 8)}/270/480`);
  const followers = hub.val('SELECT COUNT(*) FROM follows WHERE followee_id=?', acc.id) || 0;
  const views = Math.round(followers * (0.3 + rnd() * 0.4));
  if (views) enqueue(hub, 'counter_wave', { target: id, payload: { table: 'stories', field: 'view_count', remaining: views, per: 4 }, due: t + MIN, ttl: DAY });
  return id;
}

/** Initial world: posts & stories for public figures, owner follows a curated set. */
export function seedWorld(hub, created) {
  const t = now(), oid = hub.ownerId;
  seedPostsFor(hub, created.filter(p => p.tier !== 'fan'), true);
  const stars = hub.q("SELECT id, tier FROM accounts WHERE kind='virtual' AND tier<>'fan'");
  for (const s of weightedSample(stars.map(s => ({ s, w: s.tier === 'megastar' ? 3 : s.tier === 'star' ? 2 : 1 })), Math.min(32, stars.length))) hub.follow(oid, s.s.id, t - Math.floor(rnd() * 30 * DAY));
  for (const s of shuffle(stars).slice(0, Math.round(stars.length * 0.3))) {
    const acc = hub.account(s.id);
    createBotStory(hub, acc, t - Math.floor(rnd() * 20 * HOUR));
  }
  hub.notify('milestone', { text: `Welcome to STARDOM. ${created.length} virtual personalities now live in your universe.` });
}
export function seedPostsFor(hub, people, backfill = true) {
  const t = now();
  for (const p of people) {
    const acc = hub.account(p.id);
    const n = randInt(1, 3);
    for (let i = 0; i < n; i++) createBotPost(hub, acc, t - Math.floor(rnd() * 14 * DAY) - HOUR, { backfill });
  }
}

// ============ Owner-triggered reactions ============
function relMap(hub) {
  const o = hub.ownerId, m = {};
  for (const r of hub.q('SELECT a_id, b_id, type, strength FROM relationships WHERE a_id=? OR b_id=?', o, o)) m[r.a_id === o ? r.b_id : r.a_id] = r;
  return m;
}

export function onOwnerPost(hub, postId) {
  const cfg = hub.cfg, t = now(), oid = hub.ownerId;
  const post = hub.one('SELECT * FROM posts WHERE id=?', postId);
  const topics = parseJSON(post.topics, []);
  const owner = hub.owner();
  const F = owner.follower_count;
  if (!cfg.sim_running) return { scheduled: 0, paused: true };
  const rels = relMap(hub);
  const followers = hub.q("SELECT a.id, a.activity_level, a.tier, p.interests, p.friendliness, p.preferred_actions FROM follows f JOIN accounts a ON a.id=f.follower_id JOIN account_personalities p ON p.account_id=a.id WHERE f.followee_id=? AND a.status='active'", oid)
    .map(f => Object.assign(f, { interests: parseJSON(f.interests, []), prefs: parseJSON(f.preferred_actions, []) }));
  // Historical momentum: recent posts that did well lift reach slightly (consistency between posts)
  const recent = hub.q('SELECT like_count FROM posts WHERE author_id=? AND id<>? ORDER BY created_at DESC LIMIT 5', oid, postId);
  const avgRecent = recent.length ? recent.reduce((s, r) => s + r.like_count, 0) / recent.length : F * 0.35;
  const momentum = clamp(avgRecent / Math.max(1, F * 0.35), 0.75, 1.3);
  const quality = lognormal(0, 0.33);
  const hw = hourWeight(hub, t);
  const base = 0.34 * cfg.like_rate * quality * (0.8 + 0.25 * hw) * momentum;
  const viral = chance(cfg.viral_probability);
  const items = [];
  for (const f of followers) {
    const rel = rels[f.id];
    const w = (0.45 + f.activity_level) * (1 + overlap(f.interests, topics) * 0.45) * (1 + (rel ? rel.strength : 0) * 1.6);
    if (chance(clamp(base * w, 0, 0.97))) items.push([f.id, t + reactionDelay(f.activity_level) * (viral ? 0.7 : 1)]);
  }
  // Discovery via Explore (non-followers interested in the topics); much larger when viral
  const discover = Math.round(F * (viral ? 1.5 + rnd() * 2.5 : 0.04 + rnd() * 0.06) * cfg.like_rate);
  let newFollow = 0;
  if (discover > 0) {
    const pool = hub.q("SELECT a.id, a.activity_level, p.interests FROM accounts a JOIN account_personalities p ON p.account_id=a.id WHERE a.kind='virtual' AND a.status='active' AND a.id NOT IN (SELECT follower_id FROM follows WHERE followee_id=?) ORDER BY RANDOM() LIMIT ?", oid, Math.min(1500, discover * 3))
      .map(x => ({ x, w: (0.3 + x.activity_level) * (1 + overlap(parseJSON(x.interests, []), topics)) }));
    for (const { x } of weightedSample(pool, discover)) {
      const f = chance(viral ? 0.22 : 0.08);
      if (f) newFollow++;
      items.push([x.id, t + reactionDelay(x.activity_level) * (viral ? 0.6 : 1.4), f ? 'f' : '']);
    }
  }
  const budget = Math.max(0, cfg.daily_action_limit - hub.todayActions());
  const wave = items.sort((a, b) => a[1] - b[1]).slice(0, Math.max(5, Math.round(budget * 0.85)));
  if (viral) hub.run('UPDATE posts SET viral=1 WHERE id=?', postId);
  if (wave.length) enqueue(hub, 'like_wave', { post: postId, payload: { items: wave, owner: true }, due: wave[0][1], ttl: 4 * DAY });
  // Comments: friends and talkative personalities are more likely to comment
  const likerSet = new Set(wave.map(w => w[0]));
  const nComments = Math.round(wave.length * 0.075 * cfg.comment_rate * lognormal(0, 0.3)) + (wave.length > 3 ? 1 : 0);
  const pool = followers.filter(f => likerSet.has(f.id)).map(f => ({ f, w: (f.prefs.includes('comment') ? 2 : 0.7) * (1 + (rels[f.id] ? rels[f.id].strength * 3 : 0)) * (0.4 + f.friendliness) }));
  const commenters = weightedSample(pool, Math.min(nComments, 40));
  const dueOf = Object.fromEntries(wave.map(w => [w[0], w[1]]));
  for (const { f } of commenters) {
    enqueue(hub, 'comment_owner', { actor: f.id, post: postId, due: (dueOf[f.id] || t) + 30000 + rnd() * 15 * MIN, ttl: 4 * DAY, dedupe: `co:${postId}:${f.id}`,
      payload: { ai: cfg.ai_enabled && chance(cfg.ai_comment_share) } });
  }
  if (post.type === 'reel') enqueue(hub, 'counter_wave', { post: postId, payload: { table: 'posts', field: 'view_count', remaining: Math.round(wave.length * (4 + rnd() * 8)), per: 10, owner: true }, due: t + MIN, ttl: 4 * DAY });
  if (viral) enqueue(hub, 'viral_notice', { post: postId, due: t + 45 * MIN + rnd() * 60 * MIN });
  return { scheduled: wave.length, comments: commenters.length, viral, new_followers_expected: newFollow };
}

export function onOwnerStory(hub, storyId) {
  const cfg = hub.cfg, t = now(), oid = hub.ownerId;
  if (!cfg.sim_running) return;
  const rels = relMap(hub);
  const followers = hub.q("SELECT a.id, a.activity_level, p.preferred_actions, p.friendliness FROM follows f JOIN accounts a ON a.id=f.follower_id JOIN account_personalities p ON p.account_id=a.id WHERE f.followee_id=? AND a.status='active'", oid);
  const rate = clamp(0.42 * cfg.intensity * lognormal(0, 0.25), 0.05, 0.95);
  const items = [];
  for (const f of followers) {
    const rel = rels[f.id];
    if (!chance(clamp(rate * (0.5 + f.activity_level) * (1 + (rel ? rel.strength : 0)), 0, 0.98))) continue;
    const due = t + expDelay(100 * MIN * (1.4 - f.activity_level)) + 15000;
    if (due > t + 23 * HOUR) continue;
    items.push([f.id, due, chance(0.07) ? 'l' : '']);
    const prefs = parseJSON(f.preferred_actions, []);
    const pReply = 0.014 * cfg.story_reply_rate * (prefs.includes('story_reply') ? 2.5 : 1) * (1 + (rel ? rel.strength * 4 : 0));
    if (chance(pReply)) enqueue(hub, 'story_reply', { actor: f.id, target: storyId, due: due + 20000 + rnd() * 5 * MIN, ttl: DAY, dedupe: `sr:${storyId}:${f.id}` });
  }
  items.sort((a, b) => a[1] - b[1]);
  if (items.length) enqueue(hub, 'view_wave', { target: storyId, payload: { items }, due: items[0][1], ttl: DAY });
}

export function onOwnerFollow(hub, acc) {
  if (!hub.cfg.sim_running || acc.status !== 'active') return;
  if (hub.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', acc.id, hub.ownerId)) return;
  const per = hub.personality(acc.id) || { friendliness: 0.5, initiation: 0.2 };
  const p = { fan: 0.92, rising: 0.55, star: 0.22, megastar: 0.06 }[acc.tier] * (0.6 + per.friendliness * 0.6);
  if (chance(p)) {
    const due = now() + 40000 + reactionDelay(acc.activity_level) * 0.5;
    enqueue(hub, 'follow_back', { actor: acc.id, due, dedupe: `fb:${acc.id}:${hub.day()}` });
    if (chance(per.initiation * 0.6)) enqueue(hub, 'dm_open', { actor: acc.id, due: due + 2 * MIN + rnd() * 30 * MIN, payload: { reason: 'You just followed each other on STARDOM; say thanks for the follow in your own style.' } });
  }
}

export function onOwnerComment(hub, post, commentId, text, parent) {
  const oid = hub.ownerId, t = now();
  if (!hub.cfg.sim_running) return;
  const mentioned = [...text.matchAll(/@([a-z0-9._]{2,30})/gi)].map(m => m[1].toLowerCase());
  const targets = new Map();
  if (post.author_id !== oid) {
    hub.strengthen(post.author_id, oid, 0.015, 'fan');
    const a = hub.account(post.author_id), per = hub.personality(a.id);
    if (a.status === 'active') {
      const tierF = { fan: 1, rising: 0.8, star: 0.55, megastar: 0.3 }[a.tier] || 0.6;
      if (chance(0.55 * tierF + 0.2)) enqueue(hub, 'comment_like', { actor: a.id, target: commentId, post: post.id, due: t + reactionDelay(a.activity_level) * 0.4 });
      if (chance((0.2 + per.friendliness * 0.5) * tierF)) targets.set(a.id, 'author');
    }
  }
  if (parent && parent.author_id !== oid) {
    const replies = hub.val('SELECT COUNT(*) FROM comments WHERE parent_id=? AND author_id=?', parent.id, parent.author_id) || 0;
    const per = hub.personality(parent.author_id);
    if (replies < 2 && per && chance(0.35 + per.friendliness * 0.4)) targets.set(parent.author_id, 'thread');
    if (chance(0.6)) enqueue(hub, 'comment_like', { actor: parent.author_id, target: commentId, post: post.id, due: t + 30000 + rnd() * 20 * MIN });
    hub.strengthen(parent.author_id, oid, 0.02, 'fan');
  }
  for (const u of mentioned) {
    const a = hub.one("SELECT id, status FROM accounts WHERE username=? AND kind='virtual'", u);
    if (a && a.status === 'active' && chance(0.6)) targets.set(a.id, 'mention');
  }
  for (const [actor] of targets) {
    const a = hub.account(actor);
    enqueue(hub, 'comment_reply', { actor, target: commentId, post: post.id, due: t + 25000 + expDelay(8 * MIN * (1.5 - a.activity_level)), ttl: DAY, dedupe: `cr:${commentId}:${actor}` });
  }
}

export function scheduleDmReply(hub, convId) {
  const cfg = hub.cfg, t = now();
  if (!cfg.sim_running && !cfg.reply_while_paused) return;
  const conv = hub.one('SELECT * FROM conversations WHERE id=?', convId);
  const peer = conv && hub.account(conv.peer_id);
  if (!peer || peer.status !== 'active') return;
  const pending = hub.one("SELECT id, due_at FROM simulation_events WHERE type='dm_reply' AND target_id=? AND status='pending'", convId);
  if (pending) { // owner is still typing: let the character wait for the full thought
    const due = Math.max(pending.due_at, t + 3500);
    hub.run('UPDATE simulation_events SET due_at=? WHERE id=?', due, pending.id);
    hub.run('UPDATE conversations SET typing_until=? WHERE id=?', due + 30000, convId);
    return;
  }
  const [lo, hi] = { fan: [4, 12], rising: [5, 20], star: [6, 40], megastar: [10, 120] }[peer.tier] || [5, 30];
  const delay = (lo + rnd() * (hi - lo)) * 1000 * (1.3 - peer.activity_level * 0.5);
  const due = t + delay;
  hub.run('UPDATE conversations SET peer_read_at=?, typing_from=?, typing_until=? WHERE id=?', t + delay * 0.3, t + delay * 0.45, due + 30000, convId);
  enqueue(hub, 'dm_reply', { actor: peer.id, target: convId, due, ttl: DAY });
}

// ============ AI enrichment of a fresh owner post ============
export async function enrichPost(hub, postId) {
  const post = hub.one('SELECT * FROM posts WHERE id=?', postId);
  if (!post || !hub.aiAvailable()) return;
  const m = hub.one('SELECT * FROM post_media WHERE post_id=? ORDER BY idx LIMIT 1', postId);
  if (hub.cfg.ai_vision && m && hub.env.FILES) {
    const key = 'stardom/' + String(m.thumb || m.url).split('/').pop();
    const obj = await hub.env.FILES.get(key);
    if (obj && obj.size < 4 * 1024 * 1024 && /^image\//.test((obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg')) {
      const buf = new Uint8Array(await obj.arrayBuffer());
      let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      const d = await hub.aiCall('describe', { caption: post.caption, location: post.location }, { image: { mime: (obj.httpMetadata && obj.httpMetadata.contentType) || 'image/jpeg', data: btoa(s) } });
      if (d && d.description) {
        const topics = [...new Set(parseJSON(post.topics, []).concat((d.topics || []).map(x => String(x).toLowerCase().slice(0, 20))))].slice(0, 20);
        hub.run('UPDATE posts SET ai_desc=?, topics=? WHERE id=?', String(d.description).slice(0, 500), JSON.stringify(topics), postId);
      }
    }
  }
  await pregenComments(hub, postId);
}

async function pregenComments(hub, postId) {
  const evs = hub.q("SELECT id, actor_id, payload FROM simulation_events WHERE type='comment_owner' AND post_id=? AND status='pending'", postId)
    .filter(e => { const p = parseJSON(e.payload, {}); return p.ai && !p.text; });
  if (!evs.length) return;
  const post = hub.one('SELECT * FROM posts WHERE id=?', postId);
  const owner = hub.owner();
  for (let i = 0; i < evs.length; i += 8) {
    const chunk = evs.slice(i, i + 8);
    const people = chunk.map(e => {
      const a = hub.account(e.actor_id), p = hub.personality(e.actor_id), rel = hub.relation(e.actor_id, owner.id);
      const mems = hub.memoriesFor(e.actor_id, post.caption + ' ' + post.location + ' ' + (post.ai_desc || ''), 2);
      return { id: e.id, username: a.username, occupation: a.occupation, country: a.country, language: a.language, archetype: p.archetype, tone: p.tone, emoji_rate: p.emoji_rate, relation: rel ? `${rel.type} (${Math.round(rel.strength * 10)}/10)` : 'follower', memories: mems.join(' | ') };
    });
    const out = await hub.aiCall('comments', { owner: Object.assign({ is_owner: true }, owner), post: Object.assign({}, post, { tags: extractTags(post.caption) }), people, existing: [] }, { accountId: null });
    if (!out || !Array.isArray(out.comments)) return;
    for (const c of out.comments) {
      const ev = chunk.find(e => e.id === c.id);
      if (ev && c.text) hub.run('UPDATE simulation_events SET payload=? WHERE id=?', JSON.stringify({ ai: true, text: String(c.text).slice(0, 400) }), ev.id);
    }
  }
}

// ============ Event handlers ============
const H = {};

H.like_wave = (hub, ev, t) => {
  const p = parseJSON(ev.payload, { items: [] });
  const post = hub.one('SELECT id, author_id FROM posts WHERE id=?', ev.post_id);
  if (!post) return 'done';
  const ownerPost = post.author_id === hub.ownerId;
  let n = 0;
  while (p.items.length && p.items[0][1] <= t && n < 150) {
    const [actor, due, flag] = p.items.shift();
    n++;
    if (!active(hub, actor) || !budgetOk(hub, actor)) continue;
    if (hub.like(post.id, actor, Math.min(t, due))) {
      countAction(hub, t);
      hub.activity(actor, 'like', post.author_id, post.id, ownerPost, t);
      if (ownerPost) {
        hub.bumpStat('likes', 1, t); hub.bumpHour('likes', t);
        hub.notify('like', { actor, post: post.id, group: 'like:' + post.id });
      }
    }
    if (flag === 'f' && ownerPost && hub.follow(actor, hub.ownerId, t)) {
      hub.bumpStat('follows', 1, t); hub.notify('follow', { actor, group: 'follow:' + hub.day(t) });
      hub.strengthen(actor, hub.ownerId, 0.1, 'fan');
    }
  }
  if (!p.items.length) return 'done';
  hub.run('UPDATE simulation_events SET payload=?, due_at=? WHERE id=?', JSON.stringify(p), Math.max(p.items[0][1], t + 1000), ev.id);
  return 'keep';
};

H.view_wave = (hub, ev, t) => {
  const p = parseJSON(ev.payload, { items: [] });
  const s = hub.one('SELECT id, view_count FROM stories WHERE id=?', ev.target_id);
  if (!s) return 'done';
  let n = 0, views = s.view_count;
  const milestones = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  while (p.items.length && p.items[0][1] <= t && n < 200) {
    const [actor, , flag] = p.items.shift(); n++;
    if (!active(hub, actor) || !budgetOk(hub, actor)) continue;
    const w = hub.sql.exec('INSERT OR IGNORE INTO story_views(story_id,viewer_id,liked,created_at) VALUES(?,?,?,?)', s.id, actor, flag === 'l' ? 1 : 0, t).rowsWritten;
    if (!w) continue;
    views++;
    hub.run('UPDATE stories SET view_count=view_count+1 WHERE id=?', s.id);
    hub.bumpStat('story_views', 1, t); countAction(hub, t);
    hub.activity(actor, flag === 'l' ? 'story_like' : 'story_view', hub.ownerId, null, true, t);
    if (flag === 'l') hub.notify('story_like', { actor, story: s.id, group: 'storylike:' + s.id });
    if (milestones.includes(views)) hub.notify('story_view', { story: s.id, text: `Your story reached ${views} views` });
  }
  if (!p.items.length) return 'done';
  hub.run('UPDATE simulation_events SET payload=?, due_at=? WHERE id=?', JSON.stringify(p), Math.max(p.items[0][1], t + 1000), ev.id);
  return 'keep';
};

H.counter_wave = (hub, ev, t) => {
  const p = parseJSON(ev.payload, {});
  const table = p.table === 'stories' ? 'stories' : 'posts';
  const id = table === 'stories' ? ev.target_id : ev.post_id;
  if (!hub.one(`SELECT id FROM ${table} WHERE id=?`, id)) return 'done';
  const step = Math.min(p.remaining, Math.max(1, Math.round((p.per || 5) * (0.5 + rnd()) * hourWeight(hub, t))));
  hub.run(`UPDATE ${table} SET view_count=view_count+? WHERE id=?`, step, id);
  if (p.owner) hub.bumpStat('reel_views', step, t);
  p.remaining -= step;
  if (p.remaining <= 0) return 'done';
  hub.run('UPDATE simulation_events SET payload=?, due_at=? WHERE id=?', JSON.stringify(p), t + MIN * (1 + rnd() * 4), ev.id);
  return 'keep';
};

H.comment_owner = (hub, ev, t) => {
  const post = hub.one('SELECT * FROM posts WHERE id=?', ev.post_id);
  if (!post || post.comments_off || !active(hub, ev.actor_id) || !budgetOk(hub, ev.actor_id)) return 'done';
  const p = parseJSON(ev.payload, {});
  const a = hub.account(ev.actor_id), per = hub.personality(a.id);
  const text = p.text || templateComment(a.language, per, parseJSON(post.topics, []), hub.owner().display_name);
  const cid = hub.addComment(post.id, a.id, text, null, p.text ? 1 : 0, t);
  hub.bumpStat('comments', 1, t); hub.bumpHour('comments', t); countAction(hub, t);
  hub.activity(a.id, 'comment', hub.ownerId, post.id, true, t);
  hub.notify('comment', { actor: a.id, post: post.id, comment: cid, text });
  hub.strengthen(a.id, hub.ownerId, 0.01, 'fan');
  if (p.text) hub.run("UPDATE accounts SET ai_status='ai-active' WHERE id=?", a.id);
  // Occasionally another character replies to this comment (bot-to-bot on the owner's post)
  if (chance(0.1 * hub.cfg.bot_interaction)) {
    const other = hub.one("SELECT l.account_id FROM likes l JOIN accounts a ON a.id=l.account_id WHERE l.post_id=? AND l.account_id NOT IN (?,?) AND a.status='active' ORDER BY RANDOM() LIMIT 1", post.id, a.id, hub.ownerId);
    if (other) enqueue(hub, 'comment_bot_reply', { actor: other.account_id, target: cid, post: post.id, due: t + 2 * MIN + rnd() * 40 * MIN });
  }
  return 'done';
};

H.comment_bot = async (hub, ev, t) => {
  const post = hub.one('SELECT * FROM posts WHERE id=?', ev.post_id);
  if (!post || !active(hub, ev.actor_id) || !budgetOk(hub, ev.actor_id)) return 'done';
  const a = hub.account(ev.actor_id), per = hub.personality(a.id), topics = parseJSON(post.topics, []);
  let text = null, ai = 0;
  if (parseJSON(ev.payload, {}).ai && hub._tickAi < AI_PER_TICK && hub.aiAvailable()) {
    hub._tickAi++;
    const author = hub.account(post.author_id);
    const rel = hub.relation(a.id, author.id);
    const out = await hub.aiCall('comments', { owner: author, post: Object.assign({}, post, { tags: extractTags(post.caption) }), people: [{ id: a.id, username: a.username, occupation: a.occupation, country: a.country, language: a.language, archetype: per.archetype, tone: per.tone, emoji_rate: per.emoji_rate, relation: rel ? rel.type : 'follower' }], existing: [] }, { accountId: a.id });
    if (out && out.comments && out.comments[0] && out.comments[0].text) { text = String(out.comments[0].text).slice(0, 400); ai = 1; }
  }
  text = text || templateComment(a.language, per, topics);
  const cid = hub.addComment(post.id, a.id, text, null, ai, t);
  countAction(hub, t);
  hub.activity(a.id, 'comment', post.author_id, post.id, false, t);
  hub.strengthen(a.id, post.author_id, 0.01, 'acquaintance');
  if (chance(0.15)) enqueue(hub, 'comment_bot_reply', { actor: post.author_id, target: cid, post: post.id, due: t + 3 * MIN + rnd() * 60 * MIN });
  // Owner commented on this post earlier → relevant bot-to-bot activity
  if (hub.one('SELECT 1 AS x FROM comments WHERE post_id=? AND author_id=?', post.id, hub.ownerId) && chance(0.3)) hub.notify('bot', { actor: a.id, post: post.id, text: 'also commented on a post you commented on', group: 'botc:' + post.id });
  return 'done';
};

H.comment_bot_reply = (hub, ev, t) => {
  const c = hub.one('SELECT * FROM comments WHERE id=?', ev.target_id);
  if (!c || !active(hub, ev.actor_id) || !budgetOk(hub, ev.actor_id) || c.author_id === ev.actor_id) return 'done';
  if (c.parent_id) return 'done'; // no deep bot chains
  const n = hub.val('SELECT COUNT(*) FROM comments WHERE parent_id=?', c.id) || 0;
  if (n >= 3) return 'done';
  const a = hub.account(ev.actor_id), per = hub.personality(a.id), to = hub.account(c.author_id);
  hub.addComment(c.post_id, a.id, `@${to.username} ${templateReply(a.language, per)}`, c.id, 0, t);
  countAction(hub, t);
  hub.activity(a.id, 'reply', c.author_id, c.post_id, false, t);
  return 'done';
};

H.comment_reply = async (hub, ev, t) => {
  const c = hub.one('SELECT * FROM comments WHERE id=?', ev.target_id);
  const post = c && hub.one('SELECT * FROM posts WHERE id=?', c.post_id);
  if (!c || !post || !active(hub, ev.actor_id)) return 'done';
  const a = hub.account(ev.actor_id), per = hub.personality(a.id), owner = hub.owner();
  const rootId = c.parent_id || c.id;
  if ((hub.val('SELECT COUNT(*) FROM comments WHERE parent_id=? AND author_id=?', rootId, a.id) || 0) >= 3) return 'done'; // conversation length limit
  let text = null, ai = 0;
  if (hub._tickAi < AI_PER_TICK && hub.aiAvailable()) {
    hub._tickAi++;
    const thread = hub.q('SELECT c.text, a.username FROM comments c JOIN accounts a ON a.id=c.author_id WHERE c.id=? OR c.parent_id=? ORDER BY c.created_at ASC LIMIT 12', rootId, rootId).map(r => `@${r.username}: ${r.text}`).join('\n');
    const out = await hub.aiCall('commentReply', { persona: personaBlock(a, per), post: Object.assign({}, post, { mine: post.author_id === a.id }), thread, owner }, { accountId: a.id });
    if (out && out.text) { text = String(out.text).slice(0, 400); ai = 1; }
  }
  text = text || templateReply(a.language, per);
  if (!text.includes('@' + owner.username)) text = `@${owner.username} ${text}`;
  const cid = hub.addComment(post.id, a.id, text, rootId, ai, t);
  hub.activity(a.id, 'reply', hub.ownerId, post.id, true, t); countAction(hub, t);
  hub.notify('reply', { actor: a.id, post: post.id, comment: cid, text });
  hub.strengthen(a.id, owner.id, 0.02, 'fan');
  return 'done';
};

H.comment_like = (hub, ev, t) => {
  const c = hub.one('SELECT * FROM comments WHERE id=?', ev.target_id);
  if (!c || !active(hub, ev.actor_id)) return 'done';
  const w = hub.sql.exec('INSERT OR IGNORE INTO comment_likes(comment_id,account_id,created_at) VALUES(?,?,?)', c.id, ev.actor_id, t).rowsWritten;
  if (w) {
    hub.run('UPDATE comments SET like_count=like_count+1 WHERE id=?', c.id);
    if (c.author_id === hub.ownerId) hub.notify('comment_like', { actor: ev.actor_id, post: c.post_id, comment: c.id, text: c.text.slice(0, 80) });
    hub.activity(ev.actor_id, 'comment_like', c.author_id, c.post_id, c.author_id === hub.ownerId, t); countAction(hub, t);
  }
  return 'done';
};

H.mention_owner = (hub, ev, t) => {
  const post = hub.one('SELECT * FROM posts WHERE id=?', ev.post_id);
  if (!post || !active(hub, ev.actor_id)) return 'done';
  const a = hub.account(ev.actor_id), owner = hub.owner();
  const L = { en: ['wish you were here', 'we need to do this together soon', 'this reminded me of you', 'missing our hangouts'], id: ['coba kamu ikut', 'kapan-kapan bareng yuk', 'langsung inget kamu', 'kangen nongkrong'], ms: ['patut awak ikut', 'jom lepak nanti', 'teringat awak'], ko: ['wish you were here, fighting!', 'let\'s go together next time'] };
  const text = `@${owner.username} ${pick(L[a.language] || L.en)} ${pick(['✨', '🤍', '😆', ''])}`.trim();
  const cid = hub.addComment(post.id, a.id, text, null, 0, t);
  hub.notify('mention', { actor: a.id, post: post.id, comment: cid, text });
  hub.activity(a.id, 'mention', hub.ownerId, post.id, true, t); countAction(hub, t);
  return 'done';
};

H.follow_back = (hub, ev, t) => {
  if (!active(hub, ev.actor_id)) return 'done';
  if (hub.follow(ev.actor_id, hub.ownerId, t)) {
    hub.bumpStat('follows', 1, t); countAction(hub, t);
    hub.activity(ev.actor_id, 'follow', hub.ownerId, null, true, t);
    hub.notify('follow_back', { actor: ev.actor_id });
    hub.strengthen(ev.actor_id, hub.ownerId, 0.08, 'acquaintance');
  }
  return 'done';
};

H.viral_notice = (hub, ev) => {
  const post = hub.one('SELECT like_count FROM posts WHERE id=?', ev.post_id);
  if (post) hub.notify('milestone', { post: ev.post_id, text: 'Your post is trending in Explore. It\'s reaching people who don\'t follow you yet.' });
  return 'done';
};

function relationText(hub, accId) {
  const rel = hub.relation(accId, hub.ownerId);
  const follows = hub.one('SELECT 1 AS x FROM follows WHERE follower_id=? AND followee_id=?', accId, hub.ownerId);
  return rel ? `${rel.type.replace('_', ' ')} (closeness ${Math.round(rel.strength * 10)}/10)` : follows ? 'you follow the owner but have not talked much' : 'strangers';
}

H.dm_reply = async (hub, ev, t) => {
  const conv = hub.one('SELECT * FROM conversations WHERE id=?', ev.target_id);
  if (!conv) return 'done';
  const a = hub.account(conv.peer_id);
  if (!a || a.status !== 'active') { hub.run('UPDATE conversations SET typing_from=NULL, typing_until=NULL WHERE id=?', conv.id); return 'done'; }
  if (hub._tickAi >= AI_PER_TICK) return 'defer';
  const per = hub.personality(a.id), owner = hub.owner();
  const msgs = hub.q('SELECT * FROM (SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC LIMIT 16) ORDER BY created_at ASC', conv.id);
  const lastOwner = [...msgs].reverse().find(m => m.sender_id === owner.id);
  if (!lastOwner) return 'done';
  const postCache = {};
  const describe = m => {
    if (m.kind === 'image') return `[sent a photo]${m.text ? ' ' + m.text : ''}`;
    if (m.kind === 'post_share') { const p = postCache[m.ref_post] || (postCache[m.ref_post] = hub.one('SELECT p.caption, p.ai_desc, a.username FROM posts p JOIN accounts a ON a.id=p.author_id WHERE p.id=?', m.ref_post)); return `[shared a post by @${p ? p.username : 'unknown'}: "${p ? (p.caption || '').slice(0, 120) : 'deleted'}"${p && p.ai_desc ? ' showing ' + p.ai_desc.slice(0, 120) : ''}]${m.text ? ' ' + m.text : ''}`; }
    if (m.kind === 'story_reply') { const s = hub.one('SELECT kind, text, caption FROM stories WHERE id=?', m.ref_story); return `[replied to ${m.sender_id === owner.id ? 'your' : 'the owner\'s'} story${s && (s.text || s.caption) ? ' "' + (s.text || s.caption) + '"' : ''}] ${m.text}`; }
    return m.text;
  };
  const history = msgs.map(m => `${m.sender_id === owner.id ? '@' + owner.username + ' (owner)' : 'You'}: ${describe(m)}`).join('\n');
  const ownerRecent = msgs.filter(m => m.sender_id === owner.id).slice(-3).map(m => m.text).join(' ');
  let bubbles = null, reaction = null, ai = 0;
  if (hub.aiAvailable()) {
    hub._tickAi++;
    const summary = hub.one('SELECT summary FROM memory_summaries WHERE account_id=?', a.id);
    const rp = hub.one('SELECT caption, ai_desc, created_at FROM posts WHERE author_id=? ORDER BY created_at DESC LIMIT 1', owner.id);
    const out = await hub.aiCall('dm', {
      persona: personaBlock(a, per), owner, summary: summary && summary.summary, memories: hub.memoriesFor(a.id, ownerRecent, 8), history,
      recentPost: rp && t - rp.created_at < 3 * DAY ? `"${rp.caption}"${rp.ai_desc ? ' (' + rp.ai_desc + ')' : ''}` : '', relation: relationText(hub, a.id),
    }, { accountId: a.id });
    if (out && Array.isArray(out.reply) && out.reply.length) {
      bubbles = out.reply.map(s => String(s).trim()).filter(Boolean).slice(0, 3); ai = 1;
      reaction = out.reaction && out.reaction !== 'none' ? out.reaction : null;
      for (const m of (out.memories || []).slice(0, 4)) hub.addMemory(a.id, m.kind, m.content, m.importance, 'dm');
      hub.run("UPDATE accounts SET ai_status='ai-active' WHERE id=?", a.id);
    }
  }
  if (!bubbles || !bubbles.length) {
    bubbles = [lastOwner.kind === 'story_reply' ? templateDm(a.language, 'story') : templateDm(a.language, 'reply')];
    if (chance(0.15)) reaction = '❤️';
  }
  if (reaction) hub.run('INSERT INTO message_reactions(message_id,account_id,emoji,created_at) VALUES(?,?,?,?) ON CONFLICT(message_id,account_id) DO UPDATE SET emoji=excluded.emoji', lastOwner.id, a.id, reaction, t);
  bubbles.forEach((b, i) => hub.insertMessage(conv, a.id, { text: b.slice(0, 1000), ai }, t + i * 1400));
  hub.run('UPDATE conversations SET peer_read_at=?, typing_from=NULL, typing_until=NULL WHERE id=?', t, conv.id);
  hub.activity(a.id, 'dm', owner.id, null, true, t);
  hub.strengthen(a.id, owner.id, 0.02, 'acquaintance');
  maybeSummarize(hub, a.id, conv.id);
  return 'done';
};

H.dm_open = async (hub, ev, t) => {
  const a = hub.account(ev.actor_id);
  if (!a || a.status !== 'active') return 'done';
  const conv = hub.conversationWith(a.id);
  if (!conv || conv.bot_streak >= 2) return 'done';
  if (conv.last_message_at && t - conv.last_message_at < 6 * HOUR) return 'done';
  const per = hub.personality(a.id), owner = hub.owner();
  const reason = parseJSON(ev.payload, {}).reason || 'Say hi and share something related to your interests.';
  let text = null, ai = 0;
  if (hub._tickAi < AI_PER_TICK && hub.aiAvailable()) {
    hub._tickAi++;
    const summary = hub.one('SELECT summary FROM memory_summaries WHERE account_id=?', a.id);
    const out = await hub.aiCall('dmOpen', { persona: personaBlock(a, per), owner, summary: summary && summary.summary, memories: hub.memoriesFor(a.id, reason, 5), reason, relation: relationText(hub, a.id) }, { accountId: a.id });
    if (out && out.message) { text = String(out.message).slice(0, 600); ai = 1; }
  }
  text = text || templateDm(a.language, /follow/i.test(reason) ? 'follow' : 'open');
  hub.insertMessage(conv, a.id, { text, ai }, t);
  hub.notify('dm', { actor: a.id, text: text.slice(0, 80) });
  hub.activity(a.id, 'dm_open', owner.id, null, true, t); countAction(hub, t);
  return 'done';
};

H.story_reply = async (hub, ev, t) => {
  const s = hub.one('SELECT * FROM stories WHERE id=?', ev.target_id);
  if (!s || s.expires_at < t || !active(hub, ev.actor_id)) return 'done';
  const a = hub.account(ev.actor_id), per = hub.personality(a.id), owner = hub.owner();
  const media = hub.one('SELECT * FROM story_media WHERE story_id=?', s.id);
  const desc = s.kind === 'text' ? `a text story saying "${s.text}"` : `a ${s.kind === 'video' ? 'video' : 'photo'} story${s.caption || s.text ? ' with caption "' + (s.caption || s.text) + '"' : ''}`;
  let text = null, ai = 0;
  if (hub._tickAi < AI_PER_TICK && hub.aiAvailable()) {
    hub._tickAi++;
    const out = await hub.aiCall('storyReply', { persona: personaBlock(a, per), owner, story: desc, memories: hub.memoriesFor(a.id, s.text + ' ' + s.caption, 3) }, { accountId: a.id });
    if (out && out.message) { text = String(out.message).slice(0, 400); ai = 1; }
  }
  text = text || templateDm(a.language, 'story');
  const conv = hub.conversationWith(a.id);
  if (!conv) return 'done';
  const mid = hub.insertMessage(conv, a.id, { kind: 'story_reply', text, ref_story: s.id, story_thumb: media ? media.thumb || media.url : null, ai }, t);
  hub.run('INSERT INTO story_replies(id,story_id,account_id,message_id,created_at) VALUES(?,?,?,?,?)', uuid(), s.id, a.id, mid, t);
  hub.run('UPDATE stories SET reply_count=reply_count+1 WHERE id=?', s.id);
  hub.notify('story_reply', { actor: a.id, story: s.id, text: text.slice(0, 80) });
  hub.activity(a.id, 'story_reply', owner.id, null, true, t); countAction(hub, t);
  hub.strengthen(a.id, owner.id, 0.02, 'fan');
  return 'done';
};

function maybeSummarize(hub, accId, convId) {
  const sm = hub.one('SELECT through_at FROM memory_summaries WHERE account_id=?', accId);
  const n = hub.val('SELECT COUNT(*) FROM messages WHERE conversation_id=? AND created_at>?', convId, sm ? sm.through_at : 0) || 0;
  if (n >= 40) enqueue(hub, 'summarize', { actor: accId, target: convId, due: now() + 5000, dedupe: `sum:${convId}:${Math.floor(now() / HOUR)}` });
}
H.summarize = async (hub, ev, t) => {
  const a = hub.account(ev.actor_id);
  if (!a || !hub.aiAvailable()) return 'done';
  if (hub._tickAi >= AI_PER_TICK) return 'defer';
  hub._tickAi++;
  const sm = hub.one('SELECT * FROM memory_summaries WHERE account_id=?', a.id);
  const msgs = hub.q('SELECT * FROM messages WHERE conversation_id=? AND created_at>? ORDER BY created_at ASC', ev.target_id, sm ? sm.through_at : 0);
  if (msgs.length < 20) return 'done';
  const keep = msgs.slice(0, msgs.length - 12); // keep the most recent messages verbatim
  const owner = hub.owner();
  const out = await hub.aiCall('summary', { name: a.display_name, previous: sm && sm.summary, transcript: keep.map(m => `${m.sender_id === owner.id ? 'Owner' : a.display_name}: ${m.text}`).join('\n').slice(0, 9000) }, { accountId: a.id });
  if (out && out.summary) hub.run('INSERT INTO memory_summaries(account_id,summary,through_at,message_count,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET summary=excluded.summary, through_at=excluded.through_at, message_count=memory_summaries.message_count+excluded.message_count, updated_at=excluded.updated_at',
    a.id, String(out.summary).slice(0, 1500), keep[keep.length - 1].created_at, keep.length, t);
  return 'done';
};

// ============ Spontaneous world activity ============
function spontaneous(hub, t) {
  const cfg = hub.cfg, oid = hub.ownerId;
  if (hub.todayActions() >= cfg.daily_action_limit) return 0;
  const hw = hourWeight(hub, t), mult = cfg.intensity * hw;
  if (!hub._starCount || hub._starCountAt < t - 10 * MIN) { hub._starCount = hub.val("SELECT COUNT(*) FROM accounts WHERE kind='virtual' AND tier<>'fan' AND status='active'") || 0; hub._starCountAt = t; }
  let actions = 0;
  // 1. Virtual public figures publish posts
  for (let i = poisson(hub._starCount * 0.45 / 1440 * mult * cfg.bot_interaction); i > 0; i--) {
    const acc = hub.one("SELECT * FROM accounts WHERE kind='virtual' AND tier<>'fan' AND status='active' AND activity_level>=? ORDER BY RANDOM() LIMIT 1", rnd() * 0.8);
    if (acc && budgetOk(hub, acc.id)) { createBotPost(hub, acc, t); hub.activity(acc.id, 'post', null, null, false, t); countAction(hub, t); actions++; }
  }
  // 2. Stories
  for (let i = poisson(hub._starCount * 0.3 / 1440 * mult); i > 0; i--) {
    const acc = hub.one("SELECT * FROM accounts WHERE kind='virtual' AND tier<>'fan' AND status='active' AND activity_level>=? ORDER BY RANDOM() LIMIT 1", rnd() * 0.8);
    if (acc && !hub.one('SELECT 1 AS x FROM stories WHERE author_id=? AND created_at>?', acc.id, t - 4 * HOUR)) { createBotStory(hub, acc, t); hub.activity(acc.id, 'story', null, null, false, t); countAction(hub, t); actions++; }
  }
  // 3. Owner follower growth (more when the owner has posted recently)
  const recentPosts = hub.val('SELECT COUNT(*) FROM posts WHERE author_id=? AND created_at>?', oid, t - 2 * DAY) || 0;
  for (let i = poisson(18 * cfg.follower_growth / 1440 * mult * (1 + recentPosts * 0.35)); i > 0; i--) {
    let cand = hub.q("SELECT a.id, a.activity_level FROM accounts a WHERE a.kind='virtual' AND a.status='active' AND a.id NOT IN (SELECT follower_id FROM follows WHERE followee_id=?) ORDER BY RANDOM() LIMIT 40", oid);
    if (cand.length < 5 && cfg.auto_grow) {
      const total = hub.val("SELECT COUNT(*) FROM accounts WHERE kind='virtual'");
      if (total + 25 <= cfg.max_population) {
        hub.generateAccounts(Array.from({ length: 25 }, () => ({ industry: 'Community', tier: 'fan' })), { followOwner: 0 });
        hub.log('info', 'Audience saturated — generated 25 new community accounts');
        cand = hub.q("SELECT a.id, a.activity_level FROM accounts a WHERE a.kind='virtual' AND a.status='active' AND a.id NOT IN (SELECT follower_id FROM follows WHERE followee_id=?) ORDER BY RANDOM() LIMIT 40", oid);
      }
    }
    const pickd = weightedSample(cand.map(c => ({ c, w: 0.3 + c.activity_level })), 1)[0];
    if (pickd && hub.follow(pickd.c.id, oid, t)) {
      hub.bumpStat('follows', 1, t); countAction(hub, t); actions++;
      hub.activity(pickd.c.id, 'follow', oid, null, true, t);
      hub.notify('follow', { actor: pickd.c.id, group: 'follow:' + hub.day(t) });
      hub.run('INSERT OR IGNORE INTO relationships(a_id,b_id,type,strength,created_at,updated_at) VALUES(?,?,?,?,?,?)', pickd.c.id, oid, 'fan', 0.1 + rnd() * 0.2, t, t);
    }
  }
  // 4. Occasional unfollows (low-affinity followers)
  for (let i = poisson(18 * cfg.follower_growth / 1440 * mult * 0.07); i > 0; i--) {
    const f = hub.one("SELECT f.follower_id FROM follows f LEFT JOIN relationships r ON r.a_id=f.follower_id AND r.b_id=f.followee_id WHERE f.followee_id=? AND COALESCE(r.strength,0)<0.2 ORDER BY RANDOM() LIMIT 1", oid);
    if (f && hub.unfollow(f.follower_id, oid)) { hub.bumpStat('unfollows', 1, t); hub.activity(f.follower_id, 'unfollow', oid, null, true, t); countAction(hub, t); actions++; }
  }
  // 5. Bot-to-bot follows / unfollows (graph keeps evolving)
  for (let i = poisson(12 / 1440 * mult * cfg.bot_interaction); i > 0; i--) {
    const a = hub.one("SELECT id, country FROM accounts WHERE kind='virtual' AND status='active' ORDER BY RANDOM() LIMIT 1");
    const b = a && hub.one("SELECT id FROM accounts WHERE kind='virtual' AND tier<>'fan' AND status='active' AND id<>? AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id=?) ORDER BY (country=?) DESC, RANDOM() LIMIT 1", a.id, a.id, a.country);
    if (b && hub.follow(a.id, b.id, t)) { hub.activity(a.id, 'follow', b.id, null, false, t); countAction(hub, t); actions++; }
  }
  if (chance(2 / 1440 * mult * cfg.bot_interaction)) {
    const f = hub.one("SELECT f.follower_id, f.followee_id FROM follows f JOIN accounts a ON a.id=f.follower_id WHERE a.kind='virtual' AND f.followee_id<>? ORDER BY RANDOM() LIMIT 1", oid);
    if (f && hub.unfollow(f.follower_id, f.followee_id)) { hub.activity(f.follower_id, 'unfollow', f.followee_id, null, false, t); actions++; }
  }
  // 6. Characters start DMs with the owner (rate-limited, relationship-driven)
  const dmToday = hub.val("SELECT COUNT(*) FROM activity_history WHERE day=? AND verb='dm_open'", hub.day(t)) || 0;
  const hasPendingOpen = hub.one("SELECT id FROM simulation_events WHERE type='dm_open' AND status='pending' LIMIT 1");
  if (!hasPendingOpen && dmToday < cfg.dm_per_day && chance(cfg.dm_per_day / (15 * 60) * hw)) {
    const cands = hub.q(`SELECT a.id, a.activity_level, p.initiation, r.strength FROM relationships r JOIN accounts a ON a.id=r.a_id JOIN account_personalities p ON p.account_id=a.id
      WHERE r.b_id=? AND a.status='active' AND (r.strength>=0.3 OR p.initiation>=0.3) ORDER BY RANDOM() LIMIT 60`, oid)
      .filter(c => { const cv = hub.one('SELECT last_message_at, bot_streak FROM conversations WHERE peer_id=?', c.id); return !cv || (cv.bot_streak < 2 && (!cv.last_message_at || t - cv.last_message_at > 12 * HOUR)); });
    const c = weightedSample(cands.map(c => ({ c, w: c.strength * 2 + c.initiation + c.activity_level * 0.5 })), 1)[0];
    if (c) {
      const post = hub.one('SELECT id, caption, ai_desc FROM posts WHERE author_id=? AND created_at>? ORDER BY created_at DESC LIMIT 1', oid, t - DAY);
      const mem = hub.one("SELECT content FROM character_memories WHERE account_id=? AND kind IN ('event','topic') ORDER BY importance DESC, created_at DESC LIMIT 1", c.c.id);
      const story = hub.one('SELECT text, caption, kind FROM stories WHERE author_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 1', oid, t);
      const per = hub.personality(c.c.id);
      const reason = post && chance(0.5) ? `The owner recently posted: "${post.caption}"${post.ai_desc ? ' — the photo shows ' + post.ai_desc : ''}. React to it or ask about it.`
        : mem && chance(0.6) ? `Follow up on something you remember: ${mem.content}`
        : story ? `The owner has a ${story.kind} story up${story.text || story.caption ? ': "' + (story.text || story.caption) + '"' : ''}.`
        : `Share something about your day related to ${pick(per.interests || ['life'])} and ask how the owner is doing.`;
      enqueue(hub, 'dm_open', { actor: c.c.id, due: t + 5000, payload: { reason } });
    }
  }
  // 7. Explore discovery: non-followers find the owner's recent posts (long-tail likes)
  for (let i = poisson(5 / 1440 * mult * cfg.like_rate); i > 0; i--) {
    const p = hub.one('SELECT id FROM posts WHERE author_id=? AND created_at>? ORDER BY RANDOM() LIMIT 1', oid, t - 14 * DAY);
    const a = p && hub.one("SELECT id FROM accounts WHERE kind='virtual' AND status='active' AND id NOT IN (SELECT account_id FROM likes WHERE post_id=?) ORDER BY RANDOM() LIMIT 1", p.id);
    if (a && hub.like(p.id, a.id, t)) { hub.bumpStat('likes', 1, t); hub.bumpHour('likes', t); hub.activity(a.id, 'like', oid, p.id, true, t); hub.notify('like', { actor: a.id, post: p.id, group: 'like:' + p.id }); countAction(hub, t); actions++; }
  }
  return actions;
}

function housekeeping(hub, t) {
  const o = hub.owner();
  hub.run('INSERT INTO engagement_statistics(day, owner_followers) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET owner_followers=excluded.owner_followers', hub.day(t), o.follower_count);
  const oldStories = hub.q('SELECT id FROM stories WHERE author_id<>? AND highlight IS NULL AND expires_at<? LIMIT 200', o.id, t - 2 * DAY);
  if (oldStories.length) hub.run(`DELETE FROM stories WHERE id IN (${hub.inList(oldStories)})`, ...oldStories.map(s => s.id));
  hub.run("DELETE FROM simulation_events WHERE status<>'pending' AND done_at<?", t - 3 * DAY);
  hub.run("UPDATE simulation_events SET status='skipped', done_at=?, error='expired' WHERE status='pending' AND expires_at<?", t, t);
  hub.run('DELETE FROM activity_history WHERE created_at<?', t - 120 * DAY);
  hub.run('DELETE FROM ai_interaction_logs WHERE created_at<?', t - 90 * DAY);
  hub.run('DELETE FROM ai_cache WHERE created_at<?', t - 30 * DAY);
  hub.run('DELETE FROM background_job_logs WHERE started_at<?', t - 7 * DAY);
  hub.run('DELETE FROM system_logs WHERE created_at<?', t - 30 * DAY);
  hub.run('DELETE FROM notifications WHERE created_at<?', t - 120 * DAY);
  // bot posts older than 60 days that nobody (owner) interacted with are archived to keep the DB lean
  const old = hub.q("SELECT p.id FROM posts p WHERE p.author_id<>? AND p.created_at<? AND NOT EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.account_id=?) AND NOT EXISTS(SELECT 1 FROM bookmarks b WHERE b.post_id=p.id) AND NOT EXISTS(SELECT 1 FROM comments c WHERE c.post_id=p.id AND c.author_id=?) LIMIT 100", o.id, t - 60 * DAY, o.id, o.id);
  for (const p of old) { hub.setHashtags(p.id, ''); hub.run('UPDATE accounts SET post_count=MAX(0,post_count-1) WHERE id=(SELECT author_id FROM posts WHERE id=?)', p.id); hub.run('DELETE FROM posts WHERE id=?', p.id); }
}

/** One scheduler pass. Returns ms until the next run, or null to sleep until poked. */
export async function tick(hub) {
  const t0 = now(), cfg = hub.cfg;
  const running = !!cfg.sim_running;
  hub._tickAi = 0;
  let processed = 0, failed = 0, spont = 0;
  const due = hub.q("SELECT * FROM simulation_events WHERE status='pending' AND due_at<=? ORDER BY due_at ASC LIMIT 80", t0);
  for (const ev of due) {
    if (!running && !(REACTIVE.has(ev.type) && cfg.reply_while_paused)) continue;
    if (ev.expires_at < t0) { hub.run("UPDATE simulation_events SET status='skipped', done_at=?, error='expired' WHERE id=?", t0, ev.id); continue; }
    const fn = H[ev.type];
    if (!fn) { hub.run("UPDATE simulation_events SET status='failed', done_at=?, error='unknown type' WHERE id=?", t0, ev.id); failed++; continue; }
    try {
      const r = await fn(hub, ev, now());
      if (r === 'defer') hub.run('UPDATE simulation_events SET due_at=? WHERE id=?', now() + 15000, ev.id);
      else if (r !== 'keep') hub.run("UPDATE simulation_events SET status='done', done_at=? WHERE id=?", now(), ev.id);
      processed++;
    } catch (e) {
      failed++;
      const attempts = ev.attempts + 1;
      if (attempts >= 3) hub.run("UPDATE simulation_events SET status='failed', attempts=?, error=?, done_at=? WHERE id=?", attempts, String(e && e.message || e).slice(0, 300), now(), ev.id);
      else hub.run('UPDATE simulation_events SET attempts=?, error=?, due_at=? WHERE id=?', attempts, String(e && e.message || e).slice(0, 300), now() + 30000 * Math.pow(2, attempts), ev.id);
      console.error('event', ev.type, e && e.stack || e);
    }
    if (now() - t0 > 25000) break; // keep each pass short
  }
  if (running && (!hub._lastSpont || t0 - hub._lastSpont >= 55000)) {
    hub._lastSpont = t0;
    spont = spontaneous(hub, t0);
  }
  const hk = hub.ownerSetting('hk_at', 0);
  if (t0 - hk > 30 * MIN) { housekeeping(hub, t0); hub.setOwnerSetting('hk_at', t0); }
  if (processed || failed || spont) hub.run('INSERT INTO background_job_logs(id,job,started_at,ms,processed,failed,note) VALUES(?,?,?,?,?,?,?)', uuid(), 'tick', t0, now() - t0, processed + spont, failed, running ? '' : 'paused');
  else if (running && (!hub._lastBeat || t0 - hub._lastBeat > 10 * MIN)) { hub._lastBeat = t0; hub.run('INSERT INTO background_job_logs(id,job,started_at,ms,processed,failed,note) VALUES(?,?,?,?,?,?,?)', uuid(), 'tick', t0, now() - t0, 0, 0, 'idle'); }
  const next = hub.val("SELECT MIN(due_at) FROM simulation_events WHERE status='pending'" + (running ? '' : " AND type IN ('dm_reply','summarize')"));
  if (running) return clamp((next || t0 + 60000) - now(), 1000, 60000);
  return next ? clamp(next - now(), 1000, 3600000) : null;
}

export function shiftQueue(hub, ms) {
  if (!(ms > 0)) return;
  hub.run("UPDATE simulation_events SET due_at=due_at+?, expires_at=expires_at+? WHERE status='pending' AND type NOT IN ('dm_reply','summarize')", ms, ms);
  for (const ev of hub.q("SELECT id, payload FROM simulation_events WHERE status='pending' AND type IN ('like_wave','view_wave')")) {
    const p = parseJSON(ev.payload, {});
    if (Array.isArray(p.items)) { p.items.forEach(it => { it[1] += ms; }); hub.run('UPDATE simulation_events SET payload=? WHERE id=?', JSON.stringify(p), ev.id); }
  }
}

/** Remove accounts and keep every counter consistent with the remaining records. */
export function deleteAccounts(hub, ids) {
  if (!ids.length) return;
  hub.tx(() => {
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80), L = hub.inList(chunk);
      hub.run(`DELETE FROM notifications WHERE actor_id IN (${L})`, ...chunk);
      hub.run(`UPDATE simulation_events SET status='skipped', done_at=? WHERE status='pending' AND actor_id IN (${L})`, now(), ...chunk);
      hub.run(`DELETE FROM accounts WHERE id IN (${L})`, ...chunk);
    }
    hub.run('UPDATE posts SET like_count=(SELECT COUNT(*) FROM likes l WHERE l.post_id=posts.id), comment_count=(SELECT COUNT(*) FROM comments c WHERE c.post_id=posts.id)');
    hub.run('UPDATE comments SET like_count=(SELECT COUNT(*) FROM comment_likes x WHERE x.comment_id=comments.id)');
    hub.run('UPDATE accounts SET follower_count=(SELECT COUNT(*) FROM follows f WHERE f.followee_id=accounts.id), following_count=(SELECT COUNT(*) FROM follows f WHERE f.follower_id=accounts.id)');
    hub.run('UPDATE hashtags SET post_count=(SELECT COUNT(*) FROM post_hashtags h WHERE h.tag=hashtags.tag)');
  });
  hub.log('warn', `Deleted ${ids.length} virtual account(s)`);
}

export function resetWorld(hub) {
  const ids = hub.q("SELECT id FROM accounts WHERE kind='virtual'").map(r => r.id);
  hub.run("UPDATE simulation_events SET status='skipped', done_at=? WHERE status='pending'", now());
  deleteAccounts(hub, ids);
  hub.tx(() => {
    hub.run('DELETE FROM activity_history'); hub.run('DELETE FROM engagement_statistics'); hub.run('DELETE FROM hourly_engagement'); hub.run('DELETE FROM notifications');
    const created = hub.generateAccounts(initialPlan(400), { followOwner: 0.42, initial: true });
    seedWorld(hub, created);
  });
  hub.log('warn', 'World reset: new population generated');
}
