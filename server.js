const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
let SYSTEM_PROMPT = '';
try {
  SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, 'system_prompt.txt'), 'utf8');
} catch {}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health probe for frontend to detect availability of pro models
app.get('/api/health', (req, res) => {
	res.json({ openai: !!process.env.OPENAI_API_KEY, gemini: !!process.env.GEMINI_API_KEY });
});

// Public config for frontend
app.get('/api/config', (req, res) => {
	res.json({ responsiveVoiceKey: process.env.RESPONSIVEVOICE_API_KEY || '' });
});

app.post('/api/openai', async (req, res) => {
	try {
		if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
		const { prompt } = req.body || {};
		if (!prompt) return res.status(400).json({ error: 'No prompt provided' });
		const key = process.env.OPENAI_API_KEY;
		if (!key) return res.status(500).json({ error: 'Missing OPENAI_API_KEY' });

		const response = await axios.post('https://api.openai.com/v1/chat/completions', {
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT || 'You are a helpful assistant.' },
				{ role: 'user', content: prompt }
			],
			temperature: 0.7
		}, {
			headers: {
				'Authorization': `Bearer ${key}`,
				'Content-Type': 'application/json'
			}
		});

		const data = response.data;
		const reply = data.choices?.[0]?.message?.content?.trim?.() || '';
		return res.status(200).json({ reply });
	} catch (e) {
		return res.status(e.response?.status || 500).json({ error: 'OpenAI request failed', details: e.response?.data || e.message });
	}
});

app.post('/api/gemini', async (req, res) => {
	try {
		if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
		const { prompt } = req.body || {};
		if (!prompt) return res.status(400).json({ error: 'No prompt provided' });
		const key = process.env.GEMINI_API_KEY;
		if (!key) return res.status(500).json({ error: 'Missing GEMINI_API_KEY' });

		const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash-latest:generateContent?key=${key}`;
		const response = await axios.post(endpoint, {
			contents: [ { role: 'user', parts: [{ text: (SYSTEM_PROMPT ? SYSTEM_PROMPT + '\n\n' : '') + prompt }] } ]
		}, { headers: { 'Content-Type': 'application/json' } });

		const data = response.data;
		const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim?.() || '';
		return res.status(200).json({ reply });
	} catch (e) {
		return res.status(e.response?.status || 500).json({ error: 'Gemini request failed', details: e.response?.data || e.message });
	}
});

// OpenAgents bridge for local dev parity with Vercel /api/ask
app.post('/api/ask', async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { question } = req.body || {};
    if (!question) return res.status(400).json({ error: 'No question provided' });

    const key = process.env.OPENAGENTS_KEY;
    if (!key) {
      return res.status(200).json({ reply: 'This is a mock reply. Add OPENAGENTS_KEY to enable real answers.' });
    }

    const response = await axios.post('https://api.openagents.com/v1/chat',
      { agent_id: 'SirGanguly', message: question },
      { headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' } }
    );
    const data = response.data || {};
    return res.status(200).json({ reply: data.reply || '' });
  } catch (e) {
    return res.status(e.response?.status || 500).json({ error: 'OpenAgents request failed', details: e.response?.data || e.message });
  }
});

// Static files - serve project root
app.use(express.static(path.join(__dirname)));

// SPA fallback to index.html
app.get('*', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
	console.log(`Local server running at http://localhost:${PORT}`);
});


