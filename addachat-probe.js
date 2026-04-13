/**
 * AddaChat Probe — diagnostic endpoint
 * 
 * Deploy this and call GET /api/addachat-probe
 * It will tell us EXACTLY what protocol AddaChat uses
 * so we can build the real bridge
 * 
 * Returns full details: WebSocket URL, session format, 
 * message structure — everything we need.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = { timestamp: new Date().toISOString(), tests: [] };

  const doTest = async (name, fn) => {
    try {
      const result = await fn();
      results.tests.push({ name, status: 'ok', ...result });
    } catch(e) {
      results.tests.push({ name, status: 'error', error: e.message });
    }
  };

  // Test 1: Can we reach the chat page at all?
  await doTest('page_load', async () => {
    const r = await fetch('https://chat.addachat.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    // Extract all script src URLs
    const scripts = [...html.matchAll(/src=['"]([^'"]+\.js[^'"]*)['"]/g)].map(m=>m[1]);
    // Find WebSocket references
    const wsRefs = [...html.matchAll(/wss?:\/\/[^\s'"<>]+/g)].map(m=>m[0]);
    // Find socket.io references
    const sioRef = html.includes('socket.io') || html.includes('Socket.IO');
    // Find key JS vars
    const varMatches = [...html.matchAll(/var\s+(\w+)\s*=\s*['"]([^'"]{5,})['"]/g)].slice(0,10).map(m=>({[m[1]]:m[2]}));
    // Get cookies
    const cookies = r.headers.get('set-cookie');
    return { 
      status: r.status, 
      htmlLen: html.length,
      scripts: scripts.slice(0,10),
      wsRefs,
      sioRef,
      cookies: cookies?.slice(0,200),
      varMatches,
      htmlHead: html.slice(0,3000),
    };
  });

  // Test 2: Socket.IO endpoint
  await doTest('socketio_v4', async () => {
    const r = await fetch('https://chat.addachat.com/socket.io/?EIO=4&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    return { status: r.status, body: (await r.text()).slice(0,500) };
  });
  
  await doTest('socketio_v3', async () => {
    const r = await fetch('https://chat.addachat.com/socket.io/?EIO=3&transport=polling', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    return { status: r.status, body: (await r.text()).slice(0,500) };
  });

  // Test 3: Try poo.com (same engine, might be less locked down)  
  await doTest('poo_page', async () => {
    const r = await fetch('https://chat.poo.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const scripts = [...html.matchAll(/src=['"]([^'"]+\.js[^'"]*)['"]/g)].map(m=>m[1]);
    const wsRefs = [...html.matchAll(/wss?:\/\/[^\s'"<>]+/g)].map(m=>m[0]);
    return { 
      status: r.status, htmlLen: html.length,
      scripts: scripts.slice(0,10), wsRefs,
      htmlHead: html.slice(0,3000),
    };
  });

  // Test 4: Try htmlchat.org main JS file
  await doTest('htmlchat_page', async () => {
    const r = await fetch('https://chat.htmlchat.org/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000),
    });
    const html = await r.text();
    const scripts = [...html.matchAll(/src=['"]([^'"]+\.js[^'"]*)['"]/g)].map(m=>m[1]);
    const wsRefs = [...html.matchAll(/wss?:\/\/[^\s'"<>]+/g)].map(m=>m[0]);
    return { 
      status: r.status, htmlLen: html.length,
      scripts: scripts.slice(0,10), wsRefs,
      htmlHead: html.slice(0,3000),
    };
  });

  // Test 5: Try to load their main chat JS file
  await doTest('main_js', async () => {
    const r = await fetch('https://chat.addachat.com/chat.js', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000),
    });
    const text = await r.text();
    // Extract socket server, event names
    const events = [...text.matchAll(/(?:on|emit)\(['"](\w+)['"]/g)].map(m=>m[1]);
    const servers = [...text.matchAll(/wss?:\/\/[^\s'"<>]+/g)].map(m=>m[0]);
    return { status: r.status, len: text.length, events: [...new Set(events)].slice(0,20), servers };
  });

  // Test 6: Try sending a message via form POST
  await doTest('send_test', async () => {
    const r = await fetch('https://chat.addachat.com/send', {
      method: 'POST',
      headers: { 
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'room=main&name=BridgeTest&msg=test',
      signal: AbortSignal.timeout(5000),
    });
    return { status: r.status, body: (await r.text()).slice(0,300) };
  });

  res.status(200).json(results);
}
