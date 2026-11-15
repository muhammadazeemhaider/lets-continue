const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function setup(){
 const timers=new Map(),listeners=new Map(),contexts=[];let timerId=0;
 const param=()=>({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
 class Context{
  constructor(){this.currentTime=0;this.state='running';this.destination={};this.sampleRate=8000;this.sources=[];contexts.push(this);}
  createGain(){return {gain:param(),connect(){},disconnect(){}};}
  createOscillator(){const source={type:'sine',frequency:param(),setPeriodicWave(){},connect(){},disconnect(){},start:at=>source.startAt=at,stop:at=>{if(at===undefined)source.stopped=true;}};this.sources.push(source);return source;}
  createPeriodicWave(real,imaginary){return {real,imaginary};}
  createBufferSource(){return this.createOscillator();}
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  createBiquadFilter(){return {Q:{},frequency:param(),connect(){},disconnect(){}};}
  async resume(){this.state='running';}async close(){this.state='closed';}
 }
 const root={AudioContext:Context,setInterval:fn=>{timers.set(++timerId,fn);return timerId;},clearInterval:id=>timers.delete(id),document:{hidden:false,addEventListener:(key,fn)=>listeners.set(key,fn),removeEventListener:key=>listeners.delete(key)}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../js/attack-audio.js'),'utf8'),{window:root});
 return {...root,api:root.AttackAudio,timers,listeners,contexts};
}
test('all boss worlds have distinct looping scores and victory changes the melody',()=>{
 const {api}=setup(),scores=new Set();
 for(const world of ['fantasy','scifi','pirates'])for(let boss=0;boss<5;boss++){
  const battle=api.theme(world,boss),victory=api.theme(world,boss,'victory');
  assert.ok(battle.duration>4);assert.ok(battle.notes.every(n=>n[3]+n[4]<battle.duration));
  assert.notEqual(JSON.stringify(battle.notes),JSON.stringify(victory.notes));scores.add(JSON.stringify(battle.notes));
 }
 assert.equal(scores.size,15);
});
test('music survives attack effects, loops, pauses when hidden, and stops on mute or close',async()=>{
 const s=setup(),audio=s.api.create();audio.startMusic('scifi',2);assert.equal(s.contexts.length,0);
 audio.setEnabled(true);assert.equal(s.timers.size,1);const context=s.contexts[0];
 const initial=context.sources.length;audio.startMusic('scifi',2);assert.equal(context.sources.length,initial);assert.equal(s.timers.size,1);
 await audio.play('laser');assert.equal(s.timers.size,1);
 context.currentTime=9;for(const tick of s.timers.values())tick();assert.ok(context.sources.length>initial);
 s.document.hidden=true;s.listeners.get('visibilitychange')();assert.equal(s.timers.size,0);
 s.document.hidden=false;s.listeners.get('visibilitychange')();assert.equal(s.timers.size,1);
 audio.startMusic('scifi',2,'victory');assert.equal(s.timers.size,1);await audio.play('victory');
 audio.setEnabled(false);assert.equal(s.timers.size,0);const before=context.sources.length;await audio.play('miss');assert.equal(context.sources.length,before);
 audio.setEnabled(true);assert.equal(s.timers.size,1);audio.close();assert.equal(s.timers.size,0);assert.equal(context.state,'closed');assert.equal(s.listeners.size,0);
 await audio.play('rune');audio.startMusic('fantasy',0);assert.equal(s.timers.size,0);
});
test('miss cue is stronger than the old quiet cue without increasing other attack gains',()=>{
 const {api}=setup();assert.ok(api.profiles.miss[0][5]>=.5);assert.ok(api.profiles.miss[1][5]>=.65);
 assert.ok(api.profiles.victory.length>=6);
});

test('cutscene scores are distinct, slower, and transition without overlapping loops',()=>{
 const s=setup();
 for(const world of ['fantasy','scifi','pirates'])for(let boss=0;boss<5;boss++){
  const intro=s.api.theme(world,boss,'intro'),battle=s.api.theme(world,boss);
  assert.ok(intro.duration>battle.duration);assert.ok(intro.notes.length<battle.notes.length);assert.notEqual(JSON.stringify(intro.notes),JSON.stringify(battle.notes));
 }
 const audio=s.api.create();audio.setEnabled(true);audio.startMusic('pirates',1,'intro');assert.equal(s.timers.size,1);
 audio.startMusic('pirates',1);assert.equal(s.timers.size,1);audio.startMusic('pirates',1,'victory');assert.equal(s.timers.size,1);
 audio.close();assert.equal(s.timers.size,0);
});
