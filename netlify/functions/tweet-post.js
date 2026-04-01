const crypto = require('crypto');

function encode(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildAuthHeader(method, url, extraParams) {
  const oauthParams = {
    oauth_consumer_key: process.env.TWITTER_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.TWITTER_ACCESS_TOKEN,
    oauth_version: '1.0'
  };

  const allParams = { ...oauthParams, ...extraParams };
  const sortedParams = Object.keys(allParams).sort()
    .map(k => `${encode(k)}=${encode(allParams[k])}`).join('&');

  const baseString = `${method}&${encode(url)}&${encode(sortedParams)}`;
  const signingKey = `${encode(process.env.TWITTER_API_SECRET)}&${encode(process.env.TWITTER_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');

  oauthParams.oauth_signature = signature;
  const headerValue = 'OAuth ' + Object.keys(oauthParams).sort()
    .map(k => `${encode(k)}="${encode(oauthParams[k])}"`).join(', ');

  return headerValue;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { text } = body;
  if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'Missing tweet text' }) };

  const missingKeys = ['TWITTER_API_KEY','TWITTER_API_SECRET','TWITTER_ACCESS_TOKEN','TWITTER_ACCESS_TOKEN_SECRET']
    .filter(k => !process.env[k]);
  if (missingKeys.length) return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars: ' + missingKeys.join(', ') }) };

  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = buildAuthHeader('POST', url, {});

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({ text })
    });

    const data = await res.json();
    if (res.status !== 201) throw new Error(`Twitter ${res.status}: ${JSON.stringify(data)}`);
    if (!data.data?.id) throw new Error(JSON.stringify(data));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: data.data.id })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
