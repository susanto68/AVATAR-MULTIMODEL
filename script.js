// Module script: Three.js scene, model switching, API calls, TTS, fallbacks
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const el = (id) => document.getElementById(id);
const modelSelect = el('modelSelect');
const askBtn = el('askBtn');
const micBtn = el('micBtn');
const input = el('userInput');
const historyEl = el('history');
const spinner = el('spinner');
const speaking = el('speaking');
const statusChip = el('statusChip');

const HUGGINGFACE_BASE = 'https://text.pollinations.ai/'; // Free public endpoint backed by open-source models
const OLLAMA_URL = 'http://localhost:11434';

let scene, camera, renderer, avatar, clock, mixer;
let speakingAnimationActive = false;
const mouth = { mesh: null, morphKey: null, morphIndex: -1, jawBone: null, open: 0, target: 0 };
let mouthInterval = null;
let lastFive = loadHistory();
let recognition = null;
let isListening = false;
const hasRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
let proEnabled = false;
let apiHealthChecked = false;
let SYSTEM_PROMPT = '';
let RV_KEY = '';
const rig = {
	head: null, neck: null, spine: null,
	leftArm: null, rightArm: null,
	leftForeArm: null, rightForeArm: null,
	leftHand: null, rightHand: null,
	leftEye: null, rightEye: null,
	blinkLeft: { mesh: null, index: -1 },
	blinkRight: { mesh: null, index: -1 }
};
let eyeOffsetX = 0, eyeOffsetY = 0, eyeSaccadeTimer = 0;
let blinkTimer = 0; const BLINK_DUR = 0.12; let nextBlinkTime = 0;
let gestureTimer = 0; let gestureDuration = 0; let gestureStrength = 0;

init();
bootstrapWelcome();

function init() {
	setupThree();
	setupUI();
	// Load system prompt
	fetch('/system_prompt.txt').then(r => r.ok ? r.text() : '').then(t => { SYSTEM_PROMPT = (t || '').trim(); }).catch(() => {});
	// Load config (ResponsiveVoice key)
	fetch('/api/config').then(r => r.ok ? r.json() : null).then(j => {
		if (j && j.responsiveVoiceKey) {
			RV_KEY = j.responsiveVoiceKey;
			try {
				const s = document.getElementById('rvScript');
				if (s && !s.src.includes('?key=')) s.src = s.src + '?key=' + encodeURIComponent(RV_KEY);
			} catch {}
		}
	}).catch(() => {});
}

function setupThree() {
	const container = document.getElementById('canvasContainer');
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0e1628);
	camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);
	camera.position.set(0, 1.7, 2.8);

	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(container.clientWidth, container.clientHeight);
	container.appendChild(renderer.domElement);

	const hemi = new THREE.HemisphereLight(0xffffff, 0x334466, 1.1);
	scene.add(hemi);
	const dir = new THREE.DirectionalLight(0xffffff, 0.6);
	dir.position.set(3, 5, 2);
	scene.add(dir);

	const floor = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.1, 48), new THREE.MeshStandardMaterial({ color: 0x0b1222, roughness: 0.9 }));
	floor.position.y = -0.7;
	scene.add(floor);

	clock = new THREE.Clock();
	loadAvatar();
	animate();

	window.addEventListener('resize', () => {
		const w = container.clientWidth;
		const h = container.clientHeight;
		renderer.setSize(w, h);
		camera.aspect = w / h;
		camera.updateProjectionMatrix();
	});
}

function loadAvatar() {
	const loader = new GLTFLoader();
	loader.load('/assets/avatar.glb', (gltf) => {
		avatar = gltf.scene;
		avatar.position.set(0, -1.0, 0);
		avatar.scale.set(1.25, 1.25, 1.25);
		avatar.traverse((obj) => {
			if (obj.isMesh) {
				obj.castShadow = true;
				obj.receiveShadow = true;
			}
		});
		scene.add(avatar);
		mixer = gltf.animations?.length ? new THREE.AnimationMixer(avatar) : null;
		detectMouth(avatar);
		detectRig(avatar);
		scheduleNextBlink();
	}, (xhr) => {
		// progress noop
	}, (err) => {
		// Fallback primitive if GLB not provided
		const geo = new THREE.SphereGeometry(0.6, 32, 32);
		const mat = new THREE.MeshStandardMaterial({ color: 0x58f4c7, roughness: 0.35, metalness: 0.1 });
		avatar = new THREE.Mesh(geo, mat);
		avatar.position.set(0, 0, 0);
		scene.add(avatar);
	});
}

function detectMouth(root) {
	let candidateMesh = null;
	let candidateKey = null;
	let candidateIndex = -1;
	root.traverse((obj) => {
		if (!mouth.jawBone && obj.isBone && /jaw|mouth/i.test(obj.name)) {
			mouth.jawBone = obj;
		}
		if (!candidateMesh && obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
			const keys = Object.keys(obj.morphTargetDictionary);
			const preferred = ['jawOpen', 'mouthOpen', 'MouthOpen', 'viseme_aa', 'viseme_OW', 'viseme_U', 'A', 'O', 'U'];
			for (const k of preferred) {
				if (keys.includes(k)) {
					candidateMesh = obj;
					candidateKey = k;
					candidateIndex = obj.morphTargetDictionary[k];
					break;
				}
			}
		}
	});
	mouth.mesh = candidateMesh;
	mouth.morphKey = candidateKey;
	mouth.morphIndex = candidateIndex;
}

function detectRig(root) {
	root.traverse((obj) => {
		if (obj.isBone) {
			if (!rig.head && /head/i.test(obj.name)) rig.head = obj;
			else if (!rig.neck && /neck/i.test(obj.name)) rig.neck = obj;
			else if (!rig.spine && /spine|chest/i.test(obj.name)) rig.spine = obj;
			else if (!rig.leftArm && /(left|l).*arm/i.test(obj.name)) rig.leftArm = obj;
			else if (!rig.rightArm && /(right|r).*arm/i.test(obj.name)) rig.rightArm = obj;
			else if (!rig.leftForeArm && /(left|l).*forearm|lowerarm/i.test(obj.name)) rig.leftForeArm = obj;
			else if (!rig.rightForeArm && /(right|r).*forearm|lowerarm/i.test(obj.name)) rig.rightForeArm = obj;
			else if (!rig.leftHand && /(left|l).*hand/i.test(obj.name)) rig.leftHand = obj;
			else if (!rig.rightHand && /(right|r).*hand/i.test(obj.name)) rig.rightHand = obj;
			else if (!rig.leftEye && /(left|l).*(eye|eyeball)/i.test(obj.name)) rig.leftEye = obj;
			else if (!rig.rightEye && /(right|r).*(eye|eyeball)/i.test(obj.name)) rig.rightEye = obj;
		}
		if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
			const dict = obj.morphTargetDictionary;
			const leftKeys = ['eyeBlinkLeft','Blink_L','blink_L','blinkLeft','EyeBlink_L'];
			const rightKeys = ['eyeBlinkRight','Blink_R','blink_R','blinkRight','EyeBlink_R'];
			for (const k of leftKeys) if (dict[k] != null && rig.blinkLeft.index < 0) { rig.blinkLeft.mesh = obj; rig.blinkLeft.index = dict[k]; }
			for (const k of rightKeys) if (dict[k] != null && rig.blinkRight.index < 0) { rig.blinkRight.mesh = obj; rig.blinkRight.index = dict[k]; }
			if (rig.blinkLeft.index < 0 && dict['blink'] != null) { rig.blinkLeft.mesh = obj; rig.blinkLeft.index = dict['blink']; }
			if (rig.blinkRight.index < 0 && dict['blink'] != null) { rig.blinkRight.mesh = obj; rig.blinkRight.index = dict['blink']; }
		}
	});
}

function animate() {
	requestAnimationFrame(animate);
	const dt = clock.getDelta();
	const t = clock.elapsedTime;
	if (avatar) {
		updateLivePose(dt, t);
		const smoothing = 0.25;
		mouth.open += (mouth.target - mouth.open) * smoothing;
		if (mouth.jawBone) {
			const base = -0.02;
			mouth.jawBone.rotation.x = base + mouth.open * 0.3;
		} else if (mouth.mesh && mouth.morphIndex >= 0) {
			mouth.mesh.morphTargetInfluences[mouth.morphIndex] = THREE.MathUtils.clamp(mouth.open, 0, 1);
		}
	}
	if (mixer) mixer.update(dt);
	renderer.render(scene, camera);
}

function updateLivePose(dt, t) {
	// Idle sway (global)
	avatar.rotation.y = Math.sin(t * 0.25) * 0.08;

	// Head micro-motions
	if (rig.head) {
		smoothRotate(rig.head, 'y', Math.sin(t * 0.35) * 0.08, 0.1);
		smoothRotate(rig.head, 'x', Math.sin(t * 0.27) * 0.05, 0.1);
	}

	// Eye saccades
	eyeSaccadeTimer -= dt;
	if (eyeSaccadeTimer <= 0) {
		eyeOffsetX = (Math.random() - 0.5) * 0.24;
		eyeOffsetY = (Math.random() - 0.5) * 0.18;
		eyeSaccadeTimer = 0.7 + Math.random() * 1.8;
	}
	if (rig.leftEye) {
		smoothRotate(rig.leftEye, 'y', eyeOffsetX, 0.2);
		smoothRotate(rig.leftEye, 'x', eyeOffsetY, 0.2);
	}
	if (rig.rightEye) {
		smoothRotate(rig.rightEye, 'y', eyeOffsetX, 0.2);
		smoothRotate(rig.rightEye, 'x', eyeOffsetY, 0.2);
	}

	// Blinking
	if (performance.now() >= nextBlinkTime && blinkTimer <= 0) {
		blinkTimer = BLINK_DUR;
		scheduleNextBlink();
	}
	let blinkIntensity = 0;
	if (blinkTimer > 0) {
		blinkTimer -= dt;
		const n = Math.max(0, Math.min(1, blinkTimer / BLINK_DUR));
		blinkIntensity = 1 - Math.abs(2 * n - 1); // up then down
	}
	applyBlink(blinkIntensity);

	// Speaking gestures
	if (speakingAnimationActive && gestureTimer <= 0) {
		gestureDuration = 0.8 + Math.random() * 0.8;
		gestureTimer = gestureDuration;
		gestureStrength = 0.2 + Math.random() * 0.4;
	}
	if (gestureTimer > 0) {
		gestureTimer -= dt;
		const phase = 1 - Math.max(0, Math.min(1, gestureTimer / gestureDuration));
		const s = Math.sin(phase * Math.PI);
		const armX = -s * 0.25 * gestureStrength;
		const foreX = -s * 0.35 * gestureStrength;
		const handZ = s * 0.2 * gestureStrength;
		if (rig.rightArm) smoothRotate(rig.rightArm, 'x', armX, 0.25);
		if (rig.rightForeArm) smoothRotate(rig.rightForeArm, 'x', foreX, 0.25);
		if (rig.rightHand) smoothRotate(rig.rightHand, 'z', handZ, 0.25);
	} else {
		// return limbs to neutral
		if (rig.rightArm) smoothRotate(rig.rightArm, 'x', 0, 0.15);
		if (rig.rightForeArm) smoothRotate(rig.rightForeArm, 'x', 0, 0.15);
		if (rig.rightHand) smoothRotate(rig.rightHand, 'z', 0, 0.15);
	}
}

function applyBlink(v) {
	const val = THREE.MathUtils.clamp(v, 0, 1);
	if (rig.blinkLeft.mesh && rig.blinkLeft.index >= 0) {
		rig.blinkLeft.mesh.morphTargetInfluences[rig.blinkLeft.index] = val;
	}
	if (rig.blinkRight.mesh && rig.blinkRight.index >= 0) {
		rig.blinkRight.mesh.morphTargetInfluences[rig.blinkRight.index] = val;
	}
}

function smoothRotate(bone, axis, target, factor) {
	bone.rotation[axis] += (target - bone.rotation[axis]) * factor;
}

function scheduleNextBlink() {
	nextBlinkTime = performance.now() + 1500 + Math.random() * 3500;
}

function setupUI() {
	modelSelect.addEventListener('change', () => {
		statusChip.textContent = modelSelect.value === 'huggingface' ? 'Free mode' : 'Pro mode';
	});
	
	askBtn.addEventListener('click', onAsk);
	input.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onAsk();
	});

	// Determine if pro endpoints should be available (production HTTPS)
	try {
		proEnabled = (location.protocol === 'https:') && !/localhost|127\.0\.0\.1/i.test(location.hostname);
		const chatOpt = modelSelect.querySelector('option[value="chatgpt"]');
		const gemOpt = modelSelect.querySelector('option[value="gemini"]');
		if (chatOpt) chatOpt.disabled = !proEnabled;
		if (gemOpt) gemOpt.disabled = !proEnabled;
		if (!proEnabled && (modelSelect.value === 'chatgpt' || modelSelect.value === 'gemini')) {
			modelSelect.value = 'huggingface';
			statusChip.textContent = 'Free mode';
		}
	} catch {}

	// If running locally with our Node server, enable pro if keys are present
	try {
		fetch('/api/health').then(r => r.ok ? r.json() : null).then((j) => {
			apiHealthChecked = true;
			if (!j) return;
			const enable = !!(j.openai || j.gemini);
			const chatOpt = modelSelect.querySelector('option[value="chatgpt"]');
			const gemOpt = modelSelect.querySelector('option[value="gemini"]');
			if (chatOpt) chatOpt.disabled = !j.openai;
			if (gemOpt) gemOpt.disabled = !j.gemini;
			proEnabled = enable;
		});
	} catch {}

	// Voice input setup
	if (micBtn) {
		if (!hasRecognition) {
			micBtn.disabled = true;
			micBtn.title = 'Voice input not supported in this browser';
		} else {
			micBtn.addEventListener('click', () => {
				if (isListening) stopListening(); else startListening();
			});
		}
	}

	renderHistory();
}

function onAsk() {
	const prompt = input.value.trim();
	if (!prompt) return;
	input.value = '';
	pushHistory({ role: 'user', content: prompt });
	renderHistory();
	
	setLoading(true);
	queryWithFallback(prompt, modelSelect.value)
		.then((reply) => {
			pushHistory({ role: 'assistant', content: reply });
			renderHistory();
			speak(reply);
		})
		.catch((err) => {
			console.error(err);
			const msg = 'All models unavailable right now. Please try again later.';
			pushHistory({ role: 'assistant', content: msg });
			renderHistory();
			toast(msg, true);
		})
		.finally(() => setLoading(false));
}

async function queryWithFallback(prompt, preferred) {
	const base = ['huggingface', ...(proEnabled ? ['chatgpt','gemini'] : []), 'ollama'];
	const pref = preferred && base.includes(preferred) ? [preferred] : [];
	const order = [...new Set([...pref, ...base])];

	let lastError = null;
	for (const model of order) {
		try {
			statusChip.textContent = `Querying ${model}…`;
			let reply = '';
			if (model === 'huggingface') reply = await callHuggingFace(prompt);
			else if (model === 'chatgpt') reply = await callChatGPT(prompt);
			else if (model === 'gemini') reply = await callGemini(prompt);
			else if (model === 'ollama') reply = await callOllama(prompt);
			// Ensure we don't accept empty or repeated canned responses
			if (reply) {
				const trimmed = reply.trim();
				if (trimmed && !/^Ah, Llama 3\.1/i.test(trimmed)) {
					statusChip.textContent = `${model} ✓`;
					return trimmed;
				}
			}
			throw new Error(`Empty reply from ${model}`);
		} catch (e) {
			lastError = e;
			console.warn(`Model ${model} failed`, e);
		}
	}
	statusChip.textContent = 'Offline';
	throw lastError || new Error('No models succeeded');
}

async function callHuggingFace(prompt) {
	// Free, CORS-friendly endpoint backed by open-source models
	const full = (SYSTEM_PROMPT ? SYSTEM_PROMPT + '\n\n' : '') + prompt;
	const seed = Math.floor(Math.random() * 1e9);
	const url = `${HUGGINGFACE_BASE}llama3.1?prompt=${encodeURIComponent(full)}&temperature=0.8&top_p=0.9&length=300&seed=${seed}`;
	const res = await fetch(url, { method: 'GET', cache: 'no-store' });
	if (!res.ok) throw new Error('Hugging Face free endpoint failed');
	const text = await res.text();
	return sanitizeHF(text);
}

function sanitizeHF(text) {
	let out = (text || '').trim();
	// Strip quotes/newline escapes commonly returned by some spaces
	out = out.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
	// If the response starts with a canned preamble, remove it
	out = out.replace(/^Ah, Llama 3\.1[\s\S]*?\!\s*/i, '');
	return out;
}

async function callChatGPT(prompt) {
	const res = await fetch('/api/openai', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt })
	});
	if (!res.ok) throw new Error('ChatGPT endpoint failed');
	const data = await res.json();
	return data.reply;
}

async function callGemini(prompt) {
	const res = await fetch('/api/gemini', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt })
	});
	if (!res.ok) throw new Error('Gemini endpoint failed');
	const data = await res.json();
	return data.reply;
}

async function callOllama(prompt) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	try {
		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'llama3.1', prompt: (SYSTEM_PROMPT ? SYSTEM_PROMPT + '\n\n' : '') + prompt, system: SYSTEM_PROMPT || undefined, stream: false }),
			signal: controller.signal
		});
		if (!res.ok) throw new Error('Ollama failed');
		const data = await res.json();
		return data.response || '';
	} finally {
		clearTimeout(timeout);
	}
}

function speak(text) {
	if (!text) return;
	const onstart = () => setSpeaking(true);
	const onend = () => setSpeaking(false);

	const shouldUseResponsiveVoice = () => {
		try {
			// Prefer Web Speech on localhost/HTTP to avoid CORS and key warnings
			if (location.protocol !== 'https:') return false;
			return !!(window.responsiveVoice && window.responsiveVoice.speak);
		} catch { return false; }
	};

	const useWebSpeech = () => {
		try {
			const synth = window.speechSynthesis;
			if (!synth) throw new Error('No speechSynthesis');
			const uttr = new SpeechSynthesisUtterance(text);
			uttr.onstart = () => { onstart(); startMouthMotion('webspeech', text, uttr); };
			uttr.onend = () => { onend(); stopMouthMotion(); };
			uttr.onboundary = () => mouthBeat();
			// Try to pick a voice that sounds similar to UK male if present
			const voices = synth.getVoices?.() || [];
			const preferred = voices.find(v => /en-GB/i.test(v.lang) && /male/i.test(v.name))
				|| voices.find(v => /en-GB/i.test(v.lang))
				|| voices.find(v => /English/i.test(v.name));
			if (preferred) uttr.voice = preferred;
			synth.cancel();
			synth.speak(uttr);
		} catch (e) {
			console.warn('TTS unavailable', e);
		}
	};

	let started = false;
	try {
		if (shouldUseResponsiveVoice()) {
			window.responsiveVoice.cancel();
			window.responsiveVoice.speak(text, 'UK English Male', {
				rate: 1,
				onstart: () => { started = true; onstart(); startMouthMotion('rv', text); },
				onend: () => { onend(); stopMouthMotion(); }
			});
			// Watchdog: if RV fails to start (CORS/API key), fallback to Web Speech
			setTimeout(() => {
				if (!started) {
					try { window.responsiveVoice.cancel(); } catch {}
					useWebSpeech();
				}
			}, 400);
			return;
		}
	} catch {}

	useWebSpeech();
}

function startListening() {
	try {
		const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
		if (!SR) throw new Error('SpeechRecognition unavailable');
		if (!recognition) {
			recognition = new SR();
			recognition.continuous = false;
			recognition.interimResults = true;
			recognition.lang = 'en-US';
			recognition.onstart = () => setListening(true);
			recognition.onerror = (e) => { console.warn('SR error', e); setListening(false); };
			recognition.onend = () => setListening(false);
			recognition.onresult = (event) => {
				let interim = '';
				let finalText = '';
				for (let i = event.resultIndex; i < event.results.length; i++) {
					const res = event.results[i];
					if (res.isFinal) finalText += res[0].transcript;
					else interim += res[0].transcript;
				}
				if (interim) input.value = interim;
				if (finalText.trim()) {
					input.value = finalText.trim();
					onAsk();
				}
			};
		}
		recognition.start();
		statusChip.textContent = 'Listening…';
	} catch (e) {
		console.warn('Could not start SR', e);
	}
}

function stopListening() {
	try { if (recognition) recognition.stop(); } catch {}
	setListening(false);
}

function setListening(v) {
	isListening = !!v;
	if (micBtn) micBtn.textContent = v ? '■' : '🎤';
	statusChip.textContent = v ? 'Listening…' : 'Ready';
}

function startMouthMotion(source, text, uttr) {
	stopMouthMotion();
	mouth.target = 0;
	mouth.open = 0;
	if (uttr && typeof uttr.addEventListener === 'function') {
		uttr.addEventListener('boundary', () => mouthBeat());
	}
	mouthInterval = setInterval(() => {
		// Idle decay when boundary events are sparse
		mouth.target *= 0.85;
	}, 50);
	// Initial kick
	mouthBeat();
}

function stopMouthMotion() {
	if (mouthInterval) clearInterval(mouthInterval);
	mouthInterval = null;
	mouth.target = 0;
}

function mouthBeat() {
	const base = 0.6;
	const jitter = Math.random() * 0.3;
	mouth.target = Math.min(1, base + jitter);
}

function setSpeaking(v) {
	speakingAnimationActive = !!v;
	speaking.classList.toggle('hidden', !v);
}

function setLoading(v) {
	spinner.classList.toggle('hidden', !v);
	askBtn.disabled = !!v;
}

function pushHistory(msg) {
	lastFive.push({ role: msg.role, content: msg.content });
	while (lastFive.length > 5) lastFive.shift();
	localStorage.setItem('avatar_history', JSON.stringify(lastFive));
}

function loadHistory() {
	try {
		const s = localStorage.getItem('avatar_history');
		return s ? JSON.parse(s) : [];
	} catch { return []; }
}

function renderHistory() {
	historyEl.innerHTML = '';
	for (const m of lastFive) {
		const div = document.createElement('div');
		div.className = 'msg ' + (m.role === 'user' ? 'user' : 'bot');
		div.textContent = m.content;
		historyEl.appendChild(div);
	}
	historyEl.scrollTop = historyEl.scrollHeight;
}

function toast(text, isError) {
	statusChip.textContent = text;
	statusChip.style.color = isError ? 'var(--danger)' : 'var(--accent)';
	setTimeout(() => { statusChip.textContent = 'Ready'; statusChip.style.color = 'var(--accent)'; }, 3500);
}

function bootstrapWelcome() {
	const welcome = 'Hello! I am your AI avatar. Ask me anything.';
	pushHistory({ role: 'assistant', content: welcome });
	renderHistory();
	setTimeout(() => speak(welcome), 400);
}


