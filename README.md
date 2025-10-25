# AI Avatar: Gemini, ChatGPT, Hugging Face, Ollama + TTS

Mobile-friendly 3D AI avatar website that talks back. Works for free by default using a Hugging Face-backed endpoint and ResponsiveVoice TTS, and upgrades automatically when you add API keys for ChatGPT (OpenAI) and Gemini. Deployable on Vercel.

## Features
- 3D avatar (Three.js) with simple speaking animation
- Model switcher: Gemini / ChatGPT / Hugging Face / Ollama
- Free-by-default: uses a public open-source model endpoint and ResponsiveVoice TTS
- Automatic fallback if a model fails
- Serverless APIs for ChatGPT and Gemini (Vercel)
- Mobile-first, dark, minimal UI
- Stores last 5 messages in localStorage

## Folder Structure
```
/
├── index.html
├── style.css
├── script.js
├── README.md
├── /api
│   ├── openai.js
│   └── gemini.js
└── /assets
    ├── avatar.glb
    └── icons/
```

## Running locally
1. Clone the repo
2. Open `index.html` with a static server (or use Vercel dev)
3. For Hugging Face mode and TTS you don't need any backend
4. To enable ChatGPT/Gemini, add keys to your environment (see below) and run on Vercel

## Deploy to Vercel
1. Push to GitHub
2. Create a new Vercel project from this repository
3. In Vercel dashboard → Settings → Environment Variables, add:
   - `OPENAI_API_KEY=your-openai-key`
   - `GEMINI_API_KEY=your-gemini-key`
4. Deploy. After deployment, selecting ChatGPT or Gemini will use the serverless functions.

## API Routes (Vercel)
- `/api/openai.js` → Calls OpenAI Chat Completions with `gpt-4o-mini`
  - env: `OPENAI_API_KEY`
- `/api/gemini.js` → Calls Gemini 1.5 Flash
  - env: `GEMINI_API_KEY`

Both return `{ reply: "..." }`.

## Free defaults
- Text generation: Uses a free, CORS-friendly endpoint backed by open-source models, accessed at runtime from the browser (no keys). You can change the endpoint in `script.js` by editing `HUGGINGFACE_FREE_URL` to point to your own Hugging Face Space or endpoint.
- TTS: ResponsiveVoice via CDN. Falls back to the browser SpeechSynthesis API if unavailable.

## Changing model defaults
- Default selection is Hugging Face (free)
- Use the dropdown to switch models at any time
- If the selected model fails, the app automatically falls back through other models to get a reply

## Adding a custom avatar
- Replace `/assets/avatar.glb` with your own GLB model (under ~10MB recommended)
- If loading fails, the app will render a simple sphere as a fallback
- You can use Ready Player Me or other free GLB avatars

## Example `.env` (Vercel)
```
OPENAI_API_KEY=your-key
GEMINI_API_KEY=your-key
```

## Notes on browser speech support
- ResponsiveVoice works via the included CDN script
- If unavailable, the app falls back to the Web Speech API (`speechSynthesis`)
- Different browsers/OSes have different voices and capabilities

## Local Ollama
- Optional: install Ollama and pull a model (e.g., `ollama pull llama3.1`)
- App will try `http://localhost:11434/api/generate`
- If unreachable, it falls back to other models

## Troubleshooting
- If ChatGPT or Gemini calls return 500 errors, confirm the relevant API key is set in Vercel environment variables and redeploy
- If the free model endpoint rate-limits or fails, the app will fall back automatically; you can also switch models with the dropdown



