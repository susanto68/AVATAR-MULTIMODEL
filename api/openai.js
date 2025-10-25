export default async function handler(req, res) {
	if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
	try {
		const { prompt } = req.body || {};
		if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

		const key = process.env.OPENAI_API_KEY;
		if (!key) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

		let systemPrompt = 'You are a helpful assistant.';
		try {
			const fs = await import('fs/promises');
			const url = new URL('../system_prompt.txt', import.meta.url);
			systemPrompt = await fs.readFile(url, 'utf8');
		} catch {}

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${key}`
			},
			body: JSON.stringify({
				model: 'gpt-4o-mini',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: prompt }
				],
				temperature: 0.7
			})
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(response.status).json({ error: 'OpenAI error', details: errText });
		}

		const data = await response.json();
		const reply = data.choices?.[0]?.message?.content?.trim?.() || '';
		return res.status(200).json({ reply });
	} catch (e) {
		return res.status(500).json({ error: 'Request failed', details: e?.message || String(e) });
	}
}



