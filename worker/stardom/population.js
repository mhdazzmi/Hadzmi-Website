/* STARDOM — virtual population generator.
   Every persona is FICTIONAL. Names are random combinations; no account represents a real person. */
import { uuid, rnd, pick, randInt, chance, clamp, lognormal, shuffle } from './util.js';

export const REGIONS = {
  ID: { country: 'Indonesia', lang: [['id', 0.8], ['en', 0.2]], cities: ['Jakarta', 'Bandung', 'Surabaya', 'Yogyakarta', 'Bali', 'Medan', 'Makassar', 'Semarang', 'Malang'],
    first: { f: ['Ayu', 'Putri', 'Nadia', 'Rina', 'Sari', 'Dewi', 'Laras', 'Citra', 'Anisa', 'Kirana', 'Maudy', 'Tasya', 'Salsa', 'Intan', 'Febby', 'Raisa', 'Nabila', 'Alya', 'Shania', 'Wulan'],
             m: ['Dimas', 'Raka', 'Bima', 'Arya', 'Fajar', 'Reza', 'Rizky', 'Adit', 'Bayu', 'Gilang', 'Iqbal', 'Rangga', 'Dika', 'Yoga', 'Kevin', 'Andre', 'Farel', 'Daffa', 'Naufal', 'Rafi'] },
    last: ['Pratama', 'Lestari', 'Wijaya', 'Saputra', 'Hidayat', 'Kusuma', 'Santoso', 'Permata', 'Nugroho', 'Anjani', 'Halim', 'Siregar', 'Utami', 'Firmansyah', 'Maharani', 'Wibowo', 'Puspita', 'Gunawan', 'Ramadhan', 'Setiawan'] },
  MY: { country: 'Malaysia', lang: [['ms', 0.65], ['en', 0.35]], cities: ['Kuala Lumpur', 'Penang', 'Johor Bahru', 'Kota Kinabalu', 'Melaka', 'Ipoh', 'Kuching', 'Shah Alam'],
    first: { f: ['Aisyah', 'Nurul', 'Siti', 'Farah', 'Mira', 'Liyana', 'Hana', 'Sofea', 'Mei Ling', 'Priya', 'Aina', 'Balqis', 'Qistina', 'Zara'],
             m: ['Haziq', 'Amir', 'Faiz', 'Izzat', 'Hakim', 'Danial', 'Aiman', 'Wei Jie', 'Arjun', 'Syafiq', 'Irfan', 'Zul', 'Harith', 'Luqman'] },
    last: ['Rahman', 'Ismail', 'Abdullah', 'Hassan', 'Tan', 'Lim', 'Aziz', 'Yusof', 'Kamal', 'Razak', 'Nair', 'Omar', 'Zainal', 'Chong'] },
  US: { country: 'United States', lang: [['en', 1]], cities: ['Los Angeles', 'New York', 'Miami', 'Austin', 'Chicago', 'Nashville', 'San Francisco', 'Atlanta', 'Seattle'],
    first: { f: ['Ava', 'Madison', 'Harper', 'Chloe', 'Brooke', 'Taylor', 'Jordan', 'Riley', 'Skylar', 'Kennedy', 'Savannah', 'Paige', 'Quinn', 'Sienna'],
             m: ['Mason', 'Logan', 'Caleb', 'Tyler', 'Austin', 'Jaden', 'Cole', 'Hunter', 'Blake', 'Wyatt', 'Grant', 'Miles', 'Easton', 'Reid'] },
    last: ['Carter', 'Brooks', 'Hayes', 'Reed', 'Monroe', 'Sullivan', 'Bennett', 'Foster', 'Coleman', 'Parker', 'Wells', 'Hart', 'Lane', 'Archer'] },
  KR: { country: 'South Korea', lang: [['ko', 0.7], ['en', 0.3]], cities: ['Seoul', 'Busan', 'Incheon', 'Daegu', 'Jeju'],
    first: { f: ['Ji-woo', 'Seo-yeon', 'Ha-eun', 'Min-ji', 'Yu-na', 'Soo-ah', 'Ye-rin', 'Da-hye', 'Chae-won', 'Na-rae'],
             m: ['Min-jun', 'Seo-jun', 'Do-yoon', 'Ji-ho', 'Hyun-woo', 'Tae-yang', 'Jun-seo', 'Woo-jin', 'Sung-min', 'Ha-joon'] },
    last: ['Kim', 'Lee', 'Park', 'Choi', 'Jung', 'Kang', 'Yoon', 'Han', 'Shin', 'Seo'] },
  JP: { country: 'Japan', lang: [['en', 1]], cities: ['Tokyo', 'Osaka', 'Kyoto', 'Fukuoka', 'Sapporo', 'Yokohama'],
    first: { f: ['Yui', 'Hina', 'Aoi', 'Sakura', 'Rin', 'Mei', 'Haruka', 'Nanami', 'Akari', 'Mio'],
             m: ['Haruto', 'Ren', 'Sora', 'Yuto', 'Kaito', 'Riku', 'Takumi', 'Kenta', 'Daiki', 'Shun'] },
    last: ['Sato', 'Tanaka', 'Takahashi', 'Nakamura', 'Kobayashi', 'Yamamoto', 'Mori', 'Ishikawa', 'Fujita', 'Okada'] },
  EU: { country: ['United Kingdom', 'France', 'Italy', 'Spain', 'Germany', 'Netherlands', 'Sweden'], lang: [['en', 1]],
    cities: { 'United Kingdom': ['London', 'Manchester', 'Edinburgh'], France: ['Paris', 'Lyon', 'Nice'], Italy: ['Milan', 'Rome', 'Florence'], Spain: ['Madrid', 'Barcelona', 'Seville'], Germany: ['Berlin', 'Munich', 'Hamburg'], Netherlands: ['Amsterdam', 'Rotterdam'], Sweden: ['Stockholm', 'Gothenburg'] },
    first: { f: ['Amelie', 'Chiara', 'Lucia', 'Freya', 'Elena', 'Clara', 'Isla', 'Margot', 'Giulia', 'Astrid', 'Ines', 'Lena'],
             m: ['Luca', 'Mateo', 'Felix', 'Hugo', 'Oliver', 'Lorenzo', 'Matthias', 'Theo', 'Alessio', 'Lars', 'Julien', 'Finn'] },
    last: ['Rossi', 'Moreau', 'Fischer', 'Bianchi', 'Garcia', 'Laurent', 'Hughes', 'de Vries', 'Lindqvist', 'Romano', 'Dubois', 'Weber'] },
  BR: { country: 'Brazil', lang: [['en', 1]], cities: ['Rio de Janeiro', 'São Paulo', 'Salvador'],
    first: { f: ['Larissa', 'Beatriz', 'Camila', 'Manuela'], m: ['Thiago', 'Rafael', 'Gustavo', 'Enzo'] },
    last: ['Silva', 'Costa', 'Oliveira', 'Almeida', 'Ribeiro'] },
};
export const REGION_KEYS = Object.keys(REGIONS);
export const COUNTRIES = [...new Set(REGION_KEYS.flatMap(k => [].concat(REGIONS[k].country)))];

/** Industries → occupations, interests and the region bias used by the directory categories. */
export const INDUSTRIES = {
  'Film & TV': { jobs: ['Actor', 'Actress', 'Film Director', 'Screenwriter', 'Series Star'], interests: ['film', 'fashion', 'travel', 'coffee', 'books', 'art'] },
  'Music': { jobs: ['Singer', 'Rapper', 'DJ', 'Music Producer', 'Songwriter', 'Idol Group Member', 'Guitarist'], interests: ['music', 'fashion', 'nightlife', 'travel', 'art', 'coffee'] },
  'Fashion': { jobs: ['Model', 'Fashion Designer', 'Stylist', 'Runway Model', 'Creative Director'], interests: ['fashion', 'beauty', 'luxury', 'travel', 'art', 'photography'] },
  'Creators': { jobs: ['Lifestyle Creator', 'Travel Vlogger', 'Beauty Creator', 'Food Creator', 'Gaming Streamer', 'Comedy Creator', 'Fitness Creator', 'Photographer'], interests: ['travel', 'food', 'beauty', 'gaming', 'fitness', 'photography', 'coffee', 'tech'] },
  'Sports': { jobs: ['Footballer', 'Badminton Player', 'Tennis Player', 'Basketball Player', 'MMA Fighter', 'Surfer', 'Racing Driver', 'Marathon Runner'], interests: ['fitness', 'football', 'badminton', 'cars', 'nature', 'food'] },
  'Business': { jobs: ['Entrepreneur', 'Startup Founder', 'Investor', 'Restaurateur', 'Hotelier', 'Tech CEO'], interests: ['business', 'tech', 'travel', 'luxury', 'books', 'design'] },
  'Media': { jobs: ['Journalist', 'TV Host', 'Podcaster', 'News Anchor', 'Radio Host', 'Film Critic'], interests: ['books', 'film', 'coffee', 'travel', 'tech', 'music'] },
  'Fictional': { jobs: ['Space Explorer', 'Royal Heir of Aurelia', 'Mystery Novelist', 'Celebrity Chef', 'Retired Spy', 'Time-Traveling Historian', 'Deep-Sea Researcher', 'Pop Diva'], interests: ['travel', 'books', 'art', 'food', 'nature', 'tech', 'luxury'] },
  'Community': { jobs: ['Student', 'Designer', 'Nurse', 'Barista', 'Engineer', 'Teacher', 'Photographer', 'Office Worker', 'Fan Account', 'Content Lover', 'Architect', 'Chef'], interests: ['music', 'film', 'travel', 'food', 'kpop', 'football', 'coffee', 'fashion', 'gaming', 'pets'] },
};
export const INDUSTRY_KEYS = Object.keys(INDUSTRIES);
export const ALL_INTERESTS = ['travel', 'food', 'fashion', 'music', 'film', 'fitness', 'football', 'badminton', 'tech', 'photography', 'art', 'beauty', 'cars', 'gaming', 'books', 'nature', 'coffee', 'nightlife', 'family', 'business', 'design', 'kpop', 'anime', 'beach', 'luxury', 'pets', 'cooking'];

/** Directory categories requested in the product spec (fictional personas only). */
export const CATEGORIES = [
  { key: 'indonesian', label: 'Indonesian Celebrities', region: 'ID', industries: ['Film & TV', 'Music', 'Creators'] },
  { key: 'malaysian', label: 'Malaysian Celebrities', region: 'MY', industries: ['Film & TV', 'Music', 'Creators'] },
  { key: 'hollywood', label: 'Hollywood & American Entertainment', region: 'US', industries: ['Film & TV', 'Music', 'Media'] },
  { key: 'korean', label: 'Korean Entertainment', region: 'KR', industries: ['Music', 'Film & TV', 'Fashion'] },
  { key: 'japanese', label: 'Japanese Entertainment', region: 'JP', industries: ['Music', 'Film & TV', 'Creators'] },
  { key: 'european', label: 'European Entertainment', region: 'EU', industries: ['Film & TV', 'Fashion', 'Music'] },
  { key: 'musicians', label: 'International Musicians', industries: ['Music'] },
  { key: 'actors', label: 'Actors & Actresses', industries: ['Film & TV'] },
  { key: 'models', label: 'Models & Fashion', industries: ['Fashion'] },
  { key: 'creators', label: 'Influencers & Creators', industries: ['Creators'] },
  { key: 'athletes', label: 'Athletes', industries: ['Sports'] },
  { key: 'entrepreneurs', label: 'Entrepreneurs', industries: ['Business'] },
  { key: 'media', label: 'Journalists & Media', industries: ['Media'] },
  { key: 'fictional', label: 'Fictional Public Figures', industries: ['Fictional'] },
];

/** Personality archetypes: drive tone, humour, emoji use, initiative and preferred actions. */
export const ARCHETYPES = {
  'Warm Supporter': { tone: 'warm and encouraging', humor: 0.3, friendliness: 0.9, confidence: 0.5, emoji: 0.7, initiation: 0.35, emotion: 'expressive', traits: ['kind', 'loyal', 'encouraging'], actions: ['like', 'comment', 'story_reply', 'dm'] },
  'Witty Joker': { tone: 'playful, teasing and funny', humor: 0.9, friendliness: 0.7, confidence: 0.7, emoji: 0.6, initiation: 0.3, emotion: 'playful', traits: ['funny', 'quick-witted', 'sarcastic'], actions: ['comment', 'like', 'story_reply'] },
  'Hype Fan': { tone: 'excited, all caps energy, very enthusiastic', humor: 0.5, friendliness: 0.95, confidence: 0.6, emoji: 0.95, initiation: 0.25, emotion: 'very expressive', traits: ['enthusiastic', 'devoted', 'loud'], actions: ['like', 'comment', 'follow'] },
  'Thoughtful Critic': { tone: 'articulate, thoughtful, asks good questions', humor: 0.3, friendliness: 0.55, confidence: 0.8, emoji: 0.15, initiation: 0.2, emotion: 'reserved', traits: ['analytical', 'curious', 'honest'], actions: ['comment', 'dm'] },
  'Chill Minimalist': { tone: 'laid-back, short and calm', humor: 0.4, friendliness: 0.6, confidence: 0.6, emoji: 0.3, initiation: 0.1, emotion: 'calm', traits: ['relaxed', 'low-key', 'observant'], actions: ['like', 'story_view'] },
  'Glamorous Diva': { tone: 'confident, glamorous, a little dramatic', humor: 0.5, friendliness: 0.5, confidence: 0.95, emoji: 0.8, initiation: 0.2, emotion: 'dramatic', traits: ['stylish', 'bold', 'dramatic'], actions: ['like', 'comment', 'story_reply'] },
  'Professional Networker': { tone: 'polite, professional, constructive', humor: 0.2, friendliness: 0.65, confidence: 0.75, emoji: 0.2, initiation: 0.3, emotion: 'measured', traits: ['ambitious', 'polite', 'strategic'], actions: ['comment', 'dm', 'follow'] },
  'Shy Admirer': { tone: 'shy, sweet, short messages', humor: 0.2, friendliness: 0.8, confidence: 0.2, emoji: 0.6, initiation: 0.05, emotion: 'gentle', traits: ['shy', 'sweet', 'attentive'], actions: ['like', 'story_view'] },
  'Curious Traveler': { tone: 'curious, adventurous, asks about places', humor: 0.5, friendliness: 0.75, confidence: 0.6, emoji: 0.5, initiation: 0.35, emotion: 'upbeat', traits: ['adventurous', 'curious', 'open-minded'], actions: ['comment', 'dm', 'story_reply'] },
  'Motivational Coach': { tone: 'motivating, positive, uplifting', humor: 0.3, friendliness: 0.85, confidence: 0.85, emoji: 0.55, initiation: 0.3, emotion: 'upbeat', traits: ['disciplined', 'positive', 'driven'], actions: ['comment', 'like', 'dm'] },
  'Sarcastic Bestie': { tone: 'dry humour, honest, bestie energy', humor: 0.85, friendliness: 0.65, confidence: 0.75, emoji: 0.35, initiation: 0.35, emotion: 'dry', traits: ['honest', 'teasing', 'loyal'], actions: ['comment', 'story_reply', 'dm'] },
  'Mysterious Artist': { tone: 'poetic, minimal, slightly mysterious', humor: 0.2, friendliness: 0.45, confidence: 0.6, emoji: 0.2, initiation: 0.1, emotion: 'introspective', traits: ['creative', 'private', 'poetic'], actions: ['like', 'comment'] },
};
export const ARCHETYPE_KEYS = Object.keys(ARCHETYPES);

const TIERS = {
  // sim_followers lognormal params, activity, verification probability
  megastar: { mu: Math.log(12e6), s: 0.8, act: [0.25, 0.6], ver: 1 },
  star: { mu: Math.log(1.2e6), s: 0.7, act: [0.35, 0.75], ver: 0.95 },
  rising: { mu: Math.log(90e3), s: 0.8, act: [0.45, 0.9], ver: 0.35 },
  fan: { mu: Math.log(600), s: 1.0, act: [0.3, 1.0], ver: 0 },
};

const weighted = pairs => { let r = rnd(), acc = 0; for (const [v, w] of pairs) { acc += w; if (r <= acc) return v; } return pairs[pairs.length - 1][0]; };
const slug = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function makeUsername(first, last, tier, taken) {
  const f = slug(first), l = slug(last);
  const opts = tier === 'fan'
    ? [`${f}.${l}`, `${f}_${l}${randInt(1, 99)}`, `${f}${l}`, `its${f}`, `${f}.${pick(['daily', 'vibes', 'world', 'stan', 'xo', 'diaries'])}`, `${f}${randInt(90, 2009)}`]
    : [`${f}${l}`, `${f}.${l}`, `real${f}${l}`, `${f}${l}official`, `${f}_${l}`, `${f}${pick(['', 'theartist', 'official', 'tv', 'world'])}`];
  for (const u of shuffle(opts)) { const name = u.slice(0, 28); if (name.length >= 3 && !taken.has(name)) { taken.add(name); return name; } }
  let n; do { n = `${f}${l}`.slice(0, 22) + randInt(100, 99999); } while (taken.has(n));
  taken.add(n); return n;
}

const DICEBEAR_STYLES = ['notionists', 'lorelei', 'adventurer', 'micah', 'avataaars-neutral'];
const BG = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'e8f5e9', 'fde68a', 'e0e7ff'];
export const avatarUrl = (seed, style) => `https://api.dicebear.com/9.x/${style || pick(DICEBEAR_STYLES)}/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${pick(BG)}`;

function bioFor(p) {
  const em = { 'Film & TV': '🎬', Music: '🎤', Fashion: '👗', Creators: '📸', Sports: '🏆', Business: '💼', Media: '🎙️', Fictional: '✨', Community: '🌿' }[p.industry] || '✨';
  const i1 = p.interests[0], i2 = p.interests[1];
  const bits = {
    en: [`${p.occupation} ${em} ${p.city}`, `${i1} & ${i2} enthusiast`, `${p.occupation} • ${p.city} • ${i1} lover`, `living for ${i1}, ${i2} and good people`, `${em} ${p.occupation} based in ${p.city}`],
    id: [`${p.occupation} ${em} ${p.city}`, `suka ${i1} & ${i2}`, `${p.occupation} • ${p.city} • pecinta ${i1}`, `hidup untuk ${i1} dan ${i2} ✨`],
    ms: [`${p.occupation} ${em} ${p.city}`, `minat ${i1} & ${i2}`, `${p.occupation} • ${p.city}`, `${i1} • ${i2} • ${p.city}`],
    ko: [`${p.occupation} ${em} ${p.city}`, `${i1} & ${i2} 💜`, `${p.occupation} • ${p.city} • fighting!`],
  }[p.language] || [];
  const line = pick(bits.length ? bits : [`${p.occupation} ${em}`]);
  const extra = p.tier === 'fan' ? pick(['', '', '📍' + p.city, 'dm for collab', 'just here for the vibes']) : pick(['Management: inquiries via DM', 'New project soon ✨', '', 'Simulated persona on STARDOM']);
  return [line, extra].filter(Boolean).join('\n');
}

function describe(p, a) {
  return `${p.display_name} is a fictional ${p.occupation.toLowerCase()} from ${p.city}, ${p.country}. Personality: ${p.archetype} — ${a.traits.join(', ')}. Talks in a ${a.tone} way. Loves ${p.interests.slice(0, 3).join(', ')}.`;
}

/**
 * Build one fictional persona (no DB writes). opts: { region, industry, archetype, activity, tier, country }
 */
export function buildPersona(opts, taken) {
  let regionKey = opts.region && REGIONS[opts.region] ? opts.region : null;
  if (!regionKey && opts.country) regionKey = REGION_KEYS.find(k => [].concat(REGIONS[k].country).includes(opts.country)) || null;
  if (!regionKey) regionKey = weighted([['ID', 0.32], ['MY', 0.12], ['US', 0.16], ['KR', 0.12], ['JP', 0.08], ['EU', 0.15], ['BR', 0.05]]);
  const R = REGIONS[regionKey];
  const country = opts.country && [].concat(R.country).includes(opts.country) ? opts.country : pick([].concat(R.country));
  const city = pick(Array.isArray(R.cities) ? R.cities : R.cities[country]);
  const industry = opts.industry && INDUSTRIES[opts.industry] ? opts.industry : pick(INDUSTRY_KEYS);
  const tier = opts.tier || (industry === 'Community' ? 'fan' : weighted([['megastar', 0.12], ['star', 0.38], ['rising', 0.5]]));
  const sex = chance(0.5) ? 'f' : 'm';
  let occupation = pick(INDUSTRIES[industry].jobs);
  if (occupation === 'Actor' && sex === 'f') occupation = 'Actress';
  if (occupation === 'Actress' && sex === 'm') occupation = 'Actor';
  const first = pick(R.first[sex]), last = pick(R.last);
  const display_name = regionKey === 'KR' || regionKey === 'JP' ? (chance(0.5) ? `${last} ${first}` : `${first} ${last}`) : `${first} ${last}`;
  const language = weighted(R.lang);
  const archetype = opts.archetype && ARCHETYPES[opts.archetype] ? opts.archetype : pick(ARCHETYPE_KEYS);
  const A = ARCHETYPES[archetype];
  const interests = [...new Set(shuffle(INDUSTRIES[industry].interests).slice(0, 3).concat(shuffle(ALL_INTERESTS).slice(0, randInt(1, 3))))];
  if (regionKey === 'KR' && chance(0.5) && !interests.includes('kpop')) interests.push('kpop');
  const T = TIERS[tier];
  const act = opts.activity != null ? clamp(Number(opts.activity), 0.05, 1) : T.act[0] + rnd() * (T.act[1] - T.act[0]);
  const sim_followers = Math.round(clamp(lognormal(T.mu, T.s), tier === 'fan' ? 20 : 5000, 250e6));
  const sim_following = tier === 'fan' ? randInt(80, 1800) : randInt(40, 1500);
  const username = makeUsername(first, last, tier, taken);
  const p = {
    id: uuid(), kind: 'virtual', username, display_name, avatar: avatarUrl(username), country, city, language, occupation, industry,
    region: regionKey, tier, verified: chance(T.ver) ? 1 : 0, sim_followers, sim_following, activity_level: Math.round(act * 100) / 100,
    interests, archetype,
  };
  p.category = categoryFor(p);
  p.bio = bioFor(p);
  const jitter = v => clamp(v + (rnd() - 0.5) * 0.2, 0, 1);
  p.personality = {
    archetype, description: describe(p, A), traits: A.traits, interests, topics: interests.slice(0, 4), tone: A.tone,
    style: language === 'id' ? 'casual Indonesian (bahasa gaul), sometimes words like "kak", "banget", "sih"'
      : language === 'ms' ? 'casual Malaysian Malay (e.g. "lah", "best gila", "cantik sangat")'
      : language === 'ko' ? 'English with light Korean-inspired expressions (e.g. "daebak", "fighting!", "omo")'
      : 'casual English',
    humor: jitter(A.humor), friendliness: jitter(A.friendliness), confidence: jitter(A.confidence), emoji_rate: jitter(A.emoji),
    initiation: jitter(A.initiation), emotion: A.emotion,
    boundaries: 'Stays respectful and platonic. Never claims to be a real person. Avoids politics and explicit content.',
    preferred_actions: A.actions,
  };
  return p;
}

export function categoryFor(p) {
  if (p.industry === 'Community') return 'community';
  if (p.industry === 'Fictional') return 'fictional';
  const reg = { ID: 'indonesian', MY: 'malaysian', US: 'hollywood', KR: 'korean', JP: 'japanese', EU: 'european' }[p.region];
  if (reg && ['Film & TV', 'Music', 'Creators', 'Media', 'Fashion'].includes(p.industry)) return reg;
  return { Music: 'musicians', 'Film & TV': 'actors', Fashion: 'models', Creators: 'creators', Sports: 'athletes', Business: 'entrepreneurs', Media: 'media' }[p.industry] || 'creators';
}

/** Initial population plan: a cast of public figures across every category plus a fan audience. */
export function initialPlan(total = 260) {
  const plan = [];
  const stars = Math.round(total * 0.3);
  for (let i = 0; i < stars; i++) {
    const c = CATEGORIES[i % CATEGORIES.length];
    plan.push({ region: c.region, industry: pick(c.industries) });
  }
  for (let i = plan.length; i < total; i++) plan.push({ industry: 'Community', tier: 'fan' });
  return plan;
}
