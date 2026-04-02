exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { text, channelId, bufferKey } = body;
  if (!text || !channelId || !bufferKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text, channelId, or bufferKey' }) };
  }

  const query = `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id status } } } }`;

  try {
    const res = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferKey}`
      },
      body: JSON.stringify({ query, variables: { input: { channelId, text, schedulingType: 'queue', mode: 'auto' } } })
    });

    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
