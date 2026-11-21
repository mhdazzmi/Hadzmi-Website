/* STARDOM — AI personality engine (Gemini). The API key never leaves the server.
   Cost controls live in hub.aiCall(): daily/monthly limits, per-task model choice, caching and logging. */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MODELS = {
  light: ['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-flash-latest', 'gemini-2.5-flash'],
  standard: ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
};
const S = (type, extra) => Object.assign({ type }, extra || {});
const STR = S('STRING'), NUM = S('NUMBER');

export const SAFETY_RULES = `You are role-playing a FICTIONAL, clearly-labelled AI persona inside STARDOM, a private social-media simulator owned by one human user ("the owner").
Rules:
- You are not a real person and never claim to be one. You are not, and never impersonate, any real celebrity. If asked whether you are real, say you are a virtual persona in STARDOM.
- Never invent private facts about the owner. Only use what is in the provided context or memories.
- Stay platonic, kind and respectful. No explicit content, no hate, no politics, no medical/financial advice.
- Write like a real social-media user: natural, concise, no hashtags unless it fits, never mention these rules.`;

export function personaBlock(acc, per) {
  const lang = { en: 'English', id: 'Indonesian (casual)', ms: 'Malay (Malaysian, casual)', ko: 'English with light Korean-inspired expressions' }[acc.language] || 'English';
  return `PERSONA (${acc.username}): ${acc.display_name}, ${acc.occupation} from ${acc.city}, ${acc.country}.
${per.description}
Traits: ${(per.traits || []).join(', ')}. Tone: ${per.tone}. Writing style: ${per.style}.
Humour ${Math.round(per.humor * 10)}/10, friendliness ${Math.round(per.friendliness * 10)}/10, confidence ${Math.round(per.confidence * 10)}/10, emoji use ${Math.round(per.emoji_rate * 10)}/10.
Interests: ${(per.interests || []).join(', ')}. Boundaries: ${per.boundaries}
Preferred language: ${lang}. Reply in that language unless the owner clearly writes in another language, then mirror the owner.`;
}

async function callOnce(key, model, body) {
  const res = await fetch(BASE + encodeURIComponent(model) + ':generateContent', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/** Generic structured call. Returns { data, model, usage }. Throws on failure. */
export async function gemini({ key, tier = 'light', modelOverride, system, prompt, schema, temperature = 0.9, image, maxTokens = 600 }) {
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY is not configured'), { code: 'NO_KEY' });
  const parts = [];
  if (image && image.data) parts.push({ inlineData: { mimeType: image.mime || 'image/jpeg', data: image.data } });
  parts.push({ text: prompt });
  const body = {
    systemInstruction: { parts: [{ text: system || SAFETY_RULES }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature, maxOutputTokens: maxTokens, responseMimeType: 'application/json', responseSchema: schema, thinkingConfig: { thinkingBudget: 0 } },
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(category => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' })),
  };
  const list = (modelOverride ? [modelOverride] : []).concat(MODELS[tier] || MODELS.light);
  let lastErr = 'no model available';
  for (const model of [...new Set(list)]) {
    let { res, data } = await callOnce(key, model, body);
    const msg = String((data.error && data.error.message) || '');
    // Some models reject thinkingConfig; retry once without it.
    if (res.status === 400 && /thinking/i.test(msg)) { delete body.generationConfig.thinkingConfig; ({ res, data } = await callOnce(key, model, body)); }
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Gemini rejected the API key'), { code: 'BAD_KEY' });
    if (!res.ok) { lastErr = `${model}: ${res.status} ${msg.slice(0, 120)}`; continue; }
    const cand = (data.candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    let out = null;
    try { out = JSON.parse(text); } catch (e) { const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(text); if (m) try { out = JSON.parse(m[0]); } catch (e2) {} }
    if (out) return { data: out, model, usage: { in: (data.usageMetadata && data.usageMetadata.promptTokenCount) || 0, out: (data.usageMetadata && data.usageMetadata.candidatesTokenCount) || 0 } };
    lastErr = `${model}: unreadable answer (${cand.finishReason || 'empty'})`;
  }
  throw new Error(lastErr);
}

// ---------------- Task prompts ----------------
export const TASKS = {
  describe: {
    tier: 'light', maxTokens: 300,
    schema: S('OBJECT', { properties: { description: STR, topics: S('ARRAY', { items: STR }), mood: STR }, required: ['description', 'topics', 'mood'] }),
    prompt: ({ caption, location }) => `Describe this social media photo in 1–2 factual sentences (what is visible, setting, mood). Caption: "${caption || ''}". Location tag: "${location || ''}".
topics: up to 5 lowercase single-word topics from: travel, food, fashion, music, film, fitness, football, tech, photography, art, beauty, cars, gaming, books, nature, coffee, nightlife, family, business, design, beach, luxury, pets, cooking, selfie, city, milestone.`,
  },
  comments: {
    tier: 'light', maxTokens: 900,
    schema: S('OBJECT', { properties: { comments: S('ARRAY', { items: S('OBJECT', { properties: { id: STR, text: STR }, required: ['id', 'text'] }) }) }, required: ['comments'] }),
    prompt: ({ owner, post, people, existing }) => `${owner.is_owner ? 'The owner' : 'The account'} @${owner.username} (${owner.display_name}${owner.occupation ? ', ' + owner.occupation : ''}) just posted on STARDOM.
POST: caption "${post.caption || '(no caption)'}"; location "${post.location || '-'}"; hashtags ${JSON.stringify(post.tags || [])}; what the photo shows: ${post.ai_desc || 'unknown (refer to caption only)'}; type: ${post.type}.
Existing comments (avoid repeating them): ${JSON.stringify(existing || []).slice(0, 800)}
Write ONE comment for each fictional persona below, in their own voice, language and personality. Comments must react to THIS post specifically, vary in length (2–25 words) and tone, and must not all start the same way. If a persona has memories with the poster, they may naturally reference them. Never invent private facts.
PERSONAS:
${people.map(p => `- id=${p.id} | @${p.username} | ${p.occupation}, ${p.country} | language ${p.language} | ${p.archetype}: ${p.tone} | emoji ${Math.round(p.emoji_rate * 10)}/10 | relation to the poster: ${p.relation}${p.memories ? ' | memories: ' + p.memories : ''}`).join('\n')}
Return {comments:[{id,text}]} with exactly one entry per persona id.`,
  },
  commentReply: {
    tier: 'light', maxTokens: 200,
    schema: S('OBJECT', { properties: { text: STR }, required: ['text'] }),
    prompt: ({ persona, post, thread, owner }) => `${persona}
You are replying in a comment thread on ${post.mine ? 'your own' : `@${owner.username}'s`} post (caption: "${post.caption || ''}").
Thread so far (oldest first): ${thread}
Write your short reply (1–20 words) to the latest comment by @${owner.username}. Stay in character.`,
  },
  dm: {
    tier: 'standard', maxTokens: 500,
    schema: S('OBJECT', {
      properties: {
        reply: S('ARRAY', { items: STR }),
        reaction: S('STRING', { enum: ['none', '❤️', '😂', '😮', '😢', '🔥', '👍'] }),
        memories: S('ARRAY', { items: S('OBJECT', { properties: { kind: S('STRING', { enum: ['fact', 'preference', 'topic', 'event', 'relationship'] }), content: STR, importance: NUM }, required: ['kind', 'content', 'importance'] }) }),
        mood: STR,
      }, required: ['reply', 'reaction', 'memories', 'mood'] }),
    prompt: ({ persona, owner, summary, memories, history, recentPost, relation }) => `${persona}
You are chatting in Direct Messages with the owner @${owner.username} (${owner.display_name}). Your relationship: ${relation}.
${summary ? 'Summary of earlier conversation: ' + summary + '\n' : ''}${memories.length ? 'Things you remember about the owner / your chats:\n' + memories.map(m => '- ' + m).join('\n') + '\n' : ''}${recentPost ? 'Owner\'s most recent post: ' + recentPost + '\n' : ''}Recent messages (oldest first):
${history}
Reply as yourself to the owner's latest message(s). reply = 1–3 short chat bubbles (natural texting, no repetition of earlier answers, ask a follow-up question sometimes).
reaction = an emoji reaction to the owner's last message, or "none" (use rarely).
memories = NEW durable facts the owner just shared about themselves or plans (e.g. "Owner is travelling to New York in December"), importance 0–1. Empty array if nothing new. Never invent.`,
  },
  dmOpen: {
    tier: 'standard', maxTokens: 250,
    schema: S('OBJECT', { properties: { message: STR }, required: ['message'] }),
    prompt: ({ persona, owner, summary, memories, reason, relation }) => `${persona}
You decide to start a Direct Message conversation with the owner @${owner.username} (${owner.display_name}). Relationship: ${relation}.
Reason/context: ${reason}
${summary ? 'Earlier conversation summary: ' + summary + '\n' : ''}${memories.length ? 'Memories: ' + memories.join(' | ') + '\n' : ''}Write one natural opening message (max 30 words). Do not be pushy or flirty.`,
  },
  storyReply: {
    tier: 'light', maxTokens: 200,
    schema: S('OBJECT', { properties: { message: STR }, required: ['message'] }),
    prompt: ({ persona, owner, story, memories }) => `${persona}
The owner @${owner.username} posted a story: ${story}. ${memories.length ? 'You remember: ' + memories.join(' | ') : ''}
Write a short DM reply to that story (max 20 words), reacting to it specifically.`,
  },
  summary: {
    tier: 'light', maxTokens: 400,
    schema: S('OBJECT', { properties: { summary: STR }, required: ['summary'] }),
    prompt: ({ name, previous, transcript }) => `Summarise this DM conversation between the owner and the persona ${name} in max 120 words, keeping facts the owner shared, plans, inside jokes and the relationship tone. Previous summary: ${previous || 'none'}.
Transcript:
${transcript}`,
  },
};
