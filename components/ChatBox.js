/* global React, ReactDOM */
(function(){
	function ChatBox(){
		const useState = React.useState, useEffect = React.useEffect, useRef = React.useRef, useCallback = React.useCallback;
		const _a = useState([{ role: 'assistant', content: "Hello Student 👋 I’m Sir Ganguly, your Computer Applications teacher!" }]), messages = _a[0], setMessages = _a[1];
		const _b = useState(''), input = _b[0], setInput = _b[1];
		const _c = useState(false), isThinking = _c[0], setIsThinking = _c[1];
		const _d = useState(false), isListening = _d[0], setIsListening = _d[1];
		const listRef = useRef(null);
		const recognitionRef = useRef(null);

		useEffect(function(){ try{ if(listRef.current){ listRef.current.scrollTop = listRef.current.scrollHeight; } }catch(e){} }, [messages, isThinking]);

		const pickIndianEnglishVoice = useCallback(function(){
			try{ const synth = window.speechSynthesis; if(!synth) return null; const voices = (synth.getVoices && synth.getVoices()) || [];
				return voices.find(function(v){return /en-IN/i.test(v.lang);}) || voices.find(function(v){return /India|Indian/i.test(v.name);}) || voices.find(function(v){return /en-GB/i.test(v.lang);}) || voices.find(function(v){return /en-US/i.test(v.lang);}) || voices[0] || null; }catch(e){ return null; }
		}, []);

		const speak = useCallback(function(text){ if(!text) return; try{ var synth = window.speechSynthesis; if(!synth) return; var uttr = new SpeechSynthesisUtterance(text); var voice = pickIndianEnglishVoice(); if(voice) uttr.voice = voice; uttr.rate = 1; synth.cancel(); synth.speak(uttr);}catch(e){} }, [pickIndianEnglishVoice]);

		async function sendPrompt(question){
			console.log('Sir Ganguly is thinking…'); setIsThinking(true);
			try{
				const res = await fetch('/api/ask',{ method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ question }) });
				if(!res.ok) throw new Error('Request failed');
				const data = await res.json();
				const reply = (data && data.reply) ? String(data.reply) : '';
				setMessages(function(prev){ return prev.concat([{ role:'assistant', content: reply }]); });
				speak(reply);
			}catch(e){
				const fallback = 'I could not reach OpenAgents right now. Please add OPENAGENTS_KEY or try again shortly.';
				setMessages(function(prev){ return prev.concat([{ role:'assistant', content: fallback }]); });
			} finally { setIsThinking(false); }
		}

		function onSend(){ var q = (input||'').trim(); if(!q) return; setInput(''); setMessages(function(prev){ return prev.concat([{ role:'user', content:q }]); }); sendPrompt(q); }

		function startListening(){
			try{ var SR = window.SpeechRecognition || window.webkitSpeechRecognition; if(!SR) return; if(!recognitionRef.current){ var recog = new SR(); recog.continuous=false; recog.interimResults=true; recog.lang='en-IN';
				recog.onstart=function(){ setIsListening(true); };
				recog.onerror=function(){ setIsListening(false); };
				recog.onend=function(){ setIsListening(false); };
				recog.onresult=function(event){ var interim=''; var finalText=''; for(var i=event.resultIndex;i<event.results.length;i++){ var r=event.results[i]; if(r.isFinal) finalText+=r[0].transcript; else interim+=r[0].transcript; } if(interim) setInput(interim); if((finalText||'').trim()){ setInput(finalText.trim()); setTimeout(onSend,0); } };
				recognitionRef.current = recog; }
			recognitionRef.current.start(); }catch(e){}
		}

		function stopListening(){ try{ if(recognitionRef.current) recognitionRef.current.stop(); }catch(e){} setIsListening(false); }

		function MessageBubble(props){
			var m = props.m;
			var isUser = m.role === 'user';
			return React.createElement('div', { className: (isUser ? 'justify-end':'justify-start') + ' flex' },
				React.createElement('div', { className: 'px-4 py-2 rounded-2xl max-w-[85%] ' + (isUser ? 'bg-blue-600 text-white rounded-br-sm':'bg-slate-100 text-slate-800 rounded-bl-sm') },
					React.createElement('div',{ className:'text-xs opacity-70 mb-1' }, isUser ? 'Student':'Sir Ganguly'),
					React.createElement('div',{ className:'whitespace-pre-wrap leading-relaxed' }, m.content)
				)
			);
		}

		return React.createElement('div',{ className:'w-full max-w-2xl mx-auto px-4' },
			React.createElement('div',{ className:'mb-3 text-center text-slate-800 font-semibold' }, 'Hello Student 👋 I’m Sir Ganguly, your Computer Applications teacher!'),
			React.createElement('div',{ className:'bg-gradient-to-b from-blue-50 via-pink-50 to-purple-50 rounded-2xl shadow-xl p-3 sm:p-4 border border-white/60' },
				React.createElement('div',{ ref:listRef, className:'h-80 sm:h-96 overflow-y-auto rounded-2xl bg-white/70 shadow-inner p-4 space-y-3' },
					messages.map(function(m,idx){ return React.createElement(MessageBubble,{ m:m, key:idx }); }),
					isThinking && React.createElement('div',{ className:'flex justify-start' },
						React.createElement('div',{ className:'px-4 py-2 rounded-2xl bg-slate-100 text-slate-600 animate-pulse' }, 'Sir Ganguly is thinking…')
					)
				),
				React.createElement('div',{ className:'mt-3 flex items-center gap-2' },
					React.createElement('button',{ onClick:function(){ isListening?stopListening():startListening(); }, className: 'px-3 py-2 rounded-xl shadow bg-rose-100 text-rose-700 hover:bg-rose-200 transition ' + (isListening?'ring-2 ring-rose-400':''), title:'Speak' }, isListening?'■':'🎤'),
					React.createElement('input',{ value:input, onChange:function(e){ setInput(e.target.value); }, placeholder:'Ask a question…', className:'flex-1 px-4 py-2 rounded-xl bg-white shadow-inner border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-300', onKeyDown:function(e){ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onSend(); } } }),
					React.createElement('button',{ onClick:onSend, disabled:isThinking || !(input||'').trim(), className:'px-4 py-2 rounded-xl bg-blue-600 text-white shadow hover:bg-blue-700 disabled:opacity-50' }, 'Send')
				)
			)
		);
	}

	window.ChatBox = ChatBox;
})();


