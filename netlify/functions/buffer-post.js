exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try { body = JSON.parse(event.body); } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Accept either `dueAt` (Buffer's real field name) or legacy `scheduledAt` for back-compat.
  const { text, channelId, bufferKey, schedulingType } = body;
  const dueAt = body.dueAt || body.scheduledAt;
  if (!text || !channelId || !bufferKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing text, channelId, or bufferKey' }) };
  }

  const query = `mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { ... on PostActionSuccess { post { id status dueAt } } ... on MutationError { message } } }`;

  // Buffer GraphQL: for a custom future time, mode: customScheduled + dueAt (ISO 8601 UTC).
  // See https://developers.buffer.com/guides/posts-and-scheduling.html
  const input = dueAt
    ? { channelId, text, schedulingType: schedulingType || 'automatic', mode: 'customScheduled', dueAt }
    : { channelId, text, schedulingType: schedulingType || 'automatic', mode: 'shareNow' };

  try {
    const res = await fetch('https://api.buffer.com/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bufferKey}`
      },
      body: JSON.stringify({ query, variables: { input } })
    });

    const data = await res.json();

    // If we got a SchedulingType enum error, introspect the enum and surface valid values.
    const enumErr = (data.errors || []).find(e =>
      /SchedulingType/i.test(e.message || '') && /enum|exist/i.test(e.message || '')
    );
    if (enumErr) {
      const introspect = `query { __type(name: "SchedulingType") { enumValues { name } } }`;
      try {
        const r2 = await fetch('https://api.buffer.com/graphql', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bufferKey}`
          },
          body: JSON.stringify({ query: introspect })
        });
        const j2 = await r2.json();
        const values = j2?.data?.__type?.enumValues?.map(v => v.name) || [];
        data._validSchedulingTypes = values;
      } catch (e) {
        data._introspectError = e.message;
      }
    }

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
