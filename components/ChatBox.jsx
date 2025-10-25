/* global React, ReactDOM */

// Sir Ganguly ChatBox - React component (loaded via Babel Standalone)
// Uses Web Speech API for mic and SpeechSynthesis for TTS

function ChatBox() {
	const [messages, setMessages] = React.useState([
		{ role: 'assistant', content: "Hello Student 👋 I’m Sir Ganguly, your Computer Applications teacher!" }
	]);
	const [input, setInput] = React.useState('');
	const [isThinking, setIsThinking] = React.useState(false);
	const [isListening, setIsListening] = React.useState(false);
	const listRef = React.useRef(null);
	const recognitionRef = React.useRef(null);

	React.useEffect(() => {
		try {
			if (listRef.current) {
				listRef.current.scrollTop = listRef.current.scrollHeight;
			}
		} catch {}
	}, [messages, isThinking]);

	const pickIndianEnglishVoice = React.useCallback(() => {
		try {
			const synth = window.speechSynthesis;
			if (!synth) return null;
			const voices = synth.getVoices?.() || [];
			return (
				voices.find(v => /en-IN/i.test(v.lang)) ||
				voices.find(v => /India|Indian/i.test(v.name)) ||
				voices.find(v => /en-GB/i.test(v.lang)) ||
				voices.find(v => /en-US/i.test(v.lang)) ||
				voices[0] || null
			);
		} catch { return null; }
	}, []);

	const speak = React.useCallback((text) => {
		if (!text) return;
		try {
			const synth = window.speechSynthesis;
			if (!synth) return;
			const uttr = new SpeechSynthesisUtterance(text);
			const voice = pickIndianEnglishVoice();
			if (voice) uttr.voice = voice;
			uttr.rate = 1;
			synth.cancel();
			synth.speak(uttr);
		} catch {}
	}, [pickIndianEnglishVoice]);

	const sendPrompt = async (question) => {
		console.log('Sir Ganguly is thinking…');
		setIsThinking(true);
		try {
			const res = await fetch('/api/ask', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ question })
			});
			if (!res.ok) throw new Error('Request failed');
			const data = await res.json();
			const reply = (data && data.reply) ? String(data.reply) : '';
			setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
			speak(reply);
		} catch (e) {
			const fallback = 'I could not reach OpenAgents right now. Please add OPENAGENTS_KEY or try again shortly.';
			setMessages((prev) => [...prev, { role: 'assistant', content: fallback }]);
		} finally {
			setIsThinking(false);
		}
	};

	const onSend = () => {
		const q = input.trim();
		if (!q) return;
		setInput('');
		setMessages((prev) => [...prev, { role: 'user', content: q }]);
		sendPrompt(q);
	};

	const startListening = () => {
		try {
			const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
			if (!SR) return;
			if (!recognitionRef.current) {
				const recog = new SR();
				recog.continuous = false;
				recog.interimResults = true;
				recog.lang = 'en-IN';
				recog.onstart = () => setIsListening(true);
				recog.onerror = () => setIsListening(false);
				recog.onend = () => setIsListening(false);
				recog.onresult = (event) => {
					let interim = '';
					let finalText = '';
					for (let i = event.resultIndex; i < event.results.length; i++) {
						const res = event.results[i];
						if (res.isFinal) finalText += res[0].transcript;
						else interim += res[0].transcript;
					}
					if (interim) setInput(interim);
					if (finalText.trim()) {
						setInput(finalText.trim());
						setTimeout(onSend, 0);
					}
				};
				recognitionRef.current = recog;
			}
			recognitionRef.current.start();
		} catch {}
	};

	const stopListening = () => {
		try { if (recognitionRef.current) recognitionRef.current.stop(); } catch {}
		setIsListening(false);
	};

	return (
		<div className="w-full max-w-2xl mx-auto px-4">
			<div className="mb-3 text-center text-slate-800 font-semibold">
				Hello Student 👋 I’m Sir Ganguly, your Computer Applications teacher!
			</div>
			<div className="bg-gradient-to-b from-blue-50 via-pink-50 to-purple-50 rounded-2xl shadow-xl p-3 sm:p-4 border border-white/60">
				<div ref={listRef} className="h-80 sm:h-96 overflow-y-auto rounded-2xl bg-white/70 shadow-inner p-4 space-y-3">
					{messages.map((m, idx) => (
						<div key={idx} className={
							(m.role === 'user' ? 'justify-end' : 'justify-start') + ' flex'
						}>
							<div className={
								'px-4 py-2 rounded-2xl max-w-[85%] ' +
								(m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-100 text-slate-800 rounded-bl-sm')
							}>
								<div className="text-xs opacity-70 mb-1">{m.role === 'user' ? 'Student' : 'Sir Ganguly'}</div>
								<div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
							</div>
						</div>
					))}
					{isThinking && (
						<div className="flex justify-start">
							<div className="px-4 py-2 rounded-2xl bg-slate-100 text-slate-600 animate-pulse">
								Sir Ganguly is thinking…
							</div>
						</div>
					)}
				</div>
				<div className="mt-3 flex items-center gap-2">
					<button
						onClick={() => (isListening ? stopListening() : startListening())}
						className={
							'px-3 py-2 rounded-xl shadow bg-rose-100 text-rose-700 hover:bg-rose-200 transition ' +
							(isListening ? 'ring-2 ring-rose-400' : '')
						}
						title="Speak"
					>
						{isListening ? '■' : '🎤'}
					</button>
					<input
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Ask a question…"
						className="flex-1 px-4 py-2 rounded-xl bg-white shadow-inner border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300"
						onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
					/>
					<button
						onClick={onSend}
						disabled={isThinking || !input.trim()}
						className="px-4 py-2 rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-50"
					>
						Send
					</button>
				</div>
			</div>
		</div>
	);
}

// Expose globally for mounting
window.ChatBox = ChatBox;


