export default async function handler(req, res) {
	if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
	try {
		const { prompt } = req.body || {};
		if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

		const key = process.env.GEMINI_API_KEY;
		if (!key) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

		let systemPrompt = '';
		try {
			const fs = await import('fs/promises');
			const url = new URL('../system_prompt.txt', import.meta.url);
			systemPrompt = await fs.readFile(url, 'utf8');
		} catch {}

		const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{ role: 'user', parts: [{ text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt }] }
				]
			})
		});

		if (!response.ok) {
			const errText = await response.text();
			return res.status(response.status).json({ error: 'Gemini error', details: errText });
		}

		const data = await response.json();
		const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || '';
		return res.status(200).json({ reply });
	} catch (e) {
		return res.status(500).json({ error: 'Request failed', details: e?.message || String(e) });
	}
}



