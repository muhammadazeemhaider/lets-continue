/* Small, locally synthesized battle sounds. No downloads, microphone, or external service. */
(function(root){
  // Layers: waveform, start/end Hz, onset, length, relative volume.
  const s=(type,from,to,at=0,length=.2,volume=.6)=>[type,from,to,at,length,volume];
  const profiles={
    rune:[s('sine',440,880),s('triangle',660,1320,.09,.24,.3)],
    nova:[s('sine',160,600,0,.45),s('sine',1200,300,.1,.4,.3)],
    roots:[s('noise',800,150,0,.4,.4),s('triangle',110,65,.1,.35)],
    melody:[s('triangle',523,523,0,.14),s('triangle',659,659,.12,.14),s('triangle',784,784,.24,.25)],
    chord:[s('triangle',196,196,0,.38,.4),s('triangle',247,247,0,.38,.35),s('triangle',294,294,0,.4,.35)],
    anthem:[s('triangle',392,392,0,.22,.4),s('triangle',523,523,.14,.22,.4),s('sine',784,784,.28,.32,.5)],
    slash:[s('noise',3500,550,0,.17,.5),s('triangle',650,190,.08,.12,.4)],
    shield:[s('noise',1600,300,0,.08,.35),s('sine',360,150,.02,.3),s('sine',760,430,.03,.16,.2)],
    lance:[s('triangle',300,1400,0,.25),s('sine',1600,900,.2,.2,.35)],
    spark:[s('square',660,990,0,.12,.25),s('sine',1320,880,.1,.18,.4)],
    flare:[s('noise',650,2200,0,.32,.4),s('sine',140,75,.08,.35)],
    fireflies:[s('sine',1047,1047,0,.13,.4),s('sine',1568,1568,.1,.12,.3),s('sine',1319,1760,.22,.18,.35)],
    laser:[s('sawtooth',1700,160,0,.15,.25),s('square',1200,180,.16,.13,.2)],
    plasma:[s('sine',130,420,0,.27),s('noise',1800,120,.25,.28,.45),s('sine',90,40,.26,.3)],
    missiles:[s('noise',2400,400,0,.13,.4),s('noise',2100,300,.13,.14,.4),s('sine',110,45,.28,.25)],
    tesla:[s('sawtooth',800,1800,0,.08,.2),s('square',1600,420,.08,.09,.22),s('noise',3000,900,.17,.16,.4)],
    gravity:[s('sine',420,45,0,.65),s('triangle',210,65,.1,.45,.25)],
    nanites:[s('square',1100,1300,0,.06,.18),s('square',1500,900,.09,.06,.18),s('square',1900,1200,.18,.07,.18),s('noise',4000,1600,.26,.12,.25)],
    rail:[s('noise',6000,1200,0,.055,.6),s('sine',160,45,.04,.25,.6)],
    drones:[s('triangle',160,360,0,.42,.4),s('sine',330,620,.1,.35,.3)],
    hyperdrive:[s('sine',220,2000,0,.22,.45),s('sine',1800,100,.22,.22,.45)],
    ion:[s('triangle',150,500,0,.12,.4),s('noise',2200,500,.12,.13,.4),s('sine',85,40,.13,.2)],
    pulse:[s('sine',640,80,0,.48,.6),s('triangle',1280,160,.03,.32,.25)],
    overclock:[s('square',330,440,0,.08,.2),s('square',660,880,.08,.08,.2),s('square',990,1320,.16,.12,.2)],
    cutlass:[s('noise',2800,700,0,.22,.4),s('sine',950,350,.11,.2,.35)],
    flintlock:[s('noise',4200,400,0,.1,.65),s('triangle',120,50,.03,.22,.5)],
    cannons:[s('noise',600,120,0,.25,.3),s('sine',100,35,0,.38,.55),s('sine',95,32,.18,.35,.5),s('sine',85,30,.36,.32,.45)],
    compass:[s('sine',880,1320,0,.3,.45),s('triangle',660,990,.16,.22,.3)],
    chart:[s('sine',784,784,0,.2,.35),s('sine',1175,1175,.13,.22,.35),s('sine',1568,1568,.26,.3,.3)],
    whirlpool:[s('noise',1500,180,0,.6,.35),s('sine',300,90,.1,.45,.45)],
    anchor:[s('noise',800,160,0,.14,.45),s('sine',140,40,0,.3),s('noise',1400,450,.18,.23,.3)],
    rope:[s('noise',1200,300,0,.22,.35),s('triangle',500,180,.17,.13,.3)],
    keg:[s('noise',900,3200,0,.13,.25),s('noise',2400,120,.13,.4,.5),s('sine',160,35,.14,.42,.6)],
    'ghost-tide':[s('sine',240,480,0,.5,.35),s('sine',244,484,.04,.55,.3),s('noise',750,250,.2,.4,.2)],
    coral:[s('triangle',294,392,0,.18,.4),s('triangle',440,587,.12,.18,.35),s('sine',784,1047,.25,.24,.3)],
    spectral:[s('sine',196,247,0,.55,.35),s('sine',294,370,.12,.45,.3),s('triangle',392,494,.24,.34,.2)],
    miss:[s('noise',1100,260,0,.18,.5),s('triangle',220,130,.06,.23,.65)],
    victory:[s('pulse25',523,523,0,.18,.45),s('pulse25',659,659,.16,.18,.45),s('pulse25',784,784,.32,.18,.5),s('pulse25',1047,1047,.52,.65,.5),s('sine',523,523,.52,.7,.3),s('sine',659,659,.52,.7,.25),s('sine',784,784,.52,.7,.25)],
    enabled:[s('sine',523,659,0,.1,.25),s('sine',784,784,.09,.13,.25)],
  };
  const motifs=[
    [0,2,4,2,0,4,5,4,2,1,2,4,5,4,2,1],
    [4,2,5,4,2,1,0,2,4,5,7,5,4,2,1,2],
    [0,0,2,3,4,2,1,0,3,3,5,4,2,1,2,4],
    [5,4,2,1,2,4,7,5,4,2,0,2,1,4,2,0],
    [0,4,7,5,4,2,5,7,8,7,5,4,2,4,1,0],
  ];
  const hz=midi=>440*Math.pow(2,(midi-69)/12);
  function theme(world='fantasy',boss=0,mode='battle'){
    const index=((boss%5)+5)%5;
    const victory=mode==='victory',intro=mode==='intro';
    const pirate=world==='pirates',space=world==='scifi';
    const rootNote=(space?48:pirate?50:57)+[0,2,-2,3,5][index];
    const scale=victory?[0,2,4,5,7,9,11,12,14]:space?[0,1,3,5,7,8,10,12,13]:pirate?[0,2,3,5,7,9,10,12,14]:(index>=3?[0,2,3,5,7,8,11,12,14]:[0,2,4,5,7,9,11,12,14]);
    const tempo=intro?(space?84:pirate?94:76)+index*2:victory?88:(space?112:pirate?126:104)+index*4;
    const beat=60/tempo,step=beat/2,steps=pirate?24:32;
    const melody=intro?[0,4,2,5,4,1,2,0,2,5,4,7,5,2,1,0]:victory?[0,2,4,7,5,4,2,4,0,2,5,4,2,1,2,0]:motifs[index];
    const notes=[];
    for(let i=0;i<steps;i++){
      const degree=melody[(i+(space?2:0))%melody.length];
      if(intro?i%2===0:i%4!==3||index===4)notes.push(s(space?'pulse12':pirate?'pulse25':'square',hz(rootNote+(intro?0:12)+scale[degree]),hz(rootNote+(intro?0:12)+scale[degree]),i*step,step*(intro?1.5:.75),(space?.075:.15)*(intro?.8:1)));
      if(i%(intro?(pirate?6:8):pirate?3:4)===0){const base=hz(rootNote+scale[[0,3,4,2][Math.floor(i/8)%4]]);notes.push(s('triangle',base,base,i*step,step*1.7,.24));}
      if(!victory&&!intro&&i%(pirate?3:4)===0)notes.push(s('triangle',90,42,i*step,.08,.12));
      if(!victory&&!intro&&i%2===1)notes.push(s('noise',space?3000:1800,800,i*step,.035,.035));
    }
    return {key:`${world}:${index}:${mode}`,notes,duration:steps*step};
  }

  const MUSIC_VOLUME=.22*Math.pow(10,10/20), MUSIC_DUCKED_VOLUME=.10*Math.pow(10,10/20);
  const EFFECTS_VOLUME=.12*Math.pow(10,5/20);
  function create(){
    let context=null,master=null,musicGain=null,enabled=false,closed=false,generation=0;
    let desired=null,musicTimer=null,musicGeneration=0,nextNote=0,loopStart=0;
    const voices=new Set(),musicVoices=new Set(),pulseWaves=new Map();
    function setWave(oscillator,type){
      if(!type.startsWith('pulse')){oscillator.type=type;return;}
      const duty=type==='pulse12'?.125:.25;
      if(!pulseWaves.has(type)){
        const real=new Float32Array(33),imaginary=new Float32Array(33);
        for(let n=1;n<real.length;n++)real[n]=2*Math.sin(Math.PI*n*duty)/(Math.PI*n);
        pulseWaves.set(type,context.createPeriodicWave(real,imaginary));
      }
      oscillator.setPeriodicWave(pulseWaves.get(type));
    }
    function ensureContext(){
      if(context)return true;
      const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return false;
      context=new Audio();master=context.createGain();master.gain.value=EFFECTS_VOLUME;master.connect(context.destination);
      musicGain=context.createGain();musicGain.gain.value=MUSIC_VOLUME;musicGain.connect(context.destination);return true;
    }
    function pauseMusic(){musicGeneration++;if(musicTimer!==null){root.clearInterval(musicTimer);musicTimer=null;}for(const node of musicVoices){try{node.stop();}catch{}}musicVoices.clear();}
    function musicNote(note,at){
      const [type,from,to,offset,length,volume]=note;
      const gain=context.createGain(),start=at+offset,end=start+length;
      let oscillator,filter;
      if(type==='noise'){
        oscillator=context.createBufferSource();const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*length),context.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        oscillator.buffer=buffer;filter=context.createBiquadFilter();filter.type='highpass';filter.Q.value=.5;filter.frequency.value=from;oscillator.connect(filter);filter.connect(gain);
      }else{
        oscillator=context.createOscillator();setWave(oscillator,type);oscillator.frequency.setValueAtTime(from,start);oscillator.frequency.exponentialRampToValueAtTime(to,end);oscillator.connect(gain);
      }
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,end);
      gain.connect(musicGain);musicVoices.add(oscillator);
      oscillator.onended=()=>{musicVoices.delete(oscillator);oscillator.disconnect();filter?.disconnect();gain.disconnect();};oscillator.start(start);oscillator.stop(end+.01);
    }
    async function beginMusic(){
      pauseMusic();
      if(!desired||!enabled||closed||root.document?.hidden)return;
      const ticket=musicGeneration;
      try{
        if(!ensureContext())return;
        if(context.state==='suspended')await context.resume();
        if(ticket!==musicGeneration||!enabled||closed||!desired)return;
        const score=desired;const notes=[...score.notes].sort((a,b)=>a[3]-b[3]);nextNote=0;loopStart=context.currentTime+.05;
        const schedule=()=>{
          if(!enabled||closed||root.document?.hidden)return;
          if(loopStart+notes[nextNote][3]<context.currentTime-.2){loopStart=context.currentTime+.05;nextNote=0;}
          while(loopStart+notes[nextNote][3]<context.currentTime+.25){
            musicNote(notes[nextNote],loopStart);nextNote++;
            if(nextNote===notes.length){nextNote=0;loopStart+=score.duration;}
          }
        };
        schedule();musicTimer=root.setInterval(schedule,100);
      }catch{/* Background music is optional. */}
    }
    function startMusic(world,boss,mode='battle'){
      const score=theme(world,boss,mode);
      if(desired?.key===score.key)return;
      desired=score;beginMusic();
    }
    function stopMusic(){desired=null;pauseMusic();}
    const onVisibility=()=>{if(root.document.hidden)pauseMusic();else if(desired&&enabled)beginMusic();};
    root.document?.addEventListener('visibilitychange',onVisibility);
    function silence(){for(const node of voices){try{node.stop();}catch{}}voices.clear();}
    function setEnabled(value){enabled=!!value;generation++;if(!enabled){silence();pauseMusic();}else if(desired)beginMusic();}
    async function play(id){
      if(!enabled||closed)return;
      const ticket=generation;
      try{
        if(!ensureContext())return;
        if(context.state==='suspended')await context.resume();
        if(!enabled||closed||ticket!==generation)return;
        silence();
        const now=context.currentTime+.008;
        // Lower the bed briefly so attacks, misses and victory remain clear.
        musicGain.gain.cancelScheduledValues(now);musicGain.gain.setValueAtTime(MUSIC_DUCKED_VOLUME,now);musicGain.gain.linearRampToValueAtTime(MUSIC_VOLUME,now+(id==='victory'?1.5:.65));
        for(const [type,from,to,offset,length,volume] of profiles[id]||profiles.spark){
          const gain=context.createGain(),start=now+offset,end=start+length;
          gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,end);
          gain.connect(master);
          let source,filter;
          if(type==='noise'){
            source=context.createBufferSource();const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*length),context.sampleRate),data=buffer.getChannelData(0);
            for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
            source.buffer=buffer;filter=context.createBiquadFilter();filter.type='lowpass';filter.Q.value=.6;
            filter.frequency.setValueAtTime(from,start);filter.frequency.exponentialRampToValueAtTime(to,end);source.connect(filter);filter.connect(gain);
          }else{source=context.createOscillator();setWave(source,type);source.frequency.setValueAtTime(from,start);source.frequency.exponentialRampToValueAtTime(to,end);source.connect(gain);}
          voices.add(source);source.onended=()=>{voices.delete(source);source.disconnect();filter?.disconnect();gain.disconnect();};source.start(start);source.stop(end+.01);
        }
      }catch{/* Audio is optional; a blocked/unavailable device never interrupts a battle. */}
    }
    function close(){if(closed)return;closed=true;enabled=false;generation++;silence();stopMusic();root.document?.removeEventListener('visibilitychange',onVisibility);try{context?.close()?.catch(()=>{});}catch{}}
    return {play,setEnabled,startMusic,stopMusic,close};
  }
  root.AttackAudio={create,profiles,theme};
})(window);
