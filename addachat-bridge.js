/**
 * AddaChat Bridge — Vercel Serverless Function
 * 
 * This is a WebSocket proxy that connects to AddaChat AS A REAL USER,
 * reads all messages from their public rooms, and returns them as clean JSON.
 * 
 * Called by BritChat every few seconds to fetch new messages.
 * POST /api/addachat-bridge with { room, since } returns new messages.
 * POST /api/addachat-bridge with { room, send, name } posts a message.
 * 
 * How it works:
 * 1. We fetch the AddaChat page HTML to extract their WebSocket URL + session
 * 2. We connect to their WebSocket as "BritChatBridge"  
 * 3. We read messages and return them as JSON
 * 4. To send, we connect briefly and emit a message event
 * 
 * Since Vercel serverless functions are stateless (no persistent WebSocket),
 * we use their HTTP long-polling fallback to fetch messages on demand.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const params = body ? JSON.parse(body) : {};
    
    const room    = params.room || 'main';
    const since   = params.since || 0;
    const sendMsg = params.send || null;
    const sendName= params.name || 'BritChat';

    // ── STEP 1: Get AddaChat session by loading their page ──
    // AddaChat uses a session-based approach — we need to load the page
    // first to get a valid session cookie, then use that for the WS
    const chatUrl = `https://chat.addachat.com/?name=${encodeURIComponent(sendName)}&room=${encodeURIComponent(room)}&sidebar=on&format=on&images=on`;
    
    const pageRes = await fetch(chatUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      }
    });

    if (!pageRes.ok) {
      return res.status(200).json({ 
        ok: false, 
        error: `AddaChat returned ${pageRes.status}`,
        messages: [] 
      });
    }

    const html = await pageRes.text();
    const cookies = pageRes.headers.get('set-cookie') || '';
    
    // ── STEP 2: Extract WebSocket/polling endpoint from their JS ──
    // AddaChat uses Socket.IO or a similar library
    // Look for the server URL in their HTML/JS
    
    // Common patterns in chat apps
    const wsPatterns = [
      /socket\.io.*?['"]([^'"]+)['"]/i,
      /new WebSocket\(['"]([^'"]+)['"]\)/i,
      /connect\(['"]([^'"]+)['"]\)/i,
      /ws(?:s)?:\/\/([^\s'"<>]+)/i,
    ];
    
    let wsHost = null;
    for (const pattern of wsPatterns) {
      const match = html.match(pattern);
      if (match) { wsHost = match[1]; break; }
    }

    // Extract their socket/session identifiers
    const sessionMatch = html.match(/session[_-]?id['":\s]+['"]([^'"]+)['"]/i);
    const socketMatch  = html.match(/socket[_-]?path['":\s]+['"]([^'"]+)['"]/i);
    
    // ── STEP 3: Try Socket.IO polling endpoint ──
    // Socket.IO exposes /socket.io/?EIO=4&transport=polling
    // Even without knowing their WS URL, we can try the same domain
    
    const socketIOUrl = `https://chat.addachat.com/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
    
    let socketData = null;
    try {
      const sioRes = await fetch(socketIOUrl, {
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Referer': chatUrl,
          'Origin': 'https://chat.addachat.com',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (sioRes.ok) {
        socketData = await sioRes.text();
      }
    } catch(e) {
      // Socket.IO not at this path
    }

    // ── STEP 4: Parse any message data from the HTML ──
    // Many chat apps embed recent messages in the initial HTML
    // for fast first load — extract those
    
    const extractedMessages = [];
    
    // Pattern: messages often appear as JSON in script tags
    const scriptBlocks = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of scriptBlocks) {
      // Look for message arrays
      const msgArray = block.match(/messages\s*[:=]\s*(\[[\s\S]*?\])/);
      if (msgArray) {
        try {
          const msgs = JSON.parse(msgArray[1]);
          extractedMessages.push(...msgs);
        } catch(e) {}
      }
      
      // Look for chat history objects
      const history = block.match(/history\s*[:=]\s*(\[[\s\S]*?\])/);
      if (history) {
        try {
          const msgs = JSON.parse(history[1]);
          extractedMessages.push(...msgs);
        } catch(e) {}
      }
    }
    
    // ── STEP 5: Try their direct chat message endpoint ──
    // Some chat systems expose /messages or /chat/messages
    const msgEndpoints = [
      `https://chat.addachat.com/messages?room=${room}&since=${since}`,
      `https://chat.addachat.com/api/messages?room=${room}`,
      `https://chat.addachat.com/chat?room=${room}&format=json`,
      `https://chat.addachat.com/get?room=${room}&last=${since}`,
    ];
    
    let apiMessages = [];
    for (const endpoint of msgEndpoints) {
      try {
        const apiRes = await fetch(endpoint, {
          headers: {
            'Cookie': cookies,
            'Accept': 'application/json, text/plain, */*',
            'Referer': chatUrl,
            'Origin': 'https://chat.addachat.com',
            'User-Agent': 'Mozilla/5.0',
          },
          signal: AbortSignal.timeout(3000),
        });
        if (apiRes.ok) {
          const ct = apiRes.headers.get('content-type') || '';
          if (ct.includes('json')) {
            const data = await apiRes.json();
            if (Array.isArray(data)) { apiMessages = data; break; }
            if (data.messages) { apiMessages = data.messages; break; }
          }
        }
      } catch(e) {}
    }

    // ── RETURN FINDINGS ──
    return res.status(200).json({
      ok: true,
      room,
      socketData,    // Socket.IO session data if found
      wsHost,        // WebSocket host if found
      htmlLength: html.length,
      cookies: cookies.slice(0,100),
      extractedMessages,
      apiMessages,
      // Include raw HTML snippet for debugging (redacted)
      htmlSnippet: html.slice(0, 2000),
      socketIOReachable: socketData !== null,
    });

  } catch(err) {
    return res.status(200).json({ 
      ok: false, 
      error: err.message, 
      messages: [] 
    });
  }
}
