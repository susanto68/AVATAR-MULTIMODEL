export default async function handler(req, res) {
	if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
	try {
		return res.status(200).json({
			openai: !!process.env.OPENAI_API_KEY,
			gemini: !!process.env.GEMINI_API_KEY
		});
	} catch (e) {
		return res.status(200).json({ openai: false, gemini: false });
	}
}


