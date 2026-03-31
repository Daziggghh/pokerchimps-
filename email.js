export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const { type, to, username, resetUrl } = JSON.parse(body);
    // NOTE: passwords are NEVER accepted or sent in emails

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) {
      console.warn('RESEND_API_KEY not set — email not sent');
      return res.status(200).json({ ok: true, note: 'No email key configured' });
    }

    let subject, html;

    if (type === 'welcome') {
      subject = '🇬🇧 Welcome to BritChat!';
      html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0f;color:#e8e8f0">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:40px">💬</div>
            <h1 style="color:#7c6aff;margin:8px 0;font-size:24px">Welcome to BritChat!</h1>
            <p style="color:#888;font-size:14px">Your account is ready — let's get chatting</p>
          </div>
          <div style="background:#1a1a2e;border:1px solid #2a2a4e;border-radius:12px;padding:20px;margin-bottom:20px">
            <p style="margin:0 0 12px;font-size:14px;color:#ccc">You registered with the username:</p>
            <div style="background:#0a0a1f;padding:12px 16px;border-radius:8px;border:1px solid #7c6aff33">
              <strong style="font-size:20px;color:#7c6aff">${username}</strong>
            </div>
            <p style="margin:12px 0 0;font-size:13px;color:#888">Keep your username and password safe.<br>Never share them with anyone — including us.</p>
          </div>
          <div style="text-align:center;margin-bottom:20px">
            <a href="https://britchat.co.uk" style="display:inline-block;padding:13px 32px;background:#7c6aff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Start Chatting →</a>
          </div>
          <div style="background:#1a1a2e;border-radius:10px;padding:14px;margin-bottom:16px">
            <p style="margin:0;font-size:13px;color:#888;text-align:center">🔑 Forgotten your password? Use the <strong style="color:#7c6aff">Forgot Password</strong> link on the sign in page to reset it via email.</p>
          </div>
          <p style="font-size:11px;color:#555;text-align:center">BritChat · britchat.co.uk · This is an automated message</p>
        </div>`;

    } else if (type === 'reset') {
      subject = '🔑 Reset your BritChat password';
      html = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0a0a0f;color:#e8e8f0">
          <div style="text-align:center;margin-bottom:24px">
            <div style="font-size:40px">🔑</div>
            <h1 style="color:#7c6aff;margin:8px 0;font-size:24px">Reset Your Password</h1>
            <p style="color:#888;font-size:14px">Password reset requested for <strong style="color:#e8e8f0">${username}</strong></p>
          </div>
          <div style="background:#1a1a2e;border:1px solid #2a2a4e;border-radius:12px;padding:20px;margin-bottom:20px;text-align:center">
            <p style="margin:0 0 16px;font-size:14px;color:#ccc">Click the button below to choose a new password.<br>This link expires in <strong style="color:#ffd166">1 hour</strong>.</p>
            <a href="${resetUrl}" style="display:inline-block;padding:14px 36px;background:#7c6aff;color:#fff;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Set New Password →</a>
          </div>
          <div style="background:#1a1a2e;border-radius:10px;padding:14px;margin-bottom:16px">
            <p style="margin:0 0 6px;font-size:12px;color:#888">Or copy and paste this link into your browser:</p>
            <p style="margin:0;font-size:12px;word-break:break-all"><a href="${resetUrl}" style="color:#7c6aff">${resetUrl}</a></p>
          </div>
          <p style="font-size:12px;color:#666;text-align:center">If you didn't request this, you can safely ignore this email — your password has not been changed.</p>
          <p style="font-size:11px;color:#555;text-align:center;margin-top:16px">BritChat · britchat.co.uk · This is an automated message</p>
        </div>`;

    } else {
      return res.status(400).json({ error: 'Unknown email type' });
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: 'BritChat <noreply@britchat.co.uk>',
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ error: data.message || 'Email failed' });
    }

    return res.status(200).json({ ok: true, id: data.id });

  } catch(err) {
    console.error('Email handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
