exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const { url } = JSON.parse(event.body);
  if (!url) return { statusCode: 400, body: JSON.stringify({ error: 'Missing url' }) };

  try {
    const res = await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`);
    if (!res.ok) throw new Error('Tweet not found or private');
    const data = await res.json();

    // Extract text from blockquote HTML
    const match = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    let text = match ? match[1] : '';
    // Strip HTML tags and decode entities
    text = text
      .replace(/<a[^>]*>.*?<\/a>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .trim();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, author: data.author_name })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
