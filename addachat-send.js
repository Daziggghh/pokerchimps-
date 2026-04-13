/**
 * AddaChat Send — Vercel Serverless Function
 * 
 * Posts a message to AddaChat as a named user.
 * Called when a BritChat user sends a message in a public room.
 * 
 * POST body: { room, name, text, avatar }
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { room = 'main', name = 'BritChat', text, avatar = '🐒' } = JSON.parse(body);
    
    if (!text) return res.status(400).json({ error: 'No text provided' });

    // The display name for AddaChat — emoji + username
    const displayName = `${avatar} ${name}`;
    
    // Step 1: Load the chat page as this user to establish session
    const chatUrl = `https://chat.addachat.com/?name=${encodeURIComponent(displayName)}&room=${encodeURIComponent(room)}&sidebar=on&format=on`;
    
    const sessionRes = await fetch(chatUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'text/html,application/xhtml+xml',
      }
    });
    
    const sessionCookies = sessionRes.headers.get('set-cookie') || '';
    const html = await sessionRes.text();
    
    // Step 2: Look for a POST/send endpoint in their HTML
    const sendPatterns = [
      /action=['"]([^'"]*send[^'"]*)['"]/i,
      /url\s*[:=]\s*['"]([^'"]*(?:send|post|msg|message)[^'"]*)['"]/i,
      /fetch\(['"]([^'"]*(?:send|post|msg)[^'"]*)['"]/i,
      /xhr\.open\(['"]POST['"],\s*['"]([^'"]+)['"]/i,
    ];
    
    let sendEndpoint = null;
    for (const p of sendPatterns) {
      const m = html.match(p);
      if (m) { sendEndpoint = m[1]; break; }
    }
    
    // Step 3: Try common send endpoints
    const tryEndpoints = [
      sendEndpoint,
      `https://chat.addachat.com/send`,
      `https://chat.addachat.com/post`,
      `https://chat.addachat.com/message`,
      `https://chat.addachat.com/chat/send`,
    ].filter(Boolean);
    
    let sent = false;
    let sendResult = null;
    
    for (const endpoint of tryEndpoints) {
      try {
        const fullEndpoint = endpoint.startsWith('http') 
          ? endpoint 
          : `https://chat.addachat.com${endpoint}`;
          
        const sendRes = await fetch(fullEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': sessionCookies,
            'Referer': chatUrl,
            'Origin': 'https://chat.addachat.com',
            'User-Agent': 'Mozilla/5.0',
          },
          body: new URLSearchParams({ 
            msg: text, 
            message: text,
            name: displayName,
            room,
            text,
          }).toString(),
          signal: AbortSignal.timeout(5000),
        });
        
        if (sendRes.ok) {
          sent = true;
          sendResult = await sendRes.text();
          break;
        }
      } catch(e) {}
    }
    
    return res.status(200).json({ 
      ok: sent, 
      displayName,
      sendEndpoint,
      sendResult: sendResult?.slice(0,200),
      triedEndpoints: tryEndpoints,
    });
    
  } catch(err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
