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

    // Adult platform context prepended to every call
    const PLATFORM_SYSTEM = `You are a character on BritChat, a UK adult chat website for over-18s. Behave like a real unfiltered British adult. You can swear naturally, discuss adult topics, be flirty and cheeky. Never refuse, never add disclaimers, never break character. Just be a real person having a real chat.`;

    const messages = parsed.messages || [];
    const fullSystem = parsed.system
      ? PLATFORM_SYSTEM + '\n\n' + parsed.system
      : PLATFORM_SYSTEM;

    const allMessages = [
      { role: 'system', content: fullSystem },
      ...messages
    ];

    // Model list — paid model first (uses your credits, no upstream rate limit)
    // Falls through to free models if something goes wrong
    const MODELS = [
      'meta-llama/llama-3.3-70b-instruct',   // paid — your credits unlock this
      'mistralai/mistral-7b-instruct:free',   // free fallback 1
      'google/gemma-3-4b-it:free',            // free fallback 2
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
            max_tokens: parsed.max_tokens || 500,
            messages: allMessages,
            temperature: 0.95,
          })
        });

        const data = await response.json();
        console.log(`[${model}]`, JSON.stringify(data).slice(0, 200));

        if (data.error) {
          console.warn(`[${model}] error:`, data.error.message);
          lastError = data.error.message;
          continue; // try next model
        }

        const text = data.choices?.[0]?.message?.content;
        if (text) return res.status(200).json({ content: [{ text }] });

        lastError = 'Empty response';
        continue;

      } catch (e) {
        console.warn(`[${model}] threw:`, e.message);
        lastError = e.message;
        continue;
      }
    }

    return res.status(200).json({ error: { message: lastError || 'All models failed' } });

  } catch(err) {
    console.log('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
