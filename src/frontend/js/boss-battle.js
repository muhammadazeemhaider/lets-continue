/* Optional chapter encounters. Storage and answers are independent of reading progress. */
(function(root){
const themes=[
{name:'Mist Slime',place:'The Mossfall Glade',color:'#a2c8b1',sky:'#202b4b',ground:'#465957',hint:'A little light cuts through the mist.'},
{name:'Bellwing Owl',place:'The Listening Woods',color:'#d8b48c',sky:'#292449',ground:'#424c55',hint:'Listen closely. The answer is in the story.'},
{name:'Riverstone Golem',place:'The Silverwater Bank',color:'#9dbac7',sky:'#283950',ground:'#4a6570',hint:'Look beneath the surface of the chapter.'},
{name:'Archive Moth',place:'The Moonlit Archive',color:'#bfb1df',sky:'#312b54',ground:'#56516d',hint:'Small details can carry great meaning.'},
{name:'Dawn Dragon',place:'The Summit of First Light',color:'#e7b39a',sky:'#785570',ground:'#766478',hint:'Bring everything you remember into the light.'}];
const spaceThemes=[
{name:'Survey Drone',place:'The Lunar Relay',color:'#9fd7e0',sky:'#102d45',ground:'#344c62',hint:'Scan the passage for the signal.'},
{name:'Scrap Walker',place:'The Wreckage Field',color:'#c9ad9e',sky:'#2b304d',ground:'#4d4f65',hint:'Reconstruct the chapter, one detail at a time.'},
{name:'Prism Sentinel',place:'The Crystal Reactor',color:'#a4ddca',sky:'#1a3f4d',ground:'#365b68',hint:'Separate the signal from the noise.'},
{name:'Nebula Ray',place:'The Orbital Archive',color:'#bcafe9',sky:'#302d5b',ground:'#4a4b6f',hint:'Every memory leaves a trace.'},
{name:'Mooncore Titan',place:'The Lunar Crown',color:'#e7bf9b',sky:'#5f5875',ground:'#5a6078',hint:'Bring the whole chapter into focus.'}];
const pirateThemes=[
{name:'Clawback Crab',place:'The Shipwreck Shallows',color:'#cbaa91',sky:'#274e5e',ground:'#4a807e',hint:'Look closely at the details washed ashore.'},
{name:'The Powder Captain',place:'The Rival’s Cove',color:'#a17c89',sky:'#3f405e',ground:'#577a7d',hint:'A steady aim begins with a clear memory.'},
{name:'Siren of the Shoals',place:'The Singing Reef',color:'#a0cfc7',sky:'#335466',ground:'#497c85',hint:'Listen to what the chapter is telling you.'},
{name:'The Drowned Admiral',place:'The Lantern Wreck',color:'#96bdb3',sky:'#304656',ground:'#4c6b75',hint:'Let the story guide you through the fog.'},
{name:'The Ink-Crowned Kraken',place:'The Emerald Abyss',color:'#9a91ba',sky:'#303c5e',ground:'#386d79',hint:'Bring the whole chapter into the light.'}];
const prefixes=['','Quiet','Ancient','Wandering','Moonlit','Silver','Hollow','Mossbound','Starlit','Velvet','Hidden','Twilight','Amber','Frost','Cloud','Echo','Wild','Copper','Dreaming','Opal','Distant','Ivory','Violet','Bramble','Golden','Last','Elder'];
const memory={};let storageWarning=false;
// Where catalogue questions came from (see backend questions.py). Shown before and during the fight.
const CATALOG_NOTE={
  'text':'These questions were made from this chapter’s own text. Every answer is in the chapter.',
  'ai-text':'These questions were written by AI from this chapter’s text, and every answer was checked against a quote from it.',
  'ai-knowledge':'These questions were written by AI from what it knows about this book.'};
const CATALOG_DISCLOSURE={'text':'Questions from the chapter’s text','ai-text':'AI questions checked against the chapter','ai-knowledge':'AI questions from the book'};
const key=(id,n)=>`ttl.boss.v1:${id}:${n}`;
function load(id,n){const k=key(id,n);try{const raw=localStorage.getItem(k);if(raw)return BossEngine.validate(JSON.parse(raw));}catch{}return BossEngine.validate(memory[k]);}
function save(id,n,b){memory[key(id,n)]=b;try{localStorage.setItem(key(id,n),JSON.stringify(b));}catch{storageWarning=true;}}
function profile(n,world='fantasy'){world=['scifi','pirates'].includes(world)?world:'fantasy';const base=(world==='scifi'?spaceThemes:world==='pirates'?pirateThemes:themes)[(n-1)%5],prefix=n<=5?'':prefixes[n-1]||`Chapter ${n}`;return {...base,world,color:n<=5?base.color:`hsl(${(n*31+130)%360} 26% 70%)`,sky:n<=5?base.sky:`hsl(${(n*17+220)%360} 24% 23%)`,name:`${prefix} ${base.name}`.trim(),type:(n-1)%5};}
function resetBook(id){const book=Store.getBook(id);if(!book)return;for(const ch of book.chapters){delete memory[key(id,ch.n)];try{localStorage.removeItem(key(id,ch.n));}catch{}}}
function reset(){for(const book of Store.books())resetBook(book.id);}
function spaceArt(type,color){
const shapes=[
// A flat saucer with suspended sensor pods: no humanoid body or legs.
`<path d="M-8-10H8v3h5v7h-26v-7h5z" fill="#bccfdb"/><path d="M-6-8H6v5H-6z" fill="#354e70"/><path d="M-3-6h6v2h-6z" fill="${color}"/><path d="M-19 0h38v3h5v4h-5v3h-38V7h-5V3h5z" fill="#7488a9"/><path d="M-17 2h34v3h-34z" fill="#d4e2e4"/><path d="M-16 6h4v2h-4zM-2 6h4v2h-4zM12 6h4v2h-4z" fill="#a0e5e7"/><path d="M-11 10h3v6h-3zM8 10h3v6H8z" fill="#53758f"/><path d="M-13 15h7v3h-7zM6 15h7v3H6z" fill="${color}"/><path d="M-2-15h4v5h-4z" fill="#ebd5aa"/>`,
// Low, heavily built quadruped, offset rail cannon and four articulated feet.
`<path d="M-14-7h28v4h4V9h-36V-3h4z" fill="#8b8d9c"/><path d="M-10-4h20v8h-20z" fill="#b9ad9e"/><path d="M-7-1H5v3H-7z" fill="#f4cd91"/><path d="M3-14h16v4h6v4H3z" fill="#535b77"/><path d="M7-12h16v2H7z" fill="#a4bcd1"/><path d="M-20 6h5v10h-6v4h-5v-6h6zM15 6h5v8h6v6h-5v-4h-6z" fill="#62728a"/><path d="M-9 8h5v13h-8v-4h3zM4 8h5v9h3v4H4z" fill="#a0a4ae"/><path d="M-15-11h4v4h-4z" fill="${color}"/>`,
// A tall crystal with an eye, floating shards and an orbital bracket.
`<path d="M-2-23h4l8 15v9L0 18-10 1v-9z" fill="#b7e6d5"/><path d="M0-20l6 13v8L0 12z" fill="#e6f5e8"/><path d="M-6-3H6v7H-6z" fill="#416982"/><path d="M-2-2h4v4h-4z" fill="#f5e0ab"/><path d="M-20-10h4l4 7-6 8-5-8zM16-11h4l3 8-5 8-6-8zM-17 12h4l3 5-5 6-5-6zM13 12h4l4 5-5 6-5-6z" fill="${color}"/><path d="M-16-16h5v2h-5zM11-16h5v2h-5zM-12 8h-5V1h2v5h3zM12 8h5V1h-2v5h-3z" fill="#7eabc0"/>`,
// A broad, living cyber-ray with a luminous belly and ribbon-like tendrils.
`<path d="M-3-7l-16-11-6 4v13l13 10 8-4h8l8 4L25-1v-13l-6-4L3-7z" fill="#8d83b8"/><path d="M-20-13l12 8-5 7-8-5zM20-13L8-5l5 7 8-5z" fill="#b1d9e0"/><path d="M-3-10h6l5 10-4 12h-8L-8 0z" fill="#c6b4df"/><path d="M-4-4h8v2h-8z" fill="#364866"/><path d="M-3-4h2v1h-2zM1-4h2v1H1z" fill="#f4e6b4"/><path d="M-3 10v8h-5v5h-2v-7h5v-6M3 10v12h6v-4h2v6H1V10" fill="none" stroke="#8ed6d7" stroke-width="2"/>`,
// An orbital machine: central core, broken halo and broad solar wings.
`<path d="M-8-22H8v3h7v4h4v7h3V8h-3v7h-4v4H8v3H-8v-3h-7v-4h-4V8h-3V-8h3v-7h4v-4h7z" fill="#5a6a89"/><path d="M-7-18H7v3h6v4h3v5h2V6h-2v5h-3v4H7v3H-7v-3h-6v-4h-3V6h-2V-6h2v-5h3v-4h6z" fill="#ccd3da"/><path d="M-5-11H5v3h5V8H5v3H-5V8h-5V-8h5z" fill="#3f5776"/><path d="M-3-7h6v3h3v8H3v3H-3V4h-3V-4h3z" fill="#f1d5a8"/><path d="M-25-8h7V8h-7zM18-8h7V8h-7z" fill="${color}"/><path d="M-24-5h5v2h-5zM-24 2h5v2h-5zM19-5h5v2h-5zM19 2h5v2h-5z" fill="#49617e"/>`
];return `<g class="space-boss-form space-boss-form-${type}">${shapes[type]}</g>`;
}
function art(type,color,world){if(world==='pirates')return PirateWorld.bossArt(type,color);if(world==='scifi')return spaceArt(type,color);const shapes=[
`<path d="M-15 10V2h3v-8h4v-4H8v4h4v8h3v8h-3v4h-24v-4z" fill="${color}"/><path d="M-10 1v-5h4v-3h7v3h-5v5z" fill="#e3efcd" opacity=".5"/><path d="M-8 3h3v4h-3zM5 3h3v4H5z" fill="#29364d"/><path d="M-2 8h4v2h-4z" fill="#507b72"/>`,
`<path d="M-11-13l6 5h10l6-5v11h4v12h-4v6H-11v-6h-4V-2h4z" fill="${color}"/><path d="M-11-2h9v9h-9zM2-2h9v9H2z" fill="#f6dfb4"/><path d="M-7 1h3v4h-3zM4 1h3v4H4z" fill="#382c4b"/><path d="M-2 6h4v3h-4z" fill="#bd865b"/><path d="M-16 1h4v13h-4zM12 1h4v13h-4z" fill="#8e7884"/><path d="M-8 15h5v3h-5zM3 15h5v3H3z" fill="#e2bb80"/>`,
`<path d="M-10-14h20v5h4v18H9v8H2v-5h-4v5h-7V9h-5V-9h4z" fill="${color}"/><path d="M-19-4h6v16h-6zM13-4h6v16h-6z" fill="#7794a5"/><path d="M-6-7h4v3h-4zM2-7h4v3H2z" fill="#ffe2a5"/><path d="M-7 0h14v3H-7z" fill="#435c70"/><path d="M-5 6h10v3H-5z" fill="#c3d4d0"/><path d="M-11-14h5v3h-5zM7 10h5v3H7z" fill="#87a899"/>`,
`<path d="M-3-5l-15-10h-4v16l15 10h-14v9l18-7zM3-5l15-10h4V1L7 11h14v9L3 13z" fill="${color}"/><path d="M-17-6h7v6h-7zM10-6h7v6h-7z" fill="#e9d8b8"/><path d="M-15-4h3v3h-3zM12-4h3v3h-3z" fill="#6d5e8e"/><path d="M-3-8h6v23h-6z" fill="#756b98"/><path d="M-4-9v-5h-3v-2M4-9v-5h3v-2" fill="none" stroke="#f2cba3" stroke-width="2"/><path d="M-2-5h1v2h-1zM1-5h1v2H1z" fill="#ffe8b4"/>`,
`<path d="M-7-10h15v4h5v5h-4v14h-16v-4h-5V-3h5z" fill="${color}"/><path d="M-7-6l-13-10v15l10 8zM8-5l13-10V0L10 7z" fill="#ae899d"/><path d="M-15-7l-3-5v10l5 4zM16-7l3-4v10l-5 3z" fill="#d2abb1"/><path d="M-4-11v-6h3v7M5-11v-6h3v6" fill="#f6dbab"/><path d="M-3-6h3v3h-3zM5-6h3v3H5z" fill="#423347"/><path d="M0 0h5v2H0z" fill="#925e78"/><path d="M-3 4h8v8h-8z" fill="#f3d0a4"/><path d="M-8 11h6v5h-6zM5 11h6v5H5zM-9 6h-10V2h-4v7h14z" fill="${color}"/>`
];return shapes[type];}
function scene(boss,n,hero){const height=matchMedia('(max-width: 780px)').matches?180:260;const type=boss.type;let setting='';for(let i=0;i<6;i++){const x=12+(i*65+n*7)%380;setting+=boss.world==='pirates'?`<path d="M${x} 138v-44h3v44z" fill="#766b63"/><path d="M${x-12} 99l12-8 14 6-4 4-9-4-10 8z" fill="#639b87"/><path d="M${x+14} 154h22v2h-22z" fill="#b4dbcb" opacity=".25"/>`:boss.world==='scifi'?`<path d="M${x} 116V87h7V75h6v12h8v29z" fill="#21374d"/><path d="M${x+4} 94h12v6h-12z" fill="#8bcddd" opacity=".35"/>`:type===0||type===1?`<path d="M${x} 118v-28h-12v-8h6v-10h6v-10h6v10h6v10h6v8h-12v28z" fill="#151f36" opacity=".6"/>`:type===2?`<path d="M${x} 120h40v7h-40zM${x+12} 134h34v3h-34z" fill="#a5cad1" opacity=".3"/>`:type===3?`<path d="M${x} 116V65h22v51h-4V70h-14v46zM${x-3} 61h28v6h-28z" fill="#81708d" opacity=".4"/>`:`<path d="M${x-15} 124l30-60 40 60z" fill="#4b3f60"/>`;}
if(boss.world==='pirates')setting=PirateWorld.battleSetting(type,height);
return `<div class="battle-scene hero-${hero.id} battle-world-${boss.world}" style="--boss-color:${boss.color};--hero-accent:${hero.accent}"><svg class="battle-world" viewBox="0 0 400 ${height}" preserveAspectRatio="none" role="img" aria-label="${boss.name} in ${boss.place}" shape-rendering="crispEdges"><defs><linearGradient id="battleSky" x2="0" y2="1"><stop stop-color="${boss.sky}"/><stop offset="1" stop-color="${boss.world==='scifi'?'#486681':'#9b7d8c'}"/></linearGradient></defs><rect width="400" height="${height}" fill="url(#battleSky)"/><path d="M32 29h3v3h-3zM90 17h2v2h-2zM153 34h2v2h-2zM345 20h3v3h-3z" fill="#f6dfbd"/><rect y="116" width="400" height="${height-116}" fill="${boss.ground}"/>${setting}${boss.world==='scifi'?'<g transform="translate(-68 -26) scale(.45)">'+SpaceWorld.moon(1,false,false)+'</g>':''}<ellipse cx="286" cy="123" rx="60" ry="12" fill="#181c3933"/><ellipse cx="89" cy="${height*.88}" rx="40" ry="8" fill="#181c3944"/><g class="boss-creature boss-idle-${type}" transform="translate(286 92) scale(1.8)">${art(type,boss.color,boss.world)}</g></svg><svg class="journey battle-player" viewBox="-12 -13 27 30" aria-hidden="true" shape-rendering="crispEdges"><g class="landscape-explorer" data-direction="right" data-frame="0">${Journey.characterSprite(Journey.getCharacter())}</g></svg><span class="arena-flash" aria-hidden="true"></span><span class="slash-effect" aria-hidden="true">╱</span><span class="star-shower" aria-hidden="true">✦ · ✧ · ✦</span><span class="rune-orbit" aria-hidden="true">◇ ✧ ◇</span><span class="nova-ring" aria-hidden="true"></span><svg class="root-spell" viewBox="0 0 100 80" aria-hidden="true" shape-rendering="crispEdges"><path d="M10 80V50h10V25h10M45 80V30h-8V10M70 80V40h10V15M90 80V60H60" fill="none" stroke="currentColor" stroke-width="5"/></svg><span class="music-ribbon" aria-hidden="true">♪ ♫ ♬ ♪</span><span class="sound-wave" aria-hidden="true"></span><span class="dawn-rays" aria-hidden="true"></span><span class="shield-effect" aria-hidden="true">⬡</span><span class="lance-effect" aria-hidden="true"></span><span class="ember-bloom" aria-hidden="true">✺</span><span class="firefly-swarm" aria-hidden="true">· ˚ · ✧ · ˚ ·</span><span class="laser-beam" aria-hidden="true"></span><span class="plasma-core" aria-hidden="true">◉</span><span class="missile-salvo" aria-hidden="true">➤ ➤ ➤</span><span class="tesla-arc" aria-hidden="true">ϟ</span><span class="gravity-well" aria-hidden="true"></span><span class="nanite-cloud" aria-hidden="true">▦ · ⠿ · ▦</span><span class="rail-tracer" aria-hidden="true"></span><span class="drone-wing" aria-hidden="true">⌘ ⌘ ⌘</span><span class="warp-gate" aria-hidden="true">◎</span><span class="ion-fist" aria-hidden="true">◈</span><span class="emp-ring" aria-hidden="true"></span><span class="overclock-grid" aria-hidden="true">0101<br>1010</span><span class="cutlass-arc" aria-hidden="true">☽</span><span class="flintlock-smoke" aria-hidden="true">· ●</span><span class="cannon-volley" aria-hidden="true">● ● ●</span><span class="compass-flare" aria-hidden="true">✥</span><span class="chart-stars" aria-hidden="true">✧ ─ ✦ ─ ✧</span><span class="whirlpool-spin" aria-hidden="true">◎</span><span class="anchor-drop" aria-hidden="true">⚓</span><span class="rope-loop" aria-hidden="true">∞</span><span class="keg-burst" aria-hidden="true">▣ ✺</span><span class="ghost-wave" aria-hidden="true">≋ ≋ ≋</span><span class="coral-rise" aria-hidden="true">♆ ♆</span><span class="spectral-sailors" aria-hidden="true">♙ ♙ ♙</span><span class="battle-class">${hero.name}</span><span class="arena-attack-name" role="status"></span><span class="spell-orb" aria-hidden="true">✦</span><span class="damage-pop" aria-hidden="true">−30</span><div class="boss-speech" aria-hidden="true"></div><span class="battle-place">${boss.place} · CH ${n}</span></div>`;}
const threats=['The mist gathers. Your lantern flickers.','Bellwing circles overhead, listening.','Stone plates shift. The river falls quiet.','Silver wings scatter a cloud of dust.','The dragon opens its wings against the dawn.'];
const reactions=['The slime wobbles and reforms.','The owl tilts its head. Listen again.','The golem holds its ground. Look closer.','The moth drifts out of reach. Recall the details.','The dragon waits. Your light is still burning.'];
const commandVerb=hero=>hero.world==='pirates'?(hero.id==='sea-witch'?'Invoke':hero.id==='navigator'?'Chart':'Use'):hero.world==='scifi'?(['sentinel','pilot'].includes(hero.id)?'Fire':hero.id==='android'?'Activate':'Deploy'):hero.id==='knight'?'Use':hero.id==='bard'?'Play':'Cast';
function open(book,n,ui){
  if(!book||!Number.isInteger(n)||n<1||n>book.chapters.length||Math.max(book.completed,book.furthestCompleted||0)<n)return;
  Journey.useBook?.(book);
  let hero=Journey.getCharacterInfo(),attacks=hero.attacks;
  let attackVerb=commandVerb(hero);
  const boss=profile(n,book.world),demo=book.id==='lantern-road'?BossFixtures[n-1]:null;
  let battle=load(book.id,n),wrong=new Set(),feedback='',busy=false,selected=null,move=attacks[0].id,sound=false,audio=null;
  // A saved seal is history, not the starting screen for a new encounter.
  if(battle?.defeated)battle={...BossEngine.create(battle.questions,battle.source,battle.kind),...(battle.catalogSource?{catalogSource:battle.catalogSource}:{})};
  let catalog; // undefined: not fetched yet · null: none for this chapter · {source, questions}: ready
  let sealCollected=Boolean(load(book.id,n)?.defeated);
  const esc=Services.esc;
  const scrim=ui.openOverlay('<section class="sheet boss-sheet encounter-arrival" role="dialog" aria-modal="true" aria-label="Chapter boss battle"></section>','boss-overlay',()=>{try{audio?.close()?.catch(()=>{});}catch{}ui.onClose?.();});
  const panel=scrim.querySelector('.boss-sheet');
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tone(success){
    if(!sound)return;
    try{audio ||= new (root.AudioContext||root.webkitAudioContext)();audio.resume();const now=audio.currentTime;for(let i=0;i<3;i++){const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type=hero.id==='bard'?'triangle':hero.id==='sage'?'sine':'square';oscillator.frequency.value=(success?[392,523,784]:[220,196,165])[i];gain.gain.setValueAtTime(.025,now+i*.075);gain.gain.exponentialRampToValueAtTime(.001,now+i*.075+.09);oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(now+i*.075);oscillator.stop(now+i*.075+.1);}}catch{}
  }
  function persist(){if(!load(book.id,n)?.defeated)save(book.id,n,battle);}
  function focusQuestion(){panel.querySelector('#battle-question, #begin-battle, #boss-source, #battle-done')?.focus();}
  function shell(content){
    panel.innerHTML=`<div class="battle-top"><span>CHAPTER ${n} · GUARDIAN ENCOUNTER</span><div><button class="battle-sound" aria-pressed="${sound}">SOUND ${sound?'ON':'OFF'}</button><button class="battle-leave" aria-label="Leave boss battle">×</button></div></div><div class="enemy-name"><div><span class="boss-kicker">${esc(book.chapters[n-1].title)}</span><h2>${boss.name}</h2></div><span class="boss-seal">${battle?.defeated?'✦ CLEARED':'GUARDIAN '+String(n).padStart(2,'0')}</span></div><div class="enemy-health"><label for="boss-hp">BOSS HP</label><progress id="boss-hp" value="${90-(battle?.answered.length||0)*30}" max="90"></progress><span>${90-(battle?.answered.length||0)*30}/90</span></div>${scene(boss,n,hero)}${content}<p class="battle-disclosure">${battle?.kind==='catalog'?CATALOG_DISCLOSURE[battle.catalogSource]||'Questions from the book catalogue':battle?.kind==='excerpt'||!demo?'Recall from your chapter summary or excerpt':'Questions from the original demo chapter'} · 30 damage per correct answer · No reading penalty${storageWarning?' · Saved for this visit only':''}</p>`;
    panel.querySelector('.battle-leave').onclick=ui.closeOverlay;
    panel.querySelector('.battle-sound').onclick=e=>{sound=!sound;e.currentTarget.textContent=`SOUND ${sound?'ON':'OFF'}`;e.currentTarget.setAttribute('aria-pressed',sound);if(sound)tone(true);};
  }
  function sourcePanel(){
    // Catalogue books: fetch this chapter's three questions first (rule-based from the text, or AI-written).
    if(!demo&&catalog===undefined&&Store.chapterQuestions){
      shell('<div class="battle-content"><p class="encounter-instructions">The guardian is gathering its questions…</p></div>');
      panel.querySelector('.battle-leave').onclick=ui.closeOverlay;
      Store.chapterQuestions(book.id,n).then(r=>{catalog=r&&r.available&&BossEngine.validQuestions(r.questions)?r:null;if(scrim.isConnected&&!battle)sourcePanel();});
      return;
    }
    const ready=demo||catalog;
    shell(`<div class="battle-content"><div class="encounter-announcement"><span>!</span><div><h3>A guardian blocks the trail!</h3><p>${boss.world==='scifi'?['A scanner sweeps the sector. Target acquired.','The walker’s reactor hums. Systems online.','The prism core spins. A new pattern appears.','A transmission echoes from the orbital archive.','The titan unfolds its solar panels. Moonrise approaches.'][boss.type]:threats[boss.type]}</p></div></div><p class="encounter-instructions">Choose an attack, select your answer, then strike. Three correct answers bring this guardian into the light.</p>${ready?`${demo?`<details class="battle-source"><summary>Review the chapter before the encounter</summary><p>${esc(demo.text)}</p></details>`:`<p class="source-note">${esc(CATALOG_NOTE[catalog.source]||'')} <button type="button" class="btn quiet small" id="use-own-summary">Use my own summary instead</button></p>`}<div class="encounter-actions"><button class="btn quiet" id="battle-later">Maybe later</button><button class="btn primary" id="begin-battle">Enter the encounter ⚔</button></div>`:`<form id="source-form"><label for="boss-source">Add your summary or an excerpt from chapter ${n}</label><textarea id="boss-source" maxlength="20000" placeholder="What happened in this chapter? A short summary is welcome…" required></textarea><p class="source-note">Use your own summary or paste a chapter excerpt. There’s no minimum word count; questions are based only on what you provide.</p><p role="alert" id="source-error"></p><div class="encounter-actions"><button type="button" class="btn quiet" id="battle-later">Maybe later</button><button class="btn primary" type="submit">Prepare the encounter →</button></div></form>`}</div>`);
    panel.querySelector('#battle-later').onclick=ui.closeOverlay;
    if(demo)panel.querySelector('#begin-battle').onclick=()=>{battle=BossEngine.create(demo.questions,demo.text,'demo');persist();paint();focusQuestion();};
    else if(catalog){
      panel.querySelector('#use-own-summary').onclick=()=>{catalog=null;sourcePanel();};
      panel.querySelector('#begin-battle').onclick=()=>{
        const qs=catalog.questions.map(q=>({id:q.id,prompt:q.prompt,options:q.options,correctIndex:q.correctIndex,explanation:q.explanation||''}));
        battle={...BossEngine.create(qs,CATALOG_NOTE[catalog.source]||'Questions from the book catalogue.','catalog'),catalogSource:catalog.source};
        persist();paint();focusQuestion();
      };
    }
    else panel.querySelector('#source-form').onsubmit=e=>{e.preventDefault();const source=panel.querySelector('#boss-source').value;try{battle=BossEngine.create(BossEngine.questionsFromExcerpt(source),source,'excerpt');persist();paint();focusQuestion();}catch(error){panel.querySelector('#source-error').textContent=error.message;}};
  }
  function victory(celebrate=false){
    const emblem=boss.world==='pirates'?'⚓':boss.world==='scifi'?'⬡':'✦';
    shell(`<div class="battle-content battle-victory">${celebrate?`<div class="victory-cinematic" aria-hidden="true"><span>VICTORY</span><small>CHAPTER ${n} · THE WAY IS OPEN</small></div>`:''}<span class="victory-kicker">CHAPTER ${n} COMPLETE</span><h3>VICTORY</h3><p class="victory-subtitle">${boss.name} lowers its guard.<br>The way is open!</p><button class="victory-seal ${sealCollected?'collected':''}" id="collect-seal" aria-label="${sealCollected?'Chapter seal already collected':'Collect chapter '+n+' seal'}" ${sealCollected?'disabled':''}><span>${emblem}</span><small>${sealCollected?'SEAL COLLECTED':'COLLECT YOUR SEAL'}</small></button><p id="seal-message" role="status">${sealCollected?'This chapter’s seal is safely in your collection.':'A little proof of the story you carried with you.'}</p><div class="victory-stats"><span>3 QUESTIONS MASTERED</span><span>90 DAMAGE DEALT</span></div><button class="btn primary" id="battle-done" ${sealCollected?'':'disabled'}>Continue the journey →</button><button class="btn quiet" id="battle-replay">Practice again</button></div>`);
    panel.classList.add('victory-presentation');
    panel.querySelector('.battle-scene').classList.add('guardian-cleared');
    if(celebrate){scrim.classList?.add('victory-screen');tone(true);}
    panel.querySelector('#collect-seal').onclick=e=>{
      if(sealCollected)return;
      sealCollected=true;e.currentTarget.disabled=true;e.currentTarget.classList.add('collected');e.currentTarget.querySelector('small').textContent='SEAL COLLECTED';
      panel.querySelector('#seal-message').textContent=`Chapter ${n} seal collected. Your journey is saved.`;
      panel.querySelector('#battle-done').disabled=false;panel.querySelector('#battle-done').focus({preventScroll:true});tone(true);
    };
    panel.querySelector('#battle-done').onclick=ui.closeOverlay;
    panel.querySelector('#battle-replay').onclick=()=>{battle=BossEngine.create(battle.questions,battle.source,battle.kind);wrong.clear();feedback='';selected=null;sealCollected=true;panel.classList.remove('victory-presentation');scrim.classList?.remove('victory-screen');paint();focusQuestion();};
  }
  function paint(){
    if(!panel.isConnected)return;
    if(!battle){sourcePanel();return;}
    if(battle.defeated){victory();return;}
    const index=battle.answered.length,q=battle.questions[index];
    const eliminated=battle.focusQuestion===index?q.options.map((_,i)=>i).filter(i=>i!==q.correctIndex).slice(0,2):[];
    const disabled=i=>wrong.has(i)||eliminated.includes(i);
    shell(`<div class="battle-content battle-combat"><div class="battle-party"><label for="battle-character">ADVENTURER</label><select id="battle-character" aria-label="Battle character">${Characters.forWorld(book.world).map(c=>`<option value="${c.id}" ${hero.id===c.id?'selected':''}>${c.name}</option>`).join('')}</select></div><div class="turn-banner"><span>YOUR TURN</span><p>${boss.world==='scifi'?['A scanner sweeps the sector. Target acquired.','The walker’s reactor hums. Systems online.','The prism core spins. A new pattern appears.','A transmission echoes from the orbital archive.','The titan unfolds its solar panels. Moonrise approaches.'][boss.type]:threats[boss.type]}</p><span>${index+1} / 3</span></div><div class="move-picker" role="group" aria-label="Choose an attack">${attacks.map(a=>`<button data-move="${a.id}" aria-pressed="${move===a.id}"><span>${a.symbol}</span>${a.name}</button>`).join('')}</div><div class="question-area"><h3 id="battle-question" tabindex="-1">${esc(q.prompt)}</h3><div class="answer-options">${q.options.map((option,i)=>`<button data-answer="${i}" aria-pressed="${selected===i}" ${disabled(i)?'disabled':''}><span>${String.fromCharCode(65+i)}</span>${esc(option)}</button>`).join('')}</div><p class="answer-feedback" role="status" aria-live="polite">${esc(feedback||'Choose your answer, then launch your attack.')}</p><details class="battle-source"><summary>Review your chapter source</summary><p>${esc(battle.source)}</p></details></div><div class="turn-controls"><button class="btn focus-ability" id="battle-focus" ${battle.focusQuestion!==null?'disabled':''}>◈ ${hero.focus} <small>${battle.focusQuestion!==null?'USED':'Remove 2 answers · once per fight'}</small></button><button class="btn primary" id="launch-attack" ${selected===null?'disabled':''}>${attacks.find(a=>a.id===move).symbol} ${attackVerb} ${attacks.find(a=>a.id===move).name}</button></div></div>`);
    panel.querySelector('#battle-character').onchange=e=>{
      if(busy)return;
      Journey.setCharacter(e.target.value);
      root.Store?.setBookCompanion(book.id,e.target.value);
      hero=Journey.getCharacterInfo();
      attacks=hero.attacks;
      attackVerb=commandVerb(hero);
      move=attacks[0].id;
      feedback=`${hero.name} steps forward. Choose one of their attacks.`;
      paint();
      panel.querySelector('#battle-character').focus({preventScroll:true});
    };
    panel.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{if(busy)return;move=button.dataset.move;panel.querySelectorAll('[data-move]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.move===move));panel.querySelector('#launch-attack').textContent=`${attacks.find(a=>a.id===move).symbol} ${attackVerb} ${attacks.find(a=>a.id===move).name}`;});
    panel.querySelectorAll('[data-answer]').forEach(button=>button.onclick=()=>{if(busy)return;selected=+button.dataset.answer;panel.querySelectorAll('[data-answer]').forEach(b=>b.setAttribute('aria-pressed',+b.dataset.answer===selected));panel.querySelector('#launch-attack').disabled=false;});
    panel.querySelector('#battle-focus').onclick=()=>{if(busy)return;const result=BossEngine.focus(battle);battle=result.battle;persist();if(result.eliminated.includes(selected))selected=null;feedback='You gather your focus. Two possibilities fade away.';paint();panel.querySelector('[data-answer]:not(:disabled)')?.focus();};
    panel.querySelector('#launch-attack').onclick=()=>strike(index,q);
  }
  function strike(index,q){
    if(busy||selected===null)return;
    const result=BossEngine.answer(battle,index,selected);
    if(!result.accepted)return;
    busy=true;
    const arena=panel.querySelector('.battle-scene');
    arena.querySelector('.arena-attack-name').textContent=attacks.find(a=>a.id===move).name;
    arena.classList.add(`attack-${attacks.find(a=>a.id===move).effect}`,result.correct?'correct-hit':'boss-counter');
    panel.querySelectorAll('[data-answer], [data-move], #launch-attack, #battle-focus, #battle-character').forEach(b=>b.disabled=true);
    const log=panel.querySelector('.answer-feedback');
    if(result.correct){
      battle=result.battle;persist();tone(true);
      panel.querySelector(`[data-answer="${selected}"]`).classList.add('answer-correct');
      log.textContent=`${attacks.find(a=>a.id===move).line} −30 HP! ${q.explanation}`;
      panel.querySelector('#boss-hp').value=90-battle.answered.length*30;
      panel.querySelector('.enemy-health>span').textContent=`${90-battle.answered.length*30}/90`;
      panel.querySelector('.boss-speech').textContent=boss.world==='scifi'?['Signal received!','Reactor fluctuation…','Pattern recognized.','Transmission clear.','Lunar sequence online.'][boss.type]:['Gloop…!','Hoo…!','Cr-r-rack…','Flutter…!','A little brighter…'][boss.type];
    }else{
      tone(false);wrong.add(selected);
      panel.querySelector(`[data-answer="${selected}"]`).classList.add('answer-wrong');
      log.textContent=`${boss.world==='scifi'?['The drone recalibrates its scanner.','The walker braces its stabilizers.','The prism core changes frequency.','The ray slips through a magnetic current.','The titan reroutes its shield array.'][boss.type]:reactions[boss.type]} ${q.explanation} Your progress is safe. Try again.`;
      panel.querySelector('.boss-speech').textContent=['Still a little foggy…','Listen once more.','Look beneath the surface.','Recall the small things.','Your light can grow.'][boss.type];
    }
    setTimeout(()=>{
      if(!panel.isConnected)return;
      if(result.correct&&battle.defeated){busy=false;ui.onVictory?.();victory(true);panel.querySelector(sealCollected?'#battle-done':'#collect-seal').focus({preventScroll:true});return;}
      if(result.correct){
        busy=false;selected=null;wrong.clear();
        feedback=`Previous answer: correct! −30 HP. ${q.explanation}`;
        paint();focusQuestion();return;
      }
      const controls=panel.querySelector('.turn-controls');
      controls.innerHTML='<span class="turn-result">NO PENALTY · TRY AGAIN</span><button class="btn primary" id="next-turn">Try another answer →</button>';
      controls.querySelector('#next-turn').onclick=()=>{busy=false;selected=null;feedback=`${boss.hint} Take another look at the passage.`;paint();focusQuestion();};
      controls.querySelector('#next-turn').focus({preventScroll:true});
    },reduced()?0:1000);
  }
  paint();
}
const preview=(n,world)=>`<svg viewBox="-28 -26 56 54" aria-hidden="true" shape-rendering="crispEdges">${art(profile(n,world).type,profile(n,world).color,world)}</svg>`;
root.BossBattle={open,load,profile,preview,resetBook,reset};
})(window);
