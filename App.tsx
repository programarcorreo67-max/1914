import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Bomb, Crosshair, Gauge, Heart, Pause, Play, Radio, Shield, Target, Triangle, Volume2, VolumeX, Wind, Zap } from 'lucide-react';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

type Screen = 'briefing' | 'sortie' | 'upgrade' | 'upgrade-info' | 'gameover' | 'victory';
type EnemyKind = 'scout' | 'heavy' | 'boss';
type UpgradeId = 'automatic' | 'double' | 'radio' | 'dispersion' | 'triple' | 'bomb' | 'speed' | 'damage' | 'armor';
type AirframeId = 'morane' | 'eindecker' | 'camel' | 'se5a' | 'fokker-dvii';
type FireMode = 'manual' | 'automatic';
type ProjectileKind = 'bullet' | 'bomb' | 'enemy' | 'boss';

type Enemy = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  kind: EnemyKind;
  phase: number;
};

type Projectile = {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: ProjectileKind;
  damage: number;
};

type Burst = {
  id: number;
  x: number;
  y: number;
  tone: 'hit' | 'spark';
};

type World = {
  player: { x: number; y: number; vx: number; vy: number };
  enemies: Enemy[];
  projectiles: Projectile[];
  bursts: Burst[];
  nextId: number;
  spawnClock: number;
  enemyFireClock: number;
  fireClock: number;
  bombClock: number;
  bossClock: number;
  elapsed: number;
};

type RunStats = {
  health: number;
  maxHealth: number;
  scrap: number;
  kills: number;
  levelKills: number;
  wave: number;
  score: number;
  weaponDamage: number;
  speedBonus: number;
  fireMode: FireMode;
  shotCount: 1 | 2 | 3;
  radio: boolean;
  dispersion: number;
  bombs: boolean;
  pendingUpgrade?: UpgradeId;
};

type UpgradeOption = {
  id: UpgradeId;
  icon: ReactNode;
  name: string;
  tech: string;
  note: string;
  detail: string;
  history: string;
};

const queryClient = new QueryClient();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const routes = ['Dover Reach', 'Somme Corridor', 'Cambrai Line', 'Ypres Shelf', 'Flanders North'];
const levelObjectives = [10, 25, 50, 75, 100, 125, 150, 175, 200, 225];
const getLevelObjective = (wave: number) => levelObjectives[clamp(wave - 1, 0, levelObjectives.length - 1)];

const airframes: Array<{ id: AirframeId; model: string; year: string; role: string }> = [
  { id: 'morane', model: 'VOISIN III', year: '1914', role: 'FIRST COMBAT CRAFT' },
  { id: 'eindecker', model: 'FOKKER EINDECKER', year: '1915', role: 'FIRST FIGHTER' },
  { id: 'camel', model: 'SOPWITH CAMEL', year: '1917', role: 'DOGFIGHTER' },
  { id: 'se5a', model: 'ROYAL AIRCRAFT SE5a', year: '1918', role: 'HIGH-SPEED SCOUT' },
  { id: 'fokker-dvii', model: 'FOKKER D.VII', year: '1918', role: 'LAST WORD' },
];

function getAirframe(wave: number) {
  return airframes[Math.min(wave - 1, airframes.length - 1)];
}

function getUpgradeOptions(stats: RunStats): UpgradeOption[] {
  return [
    { id: 'automatic', icon: <Zap className="h-5 w-5" />, name: 'Automatic interrupter gear', tech: 'FOKKER GEAR / 1915', note: 'Hold either Shift key to keep the gun chattering.', detail: 'HOLD TO AUTO-FIRE', history: 'The Fokker Eindecker introduced practical interrupter-gear fighter fire in 1915. A cam-and-rod mechanism timed the trigger between propeller blades, letting a pilot keep firing while concentrating on the aim.' },
    { id: 'double', icon: <Target className="h-5 w-5" />, name: 'Twin-gun battery', tech: 'CAMEL ARMAMENT / 1917', note: 'Press either Shift key for a two-pellet volley.', detail: '+1 PELLET PER PRESS', history: 'Twin forward-firing Vickers guns became the signature armament of fighters such as the Sopwith Camel in 1917. The second gun doubled the stream of rounds, but the pilot still had to choose every burst.' },
    { id: 'radio', icon: <Radio className="h-5 w-5" />, name: 'Observer radio', tech: 'WIRELESS SET / 1917', note: 'A warning marker reveals fresh contacts at the eastern edge.', detail: 'SEE INBOUND ENEMIES', history: 'Wireless sets were heavy and temperamental, but a working observer radio could warn a flight about enemy movement before the silhouettes entered the gun range.' },
    { id: 'dispersion', icon: <Wind className="h-5 w-5" />, name: 'Loose tracer spread', tech: 'FIELD MODIFICATION / 1916', note: 'Every volley covers a wider slice of sky.', detail: '+ BULLET DISPERSION', history: 'Pilots learned to walk short bursts across a target rather than trust a single perfect line. The wider pattern is less precise, but more forgiving in a turning fight.' },
    { id: 'triple', icon: <Triangle className="h-5 w-5" />, name: 'Triangular salvo', tech: 'THREE-GUN PATTERN / 1918', note: 'Three rounds leave in a shallow triangular formation.', detail: '3 PELLETS / TRIANGLE', history: 'By the final years of the war, heavier batteries and disciplined burst fire let pilots saturate the narrow space around a fleeing aircraft.' },
    { id: 'bomb', icon: <Bomb className="h-5 w-5" />, name: 'Timed Cooper bomb', tech: 'ORDNANCE RACK / 1917', note: 'A bomb releases automatically every seven seconds.', detail: '×4 DAMAGE / AREA', history: 'Small aerial bombs were simple, dangerous tools. A timed rack lets the pilot drop one into a formation, damaging several aircraft caught in the blast.' },
    { id: 'speed', icon: <Gauge className="h-5 w-5" />, name: 'High-compression engine', tech: 'ENGINE TUNING / 1918', note: 'More power gives the RFC pilot room to evade.', detail: '+30% PLAYER SPEED', history: 'Better-tuned engines and lighter fittings made late-war scouts dramatically faster, though the extra performance demanded careful handling.' },
    { id: 'damage', icon: <Zap className="h-5 w-5" />, name: 'Hardened Vickers rounds', tech: 'ARMOUR-PIERCING LOAD / 1918', note: `The next volley hits for ×${stats.weaponDamage + 1} base damage. Repeatable.`, detail: `×${stats.weaponDamage + 1} BASE DAMAGE`, history: 'Ammunition mixtures and careful belt loading improved the effect of each hit. This field modification can be repeated as the campaign escalates.' },
    { id: 'armor', icon: <Shield className="h-5 w-5" />, name: 'Layered fuselage plates', tech: 'AIRFRAME PROTECTION / 1918', note: 'One more heart of hull integrity. Repeatable.', detail: '+1 MAX HEART', history: 'Extra fabric, plywood, and carefully placed metal gave a pilot another chance to bring a damaged machine home.' },
  ];
}

function CamelPlane({ enemy = false, heavy = false, model = 'morane' as AirframeId }: { enemy?: boolean; heavy?: boolean; model?: AirframeId }) {
  if (!enemy) return <AlliedPlane model={model} />;
  return (
    <svg className="pixel-art-plane h-full w-full" viewBox="0 0 90 64" aria-hidden="true">
      <g fill="currentColor">
        <path d={heavy ? 'M9 31h28l11-13 5 2-4 11 26 3v7L49 43l4 10-5 2-11-12H9l7-6-7-6Z' : 'M14 31h20l12-12 4 2-4 12 28 3v5l-28 3 4 12-4 2-12-13H14l6-7-6-7Z'} />
        <path d="M42 30h24v5H42Z" fill="rgba(24,32,34,.42)" />
        <path d="M54 24h6v18h-6Z" fill="rgba(235,214,174,.45)" />
      </g>
    </svg>
  );
}

function AlliedPlane({ model }: { model: AirframeId }) {
  const accent = model === 'se5a' || model === 'fokker-dvii' ? '#6f806e' : '#9b9a86';
  return (
    <svg className="pixel-art-plane h-full w-full" viewBox="0 0 176 96" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M22 79h126v3H22Z" fill="#17272c" opacity=".42" />
      <g stroke="#252b2b" strokeWidth="1.8" strokeLinejoin="miter">
        <path fill="#e8e3cc" d="M24 18h126l17 5v5l-18 5H31L15 25Z" />
        <path fill="#f7f0d9" d="M32 19h100v4H32Z" stroke="none" />
        <path fill="#bd462d" d="M25 19h19v11H25ZM132 19h18v11h-18Z" />
        <path fill="#e0dbc4" d="M39 62h105l17 5-17 6H42L27 67Z" />
        <path fill="#bd462d" d="M109 63h19l15 5-15 4h-19Z" />
        <path fill={accent} d="M22 42h36l15-9h43l25 7 13 7-13 7h-29l-18 6H51L31 56l-14-8Z" />
        <path fill="#b9b7a3" d="M32 43h48l-17 9H35l-10-4Z" stroke="none" />
        <path fill="#f1ecd5" d="M88 37h31l20 8-20 5H90Z" stroke="none" />
        <path fill="#2b302e" d="M75 34h20l10 11H76Z" />
        <path fill="#a9c0c0" d="M79 35h12l7 8H79Z" stroke="none" />
        <path fill="#bd462d" d="M19 41h9v15h-9Z" />
        <path fill="#f3ecd1" d="M21 43h5v11h-5Z" stroke="none" />
        <path fill="#bd462d" d="M139 40h14l10 7-10 7h-14Z" />
        <path fill="#292d2c" d="M53 61h4v15h-4ZM91 58h4v18h-4Z" />
        <path fill="#bfc9be" d="M47 75h17v4H47ZM85 75h17v4H85Z" />
      </g>
      <g transform="translate(114 24)">
        <circle r="9" fill="#e9e3ca" stroke="#252b2b" strokeWidth="1.8" />
        <circle r="6" fill="#4d7283" />
        <circle r="3" fill="#bd462d" />
      </g>
      <g transform="translate(111 68)">
        <circle r="8" fill="#e9e3ca" stroke="#252b2b" strokeWidth="1.8" />
        <circle r="5" fill="#4d7283" />
        <circle r="2.5" fill="#bd462d" />
      </g>
      <g stroke="#292d2c" strokeWidth="1.8">
        <path d="M48 29v34M83 31v31M126 31v30" />
        <path d="M48 59 83 31M83 59 126 31M48 60 83 67M83 59 126 67" />
      </g>
      <g transform="translate(164 47)" stroke="#292d2c" strokeWidth="1.8">
        <path d="M0-21v42M-8-15 8 15M8-15-8 15" />
        <path d="M0-3h9" stroke="#edb94c" />
      </g>
    </svg>
  );
}

function PaperMark({ small = false }: { small?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${small ? 'scale-90 origin-left' : ''}`} data-testid="brand-mark">
      <div className="relative grid h-9 w-9 place-items-center border border-[#d7c39e]/50 bg-[#bd462d] shadow-[3px_3px_0_#192d34]">
        <span className="type-mono text-[9px] font-medium tracking-[-.08em] text-[#f4e8ce]">W//1</span>
        <span className="absolute -bottom-1 -right-1 h-2 w-2 bg-[#edb94c]" />
      </div>
      <div className="leading-none">
        <p className="type-mono text-[10px] tracking-[.2em] text-[#dccaa8]">FIELD ISSUE</p>
        <p className="type-note text-lg text-[#f0e2c5]">Pixel Skies</p>
      </div>
    </div>
  );
}

function BattlefieldLayer({ elapsed, wave }: { elapsed: number; wave: number }) {
  const fields = [
    { left: -4, top: 19, width: 20, height: 22, rotate: -8, tone: '#697553' },
    { left: 13, top: 9, width: 22, height: 30, rotate: 10, tone: '#7d8256' },
    { left: 32, top: 16, width: 18, height: 25, rotate: -18, tone: '#5d6d4e' },
    { left: 49, top: 5, width: 25, height: 31, rotate: 7, tone: '#777c50' },
    { left: 72, top: 14, width: 25, height: 30, rotate: -12, tone: '#5c6849' },
  ];
  const craters = [
    { left: 8, top: 63, size: 10 },
    { left: 24, top: 46, size: 7 },
    { left: 43, top: 73, size: 12 },
    { left: 66, top: 57, size: 8 },
    { left: 86, top: 71, size: 11 },
  ];
  return (
    <div className="battlefield absolute inset-x-0 bottom-0 h-[42%] overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[#4e5c45]" style={{ clipPath: 'polygon(0 12%, 7% 4%, 14% 14%, 21% 6%, 31% 16%, 40% 7%, 49% 14%, 60% 4%, 70% 13%, 81% 5%, 90% 14%, 100% 6%, 100% 100%, 0 100%)' }} />
      <div className="absolute inset-0 opacity-80" style={{ backgroundImage: 'repeating-linear-gradient(163deg, transparent 0 28px, rgba(39,54,42,.42) 29px 31px, transparent 32px 60px)', backgroundPosition: `${-Math.round(elapsed * .45)}px 0` }} />
      {fields.map((field, index) => (
        <div key={index} className="absolute border-2 border-[#33443c]/55" style={{ left: `${field.left}%`, top: `${field.top}%`, width: `${field.width}%`, height: `${field.height}%`, backgroundColor: field.tone, transform: `rotate(${field.rotate}deg) translateX(${Math.round((elapsed / (index + 2)) % 18)}px)` }}>
          <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent 0 7px, rgba(34,54,43,.32) 8px 9px)' }} />
        </div>
      ))}
      <div className="battlefield-river absolute -left-[8%] top-[20%] h-4 w-[116%] rotate-[-9deg] bg-[#647d75]/80 shadow-[0_3px_0_#3d584f,0_-3px_0_#8a8f65]" style={{ transform: `translateX(${Math.round((elapsed * .22) % 34)}px) rotate(-9deg)` }} />
      <div className="absolute left-[6%] top-[50%] h-1 w-[87%] rotate-[6deg] border-y border-[#313f38]/80" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #34443a 0 18px, transparent 18px 29px)', transform: `translateX(${Math.round((elapsed * .32) % 50)}px) rotate(6deg)` }} />
      <div className="absolute left-[38%] top-[39%] h-1 w-[56%] rotate-[-18deg] border-y border-[#313f38]/70" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #34443a 0 12px, transparent 12px 22px)' }} />
      {craters.map((crater, index) => (
        <div key={index} className="absolute border-2 border-[#303e36]/75 bg-[#39483a]/60" style={{ left: `${crater.left}%`, top: `${crater.top}%`, width: `${crater.size}px`, height: `${Math.max(4, crater.size / 2)}px`, boxShadow: `3px 2px 0 rgba(30,43,35,.35), -2px -1px 0 rgba(127,132,91,.35)` }} />
      ))}
      <div className="absolute left-[18%] top-[33%] grid grid-cols-4 gap-1 opacity-80">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((house) => <span key={house} className="h-2 w-2 border border-[#273a35] bg-[#8b7758]" />)}
      </div>
      <div className="absolute right-[18%] top-[47%] grid grid-cols-3 gap-1 opacity-75">
        {[0, 1, 2, 3, 4, 5].map((house) => <span key={house} className="h-2 w-2 border border-[#273a35] bg-[#8b7758]" />)}
      </div>
      <div className="battlefield-gun absolute left-[7%] top-[53%] h-2 w-10 bg-[#273a35]"><span className="absolute -right-3 -top-1 h-1 w-5 rotate-[-14deg] bg-[#273a35]" /><span className="absolute -bottom-2 left-1 h-2 w-2 bg-[#273a35] shadow-[10px_0_0_#273a35]" /></div>
      <div className="battlefield-gun absolute right-[12%] top-[61%] h-2 w-9 rotate-[4deg] bg-[#273a35]"><span className="absolute -left-3 -top-1 h-1 w-5 rotate-[12deg] bg-[#273a35]" /><span className="absolute -bottom-2 left-1 h-2 w-2 bg-[#273a35] shadow-[10px_0_0_#273a35]" /></div>
      <div className="battlefield-soldier absolute left-[57%] top-[51%] h-5 w-1 bg-[#263a35]"><span className="absolute -left-1 -top-1 h-2 w-3 bg-[#263a35]" /><span className="absolute left-1 top-2 h-1 w-3 rotate-[-18deg] bg-[#263a35]" /></div>
      <div className="battlefield-soldier absolute right-[39%] top-[64%] h-5 w-1 bg-[#263a35]"><span className="absolute -left-1 -top-1 h-2 w-3 bg-[#263a35]" /><span className="absolute left-1 top-2 h-1 w-3 rotate-[-18deg] bg-[#263a35]" /></div>
      <div className="battlefield-smoke absolute left-[26%] top-[16%] h-7 w-5 bg-[#d5c9a8]/25" />
      <div className="battlefield-smoke absolute right-[31%] top-[24%] h-9 w-6 bg-[#d5c9a8]/20" style={{ animationDelay: '1.2s' }} />
      <div className="battlefield-flash absolute left-[9%] top-[48%] h-3 w-3 bg-[#e5ac3b]" />
      <div className="battlefield-flash absolute right-[14%] top-[57%] h-2 w-2 bg-[#bd462d]" style={{ animationDelay: '1.8s' }} />
      <div className="absolute bottom-0 left-0 right-0 h-5 bg-[#2e4039]/70" />
      <div className="absolute bottom-2 left-5 type-mono text-[8px] tracking-[.15em] text-[#e6d5ad]/45">BATTLEFIELD / SECTOR {String(wave).padStart(2, '0')}</div>
    </div>
  );
}

function SkyBackdrop({ elapsed, wave, battlefield = false }: { elapsed: number; wave: number; battlefield?: boolean }) {
  const clouds = [
    { top: 16, left: 4, width: 30, opacity: .48, scale: 1 },
    { top: 31, left: 64, width: 24, opacity: .34, scale: 1.15 },
    { top: 48, left: 18, width: 39, opacity: .26, scale: .78 },
    { top: 7, left: 78, width: 32, opacity: .42, scale: .72 },
  ];
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#274b5a]" data-testid="game-sky">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_12%,#f4d9a7_0%,transparent_28%),linear-gradient(180deg,#80989a_0%,#9fa9a0_38%,#e7be8f_69%,#ad6e4f_100%)]" />
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(90deg, transparent 49%, rgba(240,220,177,.22) 50%, transparent 51%), linear-gradient(0deg, transparent 49%, rgba(240,220,177,.18) 50%, transparent 51%)', backgroundSize: '160px 160px', backgroundPosition: `${-Math.round(elapsed / 2)}px 0` }} />
      <div className="advance-lines absolute inset-0 opacity-30" />
      <div className="absolute -bottom-[4%] left-[-8%] h-[28%] w-[116%] bg-[#1e3d46]" style={{ clipPath: 'polygon(0 77%, 8% 53%, 14% 69%, 25% 27%, 33% 64%, 43% 49%, 54% 73%, 61% 38%, 70% 66%, 78% 48%, 89% 72%, 100% 38%, 100% 100%, 0 100%)' }} />
      <div className="absolute -bottom-[5%] left-[-5%] h-[21%] w-[110%] bg-[#18333e]/85" style={{ clipPath: 'polygon(0 74%, 10% 63%, 19% 77%, 28% 47%, 38% 73%, 50% 34%, 62% 74%, 72% 51%, 84% 68%, 100% 46%, 100% 100%, 0 100%)' }} />
      {battlefield && <BattlefieldLayer elapsed={elapsed} wave={wave} />}
       {clouds.map((cloud, index) => (
         <div key={index} className="sky-cloud sky-drift absolute" style={{ top: `${cloud.top}%`, left: `${cloud.left}%`, width: `${cloud.width}%`, opacity: cloud.opacity, transform: `scale(${cloud.scale})` }}>
           <div className="h-3 w-full bg-[#f2dfb2]" />
           <div className="mx-auto -mt-2 h-4 w-[65%] bg-[#f2dfb2]" />
           <div className="mx-auto -mt-1 h-2 w-[38%] bg-[#d5bd96]" />
        </div>
      ))}
      <div className="absolute right-4 top-20 type-mono text-[9px] tracking-[.18em] text-[#f1dbb7]/45">ALT {Math.round(4200 + Math.sin(elapsed / 1200) * 140)} FT</div>
      <div className="absolute bottom-[26%] left-5 type-mono text-[9px] tracking-[.14em] text-[#f1dbb7]/50">EASTBOUND / SECTOR {String(wave).padStart(2, '0')} / {routes[(wave - 1) % routes.length].toUpperCase()}</div>
    </div>
  );
}

function HealthPips({ health, maxHealth = 5 }: { health: number; maxHealth?: number }) {
  return (
    <div className="flex max-w-[148px] flex-wrap gap-1 opacity-70" aria-label={`${health} of ${maxHealth} hearts remaining`} data-testid="status-health">
      {Array.from({ length: maxHealth }, (_, heart) => <svg key={heart} className={`heart-icon h-5 w-6 ${heart < health ? 'is-filled' : 'is-empty'}`} viewBox="0 0 16 14" aria-hidden="true"><path d="M3 1H6L8 3L10 1H13L15 3V8L8 14L1 8V3Z" /><path d="M3 3H6L8 5L10 3H13V7L8 11L3 7Z" className="heart-inset" /></svg>)}
    </div>
  );
}

function ControlHint({ fireMode = 'manual' }: { fireMode?: FireMode }) {
  return (
    <div className="type-mono flex flex-wrap gap-x-5 gap-y-2 text-[10px] uppercase tracking-[.14em] text-[#e4d2af]/65">
      <span><b className="text-[#e4d2af]">WASD</b> / arrows to fly</span>
       <span><b className="text-[#e4d2af]">LShift / RShift</b> / {fireMode === 'automatic' ? 'hold' : 'press'} to fire</span>
    </div>
  );
}

function TechnologyPath({ stats }: { stats: RunStats }) {
  const currentFrame = getAirframe(stats.wave);
  const progress = clamp(((stats.wave - 1) / 9) * 100, 0, 100);
  const steps = Array.from({ length: 10 }, (_, index) => ({ label: `LVL ${index + 1}`, short: index === 9 ? 'BOSS' : `${getLevelObjective(index + 1)} KILLS` }));
  return (
    <div className="mx-auto w-full max-w-[760px] border-2 border-[#d8c49f]/70 bg-[#1d3035]/90 p-2.5 shadow-[4px_4px_0_rgba(16,27,31,.55)] sm:p-3" data-testid="technology-path">
      <div className="mb-2 flex items-center justify-between type-mono text-[9px] tracking-[.15em] text-[#f1dfb7]/80"><span className="text-[#edb94c]">TECHNOLOGY PATH</span><span>{currentFrame.role} / {currentFrame.year}</span></div>
        <div className="relative h-3 border border-[#bea978]/70 bg-[#263d3d]">
        <div className="absolute left-0 top-0 h-full bg-[#80a65e]" style={{ width: `${progress}%` }} />
         <div className="absolute inset-0 grid grid-cols-10">
          {steps.map((step, index) => <span key={step.label} className={`relative border-r border-[#172a30] last:border-r-0 ${index < stats.wave ? 'bg-[#e4bb43]/80' : 'bg-transparent'}`}><span className="absolute -top-1 left-1/2 h-5 w-2 -translate-x-1/2 border border-[#172a30] bg-[#d8c49f]" /></span>)}
        </div>
      </div>
       <div className="mt-2 grid grid-cols-5 gap-y-1 text-center type-mono text-[8px] leading-3 tracking-[.08em] text-[#f1dfb7]/70 sm:grid-cols-10">{steps.map((step, index) => <span key={step.label} className={index === stats.wave - 1 ? 'text-[#edb94c]' : ''}>{step.label}<br /><small>{step.short}</small></span>)}</div>
    </div>
  );
}

function IllustratedBackdrop({ wrecked = false }: { wrecked?: boolean }) {
  return (
    <div className={`illustrated-backdrop absolute inset-0 overflow-hidden ${wrecked ? 'is-wrecked' : ''}`} aria-hidden="true">
      <div className="scene-sun" />
      <div className="scene-cloud scene-cloud-one" />
      <div className="scene-cloud scene-cloud-two" />
      <div className="scene-cloud scene-cloud-three" />
      <div className="scene-mountain scene-mountain-far" />
      <div className="scene-mountain scene-mountain-near" />
      <div className="scene-horizon" />
      <div className="scene-ground">
        <span className="scene-trench scene-trench-one" />
        <span className="scene-trench scene-trench-two" />
        <span className="scene-post scene-post-one" />
        <span className="scene-post scene-post-two" />
        <span className="scene-smoke scene-smoke-one" />
        <span className="scene-smoke scene-smoke-two" />
      </div>
    </div>
  );
}

function Briefing({ onLaunch, onHowToPlay, runNumber }: { onLaunch: () => void; onHowToPlay: () => void; runNumber: number }) {
  const startingFrame = getAirframe(1);
  return (
    <main className="grain pixel-ui scene-screen relative min-h-[100dvh] overflow-hidden text-[#f6e4bd]">
      <IllustratedBackdrop />
      <div className="scene-vignette absolute inset-0" />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1400px] flex-col px-5 py-5 sm:px-10 sm:py-7">
        <header className="flex items-start justify-between">
          <PaperMark />
          <div className="scene-header-tag type-mono hidden text-right text-[10px] leading-5 tracking-[.16em] sm:block"><p>ALLIED POWERS / RFC</p><p>ADVANCE WEATHER OFFICE / 1917</p></div>
        </header>
        <div className="relative flex flex-1 flex-col items-center justify-center pb-14 pt-12 text-center">
          <div className="scene-title-block paper-in">
            <p className="type-mono text-[clamp(.8rem,2vw,1.15rem)] font-bold tracking-[.32em] text-[#f3d28d]">ALLIED FLIGHT COMMAND PRESENTS</p>
            <h1 className="scene-title pixel-title mt-3 type-note text-[clamp(3.5rem,10vw,8.8rem)] leading-[.78] text-[#f0d6aa]">
              <span className="block">SKIES OF IRON:</span><span className="block text-[#bd573f]">1914—1918</span>
            </h1>
            <p className="mt-5 type-mono text-[clamp(.72rem,1.5vw,1rem)] font-bold tracking-[.18em] text-[#f4e3b9]">THE EVOLUTION OF ALLIED AIR POWER</p>
            <p className="mt-2 type-note text-base text-[#f0d8a7] sm:text-xl">A pixel-art flight campaign of courage, machinery, and muddy skies.</p>
             <button onClick={onLaunch} className="scene-start-button group relative mx-auto mt-8 flex items-center gap-3 border-2 border-[#f7deb0] bg-[#bd462d] px-7 py-4 type-mono text-sm font-bold tracking-[.16em] text-[#fff1d1] shadow-[5px_5px_0_#302c2b] transition-transform hover:-translate-y-1 active:translate-y-0" data-testid="button-launch-sortie">
              <Play className="h-5 w-5 fill-current" /> START SORTIE
              <span className="absolute -right-2 -top-2 h-3 w-3 bg-[#edb94c]" />
            </button>
             <button onClick={onHowToPlay} className="mx-auto mt-3 border border-[#f3d28d]/70 bg-[#203947]/45 px-5 py-2.5 type-mono text-[10px] font-bold tracking-[.16em] text-[#f3e0b7] shadow-[3px_3px_0_rgba(48,44,43,.7)] transition-colors hover:bg-[#bd462d] hover:text-[#fff1d1]" data-testid="button-how-to-play">HOW TO PLAY</button>
          </div>
          <div className="absolute bottom-3 left-[-2%] w-[min(430px,46vw)] -rotate-2 drop-shadow-[7px_8px_0_rgba(36,37,34,.38)] sm:bottom-2 sm:left-[3%]"><AlliedPlane model={startingFrame.id} /></div>
          <div className="scene-menu-brief paper-in absolute bottom-4 right-[2%] hidden max-w-[300px] border-2 border-[#3b3a35]/65 bg-[#d9c49a]/90 p-4 text-left text-[#2c3634] shadow-[5px_5px_0_rgba(38,36,32,.35)] lg:block">
            <p className="type-mono text-[9px] font-bold tracking-[.16em] text-[#bd462d]">MISSION BRIEF / FIELD 14</p>
            <p className="mt-2 type-note text-sm leading-relaxed">Take the {startingFrame.model} east. Hold the line before the next wave reaches the ridge.</p>
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#4d5c55]/35 pt-3 type-mono text-[8px] tracking-[.08em]"><span>AIRFRAME<br /><b>{startingFrame.model}</b></span><span>WEAPON<br /><b>SINGLE VICKERS</b></span><span>FACTION<br /><b>ALLIED</b></span></div>
          </div>
        </div>
        <footer className="flex flex-wrap items-end justify-between gap-4 border-t border-[#e8d09d]/45 pt-4">
          <ControlHint />
          <p className="type-mono text-[9px] tracking-[.16em] text-[#f0d6a5]/75">SORTIE {String(runNumber).padStart(2, '0')} / WEATHERED BUT UNBROKEN</p>
        </footer>
      </div>
    </main>
  );
}

function HowToPlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-[#152c35]/55 p-4 backdrop-blur-[1px]" data-testid="how-to-play-panel">
      <div className="pixel-panel w-full max-w-[620px] border-2 border-[#e8d2a5]/80 bg-[#1e3b45]/95 p-5 text-[#f0e2c5] shadow-[7px_7px_0_rgba(18,29,32,.6)] sm:p-8">
        <div className="flex items-start justify-between gap-4 border-b border-[#d8c49f]/30 pb-4">
          <div><p className="type-mono text-[10px] tracking-[.18em] text-[#edb94c]">FIELD MANUAL / QUICK REFERENCE</p><h2 className="mt-2 pixel-title type-note text-3xl sm:text-5xl">HOW TO PLAY</h2></div>
          <button onClick={onClose} className="border border-[#d8c49f]/50 px-2 py-1 type-mono text-[10px] text-[#f0e2c5]/75 hover:border-[#edb94c] hover:text-[#edb94c]" aria-label="Close how to play">CLOSE</button>
        </div>
        <div className="mt-5 grid gap-2 type-mono text-[10px] tracking-[.1em] sm:grid-cols-2">
          <div className="border border-[#d8c49f]/25 bg-[#132e38]/70 p-3"><b className="text-[#edb94c]">W A S D</b><span className="ml-3 text-[#f0e2c5]/75">MOVE THE AIRCRAFT</span></div>
          <div className="border border-[#d8c49f]/25 bg-[#132e38]/70 p-3"><b className="text-[#edb94c]">ARROW KEYS</b><span className="ml-3 text-[#f0e2c5]/75">MOVE THE AIRCRAFT</span></div>
          <div className="border border-[#d8c49f]/25 bg-[#132e38]/70 p-3"><b className="text-[#edb94c]">LEFT / RIGHT SHIFT</b><span className="ml-3 text-[#f0e2c5]/75">FIRE YOUR VICKERS</span></div>
          <div className="border border-[#d8c49f]/25 bg-[#132e38]/70 p-3"><b className="text-[#edb94c]">P BUTTON</b><span className="ml-3 text-[#f0e2c5]/75">PAUSE OR RESUME</span></div>
        </div>
        <div className="mt-5 border-t border-[#d8c49f]/30 pt-4 type-note text-sm leading-relaxed text-[#e4d2af]/80">
          <p><span className="text-[#edb94c]">MISSION:</span> Fly east, shoot down the required planes, and survive every level.</p>
          <p className="mt-2"><span className="text-[#edb94c]">UPGRADES:</span> Choose one modification between levels. The sortie pauses while you choose and while the field note is open.</p>
          <p className="mt-2"><span className="text-[#edb94c]">FIELD NOTE:</span> Press either Shift key after reading it to return to the clouds.</p>
        </div>
      </div>
    </div>
  );
}

function UpgradePanel({ stats, onChoose }: { stats: RunStats; onChoose: (id: UpgradeId) => void }) {
  const currentFrame = getAirframe(stats.wave);
  const nextFrame = getAirframe(stats.wave + 1);
  const allOptions = getUpgradeOptions(stats);
  const starterOptions = allOptions.slice(0, 2);
  const availableLater = allOptions.filter((option) => {
    if (option.id === stats.pendingUpgrade) return false;
    if (option.id === 'radio' && stats.radio) return false;
    if (option.id === 'triple' && stats.shotCount === 3) return false;
    if (option.id === 'bomb' && stats.bombs) return false;
    if (option.id === 'speed' && stats.speedBonus > 0) return false;
    return true;
  });
  const options = stats.wave === 1
    ? starterOptions
    : [
        ...(stats.pendingUpgrade ? allOptions.filter((option) => option.id === stats.pendingUpgrade) : []),
        ...availableLater.sort(() => Math.random() - .5).slice(0, stats.pendingUpgrade ? 1 : 2),
      ];
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#162e38]/25 p-3 sm:p-5" data-testid="upgrade-panel">
       <div className="paper-in pixel-panel w-full max-w-[720px] border border-[#dbcaab]/70 bg-[#dfcda8]/75 p-4 text-[#283d43] shadow-[8px_8px_0_rgba(10,28,34,.35)] backdrop-blur-[1px] sm:p-7">
         <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#71827c]/40 pb-5">
             <div><p className="type-mono text-[10px] tracking-[.18em] text-[#bd462d]">SORTIE PAUSED / LEVEL {String(stats.wave).padStart(2, '0')} CLEARED</p><h2 className="mt-2 type-note text-3xl sm:text-4xl">Choose your edge.</h2></div>
            <div className="text-right"><p className="type-mono text-[9px] tracking-[.12em] text-[#587076]">CURRENT FRAME</p><p className="mt-1 type-mono text-[10px] text-[#283d43]">{currentFrame.model} / {currentFrame.year}</p><p className="mt-1 type-mono text-[9px] tracking-[.12em] text-[#bd462d]">NEXT: {nextFrame.model}</p></div>
        </div>
           <p className="my-5 max-w-[560px] type-note text-sm leading-relaxed text-[#52666a]">{stats.wave === 1 ? 'Two field modifications are ready. Select one to inspect its field note before returning to the clouds.' : stats.pendingUpgrade ? 'The field office recovered the modification you left behind. It is guaranteed to appear beside one random field option.' : 'Two field modifications are ready for the next patrol.'}</p>
           <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {options.map((option, index) => (
             <button key={option.id} onClick={() => onChoose(option.id)} className="group relative flex min-h-[150px] min-w-0 flex-col border border-[#6d807b]/55 bg-[#eadbbd]/55 p-2.5 text-left backdrop-blur-[1px] transition-all hover:-translate-y-1 hover:bg-[#f1e3c6]/75 hover:shadow-[5px_5px_0_#bd462d] active:translate-y-0 sm:min-h-[172px] sm:p-4" data-testid={`button-upgrade-${option.id}`}>
               <span className="flex items-start justify-between gap-2"><span className="grid h-9 w-9 shrink-0 place-items-center border border-[#bd462d]/45 bg-[#bd462d] text-[#ffe8bc] shadow-[3px_3px_0_#725040] sm:h-12 sm:w-12">{option.icon}</span><span className="type-mono text-[8px] tracking-[.12em] text-[#6d807b] sm:text-[10px]">OPTION 0{index + 1}</span></span>
                <span className="mt-3 min-w-0 flex-1"><strong className="block type-mono text-[10px] uppercase leading-tight tracking-[.08em] text-[#283d43] sm:text-xs sm:tracking-[.12em]">{option.name}</strong><em className="mt-1 block type-mono text-[8px] not-italic leading-tight text-[#bd462d] sm:text-[10px]">{option.detail}</em><span className="mt-2 block type-mono text-[8px] tracking-[.08em] text-[#bd462d]/80 sm:text-[9px] sm:tracking-[.12em]">{option.tech}</span></span>
            </button>
          ))}
        </div>
        <div className="mt-7 flex items-center justify-between border-t border-[#71827c]/40 pt-4 type-mono text-[10px] tracking-[.11em] text-[#668080]"><span>ALLIED HULL <b className="text-[#283d43]">{stats.health}/{stats.maxHealth}</b></span><span>FULL REPAIR AFTER DECISION</span></div>
      </div>
    </div>
  );
}

function UpgradeInfoPanel({ stats, optionId }: { stats: RunStats; optionId: UpgradeId }) {
  const option = getUpgradeOptions(stats).find((candidate) => candidate.id === optionId);
  if (!option) return null;
  return (
    <div className="absolute inset-0 z-20 grid place-items-center bg-[#162e38]/20 p-3 sm:p-5" data-testid="upgrade-info-panel">
      <div className="paper-in pixel-panel w-full max-w-[650px] border border-[#dbcaab]/75 bg-[#dfcda8]/80 p-5 text-[#283d43] shadow-[8px_8px_0_rgba(10,28,34,.35)] backdrop-blur-[1px] sm:p-8">
        <p className="type-mono text-[10px] tracking-[.18em] text-[#bd462d]">FIELD NOTE / MODIFICATION RECEIVED</p>
        <h2 className="mt-3 type-note text-3xl leading-none sm:text-5xl">{option.name}</h2>
        <p className="mt-3 type-mono text-[10px] tracking-[.13em] text-[#bd462d]">{option.tech}</p>
        <div className="mt-6 grid gap-4 border-y border-[#71827c]/40 py-5 sm:grid-cols-[1fr_auto] sm:items-start">
          <p className="type-note text-base leading-relaxed text-[#52666a]">{option.history}</p>
          <div className="border border-[#bd462d]/45 bg-[#bd462d]/15 p-3 type-mono text-[10px] tracking-[.1em] text-[#bd462d] sm:min-w-[170px]">{option.detail}<br /><span className="text-[#52666a]">{option.note}</span></div>
        </div>
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-[#71827c]/40 pt-4">
          <span className="type-mono text-[9px] tracking-[.12em] text-[#668080]">SORTIE PAUSED / FULL REPAIR READY</span>
          <span className="shift-prompt type-mono text-[10px] font-bold tracking-[.12em] text-[#bd462d]">PRESS SHIFT TO FLY</span>
        </div>
      </div>
    </div>
  );
}

function GameOver({ stats, onBackToMenu }: { stats: RunStats; onBackToMenu: () => void }) {
  const airframe = getAirframe(stats.wave);
  return (
    <div className="scene-screen grain relative min-h-[100dvh] overflow-hidden text-[#f4e2bd]" data-testid="gameover-panel">
      <IllustratedBackdrop wrecked />
      <div className="scene-vignette absolute inset-0" />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1200px] flex-col items-center px-5 py-6 text-center sm:px-10">
        <header className="w-full border-b border-[#eed5a5]/40 pb-4"><p className="type-mono text-[clamp(.8rem,2vw,1.1rem)] font-bold tracking-[.2em] text-[#f4d28d]">SKIES OF IRON: 1914—1918</p><p className="mt-1 type-mono text-[9px] tracking-[.22em] text-[#f5dfb4]/75">ALLIED POWERS / FLIGHT REPORT TERMINATED</p></header>
        <h2 className="gameover-title pixel-title mt-10 type-mono text-[clamp(3.8rem,11vw,9rem)] leading-none text-[#bd4f3c]">GAME OVER</h2>
        <div className="relative mt-1 w-[min(680px,82vw)] rotate-[-2deg] drop-shadow-[7px_8px_0_rgba(30,30,28,.48)]"><AlliedPlane model={airframe.id} /><span className="wreck-flame wreck-flame-one" /><span className="wreck-flame wreck-flame-two" /><span className="wreck-smoke wreck-smoke-one" /><span className="wreck-smoke wreck-smoke-two" /></div>
        <div className="gameover-card paper-in mt-[-.5rem] w-full max-w-[560px] border-2 border-[#4a3c31] bg-[#d9c39a] p-5 text-[#293536] shadow-[6px_6px_0_rgba(27,28,27,.45)] sm:p-7">
          <p className="type-mono text-[clamp(.85rem,2vw,1.1rem)] font-bold tracking-[.12em]">MISSION COMPLETE: {String(stats.wave - 1).padStart(2, '0')}</p>
          <p className="mt-1 type-mono text-[clamp(.8rem,1.7vw,1rem)] font-bold tracking-[.1em]">PLANES SHOT DOWN: {String(stats.kills).padStart(2, '0')}</p>
          <p className="mt-1 type-mono text-[clamp(.75rem,1.5vw,.9rem)] tracking-[.1em] text-[#bd462d]">AIRFRAME REACHED: {airframe.model} / {airframe.year}</p>
          <button onClick={onBackToMenu} className="mt-5 flex w-full items-center justify-center gap-3 border-2 border-[#342d29] bg-[#bd462d] px-5 py-4 type-mono text-sm font-bold tracking-[.13em] text-[#fff0d1] shadow-[4px_4px_0_#342d29] transition-transform hover:-translate-y-1 active:translate-y-0" data-testid="button-back-to-menu">BACK TO MAIN MENU</button>
        </div>
      </div>
    </div>
  );
}

function MobileControls({ onMove, onFire }: { onMove: (key: string, down: boolean) => void; onFire: (down: boolean) => void }) {
  const holdProps = (key: string) => ({ onPointerDown: () => onMove(key, true), onPointerUp: () => onMove(key, false), onPointerLeave: () => onMove(key, false), onPointerCancel: () => onMove(key, false) });
  return (
    <div className="absolute bottom-4 left-4 right-4 z-10 flex items-end justify-between sm:hidden">
      <div className="grid grid-cols-3 gap-1 opacity-75">
        <span /><button {...holdProps('ArrowUp')} className="grid h-10 w-10 place-items-center border border-[#e4d2af]/45 bg-[#203b45]/65 type-mono text-lg text-[#e4d2af]" data-testid="button-control-up">↑</button><span />
        <button {...holdProps('ArrowLeft')} className="grid h-10 w-10 place-items-center border border-[#e4d2af]/45 bg-[#203b45]/65 type-mono text-lg text-[#e4d2af]" data-testid="button-control-left">←</button><button {...holdProps('ArrowDown')} className="grid h-10 w-10 place-items-center border border-[#e4d2af]/45 bg-[#203b45]/65 type-mono text-lg text-[#e4d2af]" data-testid="button-control-down">↓</button><button {...holdProps('ArrowRight')} className="grid h-10 w-10 place-items-center border border-[#e4d2af]/45 bg-[#203b45]/65 type-mono text-lg text-[#e4d2af]" data-testid="button-control-right">→</button>
      </div>
      <button onPointerDown={() => onFire(true)} onPointerUp={() => onFire(false)} onPointerLeave={() => onFire(false)} onPointerCancel={() => onFire(false)} className="grid h-16 w-16 place-items-center border-2 border-[#f1ddb4] bg-[#bd462d]/90 text-[#f8e7c4] shadow-[3px_3px_0_#172f39] active:scale-95" data-testid="button-control-fire"><Target className="h-6 w-6" /></button>
    </div>
  );
}

function Sortie({ stats, setStats, onWaveClear, onGameOver, onVictory, startPaused = false, overlay }: { stats: RunStats; setStats: (next: RunStats) => void; onWaveClear: () => void; onGameOver: () => void; onVictory: () => void; startPaused?: boolean; overlay?: ReactNode }) {
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(startPaused);
  const [muted, setMuted] = useState(false);
  const worldRef = useRef<World>({ player: { x: 23, y: 50, vx: 0, vy: 0 }, enemies: [], projectiles: [], bursts: [], nextId: 1, spawnClock: 0, enemyFireClock: 0, fireClock: 0, bombClock: 420, bossClock: 260, elapsed: 0 });
  const inputRef = useRef<Record<string, boolean>>({});
  const fireRef = useRef(false);
  const fireRequestRef = useRef(0);
  const statsRef = useRef(stats);
  const completedRef = useRef(false);
  statsRef.current = stats;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const onMove = useCallback((key: string, down: boolean) => { inputRef.current[key] = down; }, []);
  const onFire = useCallback((down: boolean) => {
    fireRef.current = down;
    if (down) fireRequestRef.current += 1;
  }, []);

  useEffect(() => {
    const world = worldRef.current;
    const enemyHp = 2 * Math.pow(2, stats.wave - 1);
    const spawnEnemy = (index = 0): Enemy => {
      const heavy = stats.wave > 2 && index % 5 === 0;
      return {
        id: world.nextId++,
        x: randomBetween(88, 108),
        y: randomBetween(14, 86),
        hp: heavy ? enemyHp * 2 : enemyHp,
        maxHp: heavy ? enemyHp * 2 : enemyHp,
        speed: randomBetween(.28, .5) + stats.wave * .012,
        kind: heavy ? 'heavy' : 'scout',
        phase: randomBetween(0, Math.PI * 2),
      };
    };
    world.enemies = stats.wave === 10
      ? [{ id: world.nextId++, x: 82, y: 50, hp: 9000, maxHp: 9000, speed: 0, kind: 'boss', phase: 0 }]
      : Array.from({ length: 6 }, (_, index) => ({ ...spawnEnemy(index), x: randomBetween(82 + index * 2, 96 + index * 2) }));
    world.projectiles = [];
    world.bursts = [];
    world.player = { x: 23, y: 50, vx: 0, vy: 0 };
    world.spawnClock = 0;
    world.fireClock = 0;
    world.bombClock = stats.bombs ? 420 : 0;
    world.enemyFireClock = 0;
    world.bossClock = 260;
    completedRef.current = false;
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - previous) / 16.67, 2.2);
      previous = now;
      if (!pausedRef.current && !completedRef.current) {
        world.elapsed += dt * 16.67;
        const input = inputRef.current;
        const levelSpeedBonus = (statsRef.current.wave - 1) * .06;
        const maxSpeed = 1.18 * (1 + levelSpeedBonus + statsRef.current.speedBonus);
        const acceleration = .18;
        const horizontal = (input.a || input.A || input.KeyA || input.ArrowLeft ? -1 : 0) + (input.d || input.D || input.KeyD || input.ArrowRight ? 1 : 0);
        const vertical = (input.w || input.W || input.KeyW || input.ArrowUp ? -1 : 0) + (input.s || input.S || input.KeyS || input.ArrowDown ? 1 : 0);
        world.player.vx += horizontal * acceleration * dt;
        world.player.vy += vertical * acceleration * dt;
        const friction = Math.pow(.78, dt);
        if (!horizontal) world.player.vx *= friction;
        if (!vertical) world.player.vy *= friction;
        world.player.vx = clamp(world.player.vx, -maxSpeed, maxSpeed);
        world.player.vy = clamp(world.player.vy, -maxSpeed, maxSpeed);
        world.player.x = clamp(world.player.x + world.player.vx * dt, 8, 43);
        world.player.y = clamp(world.player.y + world.player.vy * dt, 12, 88);
        if (world.player.x <= 8 || world.player.x >= 43) world.player.vx = 0;
        if (world.player.y <= 12 || world.player.y >= 88) world.player.vy = 0;
        world.fireClock -= dt;
        const fireHeld = fireRef.current || input.ShiftLeft || input.ShiftRight || input.Shift;
        const canFire = statsRef.current.fireMode === 'automatic' ? fireHeld : fireRequestRef.current > 0;
        if (canFire) {
          if (world.fireClock <= 0) {
            const offsets = statsRef.current.shotCount === 3 ? [0, -3.2, 3.2] : statsRef.current.shotCount === 2 ? [-1.7, 1.7] : [0];
            offsets.forEach((offset) => world.projectiles.push({ id: world.nextId++, x: world.player.x + 3.8, y: world.player.y + offset, vx: 2.8, vy: offset === 0 ? randomBetween(-.06, .06) * statsRef.current.dispersion : offset * .07 + randomBetween(-.06, .06) * statsRef.current.dispersion, kind: 'bullet', damage: statsRef.current.weaponDamage }));
            if (statsRef.current.fireMode === 'manual') fireRequestRef.current = Math.max(0, fireRequestRef.current - 1);
            world.fireClock = statsRef.current.fireMode === 'automatic' ? .28 : .08;
          }
        }
        if (statsRef.current.bombs) {
          world.bombClock -= dt;
          if (world.bombClock <= 0) {
            world.projectiles.push({ id: world.nextId++, x: world.player.x + 4, y: world.player.y, vx: 1.65, vy: .12, kind: 'bomb', damage: statsRef.current.weaponDamage * 4 });
            world.bombClock = 420;
          }
        }
        world.enemies.forEach((enemy) => {
          if (enemy.kind !== 'boss') {
            enemy.x -= enemy.speed * dt;
            enemy.y += Math.sin(world.elapsed / 500 + enemy.phase) * .035 * dt * (enemy.kind === 'heavy' ? .55 : 1);
          }
        });
        world.spawnClock += dt;
        if (world.spawnClock > 2.8 && statsRef.current.wave < 10) {
          world.spawnClock = 0;
          const airborne = world.enemies.filter((candidate) => candidate.kind !== 'boss');
          if (statsRef.current.levelKills < getLevelObjective(statsRef.current.wave) && airborne.length < 8) {
            world.enemies.push(spawnEnemy(statsRef.current.levelKills + airborne.length));
          }
        }
        world.enemyFireClock += dt;
        if (world.enemyFireClock > 5.5 && statsRef.current.wave > 1 && statsRef.current.wave < 10) {
          world.enemyFireClock = 0;
          const airborne = world.enemies.filter((candidate) => candidate.kind !== 'boss');
          const enemy = airborne[Math.floor(Math.random() * airborne.length)];
          if (enemy && enemy.x > 42 && enemy.x < 92) world.projectiles.push({ id: world.nextId++, x: enemy.x - 3, y: enemy.y, vx: -1.08, vy: 0, kind: 'enemy', damage: 1 });
        }
        if (statsRef.current.wave === 10) {
          world.bossClock -= dt;
          const boss = world.enemies.find((enemy) => enemy.kind === 'boss');
          if (boss && world.bossClock <= 0) {
            const dx = world.player.x - boss.x;
            const dy = world.player.y - boss.y;
            const length = Math.max(.001, Math.hypot(dx, dy));
            world.projectiles.push({ id: world.nextId++, x: boss.x - 5, y: boss.y, vx: (dx / length) * 1.12, vy: (dy / length) * 1.12, kind: 'boss', damage: 2 });
            world.bossClock = 260;
          }
        }
        world.projectiles.forEach((shot) => { shot.x += shot.vx * dt; shot.y += shot.vy * dt; });
        const nextBursts: Burst[] = [];
        world.projectiles = world.projectiles.filter((shot) => {
          if (shot.kind === 'enemy' || shot.kind === 'boss') {
            if (Math.abs(shot.x - world.player.x) < 5.5 && Math.abs(shot.y - world.player.y) < 5) {
              nextBursts.push({ id: world.nextId++, x: world.player.x, y: world.player.y, tone: 'hit' });
              const nextHealth = statsRef.current.health - shot.damage;
              statsRef.current = { ...statsRef.current, health: nextHealth };
              setStats(statsRef.current);
              if (nextHealth <= 0) onGameOver();
              return false;
            }
            return shot.x > -10 && shot.x < 110;
          }
          if (shot.kind === 'bomb') {
            const exploded = shot.x > 98 || world.enemies.some((enemy) => Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < 8.5);
            if (!exploded) return shot.x < 110;
            nextBursts.push({ id: world.nextId++, x: shot.x, y: shot.y, tone: 'hit' });
            world.enemies.forEach((enemy) => {
              if (completedRef.current) return;
              if (Math.hypot(shot.x - enemy.x, shot.y - enemy.y) < 9) {
                enemy.hp -= shot.damage;
                nextBursts.push({ id: world.nextId++, x: enemy.x, y: enemy.y, tone: enemy.hp <= 0 ? 'hit' : 'spark' });
                if (enemy.hp <= 0) {
                  enemy.y = 130;
                  if (enemy.kind === 'boss') {
                    completedRef.current = true;
                    onVictory();
                  } else {
                    const updated = { ...statsRef.current, levelKills: statsRef.current.levelKills + 1, scrap: statsRef.current.scrap + (enemy.kind === 'heavy' ? 35 : 15), kills: statsRef.current.kills + 1, score: statsRef.current.score + (enemy.kind === 'heavy' ? 250 : 100) };
                    statsRef.current = updated;
                    setStats(updated);
                    if (updated.levelKills >= getLevelObjective(updated.wave)) {
                      completedRef.current = true;
                      onWaveClear();
                    } else {
                      world.enemies.push(spawnEnemy(updated.levelKills));
                    }
                  }
                }
              }
            });
            return false;
          }
          let hit = false;
           world.enemies.forEach((enemy) => {
             if (!completedRef.current && !hit && Math.abs(shot.x - enemy.x) < (enemy.kind === 'boss' ? 11 : enemy.kind === 'heavy' ? 8 : 6) && Math.abs(shot.y - enemy.y) < (enemy.kind === 'boss' ? 12 : 5)) {
              hit = true;
              enemy.hp -= shot.damage;
              nextBursts.push({ id: world.nextId++, x: enemy.x, y: enemy.y, tone: enemy.hp <= 0 ? 'hit' : 'spark' });
                 if (enemy.hp <= 0) {
                enemy.y = 130;
                if (enemy.kind === 'boss') {
                  completedRef.current = true;
                  onVictory();
                  return;
                }
                const updated = { ...statsRef.current, levelKills: statsRef.current.levelKills + 1, scrap: statsRef.current.scrap + (enemy.kind === 'heavy' ? 35 : 15), kills: statsRef.current.kills + 1, score: statsRef.current.score + (enemy.kind === 'heavy' ? 250 : 100) };
                statsRef.current = updated;
                setStats(updated);
                 if (updated.levelKills >= getLevelObjective(updated.wave)) {
                   completedRef.current = true;
                   onWaveClear();
                 } else {
                   world.enemies.push(spawnEnemy(updated.levelKills));
                 }
              }
            }
          });
          return !hit && shot.x < 110;
        });
        world.enemies = world.enemies.filter((enemy) => {
          if (enemy.x < -10) {
            const nextHealth = statsRef.current.health - 1;
            statsRef.current = { ...statsRef.current, health: nextHealth };
            setStats(statsRef.current);
            if (nextHealth <= 0) onGameOver();
            if (statsRef.current.wave < 10 && statsRef.current.levelKills < getLevelObjective(statsRef.current.wave)) world.enemies.push(spawnEnemy(statsRef.current.levelKills));
            return false;
          }
          return enemy.y < 125;
        });
        nextBursts.forEach((burst) => world.bursts.push(burst));
        world.bursts = world.bursts.slice(-12);
        setFrame((value) => value + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [onGameOver, onVictory, onWaveClear, setStats, stats.wave]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Shift'].includes(event.key) || event.code.startsWith('Key') || event.code === 'ShiftLeft' || event.code === 'ShiftRight') event.preventDefault();
      const isShift = event.code === 'ShiftLeft' || event.code === 'ShiftRight';
      if (event.code === 'KeyP' && !event.repeat) setPaused((value) => !value);
      if (isShift && !event.repeat) fireRequestRef.current += 1;
      inputRef.current[event.key] = true;
      inputRef.current[event.code] = true;
    };
    const up = (event: KeyboardEvent) => {
      inputRef.current[event.key] = false;
      inputRef.current[event.code] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const world = worldRef.current;
  const remaining = world.enemies.length;
  const objective = getLevelObjective(stats.wave);
  const boss = world.enemies.find((enemy) => enemy.kind === 'boss');
  const progress = stats.wave === 10 && boss ? clamp((1 - boss.hp / boss.maxHp) * 100, 0, 100) : clamp((stats.levelKills / objective) * 100, 0, 100);
  return (
    <main className="grain pixel-ui min-h-[100dvh] bg-[#1b3540] p-1 text-[#f0e2c5] sm:p-2" data-testid="sortie-screen">
      <div className="relative mx-auto flex min-h-[calc(100dvh-.5rem)] max-w-[1600px] flex-col overflow-hidden border border-[#d8c49f]/35 bg-[#234654] shadow-[0_14px_50px_rgba(5,19,25,.45)] sm:min-h-[calc(100dvh-1rem)]">
        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dac7a4]/25 bg-[#1c3843]/90 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-5"><PaperMark small /><span className="hidden h-7 w-px bg-[#dac7a4]/25 sm:block" /><div className="type-mono text-[10px] leading-4 tracking-[.12em] text-[#cfbd9d]/70"><span className="text-[#edb94c]">LIVE SORTIE</span><br />{getAirframe(stats.wave).model} / SOLO FLIGHT</div></div>
          <div className="order-3 w-full text-center sm:order-none sm:w-auto"><p className="pixel-title type-mono text-xl leading-none tracking-[.12em] text-[#f2e0b3]">SKIES OF IRON:</p><p className="type-mono text-[9px] tracking-[.2em] text-[#edb94c]">WWI AVIATION EVOLUTION</p></div>
          <div className="flex items-center gap-4 type-mono text-[10px] tracking-[.13em]">
             <div className="hidden items-center gap-2 sm:flex"><span className="text-[#cfbd9d]/60">ALLIED HULL</span><HealthPips health={stats.health} maxHealth={stats.maxHealth} /></div>
            <div className="flex items-center gap-2 text-[#edb94c]" data-testid="text-scrap"><span className="text-[#cfbd9d]/60">SCRAP</span>{String(stats.scrap).padStart(3, '0')}</div>
            <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Mute sound'} className="border border-[#dac7a4]/30 p-2 text-[#cfbd9d]/70 hover:border-[#edb94c]" data-testid="button-toggle-sound">{muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}</button>
            <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Resume sortie' : 'Pause sortie'} className="border border-[#dac7a4]/30 p-2 text-[#cfbd9d]/70 hover:border-[#edb94c]" data-testid="button-toggle-pause">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}</button>
          </div>
        </div>
         <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[#dac7a4]/25 bg-[#203e48] px-4 py-2.5 type-mono text-[9px] tracking-[.12em] text-[#d9c9a7]/70 sm:px-6">
           <div><span className="text-[#edb94c]">LEVEL {String(stats.wave).padStart(2, '0')}</span><span className="ml-3">{stats.wave === 10 ? 'STATIC FORTRESS' : 'EASTBOUND'}</span></div>
           <div className="flex items-center gap-4"><span className="hidden sm:inline">SCORE {String(stats.score).padStart(5, '0')}</span><span className="flex items-center gap-2"><span className="text-[#cfbd9d]/60">HULL</span><HealthPips health={stats.health} maxHealth={stats.maxHealth} /></span><div className="h-1.5 w-20 overflow-hidden bg-[#142e38]/70 sm:w-32"><div className="h-full bg-[#edb94c]" style={{ width: `${progress}%` }} /></div></div>
         </div>
           <div className="relative min-h-[58vh] flex-1 overflow-hidden">
          <SkyBackdrop elapsed={world.elapsed} wave={stats.wave} battlefield />
          <div className="absolute left-0 top-0 h-full w-full" onPointerDown={() => onFire(true)} onPointerUp={() => onFire(false)} onPointerLeave={() => onFire(false)} data-testid="game-field">
              <div className="pointer-events-none absolute left-4 top-4 z-[3] type-mono text-[9px] tracking-[.13em] text-[#f0e2c5]/65 sm:left-7 sm:top-5" data-testid="text-objective"><span className="text-[#edb94c]">OBJECTIVE // </span>{stats.wave === 10 ? 'BREAK STATIC FORTRESS' : `DOWN ${objective} PLANES (${stats.levelKills}/${objective})`}</div>
             {world.enemies.map((enemy) => <div key={enemy.id} className={`absolute z-[4] -translate-x-1/2 -translate-y-1/2 ${enemy.kind === 'boss' ? 'h-32 w-44 text-[#bdc2ad]' : enemy.kind === 'heavy' ? 'h-16 w-24 text-[#bdc2ad]' : 'h-12 w-16 text-[#d6d3bb]'}`} style={{ left: `${enemy.x}%`, top: `${enemy.y}%` }} data-testid={`enemy-${enemy.id}`}><EnemyMarker enemy={enemy} />{stats.radio && enemy.x > 70 && <span className="radio-contact absolute -top-5 left-1/2 -translate-x-1/2 border border-[#edb94c]/70 bg-[#203b45]/80 px-1.5 py-0.5 type-mono text-[7px] tracking-[.1em] text-[#edb94c]">INBOUND</span>}</div>)}
             {world.projectiles.map((shot) => <div key={shot.id} className={`absolute z-[6] h-2 w-2 -translate-x-1/2 ${shot.kind === 'enemy' || shot.kind === 'boss' ? 'bg-[#edb94c]' : shot.kind === 'bomb' ? 'h-3 w-3 border border-[#252a2a] bg-[#bd462d]' : 'bg-[#f4e4b9]'}`} style={{ left: `${shot.x}%`, top: `${shot.y}%`, boxShadow: shot.kind === 'bomb' ? '2px 2px 0 rgba(26,38,39,.5)' : '3px 0 0 rgba(237,185,76,.38)' }} />)}
            {world.bursts.map((burst) => <div key={burst.id} className={`hit-flash pointer-events-none absolute z-[8] h-7 w-7 -translate-x-1/2 -translate-y-1/2 border-2 ${burst.tone === 'hit' ? 'border-[#edb94c] bg-[#bd462d]/40' : 'border-[#e4d2af] bg-transparent'}`} style={{ left: `${burst.x}%`, top: `${burst.y}%` }} />)}
              <div className="absolute z-[7] h-24 w-40 -translate-x-1/2 -translate-y-1/2 text-[#e9d6aa]" style={{ left: `${world.player.x}%`, top: `${world.player.y}%` }} data-testid="player-plane"><CamelPlane model={getAirframe(stats.wave).id} /><span className="absolute -bottom-3 left-1/2 h-px w-16 -translate-x-1/2 bg-[#e9d6aa]/40" /></div>
          </div>
          <MobileControls onMove={onMove} onFire={onFire} />
           {paused && !overlay && <div className="absolute inset-0 z-[15] grid place-items-center bg-[#19333e]/45 backdrop-blur-[2px]"><div className="border border-[#e1ceaa]/50 bg-[#263f47]/90 px-10 py-8 text-center shadow-[5px_5px_0_rgba(14,29,35,.35)]"><Pause className="mx-auto mb-3 h-6 w-6 text-[#edb94c]" /><p className="type-note text-2xl">Sortie paused</p><p className="mt-2 type-mono text-[9px] tracking-[.15em] text-[#d5c3a1]/60">PRESS RESUME TO RE-ENTER THE CLOUDS</p></div></div>}
        </div>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-[#dac7a4]/25 bg-[#203e48] px-4 py-2.5 type-mono text-[9px] tracking-[.13em] text-[#cdbd9d]/60 sm:px-6"><div className="flex flex-wrap items-center gap-x-5 gap-y-2"><span className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-[#edb94c]" /> ALT {Math.round(4200 + Math.sin(world.elapsed / 1000) * 140)} FT</span><span>ADVANCE {String(Math.max(1, Math.floor(world.elapsed / 95))).padStart(3, '0')} MI</span><span className="text-[#edb94c]">DAMAGE {stats.weaponDamage}</span>{stats.radio && <span className="flex items-center gap-1 text-[#edb94c]"><Radio className="h-3 w-3" /> RADIO CONTACTS</span>}<div className="hidden sm:block"><ControlHint fireMode={stats.fireMode} /></div></div><span className="flex items-center gap-2 text-[#edb94c]"><Crosshair className="h-3.5 w-3.5" /> {muted ? 'QUIET GUNS' : 'GUNS HOT'}</span></div>
           <div className="hidden shrink-0 border-t border-[#dac7a4]/25 bg-[#1c3843] px-4 py-2.5 sm:block sm:px-6"><TechnologyPath stats={stats} /></div>
           <div className="flex shrink-0 items-center justify-between border-t border-[#dac7a4]/25 bg-[#1c3843] px-4 py-2.5 type-mono text-[9px] tracking-[.13em] text-[#cdbd9d]/55 sm:px-6"><span>FLIGHT RECORDER: EASTBOUND</span><span className="hidden sm:block">FIELD 14 — {routes[(stats.wave - 1) % routes.length].toUpperCase()}</span><span className="text-[#edb94c]">{stats.fireMode === 'automatic' ? 'AUTO' : 'MANUAL'} / {stats.shotCount} PELLET{stats.shotCount === 1 ? '' : 'S'} {stats.bombs ? '/ BOMB RACK' : ''}</span></div>
           {overlay}
      </div>
    </main>
  );
}

function EnemyMarker({ enemy }: { enemy: Enemy }) {
  return <div className="relative h-full w-full"><EnemyPlane kind={enemy.kind} /><span className="absolute left-1/2 top-0 h-1 w-1 -translate-x-1/2 rounded-full bg-[#bd462d]" />{enemy.hp < enemy.maxHp && <span className="absolute -bottom-1 left-1/2 h-1 w-10 -translate-x-1/2 bg-[#bd462d]" />}</div>;
}

function EnemyPlane({ kind }: { kind: EnemyKind }) {
  return <svg viewBox="0 0 110 76" className="pixel-art-plane h-full w-full" aria-hidden="true"><g fill="currentColor"><path d={kind === 'boss' ? 'M5 36h36l14-18h11l-3 16 36 2 8 6-8 6-36 2 3 16H55L41 48H5l8-6-8-6Z' : kind === 'heavy' ? 'M9 31h28l11-13 5 2-4 11 26 3v7L49 43l4 10-5 2-11-12H9l7-6-7-6Z' : 'M14 31h20l12-12 4 2-4 12 28 3v5l-28 3 4 12-4 2-12-13H14l6-7-6-7Z'} /><path d={kind === 'boss' ? 'M45 34h31v7H45Z' : 'M42 30h24v5H42Z'} fill="rgba(24,32,34,.48)" /><path d={kind === 'boss' ? 'M61 23h8v27h-8Z' : 'M54 24h6v18h-6Z'} fill="#bd462d" /></g>{kind === 'boss' && <path d="M87 29h5v21h-5Z" fill="#edb94c" />}</svg>;
}

function Victory({ stats, onBackToMenu }: { stats: RunStats; onBackToMenu: () => void }) {
  return (
    <div className="scene-screen grain relative min-h-[100dvh] overflow-hidden text-[#f4e2bd]">
      <IllustratedBackdrop />
      <div className="scene-vignette absolute inset-0" />
      <div className="relative z-10 mx-auto flex min-h-[100dvh] max-w-[1100px] flex-col items-center px-5 py-6 text-center sm:px-10">
        <header className="w-full border-b border-[#eed5a5]/40 pb-4"><p className="type-mono text-[clamp(.8rem,2vw,1.1rem)] font-bold tracking-[.2em] text-[#f4d28d]">SKIES OF IRON: 1914—1918</p><p className="mt-1 type-mono text-[9px] tracking-[.22em] text-[#f5dfb4]/75">ALLIED POWERS / RFC FLIGHT REPORT</p></header>
        <div className="paper-in mt-16 w-full max-w-[680px] border-2 border-[#4a3c31] bg-[#d9c39a] p-6 text-[#293536] shadow-[7px_7px_0_rgba(27,28,27,.45)] sm:p-10">
          <p className="type-mono text-[10px] font-bold tracking-[.2em] text-[#bd462d]">THE LINE HOLDS</p>
          <h2 className="pixel-title mt-3 type-note text-[clamp(3rem,9vw,7rem)] leading-none text-[#bd4f3c]">VICTORY</h2>
          <p className="mt-5 type-note text-xl leading-relaxed">The static fortress is down. Ten levels east, the Allied flight has carried its signal through the whole war.</p>
          <p className="mt-4 type-mono text-[11px] tracking-[.14em] text-[#bd462d]">PLANES SHOT DOWN: {String(stats.kills).padStart(3, '0')} / RFC PILOT STATUS: RETURNING</p>
          <button onClick={onBackToMenu} className="mt-7 flex w-full items-center justify-center border-2 border-[#342d29] bg-[#bd462d] px-5 py-4 type-mono text-sm font-bold tracking-[.13em] text-[#fff0d1] shadow-[4px_4px_0_#342d29] transition-transform hover:-translate-y-1" data-testid="button-victory-menu">BACK TO MAIN MENU</button>
        </div>
      </div>
    </div>
  );
}

function Home() {
  const [screen, setScreen] = useState<Screen>('briefing');
  const [runNumber] = useState(1);
  const freshStats = (): RunStats => ({ health: 5, maxHealth: 5, scrap: 0, kills: 0, levelKills: 0, wave: 1, score: 0, weaponDamage: 5, speedBonus: 0, fireMode: 'manual', shotCount: 1, radio: false, dispersion: 0, bombs: false });
  const [stats, setStatsState] = useState<RunStats>(freshStats);
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeId | null>(null);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const launch = useCallback(() => { setStatsState(freshStats()); setScreen('sortie'); }, []);
  const backToMenu = useCallback(() => setScreen('briefing'), []);
  const setStats = useCallback((next: RunStats) => setStatsState(next), []);
  const waveClear = useCallback(() => setScreen('upgrade'), []);
  const gameOver = useCallback(() => setScreen('gameover'), []);
  const victory = useCallback(() => setScreen('victory'), []);
  const chooseUpgrade = useCallback((id: UpgradeId) => {
    setSelectedUpgrade(id);
    setScreen('upgrade-info');
  }, []);
  const applyUpgrade = useCallback(() => {
    if (!selectedUpgrade) return;
    const id = selectedUpgrade;
    setStatsState((current) => {
      const nextPending = current.wave === 1 ? (id === 'automatic' ? 'double' : 'automatic') : undefined;
      return {
        ...current,
        health: current.maxHealth + (id === 'armor' ? 1 : 0),
        maxHealth: current.maxHealth + (id === 'armor' ? 1 : 0),
        levelKills: 0,
        weaponDamage: id === 'damage' ? current.weaponDamage + 1 : current.weaponDamage,
        speedBonus: id === 'speed' ? current.speedBonus + .3 : current.speedBonus,
        fireMode: id === 'automatic' ? 'automatic' : current.fireMode,
        shotCount: id === 'double' ? 2 : id === 'triple' ? 3 : current.shotCount,
        radio: id === 'radio' ? true : current.radio,
        dispersion: id === 'dispersion' ? current.dispersion + 1 : current.dispersion,
        bombs: id === 'bomb' ? true : current.bombs,
        pendingUpgrade: nextPending,
        wave: current.wave + 1,
      };
    });
    setSelectedUpgrade(null);
    setScreen('sortie');
  }, [selectedUpgrade]);
  useEffect(() => {
    const continueAfterBriefing = (event: KeyboardEvent) => {
      if (screen !== 'upgrade-info' || event.repeat || (event.code !== 'ShiftLeft' && event.code !== 'ShiftRight')) return;
      event.preventDefault();
      applyUpgrade();
    };
    window.addEventListener('keydown', continueAfterBriefing);
    return () => window.removeEventListener('keydown', continueAfterBriefing);
  }, [applyUpgrade, screen]);
  return (
    <>
      {screen === 'briefing' && <Briefing onLaunch={launch} onHowToPlay={() => setShowHowToPlay(true)} runNumber={runNumber} />}
      {screen === 'briefing' && showHowToPlay && <HowToPlay onClose={() => setShowHowToPlay(false)} />}
      {screen === 'sortie' && <Sortie stats={stats} setStats={setStats} onWaveClear={waveClear} onGameOver={gameOver} onVictory={victory} />}
      {screen === 'upgrade' && <Sortie stats={stats} setStats={setStats} onWaveClear={waveClear} onGameOver={gameOver} onVictory={victory} startPaused overlay={<UpgradePanel stats={stats} onChoose={chooseUpgrade} />} />}
      {screen === 'upgrade-info' && selectedUpgrade && <Sortie stats={stats} setStats={setStats} onWaveClear={waveClear} onGameOver={gameOver} onVictory={victory} startPaused overlay={<UpgradeInfoPanel stats={stats} optionId={selectedUpgrade} />} />}
      {screen === 'gameover' && <GameOver stats={stats} onBackToMenu={backToMenu} />}
      {screen === 'victory' && <Victory stats={stats} onBackToMenu={backToMenu} />}
    </>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;