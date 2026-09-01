import { useCallback, useEffect, useRef, useState } from "react";

type SR = any;

export function stopAllBrowserSpeech() {
  if (typeof window === "undefined") return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    synth.pause();
    synth.cancel();
    synth.resume();
    synth.cancel();
    window.setTimeout(() => {
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    }, 50);
    window.setTimeout(() => {
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    }, 250);
  } catch { /* ignore */ }
}

export type VoicePresetKey = "aria" | "orion" | "nova" | "atlas";

export const VOICE_PRESETS: {
  key: VoicePresetKey;
  label: string;
  desc: string;
  match: RegExp;
  lang: RegExp;
  pitch: number;
  rate: number;
}[] = [
  { key: "aria",  label: "Aria",  desc: "Warm female · US",   match: /samantha|google us english|aria|jenny|zira|female/i, lang: /en-US/i, pitch: 1.05, rate: 1.0 },
  { key: "nova",  label: "Nova",  desc: "Soft female · UK",   match: /karen|serena|kate|google uk english female|female/i, lang: /en-GB/i, pitch: 1.1,  rate: 1.0 },
  { key: "orion", label: "Orion", desc: "Deep male · UK",     match: /daniel|google uk english male|oliver|male/i,         lang: /en-GB/i, pitch: 0.9,  rate: 1.0 },
  { key: "atlas", label: "Atlas", desc: "Confident male · US",match: /alex|david|fred|google us english male|male/i,        lang: /en-US/i, pitch: 0.95, rate: 1.05 },
];

export function useSpeech() {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptId, setTranscriptId] = useState(0);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [wordPulse, setWordPulse] = useState(0);
  const [voicePreset, setVoicePresetState] = useState<VoicePresetKey>("orion");
  const recognitionRef = useRef<SR | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const voicePresetRef = useRef<VoicePresetKey>("orion");
  const wantListeningRef = useRef(false);
  const startingRef = useRef(false);
  const pausedRef = useRef(false);
  const restartTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const pendingPlayTimerRef = useRef<number | null>(null);
  const keepAliveTimerRef = useRef<number | null>(null);

  const safeStart = useCallback((deferred = false) => {
    if (startingRef.current) return;
    startingRef.current = true;
    const run = () => {
      try {
        recognitionRef.current?.start();
        setNeedsGesture(false);
        setListening(true);
      } catch (error: any) {
        const name = String(error?.name || error?.message || "").toLowerCase();
        if (name.includes("notallowed") || name.includes("permission")) {
          wantListeningRef.current = false;
          setNeedsGesture(true);
          setListening(false);
        }
        // InvalidStateError means it is already running — keep the UI active.
        if (name.includes("invalidstate")) setListening(true);
      } finally {
        startingRef.current = false;
      }
    };
    if (deferred) {
      restartTimerRef.current = window.setTimeout(run, 220);
    } else {
      // Initial start must happen inside the direct click/tap handler.
      run();
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    mountedRef.current = true;
    const stopLocalSpeech = () => {
      wantListeningRef.current = false;
      pausedRef.current = false;
      if (restartTimerRef.current) {
        window.clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (pendingPlayTimerRef.current) {
        window.clearTimeout(pendingPlayTimerRef.current);
        pendingPlayTimerRef.current = null;
      }
      if (keepAliveTimerRef.current) {
        window.clearInterval(keepAliveTimerRef.current);
        keepAliveTimerRef.current = null;
      }
      currentIdRef.current++;
      queueRef.current = [];
      currentJobRef.current = null;
      currentCharRef.current = 0;
      setSpeaking(false);
      setListening(false);
      try { recognitionRef.current?.stop(); } catch { /* ignore */ }
      stopAllBrowserSpeech();
    };

    window.addEventListener("jenvu:speech:stop-all", stopLocalSpeech);

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return () => {
        mountedRef.current = false;
        window.removeEventListener("jenvu:speech:stop-all", stopLocalSpeech);
        stopLocalSpeech();
      };
    }
    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    // en-US recognizes English + Hinglish reliably across Chrome/Edge.
    // ur-PK silently returns no results for most accents.
    rec.lang = "en-US";
    rec.onresult = (e: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interimText += r[0].transcript;
      }
      if (interimText) setInterim(interimText);
      if (finalText.trim()) {
        setInterim("");
        setTranscript(finalText.trim());
        setTranscriptId((id) => id + 1);
      }
    };
    rec.onstart = () => setListening(true);
    rec.onend = () => {
      // auto-restart if user still wants to listen (continuous mode)
      if (wantListeningRef.current && !pausedRef.current) {
        // keep UI in "listening" — don't flicker to Standby between restarts
        safeStart(true);
      } else {
        setListening(false);
      }
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        wantListeningRef.current = false;
        setNeedsGesture(true);
        setListening(false);
      } else if (e?.error === "no-speech" || e?.error === "aborted" || e?.error === "network") {
        // transient — let onend handle restart
      } else {
        setListening(false);
      }
    };
    recognitionRef.current = rec;

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const preset = VOICE_PRESETS.find((p) => p.key === voicePresetRef.current) ?? VOICE_PRESETS[0];
      voiceRef.current =
        voices.find((v) => preset.lang.test(v.lang) && preset.match.test(v.name)) ||
        voices.find((v) => preset.match.test(v.name)) ||
        voices.find((v) => preset.lang.test(v.lang)) ||
        voices.find((v) => /en/i.test(v.lang)) ||
        voices[0] ||
        null;
    };
    // restore saved preset
    try {
      const saved = localStorage.getItem("jenvu.voicePreset") as VoicePresetKey | null;
      if (saved && VOICE_PRESETS.some((p) => p.key === saved)) {
        voicePresetRef.current = saved;
        setVoicePresetState(saved);
      }
    } catch { /* ignore */ }
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;
    // re-pick when preset changes
    (window as any).__jenvuPickVoice = pickVoice;

    return () => {
      mountedRef.current = false;
      window.removeEventListener("jenvu:speech:stop-all", stopLocalSpeech);
      stopLocalSpeech();
    };
  }, [safeStart]);


  const startListening = useCallback(() => {
    wantListeningRef.current = true;
    pausedRef.current = false;
    setNeedsGesture(false);
    setTranscript("");
    setInterim("");
    safeStart(false);
  }, [safeStart]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    pausedRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  // Pause listening during TTS, then resume if continuous mode was on
  const pauseListening = useCallback(() => {
    pausedRef.current = true;
    try { recognitionRef.current?.stop(); } catch { /* ignore */ }
    setListening(false);
  }, []);

  const resumeIfWanted = useCallback(() => {
    if (wantListeningRef.current) {
      pausedRef.current = false;
      safeStart(true);
    }
  }, [safeStart]);

  // --- queued speech with interrupt+resume that preserves onDone callbacks ---
  type SpeechJob = { text: string; onDone?: () => void };
  const queueRef = useRef<SpeechJob[]>([]);
  const currentJobRef = useRef<SpeechJob | null>(null);
  const currentCharRef = useRef<number>(0);
  const currentIdRef = useRef<number>(0);

  const _playNext = useCallback(() => {
    if (!mountedRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      currentJobRef.current = null;
      currentCharRef.current = 0;
      setSpeaking(false);
      return;
    }
    // Empty-text job = "fire onDone then continue". Used to defer the original
    // narration's completion callback until AFTER the interrupting reply finishes.
    if (!next.text || !next.text.trim()) {
      currentJobRef.current = null;
      try { next.onDone?.(); } catch { /* ignore */ }
      _playNext();
      return;
    }
    currentJobRef.current = next;
    currentCharRef.current = 0;
    const id = ++currentIdRef.current;
    const u = new SpeechSynthesisUtterance(next.text);
    if (voiceRef.current) u.voice = voiceRef.current;
    u.lang = "en-US";
    const preset = VOICE_PRESETS.find((p) => p.key === voicePresetRef.current) ?? VOICE_PRESETS[0];
    u.rate = preset.rate;
    u.pitch = preset.pitch;
    u.volume = 1;
    u.onstart = () => { setSpeaking(true); setWordPulse((n) => n + 1); };
    u.onboundary = (ev: any) => {
      if (typeof ev?.charIndex === "number") currentCharRef.current = ev.charIndex;
      if (!ev || ev.name === undefined || ev.name === "word") setWordPulse((n) => n + 1);
    };
    // Chrome bug: speechSynthesis silently stops after ~15s. Pulse pause/resume to keep alive.
    if (keepAliveTimerRef.current) window.clearInterval(keepAliveTimerRef.current);
    const keepAlive = window.setInterval(() => {
      try {
        if (!mountedRef.current) return;
        if (!window.speechSynthesis.speaking) return;
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      } catch { /* ignore */ }
    }, 8000);
    keepAliveTimerRef.current = keepAlive;
    const advance = () => {
      window.clearInterval(keepAlive);
      if (keepAliveTimerRef.current === keepAlive) keepAliveTimerRef.current = null;
      if (id !== currentIdRef.current) return; // invalidated by interrupt
      const done = next.onDone;
      currentJobRef.current = null;
      try { done?.(); } catch { /* ignore */ }
      _playNext();
    };
    u.onend = advance;
    u.onerror = advance;
    window.speechSynthesis.speak(u);

  }, []);

  const speak = useCallback((text: string, onDone?: () => void) => {
    if (typeof window === "undefined" || !text) return;
    const isSpeakingNow = window.speechSynthesis.speaking && !!currentJobRef.current;

    // Build the resume job from the currently-speaking utterance so it picks up
    // where it left off after the new reply finishes — and keep its onDone.
    let resumeJob: SpeechJob | null = null;
    if (isSpeakingNow && currentJobRef.current) {
      const cur = currentJobRef.current;
      const remaining = cur.text.slice(currentCharRef.current).trim();
      resumeJob = { text: remaining, onDone: cur.onDone };
      // The current job's onDone has been moved into resumeJob — don't fire it twice.
      cur.onDone = undefined;
    }

    const previous = queueRef.current.slice();
    queueRef.current = [
      { text, onDone },
      ...(resumeJob ? [resumeJob] : []),
      ...previous,
    ];
    currentIdRef.current++; // invalidate any in-flight onend handlers
    if (pendingPlayTimerRef.current) {
      window.clearTimeout(pendingPlayTimerRef.current);
      pendingPlayTimerRef.current = null;
    }
    window.speechSynthesis.cancel();
    // small delay so cancel() finishes before the new utterance starts (Chrome quirk)
    pendingPlayTimerRef.current = window.setTimeout(() => {
      pendingPlayTimerRef.current = null;
      if (mountedRef.current) _playNext();
    }, 80);
  }, [_playNext]);

  const stopSpeaking = useCallback(() => {
    currentIdRef.current++;
    queueRef.current = [];
    currentJobRef.current = null;
    currentCharRef.current = 0;
    if (pendingPlayTimerRef.current) {
      window.clearTimeout(pendingPlayTimerRef.current);
      pendingPlayTimerRef.current = null;
    }
    if (keepAliveTimerRef.current) {
      window.clearInterval(keepAliveTimerRef.current);
      keepAliveTimerRef.current = null;
    }
    stopAllBrowserSpeech();
    setSpeaking(false);
  }, []);

  const setVoicePreset = useCallback((key: VoicePresetKey) => {
    voicePresetRef.current = key;
    setVoicePresetState(key);
    try { localStorage.setItem("jenvu.voicePreset", key); } catch { /* ignore */ }
    try { (window as any).__jenvuPickVoice?.(); } catch { /* ignore */ }
    // preview the chosen voice
    try {
      stopAllBrowserSpeech();
      const preset = VOICE_PRESETS.find((p) => p.key === key) ?? VOICE_PRESETS[0];
      const u = new SpeechSynthesisUtterance(`Voice set to ${preset.label}.`);
      const voices = window.speechSynthesis.getVoices();
      const v = voices.find((vv) => preset.lang.test(vv.lang) && preset.match.test(vv.name))
        || voices.find((vv) => preset.match.test(vv.name))
        || voices.find((vv) => preset.lang.test(vv.lang));
      if (v) u.voice = v;
      u.rate = preset.rate; u.pitch = preset.pitch;
      window.speechSynthesis.speak(u);
    } catch { /* ignore */ }
  }, []);

  return {
    listening, speaking, transcript, transcriptId, interim, supported, needsGesture, wordPulse,
    voicePreset, setVoicePreset,
    startListening, stopListening, pauseListening, resumeIfWanted,
    speak, stopSpeaking, setTranscript,
    isContinuous: () => wantListeningRef.current,
  };
}
