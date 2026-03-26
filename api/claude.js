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

    let prompt = '';
    if (parsed.system) prompt = parsed.system + '\n\n';
    const messages = parsed.messages || [];
    messages.forEach(m => {
      if (m.role === 'user') prompt += 'User: ' + m.content + '\n';
      else if (m.role === 'assistant') prompt += 'Assistant: ' + m.content + '\n';
    });
    prompt += 'Assistant:';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: parsed.max_tokens || 700,
            temperature: 0.9,
          }
        })
      }
    );

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data).slice(0, 200));

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      return res.status(200).json({ content: [{ text }] });
    }
    return res.status(200).json({ error: { message: data.error?.message || 'No response' } });
  } catch(err) {
    console.log('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
