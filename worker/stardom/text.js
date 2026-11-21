/* STARDOM — template text used when AI is disabled, over budget, or for lightweight bot-to-bot chatter.
   Templates are combined from parts so comments rarely repeat exactly. */
import { pick, chance, rnd } from './util.js';

const EMO = ['😍', '🔥', '✨', '😭', '🙌', '💯', '❤️', '🥹', '👏', '💫', '🤍', '😮‍💨'];
const C = {
  en: {
    generic: ['This is everything', 'Obsessed with this', 'Okay this is stunning', 'The vibes are immaculate', 'Can\'t stop looking at this', 'Love this so much', 'Absolutely beautiful', 'You never miss', 'Iconic as always', 'This made my day', 'So good', 'Major main character energy', 'Need more of this', 'Frame this'],
    question: ['Where is this?', 'How was it?', 'What camera do you use?', 'When are you dropping more?', 'Is this recent?', 'Teach me your ways'],
    travel: ['Adding this to my bucket list', 'Take me with you next time', 'Where is this place??', 'Wanderlust activated', 'The views!!'],
    food: ['Now I\'m hungry', 'Recipe please', 'That looks delicious', 'Save me a bite'],
    fashion: ['The fit is insane', 'Who are you wearing?', 'Styling on point', 'Fashion icon behaviour'],
    music: ['On repeat', 'Need this on Spotify', 'Your voice tho', 'Goosebumps'],
    fitness: ['Discipline goals', 'Motivation unlocked', 'Strong!!'],
    hype: ['LET\'S GOOO', 'SCREAMING', 'NO BECAUSE THIS IS SO GOOD', 'MOTHER', 'I\'M NOT OKAY'],
    witty: ['Leave some talent for the rest of us', 'Illegal to look this good on a Tuesday', 'My phone just got 10% prettier', 'Okay show off'],
    calm: ['nice', 'beautiful', 'love', 'good one', 'peaceful'],
    pro: ['Great work, congrats!', 'Beautifully executed', 'Love the direction here', 'Congrats on this, well deserved'],
  },
  id: {
    generic: ['Cakep banget', 'Keren parah', 'Suka banget sama ini', 'Vibes-nya dapet banget', 'Gemes banget', 'Kece abis', 'Selalu keren', 'Bagus bangeet', 'Auto save', 'Aesthetic parah'],
    question: ['Ini di mana kak?', 'Kapan nih?', 'Pakai kamera apa kak?', 'Seru gak kak?', 'Spill dong kak'],
    travel: ['Pengen ke sana juga', 'Ajak dong kak', 'Ini di mana sih? cakep bgt', 'Jadi pengen liburan'],
    food: ['Jadi laper', 'Spill resepnya dong', 'Kelihatan enak banget', 'Bagi dong kak'],
    fashion: ['Outfit-nya juara', 'Spill outfit kak', 'Fashionable banget', 'Ootd goals'],
    music: ['Auto repeat', 'Suaranya adem banget', 'Merinding dengernya'],
    fitness: ['Semangat terus kak', 'Goals banget', 'Disiplin parah'],
    hype: ['GILAAA KEREN BANGET', 'AAAAA SUKA', 'IDOLAKUUU', 'GA KUAT'],
    witty: ['Bagi dikit dong gantengnya/cantiknya', 'HP aku jadi ikut glowing', 'Pamer terus nih', 'Kok bisa sih sekeren ini'],
    calm: ['bagus', 'mantap', 'keren', 'adem'],
    pro: ['Selamat ya, keren hasilnya', 'Karyanya bagus banget', 'Sukses terus ya'],
  },
  ms: {
    generic: ['Cantik sangat', 'Best gila', 'Lawa betul', 'Suka sangat', 'Vibe dia lain macam', 'Terbaik lah', 'Comel gila', 'Superb'],
    question: ['Kat mana ni?', 'Bila ni?', 'Guna kamera apa?', 'Best tak?'],
    travel: ['Nak pergi jugak', 'Bawa saya sekali', 'Kat mana ni? cantik sangat'],
    food: ['Lapar terus', 'Nak resepi', 'Nampak sedap gila'],
    fashion: ['Outfit cun gila', 'Stylish betul', 'Baju mana ni?'],
    music: ['Ulang banyak kali', 'Suara sedap', 'Meremang dengar'],
    fitness: ['Semangat!', 'Goals betul', 'Power lah'],
    hype: ['TERBAIK LAH', 'AAAA SUKA', 'MELETOP'],
    witty: ['Simpan sikit lawa tu untuk orang lain', 'Phone saya pun jadi lawa', 'Over sangat lah ni, hensem/cantik sangat'],
    calm: ['cantik', 'best', 'mantap'],
    pro: ['Tahniah, hasil kerja hebat', 'Teruskan usaha', 'Sangat profesional'],
  },
  ko: {
    generic: ['Daebak, this is so good', 'Omo, stunning', 'Love this so much', 'Visual king/queen', 'So pretty, jinjja', 'This is art'],
    question: ['Where is this? Omo', 'When was this?', 'Is this a new project?'],
    travel: ['Take me there, jebal', 'So pretty, I want to visit'],
    food: ['Looks so mashisseo', 'Now I\'m hungry, omo'],
    fashion: ['The fit, daebak', 'Fashion icon fr'],
    music: ['On repeat, daebak', 'Your voice is healing'],
    fitness: ['Fighting! 💪', 'So strong, daebak'],
    hype: ['DAEBAK!!!', 'OMO OMO OMO', 'FIGHTING!!!'],
    witty: ['Visual crime, someone arrest them', 'My heart cannot take this'],
    calm: ['pretty', 'nice', 'love'],
    pro: ['Congratulations, great work', 'Fighting on the next one'],
  },
};
const TOPIC_KEYS = ['travel', 'food', 'fashion', 'music', 'fitness'];
const TOPIC_ALIAS = { beach: 'travel', nature: 'travel', cooking: 'food', coffee: 'food', beauty: 'fashion', luxury: 'fashion', football: 'fitness', badminton: 'fitness', nightlife: 'music', kpop: 'music' };

function toneBucket(per) {
  const a = per && per.archetype || '';
  if (/Hype/.test(a)) return 'hype';
  if (/Witty|Sarcastic/.test(a)) return 'witty';
  if (/Chill|Mysterious|Shy/.test(a)) return 'calm';
  if (/Professional|Coach/.test(a)) return 'pro';
  return null;
}

/** Template comment for a post, adapted to the character's language, personality and the post topics. */
export function templateComment(lang, per, topics, ownerName) {
  const L = C[lang] || C.en;
  const parts = [];
  const tb = toneBucket(per);
  const topicHit = (topics || []).map(t => TOPIC_ALIAS[t] || t).find(t => TOPIC_KEYS.includes(t) && L[t]);
  const r = rnd();
  if (tb && r < 0.45) parts.push(pick(L[tb]));
  else if (topicHit && r < 0.75) parts.push(pick(L[topicHit]));
  else parts.push(pick(L.generic));
  if (chance(0.22)) parts.push(pick(L.question));
  let text = parts.join(tb === 'hype' ? '!! ' : '. ').replace(/\.\./g, '.');
  if (ownerName && chance(0.08)) text = (lang === 'id' ? 'Kak ' : lang === 'ms' ? 'Kak ' : '') + text;
  const emojiRate = per ? per.emoji_rate : 0.5;
  if (chance(emojiRate)) text += ' ' + pick(EMO) + (chance(emojiRate * 0.5) ? pick(EMO) : '');
  if (tb === 'calm' && chance(0.6)) text = text.toLowerCase();
  return text;
}

export function templateReply(lang, per) {
  const P = {
    en: ['Haha thank you!', 'Thanks so much 🤍', 'Right?!', 'You\'re too kind', 'Appreciate you!', 'Haha facts', 'Thank youuu'],
    id: ['Makasih banyak!', 'Hehe makasih ya 🤍', 'Iya kan?!', 'Aww makasih', 'Hahaha bener'],
    ms: ['Terima kasih!', 'Hehe thank you 🤍', 'Kan?!', 'Aww terima kasih'],
    ko: ['Gomawo! 🤍', 'Thank you, daebak', 'Hehe thank you!'],
  };
  return pick(P[lang] || P.en);
}

const CAPTIONS = {
  en: { travel: ['Somewhere new ✈️', 'Passport stamps & sunsets', 'Lost in {city}', 'Window seat kind of day'], food: ['Brunch o\'clock', 'Best bite of the week', 'Food is my love language'], fashion: ['Fit check', 'Dressed for the mood', 'Monochrome Monday'], music: ['Studio nights 🎧', 'New sound loading…', 'Soundcheck vibes'], film: ['On set today 🎬', 'Between takes', 'Script reading day'], fitness: ['Early session done 💪', 'Progress not perfection', 'Game day'], generic: ['Golden hour ✨', 'Sunday mood', 'Little moments', 'Grateful', 'Back in {city}', 'Weekend dump', 'Main character energy', 'Soft days'] },
  id: { travel: ['Healing dulu ✈️', 'Jalan-jalan ke tempat baru', 'Senja di {city}'], food: ['Makan dulu biar waras', 'Kuliner favorit minggu ini'], fashion: ['Ootd hari ini', 'Outfit santai'], music: ['Studio time 🎧', 'Lagu baru segera'], film: ['Syuting hari ini 🎬', 'Di balik layar'], fitness: ['Olahraga pagi dulu 💪'], generic: ['Senja ✨', 'Hari Minggu', 'Bersyukur', 'Pulang ke {city}', 'Momen kecil', 'Weekend dump'] },
  ms: { travel: ['Jalan-jalan cari makan ✈️', 'Senja di {city}'], food: ['Makan dulu', 'Sedap gila tempat ni'], fashion: ['Ootd hari ni'], music: ['Studio malam ni 🎧'], film: ['Penggambaran hari ni 🎬'], fitness: ['Senaman pagi 💪'], generic: ['Petang yang tenang ✨', 'Hujung minggu', 'Bersyukur', 'Balik {city}'] },
  ko: { travel: ['New city, new memories ✈️', 'Seoul nights'], food: ['Late night snack time'], fashion: ['Fit check, daebak'], music: ['Practice room diaries 🎧', 'Comeback soon?'], film: ['On set today 🎬'], fitness: ['Workout done, fighting 💪'], generic: ['Golden hour ✨', 'Little moments', 'Thank you for today 💜'] },
};

export function botCaption(acc, interests) {
  const L = CAPTIONS[acc.language] || CAPTIONS.en;
  const map = { 'Film & TV': 'film', Music: 'music', Fashion: 'fashion', Sports: 'fitness' };
  const topic = chance(0.4) && map[acc.industry] ? map[acc.industry] : (interests || []).map(t => TOPIC_ALIAS[t] || t).find(t => L[t] && chance(0.6)) || 'generic';
  let cap = pick(L[topic] || L.generic).replace('{city}', acc.city || 'the city');
  const tags = (interests || []).slice(0, 3).filter(() => chance(0.5)).map(t => '#' + t);
  if (tags.length) cap += '\n' + tags.join(' ');
  return { caption: cap, topic };
}

const STORY_TEXTS = {
  en: ['Good morning ☀️', 'Busy week ahead', 'Who else is up?', 'Coffee first', 'Grateful today', 'New things coming soon 👀', 'Rainy day mood'],
  id: ['Selamat pagi ☀️', 'Minggu yang sibuk', 'Ngopi dulu', 'Ada yang belum tidur?', 'Segera hadir 👀'],
  ms: ['Selamat pagi ☀️', 'Minggu yang sibuk', 'Kopi dulu', 'Coming soon 👀'],
  ko: ['Good morning ☀️', 'Practice day, fighting!', 'Coming soon 👀'],
};
export const storyText = lang => pick(STORY_TEXTS[lang] || STORY_TEXTS.en);
export const STORY_BGS = ['linear-gradient(160deg,#ff9a8b,#ff6a88)', 'linear-gradient(160deg,#6a85b6,#bac8e0)', 'linear-gradient(160deg,#30cfd0,#330867)', 'linear-gradient(160deg,#f6d365,#fda085)', 'linear-gradient(160deg,#a18cd1,#fbc2eb)', 'linear-gradient(160deg,#111,#434343)', 'linear-gradient(160deg,#84fab0,#8fd3f4)'];

export function templateDm(lang, kind, ctx = {}) {
  const T = {
    en: { reply: ['Haha that\'s amazing!', 'No way, tell me more', 'Love that for you', 'That sounds so fun', 'Honestly same', 'Wait really? 😮'], open: ['Hey! Loved your latest post', 'Hi! Just saw your story, looks amazing', 'Hey hey, how have you been?'], story: ['Omg this 😍', 'Where is this??', 'Love this!', 'So pretty'], follow: ['Thanks for the follow! 🤍'] },
    id: { reply: ['Wkwk seru banget!', 'Serius? cerita dong', 'Ikut seneng dengernya', 'Asik banget', 'Sama aku juga', 'Hah beneran? 😮'], open: ['Haii! Suka banget sama post terbarumu', 'Hai kak, barusan liat story kamu, keren!', 'Halo! Apa kabar?'], story: ['Ih cakep 😍', 'Ini di mana kak?', 'Suka banget!', 'Seru banget'], follow: ['Makasih udah follow ya kak 🤍'] },
    ms: { reply: ['Haha best gila!', 'Serius? ceritalah lagi', 'Seronok dengar', 'Sama lah'], open: ['Hai! Suka post terbaru awak', 'Hai, baru tengok story awak, cantik!'], story: ['Cantiknya 😍', 'Kat mana ni?', 'Best!'], follow: ['Terima kasih follow 🤍'] },
    ko: { reply: ['Daebak, that\'s amazing!', 'Omo really? tell me more', 'Love that for you 💜'], open: ['Hi! Loved your latest post, daebak', 'Hello! Saw your story, so pretty'], story: ['Omo so pretty 😍', 'Daebak!'], follow: ['Thank you for the follow! 💜'] },
  };
  const L = T[lang] || T.en;
  return pick(L[kind] || L.reply);
}
