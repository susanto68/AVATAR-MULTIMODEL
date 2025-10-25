export default async function handler(req, res) {
	if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
	try {
		const { question } = req.body || {};
		if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Missing question' });

		const key = process.env.OPENAGENTS_KEY || '';
		if (!key) {
			// Mock when key is missing
			return res.status(200).json({ reply: 'This is a mock reply. Add OPENAGENTS_KEY to enable real answers.' });
		}

		const response = await fetch('https://api.openagents.com/v1/chat', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${key}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ agent_id: 'SirGanguly', message: question })
		});

		if (!response.ok) {
			const txt = await response.text();
			return res.status(response.status).json({ error: 'OpenAgents error', details: txt });
		}

		const data = await response.json();
		return res.status(200).json({ reply: data?.reply || '' });
	} catch (e) {
		return res.status(500).json({ error: 'Request failed', details: e?.message || String(e) });
	}
}


