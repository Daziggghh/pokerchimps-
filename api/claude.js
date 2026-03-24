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

    const groqBody = {
      model: 'llama3-70b-8192',
      max_tokens: parsed.max_tokens || 200,
      messages: parsed.messages || [],
    };
    if (parsed.system) {
      groqBody.messages = [{ role: 'system', content: parsed.system }, ...groqBody.messages];
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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',
      },
      body: JSON.stringify(groqBody)
    });

    const data = await response.json();
    if (data.choices && data.choices[0]) {
      return res.status(200).json({ content: [{ text: data.choices[0].message.content }] });
    }
    return res.status(200).json({ error: { message: 'No response from Groq' } });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
