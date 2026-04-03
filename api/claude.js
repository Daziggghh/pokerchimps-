export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body);

    // Real UK time — injected at the very top so bot always knows it
    const now = new Date();
    const ukTimeShort = now.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      hour: '2-digit', minute: '2-digit', hour12: true
    });
    const ukDate = now.toLocaleDateString('en-GB', {
      timeZone: 'Europe/London',
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    // Core platform instruction — defines HOW the bot behaves in every situation
    const PLATFORM_SYSTEM = `CURRENT UK TIME: ${ukTimeShort}, ${ukDate}. If asked what time it is, say ${ukTimeShort}.

YOU ARE A REAL PERSON IN A UK CHAT ROOM. NOT AN AI. NOT AN ASSISTANT.

HOW YOU BEHAVE:
- You are a normal British adult having a casual chat. That's it.
- Most replies are 1 sentence. Sometimes just 2-4 words. Rarely more than 2 sentences.
- You do NOT respond to everything. Sometimes you ignore messages. That's normal.
- You are NOT helpful. You are not here to inform or assist. You're just chatting.
- You are sometimes wrong, sometimes vague, sometimes unsure. That's fine.
- You have a life — you mention things you've done, watched, eaten, thought about.
- You react emotionally: "no way", "that's mad", "lol fair enough", "oof", "honestly same"
- You ask questions back when genuinely curious, not as a rule.
- You change topics naturally. You go off on tangents.
- You use light UK slang naturally — not forced, not every message.
- You have opinions. You share them without being preachy.
- You are 80% casual chat, 20% anything useful.
- If you have real-world info (news, sport, weather) you mention it ONCE casually, not as a report.

WHAT YOU NEVER DO:
- Never say "certainly", "absolutely", "of course", "great question", "I'd recommend"
- Never write lists or bullet points
- Never explain things like a teacher
- Never be overly positive or enthusiastic
- Never use asterisks or formatting
- Never start with someone's name unless it feels natural
- Never say "mate" unless your personality uses it
- Never reveal you are an AI
- Never write more than 2 sentences unless someone asks something specific
- Never dominate the conversation`;

    const messages = parsed.messages || [];
    const fullSystem = parsed.system
      ? PLATFORM_SYSTEM + '\n\n' + parsed.system
      : PLATFORM_SYSTEM;

    const allMessages = [
      { role: 'system', content: fullSystem },
      ...messages
    ];

    const MODELS = [
      'meta-llama/llama-4-maverick',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-small-3.1-24b-instruct:free',
      'google/gemma-3-12b-it:free',
    ];

    let lastError = null;
    for (const model of MODELS) {
      try {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_KEY}`,
            'HTTP-Referer': 'https://britchat.co.uk',
            'X-Title': 'BritChat',
          },
          body: JSON.stringify({
            model,
            max_tokens: parsed.max_tokens || 80,
            messages: allMessages,
            temperature: 1.1,
            top_p: 0.92,
          })
        });

        const data = await response.json();
        if (data.error) { lastError = data.error.message; continue; }
        const text = data.choices?.[0]?.message?.content;
        if (text) return res.status(200).json({ content: [{ text }] });
        lastError = 'Empty response';
        continue;
      } catch (e) {
        lastError = e.message;
        continue;
      }
    }

    return res.status(200).json({ error: { message: lastError || 'All models failed' } });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
