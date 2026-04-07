const { TwitterApi } = require('twitter-api-v2');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { text, tweetId } = body;
  if (!text || !tweetId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text or tweetId' }) };
  }

  const missing = ['TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_TOKEN_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars: ' + missing.join(', ') }) };
  }

  const client = new TwitterApi({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  });

  try {
    const tweet = await client.v2.tweet({
      text,
      reply: { in_reply_to_tweet_id: tweetId }
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tweet.data.id })
    };
  } catch (err) {
    const detail = err?.data ? JSON.stringify(err.data) : err.message;
    return { statusCode: 500, body: JSON.stringify({ error: detail }) };
  }
};
