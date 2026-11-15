/* One roster drives the picker, saved choice, and class-specific battle moves. */
(function(root){
const roster=[
{id:'sage',name:'Sage',role:'A keeper of forgotten magic',accent:'#c6b5ec',focus:'Insight',attacks:[
{id:'rune',name:'Rune bolt',symbol:'◇',effect:'runes',line:'Ancient runes gather at your staff and strike the guardian!'},
{id:'nova',name:'Moon nova',symbol:'☾',effect:'nova',line:'A ring of moonlight blooms across the clearing!'},
{id:'roots',name:'Elder roots',symbol:'❧',effect:'roots',line:'Silver roots rise from the earth in a burst of light!'}]},
{id:'bard',name:'Bard',role:'A storyteller with a little magic',accent:'#e7b0a7',focus:'Perfect pitch',attacks:[
{id:'melody',name:'Echo melody',symbol:'♪',effect:'notes',line:'A ribbon of glowing notes dances from your lute!'},
{id:'chord',name:'Thunder chord',symbol:'♫',effect:'chord',line:'One bright chord sends a wave of sound through the glade!'},
{id:'anthem',name:'Dawn anthem',symbol:'♬',effect:'anthem',line:'Your song fills the clearing with the colors of sunrise!'}]},
{id:'knight',name:'Knight',role:'A brave guardian of the written word',accent:'#b6cadc',focus:'Battle focus',attacks:[
{id:'slash',name:'Dawn slash',symbol:'╱',effect:'blade',line:'You dash forward with a golden arc of your blade!'},
{id:'shield',name:'Shield bash',symbol:'⬡',effect:'shield',line:'Your shield meets the guardian in a flash of silver!'},
{id:'lance',name:'Star lance',symbol:'✧',effect:'lance',line:'A shining lance cuts a path through the shadows!'}]},
{id:'lantern',name:'Lantern keeper',role:'Carry a little light into the unknown',accent:'#b6d0b7',focus:'Lantern focus',attacks:[
{id:'spark',name:'Lantern spark',symbol:'✦',effect:'spark',line:'Your lantern sends a spark across the clearing!'},
{id:'flare',name:'Ember flare',symbol:'✺',effect:'flare',line:'Your last ember flares into a warm ring of light!'},
{id:'fireflies',name:'Firefly dance',symbol:'✧',effect:'fireflies',line:'A cloud of tiny fireflies carries your light forward!'}]}
];
roster.forEach(c=>c.world='fantasy');
roster.push(
{id:'sentinel',world:'scifi',name:'Sentinel',role:'An armored explorer of distant worlds',accent:'#9fd8e1',focus:'Target scan',attacks:[
{id:'laser',name:'Laser burst',symbol:'⌁',effect:'laser',line:'Your pulse rifle sends a bright laser across the sector!'},
{id:'plasma',name:'Plasma bomb',symbol:'◉',effect:'plasma',line:'A contained plasma charge blooms around the target!'},
{id:'missiles',name:'Micro missiles',symbol:'⋗',effect:'missiles',line:'Three tiny guided missiles streak across the clearing!'}]},
{id:'technomancer',world:'scifi',name:'Technomancer',role:'Rewrite the universe, one signal at a time',accent:'#c7b3f2',focus:'Neural link',attacks:[
{id:'tesla',name:'Tesla arc',symbol:'ϟ',effect:'tesla',line:'A violet arc leaps from your gauntlet into the machine!'},
{id:'gravity',name:'Gravity well',symbol:'◎',effect:'gravity',line:'Space folds into a bright gravity well around the target!'},
{id:'nanites',name:'Nanite swarm',symbol:'⠿',effect:'nanites',line:'A swarm of luminous nanites flows from your console!'}]},
{id:'pilot',world:'scifi',name:'Star pilot',role:'A trailblazer of the lunar frontier',accent:'#edc19e',focus:'Flight computer',attacks:[
{id:'rail',name:'Rail shot',symbol:'➝',effect:'rail',line:'Your sidearm launches a pinpoint rail shot!'},
{id:'drones',name:'Drone wing',symbol:'⌘',effect:'drones',line:'Your support drones sweep through the sector!'},
{id:'hyperdrive',name:'Warp strike',symbol:'✧',effect:'warp',line:'You blink through a warp gate in a flash of starlight!'}]},
{id:'android',world:'scifi',name:'Android',role:'A curious machine with a reader’s heart',accent:'#addac5',focus:'Pattern analysis',attacks:[
{id:'ion',name:'Ion fist',symbol:'◈',effect:'ion',line:'Your charged gauntlet releases a concentrated ion strike!'},
{id:'pulse',name:'EMP wave',symbol:'≋',effect:'emp',line:'An electromagnetic wave ripples out from your core!'},
{id:'overclock',name:'Overclock',symbol:'»',effect:'overclock',line:'Your systems flare with a rapid burst of electric light!'}]});
roster.push(
{id:'captain',world:'pirates',name:'Captain',role:'Chart your own course through the story',accent:'#e8bd96',focus:'Captain’s instinct',attacks:[
{id:'cutlass',name:'Cutlass sweep',symbol:'☽',effect:'cutlass',line:'Your cutlass traces a golden crescent through the sea mist!'},
{id:'flintlock',name:'Flintlock shot',symbol:'➝',effect:'flintlock',line:'A flash of powder sends your shot across the deck!'},
{id:'cannons',name:'Cannon volley',symbol:'●',effect:'cannons',line:'Your crew answers with a rolling cannon volley!'}]},
{id:'navigator',world:'pirates',name:'Navigator',role:'Find a path by compass, memory and starlight',accent:'#acd5d2',focus:'Chart the course',attacks:[
{id:'compass',name:'Compass beam',symbol:'✥',effect:'compass',line:'Your compass points true and releases a bright beam!'},
{id:'chart',name:'Star chart',symbol:'✧',effect:'chart',line:'A constellation from your chart lights the way!'},
{id:'whirlpool',name:'Whirlpool',symbol:'◎',effect:'whirlpool',line:'The tide gathers into a shimmering whirlpool!'}]},
{id:'deckhand',world:'pirates',name:'Deckhand',role:'A steady heart and an anchor to match',accent:'#c6d1ad',focus:'Steady hands',attacks:[
{id:'anchor',name:'Anchor slam',symbol:'⚓',effect:'anchor',line:'You bring your anchor down with a mighty splash!'},
{id:'rope',name:'Rope snare',symbol:'∞',effect:'rope',line:'Your rope loops through the air and catches its mark!'},
{id:'keg',name:'Powder keg',symbol:'▣',effect:'keg',line:'A powder keg bursts in a shower of warm sparks!'}]},
{id:'sea-witch',world:'pirates',name:'Sea Witch',role:'Listen to the whispers beneath the waves',accent:'#b8d1b7',focus:'Ocean whispers',attacks:[
{id:'ghost-tide',name:'Ghost tide',symbol:'≋',effect:'ghost-tide',line:'A luminous ghost tide sweeps across the shore!'},
{id:'coral',name:'Coral curse',symbol:'♆',effect:'coral',line:'Glowing coral rises from the shallows!'},
{id:'spectral',name:'Spectral crew',symbol:'♙',effect:'spectral',line:'Your spectral crew answers the call!'}]});
const normalizeWorld=world=>['scifi','pirates'].includes(world)?world:'fantasy';
const forWorld=world=>roster.filter(c=>c.world===normalizeWorld(world));
const get=(id,world)=>roster.find(c=>c.id===id&&(!world||c.world===world))||roster.find(c=>c.id===(world==='scifi'?'sentinel':world==='pirates'?'captain':'lantern'));
const api={roster,get,forWorld,normalizeWorld};if(typeof module!=='undefined')module.exports=api;else root.Characters=api;
})(typeof window==='undefined'?globalThis:window);
