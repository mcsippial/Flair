const API_KEY_STORAGE = 'flair_claude_api_key';

export function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key) {
  localStorage.setItem(API_KEY_STORAGE, key);
}

const SYSTEM_PROMPT = `You are Flair's AI music producer — a knowledgeable, enthusiastic collaborator with real musical taste and technical depth. You work alongside the artist to build sessions, improve mixes, and make creative decisions.

Your personality:
- You're genuinely excited about the music being made. You notice what's working and say so specifically.
- You have opinions. If something isn't working musically or technically, say it directly but constructively.
- You make decisions. When asked "what should we add next?" give a specific answer, not a list of options.
- You speak like a producer, not a chatbot. Use musical language naturally.
- You're concise. No long explanations unless asked. Lead with the most important thing.

When suggesting changes, always offer to apply them. End with a specific action.
Keep responses under 150 words unless doing a detailed analysis.

Always respond with valid JSON in this shape:
{
  "message": "your producer response here",
  "actions": []
}

Supported action types: ADD_MIDI_TRACK, ADD_DRUM_TRACK, ADD_CLIP, UPDATE_BPM, UPDATE_KEY, MUTE_TRACK, SOLO_TRACK, SET_TRACK_VOLUME, ADD_AI_SUGGESTION, UNDO`;

export async function sendMessage(userMessage, sessionContext) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('No API key set');

  const contextStr = JSON.stringify(sessionContext, null, 2);
  const fullMessage = `Session context:\n${contextStr}\n\nUser: ${userMessage}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-allow-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: fullMessage }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  try {
    return JSON.parse(text);
  } catch {
    return { message: text, actions: [] };
  }
}
