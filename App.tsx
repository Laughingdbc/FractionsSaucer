import React, { useEffect, useRef, useState } from 'react';
import { playLevelComplete, playNegativeGem, playPositiveGem, playPulsar, playReset, playTone } from './audio';

type GameState = 'start' | 'playing' | 'math_challenge' | 'level_complete' | 'game_complete' | 'charge_up';

interface Level {
  id: number;
  denominator: number;
  targetNumerator: number;
  numShips: number;
  speedMultiplier: number;
}

const LEVELS: Level[] = [
  { id: 1, denominator: 3, targetNumerator: 3, numShips: 1, speedMultiplier: 0.8 },
  { id: 2, denominator: 4, targetNumerator: 4, numShips: 1, speedMultiplier: 0.9 },
  { id: 3, denominator: 5, targetNumerator: 5, numShips: 1, speedMultiplier: 1.0 },
  { id: 4, denominator: 6, targetNumerator: 6, numShips: 1, speedMultiplier: 1.1 },
  { id: 5, denominator: 7, targetNumerator: 7, numShips: 1, speedMultiplier: 1.2 },
  { id: 6, denominator: 8, targetNumerator: 8, numShips: 1, speedMultiplier: 1.3 },
  { id: 7, denominator: 4, targetNumerator: 8, numShips: 2, speedMultiplier: 1.4 },
  { id: 8, denominator: 5, targetNumerator: 10, numShips: 2, speedMultiplier: 1.5 },
  { id: 9, denominator: 6, targetNumerator: 12, numShips: 2, speedMultiplier: 1.6 },
  { id: 10, denominator: 8, targetNumerator: 24, numShips: 3, speedMultiplier: 1.7 },
  { id: 11, denominator: 3, targetNumerator: 12, numShips: 4, speedMultiplier: 1.8 },
];

interface ChargeQuestion {
  n1: number;
  n2: number;
  op: '+' | '-';
  d: number;
}

interface Gem {
  id: number;
  x: number;
  y: number;
  numerator: number;
  speed: number;
  radius: number;
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  speed: number;
  radius: number;
  rotation: number;
  rotSpeed: number;
}

interface Star {
  x: number;
  y: number;
  speed: number;
  size: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('start');
  const [levelIdx, setLevelIdx] = useState(0);

  // Math challenge state
  const [mathStep, setMathStep] = useState(0);
  const [mathInput, setMathInput] = useState('');
  const [mathError, setMathError] = useState(false);

  // Charge Up state
  const [chargeProgress, setChargeProgress] = useState(0);
  const [chargeQuestion, setChargeQuestion] = useState<ChargeQuestion>({ n1: 1, n2: 1, op: '+', d: 3 });

  const gameStateRef = useRef(gameState);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  const levelIdxRef = useRef(levelIdx);
  useEffect(() => { levelIdxRef.current = levelIdx; }, [levelIdx]);

  const stateRef = useRef({
    shipX: window.innerWidth / 2,
    shipY: window.innerHeight - 80,
    currentNumerator: 0,
    gems: [] as Gem[],
    obstacles: [] as Obstacle[],
    stars: [] as Star[],
    shockwaves: [] as Shockwave[],
    collectedHistory: [] as number[],
    keys: {} as Record<string, boolean>,
    lastTime: 0,
    gemSpawnTimer: 0,
    obstacleSpawnTimer: 0,
    flashTimer: 0,
    bgmTimer: 0,
    bgmStep: 0,
    powerUps: 0,
  });

  const requestRef = useRef<number>(0);

  // Initialize stars
  useEffect(() => {
    stateRef.current.stars = Array.from({ length: 100 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      speed: Math.random() * 2 + 1,
      size: Math.random() * 2 + 1,
    }));
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = true;

      // Spacebar triggers pulsar power-up during gameplay
      if (e.key === ' ' && gameStateRef.current === 'playing') {
        e.preventDefault();
        const state = stateRef.current;
        if (state.powerUps > 0) {
          state.powerUps -= 1;
          playPulsar();

          // Create shockwave visual
          state.shockwaves.push({
            x: state.shipX,
            y: state.shipY,
            radius: 0,
            maxRadius: Math.max(window.innerWidth, window.innerHeight),
            alpha: 1,
          });

          // Destroy all obstacles
          state.obstacles = [];
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const spawnGem = (level: Level, canvasWidth: number): Gem => {
    const isNegative = Math.random() < 0.3;
    let num = Math.floor(Math.random() * (level.denominator - 1)) + 1;
    if (isNegative) num = -num;

    return {
      id: Math.random(),
      x: Math.random() * (canvasWidth - 80) + 40,
      y: -40,
      numerator: num,
      speed: (Math.random() * 1.5 + 1.5) * level.speedMultiplier,
      radius: 32,
    };
  };

  const drawShip = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, denominator: number, currentNumerator: number) => {
    // Base
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Segments
    for (let i = 0; i < denominator; i++) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, (i * 2 * Math.PI) / denominator, ((i + 1) * 2 * Math.PI) / denominator);
      ctx.closePath();

      if (i < currentNumerator) {
        ctx.fillStyle = '#3b82f6';
      } else {
        ctx.fillStyle = '#0f172a';
      }
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Dome
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  };

  const formatFraction = (numerator: number, denominator: number): string => {
    if (numerator === 0) return `0/${denominator}`;
    const wholes = Math.floor(numerator / denominator);
    const remainder = numerator % denominator;
    if (wholes === 0) return `${numerator}/${denominator}`;
    if (remainder === 0) return `${numerator}/${denominator} (${wholes} Whole${wholes > 1 ? 's' : ''})`;
    return `${wholes} ${remainder}/${denominator}`;
  };

  const update = (dt: number) => {
    const state = stateRef.current;
    const level = LEVELS[levelIdxRef.current];
    const canvas = canvasRef.current;
    if (!canvas) return;

    // BGM
    state.bgmTimer -= dt;
    if (state.bgmTimer <= 0) {
      const baseFreq = 130.81 * Math.pow(1.05946, level.id - 1);
      const speed = Math.max(120, 250 - level.id * 10);
      const pattern = [0, 3, 7, 10, 12, 10, 7, 3];
      const freq = baseFreq * Math.pow(2, pattern[state.bgmStep % pattern.length] / 12);
      playTone(freq, 'square', 0.1, 0.02);
      if (state.bgmStep % 4 === 0) {
        playTone(baseFreq / 2, 'sawtooth', 0.15, 0.04);
      }
      state.bgmStep++;
      state.bgmTimer = speed;
    }

    // Movement
    const moveSpeed = 0.6 * dt;
    if (state.keys['arrowup'] || state.keys['w']) state.shipY -= moveSpeed;
    if (state.keys['arrowdown'] || state.keys['s']) state.shipY += moveSpeed;
    if (state.keys['arrowleft'] || state.keys['a']) state.shipX -= moveSpeed;
    if (state.keys['arrowright'] || state.keys['d']) state.shipX += moveSpeed;

    const radius = 35;
    const playerWidth = level.numShips * radius * 2.5;
    const playerHeight = radius * 2;

    if (state.shipX < playerWidth / 2) state.shipX = playerWidth / 2;
    if (state.shipX > canvas.width - playerWidth / 2) state.shipX = canvas.width - playerWidth / 2;
    if (state.shipY < 100 + playerHeight / 2) state.shipY = 100 + playerHeight / 2;
    if (state.shipY > canvas.height - playerHeight / 2) state.shipY = canvas.height - playerHeight / 2;

    // Stars
    state.stars.forEach(star => {
      star.y += star.speed * (dt / 16);
      if (star.y > canvas.height) {
        star.y = 0;
        star.x = Math.random() * canvas.width;
      }
    });

    // Flash
    if (state.flashTimer > 0) {
      state.flashTimer -= dt;
    }

    // Shockwaves
    for (let i = state.shockwaves.length - 1; i >= 0; i--) {
      const sw = state.shockwaves[i];
      sw.radius += dt * 2.5;
      sw.alpha = 1 - sw.radius / sw.maxRadius;
      if (sw.alpha <= 0) {
        state.shockwaves.splice(i, 1);
      }
    }

    // Gems
    state.gemSpawnTimer -= dt;
    if (state.gemSpawnTimer <= 0) {
      state.gems.push(spawnGem(level, canvas.width));
      state.gemSpawnTimer = 1500 / level.speedMultiplier;
    }

    // Obstacles
    state.obstacleSpawnTimer -= dt;
    if (state.obstacleSpawnTimer <= 0) {
      state.obstacles.push({
        id: Math.random(),
        x: Math.random() * (canvas.width - 60) + 30,
        y: -30,
        speed: (Math.random() * 2 + 2) * level.speedMultiplier,
        radius: 20 + Math.random() * 15,
        rotation: 0,
        rotSpeed: (Math.random() - 0.5) * 0.1,
      });
      state.obstacleSpawnTimer = 2500 / level.speedMultiplier;
    }

    // Update Obstacles
    for (let i = state.obstacles.length - 1; i >= 0; i--) {
      const obs = state.obstacles[i];
      obs.y += obs.speed * (dt / 16);
      obs.rotation += obs.rotSpeed * (dt / 16);

      if (
        obs.y + obs.radius > state.shipY - radius &&
        obs.y - obs.radius < state.shipY + radius &&
        obs.x + obs.radius > state.shipX - playerWidth / 2 &&
        obs.x - obs.radius < state.shipX + playerWidth / 2
      ) {
        state.currentNumerator = 0;
        state.collectedHistory = [];
        state.flashTimer = 300;
        playReset();
        state.obstacles.splice(i, 1);
        continue;
      }

      if (obs.y > canvas.height + 50) {
        state.obstacles.splice(i, 1);
      }
    }

    // Update Gems
    for (let i = state.gems.length - 1; i >= 0; i--) {
      const gem = state.gems[i];
      gem.y += gem.speed * (dt / 16);

      if (
        gem.y + gem.radius > state.shipY - radius &&
        gem.y - gem.radius < state.shipY + radius &&
        gem.x + gem.radius > state.shipX - playerWidth / 2 &&
        gem.x - gem.radius < state.shipX + playerWidth / 2
      ) {
        state.currentNumerator += gem.numerator;
        state.collectedHistory.push(gem.numerator);

        if (gem.numerator > 0) {
          playPositiveGem();
        } else {
          playNegativeGem();
        }

        if (state.currentNumerator < 0) {
          state.currentNumerator = 0;
          state.collectedHistory = [];
        }

        if (state.currentNumerator === level.targetNumerator) {
          if (state.collectedHistory.length <= 1) {
            playLevelComplete();
            if (levelIdxRef.current === LEVELS.length - 1) {
              setGameState('game_complete');
            } else {
              setGameState('level_complete');
            }
          } else {
            setMathStep(1);
            setMathInput('');
            setMathError(false);
            setGameState('math_challenge');
          }
        } else if (state.currentNumerator > level.targetNumerator) {
          state.currentNumerator = 0;
          state.collectedHistory = [];
          state.flashTimer = 300;
          playReset();
        }

        state.gems.splice(i, 1);
        continue;
      }

      if (gem.y > canvas.height + 50) {
        state.gems.splice(i, 1);
      }
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const level = LEVELS[levelIdxRef.current];
    const state = stateRef.current;

    // Background
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stars
    ctx.fillStyle = '#ffffff';
    state.stars.forEach(star => {
      ctx.globalAlpha = star.speed / 4;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1.0;

    // Shockwaves
    state.shockwaves.forEach(sw => {
      ctx.save();
      // Outer ring - magenta
      ctx.strokeStyle = `rgba(217, 70, 239, ${sw.alpha * 0.8})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner ring - cyan
      ctx.strokeStyle = `rgba(34, 211, 238, ${sw.alpha * 0.6})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius * 0.85, 0, Math.PI * 2);
      ctx.stroke();

      // Glow fill
      const gradient = ctx.createRadialGradient(sw.x, sw.y, sw.radius * 0.7, sw.x, sw.y, sw.radius);
      gradient.addColorStop(0, `rgba(217, 70, 239, 0)`);
      gradient.addColorStop(0.7, `rgba(217, 70, 239, ${sw.alpha * 0.05})`);
      gradient.addColorStop(1, `rgba(34, 211, 238, ${sw.alpha * 0.15})`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // Ship
    const radius = 35;
    const numShips = level.numShips;

    for (let s = 0; s < numShips; s++) {
      const shipXOffset = state.shipX + (s - (numShips - 1) / 2) * (radius * 2.5);
      const shipNumerator = Math.max(0, Math.min(level.denominator, state.currentNumerator - s * level.denominator));
      drawShip(ctx, shipXOffset, state.shipY, radius, level.denominator, shipNumerator);
    }

    // Obstacles
    state.obstacles.forEach(obs => {
      ctx.save();
      ctx.translate(obs.x, obs.y);
      ctx.rotate(obs.rotation);

      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const r = obs.radius * (0.8 + Math.sin(i * 1234.5) * 0.2);
        const px = Math.cos(angle) * r;
        const py = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = '#475569';
      ctx.fill();
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#334155';
      ctx.beginPath();
      ctx.arc(-obs.radius * 0.3, -obs.radius * 0.2, obs.radius * 0.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    // Gems
    state.gems.forEach(gem => {
      ctx.save();
      ctx.translate(gem.x, gem.y);

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        const px = Math.cos(angle) * gem.radius;
        const py = Math.sin(angle) * gem.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      ctx.fillStyle = gem.numerator > 0 ? '#10b981' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, gem.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const sign = gem.numerator > 0 ? '+' : '';
      ctx.fillText(`${sign}${gem.numerator}/${level.denominator}`, 0, 0);

      ctx.restore();
    });

    // Flash
    if (state.flashTimer > 0) {
      ctx.fillStyle = `rgba(239, 68, 68, ${state.flashTimer / 300})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // HUD
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Level ${level.id}`, 20, 40);

    // Power-up indicator
    if (state.powerUps > 0) {
      ctx.fillStyle = '#d946ef';
      ctx.font = 'bold 18px Inter, sans-serif';
      ctx.fillText(`⚡ Pulsar x${state.powerUps}  [SPACE]`, 20, 70);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Inter, sans-serif';
    ctx.textAlign = 'right';
    const targetText = formatFraction(level.targetNumerator, level.denominator);
    const currentText = formatFraction(state.currentNumerator, level.denominator);
    ctx.fillText(`Power: ${currentText} / ${targetText}`, canvas.width - 20, 40);
  };

  const loop = (time: number) => {
    if (gameStateRef.current === 'playing') {
      let dt = time - stateRef.current.lastTime;
      if (dt > 50) dt = 50;
      stateRef.current.lastTime = time;

      update(dt);
      draw();
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        draw();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const startGame = () => {
    setLevelIdx(0);
    stateRef.current.currentNumerator = 0;
    stateRef.current.gems = [];
    stateRef.current.obstacles = [];
    stateRef.current.shockwaves = [];
    stateRef.current.collectedHistory = [];
    stateRef.current.shipX = window.innerWidth / 2;
    stateRef.current.shipY = window.innerHeight - 80;
    stateRef.current.lastTime = performance.now();
    stateRef.current.bgmTimer = 0;
    stateRef.current.powerUps = 0;
    setGameState('playing');
  };

  const nextLevel = () => {
    setLevelIdx(prev => prev + 1);
    stateRef.current.currentNumerator = 0;
    stateRef.current.gems = [];
    stateRef.current.obstacles = [];
    stateRef.current.shockwaves = [];
    stateRef.current.collectedHistory = [];
    stateRef.current.shipX = window.innerWidth / 2;
    stateRef.current.shipY = window.innerHeight - 80;
    stateRef.current.lastTime = performance.now();
    stateRef.current.bgmTimer = 0;
    setGameState('playing');
  };

  const handleMathSubmit = () => {
    const history = stateRef.current.collectedHistory;
    const currentGem = history[mathStep];
    const previousSum = history.slice(0, mathStep).reduce((a, b) => a + b, 0);
    const expected = previousSum + currentGem;

    if (parseInt(mathInput) === expected) {
      playPositiveGem();
      if (mathStep + 1 >= history.length) {
        playLevelComplete();
        if (levelIdxRef.current === LEVELS.length - 1) {
          setGameState('game_complete');
        } else {
          setGameState('level_complete');
        }
      } else {
        setMathStep(s => s + 1);
        setMathInput('');
        setMathError(false);
      }
    } else {
      playNegativeGem();
      setMathError(true);
    }
  };

  const renderMathChallenge = () => {
    const level = LEVELS[levelIdx];
    const history = stateRef.current.collectedHistory;
    const currentGem = history[mathStep] || 0;
    const previousSum = history.slice(0, mathStep).reduce((a, b) => a + b, 0);
    const nextSum = previousSum + currentGem;

    const maxVal = Math.max(level.targetNumerator, nextSum, previousSum) + 2;
    const tickSpacing = 40;
    const numTicks = maxVal + 1;
    const svgWidth = numTicks * tickSpacing + 40;

    const arrowColor = currentGem > 0 ? '#10b981' : '#ef4444';

    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white p-6 text-center">
        <h2 className="text-4xl font-bold mb-4 text-blue-400">Verify Your Calculations</h2>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl">
          Add up the fraction gems in the order you collected them to power up the hyperdrive!
        </p>

        <div className="flex gap-2 mb-8 flex-wrap justify-center max-w-3xl">
          {history.map((gem, idx) => (
            <div key={idx} className={`px-3 py-1 rounded border ${idx === mathStep ? 'border-blue-400 bg-blue-900/50' : idx < mathStep ? 'border-emerald-500/50 text-emerald-400/50' : 'border-slate-700 text-slate-500'}`}>
              {gem > 0 ? '+' : ''}{gem}/{level.denominator}
            </div>
          ))}
        </div>

        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 flex flex-col items-center w-full max-w-4xl">
          <div className="text-4xl font-mono mb-6 flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span>{previousSum}</span>
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{level.denominator}</span>
            </div>

            <span className={currentGem > 0 ? 'text-emerald-400' : 'text-red-400'}>
              {currentGem > 0 ? '+' : '−'}
            </span>

            <div className="flex flex-col items-center">
              <span className={currentGem > 0 ? 'text-emerald-400' : 'text-red-400'}>{Math.abs(currentGem)}</span>
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{level.denominator}</span>
            </div>

            <span>=</span>

            <div className="flex flex-col items-center">
              <input
                type="number"
                value={mathInput}
                onChange={e => { setMathInput(e.target.value); setMathError(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleMathSubmit(); }}
                className={`w-24 text-center bg-slate-900 border-2 ${mathError ? 'border-red-500' : 'border-slate-600'} rounded-lg p-2 text-4xl outline-none focus:border-blue-500`}
                autoFocus
              />
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{level.denominator}</span>
            </div>
          </div>

          <button
            onClick={handleMathSubmit}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 transition-colors rounded-xl text-xl font-bold w-full max-w-md mb-8"
          >
            Confirm
          </button>

          {/* Number Line */}
          <div className="w-full overflow-x-auto">
            <div className="h-32 relative" style={{ minWidth: svgWidth }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${svgWidth} 100`} preserveAspectRatio="xMidYMid meet">
                {/* Base line */}
                <line x1="20" y1="50" x2={svgWidth - 20} y2="50" stroke="#475569" strokeWidth="4" />

                {/* Ticks */}
                {Array.from({ length: numTicks }).map((_, i) => (
                  <g key={i} transform={`translate(${20 + i * tickSpacing}, 50)`}>
                    <line x1="0" y1="-10" x2="0" y2="10" stroke={i % level.denominator === 0 ? '#94a3b8' : '#475569'} strokeWidth={i % level.denominator === 0 ? '4' : '2'} />
                    {i % level.denominator === 0 && (
                      <text x="0" y="30" fill="#94a3b8" fontSize="16" textAnchor="middle" fontWeight="bold">
                        {i / level.denominator}
                      </text>
                    )}
                  </g>
                ))}

                {/* Animated arrow from previousSum to nextSum */}
                <defs>
                  <marker id={`arrowhead-${mathStep}`} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill={arrowColor} />
                  </marker>
                  <style>{`
                    @keyframes dash {
                      to { stroke-dashoffset: 0; }
                    }
                  `}</style>
                </defs>

                <path
                  key={`arrow-${mathStep}`}
                  d={`M ${20 + previousSum * tickSpacing} 40 Q ${20 + ((previousSum + nextSum) / 2) * tickSpacing} ${currentGem > 0 ? 5 : 5} ${20 + nextSum * tickSpacing} 40`}
                  fill="none"
                  stroke={arrowColor}
                  strokeWidth="4"
                  markerEnd={`url(#arrowhead-${mathStep})`}
                  strokeDasharray="1000"
                  strokeDashoffset="1000"
                  style={{ animation: 'dash 1s ease-out forwards' }}
                />

                {/* Start dot */}
                <circle cx={20 + previousSum * tickSpacing} cy="50" r="6" fill="#60a5fa" />
              </svg>
            </div>
          </div>
        </div>

        <div className="mt-8 text-slate-400">
          Step {mathStep} of {history.length - 1}
        </div>
      </div>
    );
  };

  // --- Charge Up ---

  const makeChargeQuestion = (lvlIdx: number): ChargeQuestion => {
    const level = LEVELS[lvlIdx];
    const d = level.denominator;
    const n1 = Math.floor(Math.random() * d * 2) + 1;
    const n2 = Math.floor(Math.random() * d) + 1;
    const op: '+' | '-' = Math.random() > 0.5 ? '+' : '-';

    if (op === '-' && n1 < n2) {
      return { n1: n2, n2: n1, op, d };
    }
    return { n1, n2, op, d };
  };

  const startChargeUp = () => {
    const q = makeChargeQuestion(levelIdx);
    setChargeQuestion(q);
    setChargeProgress(0);
    setMathInput('');
    setMathError(false);
    setGameState('charge_up');
  };

  const handleChargeSubmit = () => {
    const { n1, n2, op } = chargeQuestion;
    const expected = op === '+' ? n1 + n2 : n1 - n2;
    if (parseInt(mathInput) === expected) {
      playPositiveGem();
      const newProgress = chargeProgress + 1;
      if (newProgress >= 3) {
        stateRef.current.powerUps += 1;
        playLevelComplete();
        nextLevel();
      } else {
        setChargeProgress(newProgress);
        setMathInput('');
        setMathError(false);
        setChargeQuestion(makeChargeQuestion(levelIdx));
      }
    } else {
      playNegativeGem();
      setMathError(true);
    }
  };

  const renderChargeUp = () => {
    const { n1, n2, op, d } = chargeQuestion;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md text-white p-6 text-center">
        <h2 className="text-4xl font-bold mb-4 text-fuchsia-400">Charge Up!</h2>
        <p className="text-xl text-slate-300 mb-8 max-w-2xl">
          Answer 3 correctly to earn a Pulsar Power-Up.
        </p>

        <div className="flex gap-2 mb-8">
          {[0, 1, 2].map(i => (
            <div key={i} className={`w-16 h-4 rounded-full ${i < chargeProgress ? 'bg-fuchsia-500 shadow-[0_0_15px_rgba(217,70,239,0.8)]' : 'bg-slate-800'}`}></div>
          ))}
        </div>

        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 flex flex-col items-center">
          <div className="text-4xl font-mono mb-6 flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span>{n1}</span>
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{d}</span>
            </div>

            <span className="text-fuchsia-400">{op === '-' ? '−' : '+'}</span>

            <div className="flex flex-col items-center">
              <span>{n2}</span>
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{d}</span>
            </div>

            <span>=</span>

            <div className="flex flex-col items-center">
              <input
                type="number"
                value={mathInput}
                onChange={e => { setMathInput(e.target.value); setMathError(false); }}
                onKeyDown={e => { if (e.key === 'Enter') handleChargeSubmit(); }}
                className={`w-24 text-center bg-slate-900 border-2 ${mathError ? 'border-red-500' : 'border-slate-600'} rounded-lg p-2 text-4xl outline-none focus:border-fuchsia-500`}
                autoFocus
              />
              <div className="w-full h-1 bg-white my-1"></div>
              <span>{d}</span>
            </div>
          </div>

          <button
            onClick={handleChargeSubmit}
            className="px-8 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 transition-colors rounded-xl text-xl font-bold w-full"
          >
            Confirm
          </button>
        </div>

        <div className="mt-6 text-slate-500 text-sm">
          Press Spacebar during gameplay to use your Pulsar Power-Up
        </div>
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 touch-none">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {gameState === 'start' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white p-6 text-center">
          <h1 className="text-6xl font-black mb-6 tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            Fraction Racer
          </h1>
          <p className="text-xl text-slate-300 mb-4 max-w-md">
            Collect fractional gems to power your ship. Reach exactly 100% power to advance. Don't overcharge, and avoid the asteroids!
          </p>
          <div className="flex gap-4 mb-8 text-slate-400 bg-slate-900/50 p-4 rounded-xl border border-slate-800">
            <div className="flex flex-col items-center">
              <div className="flex gap-1 mb-1">
                <kbd className="px-2 py-1 bg-slate-800 rounded border border-slate-700">W</kbd>
              </div>
              <div className="flex gap-1">
                <kbd className="px-2 py-1 bg-slate-800 rounded border border-slate-700">A</kbd>
                <kbd className="px-2 py-1 bg-slate-800 rounded border border-slate-700">S</kbd>
                <kbd className="px-2 py-1 bg-slate-800 rounded border border-slate-700">D</kbd>
              </div>
            </div>
            <div className="flex items-center">or Arrow Keys to Move</div>
          </div>
          <button
            onClick={startGame}
            className="px-8 py-4 bg-blue-600 hover:bg-blue-500 transition-colors rounded-2xl text-2xl font-bold shadow-[0_0_30px_rgba(37,99,235,0.5)] cursor-pointer"
          >
            Start Engine
          </button>
        </div>
      )}

      {gameState === 'math_challenge' && renderMathChallenge()}
      {gameState === 'charge_up' && renderChargeUp()}

      {gameState === 'level_complete' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white p-6 text-center">
          <h2 className="text-5xl font-bold mb-4 text-emerald-400">Level Complete!</h2>
          <p className="text-2xl text-slate-300 mb-8">
            Calculations verified. Preparing for next sector...
          </p>
          <div className="flex flex-col gap-4">
            <button
              onClick={nextLevel}
              className="px-8 py-4 bg-emerald-600 hover:bg-emerald-500 transition-colors rounded-2xl text-2xl font-bold shadow-[0_0_30px_rgba(16,185,129,0.5)] cursor-pointer"
            >
              Continue to Next Level
            </button>
            <button
              onClick={startChargeUp}
              className="px-8 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 transition-colors rounded-2xl text-2xl font-bold shadow-[0_0_30px_rgba(217,70,239,0.5)] cursor-pointer"
            >
              Charge Up
            </button>
          </div>
        </div>
      )}

      {gameState === 'game_complete' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm text-white p-6 text-center">
          <h2 className="text-6xl font-black mb-4 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
            Victory!
          </h2>
          <p className="text-2xl text-slate-300 mb-8 max-w-md">
            You have mastered the fractional sectors and fully powered the fleet!
          </p>
          <button
            onClick={startGame}
            className="px-8 py-4 bg-orange-600 hover:bg-orange-500 transition-colors rounded-2xl text-2xl font-bold shadow-[0_0_30px_rgba(234,88,12,0.5)] cursor-pointer"
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
