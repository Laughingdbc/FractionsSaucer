let audioCtx: AudioContext | null = null;

const getAudioCtx = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
};

export const playTone = (freq: number, type: OscillatorType, duration: number, vol: number = 0.1) => {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (e) {
    console.error("Audio play error", e);
  }
};

export const playPositiveGem = () => {
  playTone(600, 'sine', 0.1, 0.1);
  setTimeout(() => playTone(800, 'sine', 0.15, 0.1), 50);
};

export const playNegativeGem = () => {
  playTone(300, 'square', 0.1, 0.1);
  setTimeout(() => playTone(200, 'square', 0.15, 0.1), 50);
};

export const playLevelComplete = () => {
  [440, 554, 659, 880].forEach((freq, i) => {
    setTimeout(() => playTone(freq, 'sine', 0.3, 0.15), i * 100);
  });
};

export const playReset = () => {
  playTone(150, 'sawtooth', 0.4, 0.2);
  setTimeout(() => playTone(100, 'sawtooth', 0.4, 0.2), 100);
};

export const playPulsar = () => {
  // Dramatic sweep up
  try {
    const ctx = getAudioCtx();
    
    // Main sweep oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.15);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.5);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);

    // High sine ping
    setTimeout(() => playTone(1400, 'sine', 0.2, 0.15), 80);
    setTimeout(() => playTone(1800, 'sine', 0.15, 0.1), 150);
  } catch (e) {
    console.error("Audio play error", e);
  }
};
