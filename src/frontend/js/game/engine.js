(function(root){
const chapters = [
{id:1,title:'The Whispering Gate',region:'Mossfall Entrance',pages:12,rewardXP:80,rewardGold:25,story:'Beyond the ivy-covered gate, an old lantern flickers. Read the first chapter to find your way into the forgotten kingdom.'},
{id:2,title:'A Light Below',region:'Lantern Hollows',pages:15,rewardXP:100,rewardGold:30,story:'Follow the lanterns through the hollow. A forgotten story waits beneath the stone.'},
{id:3,title:'The Keeper’s Promise',region:'The Sunken Archives',pages:18,rewardXP:120,rewardGold:40,story:'Among the flooded shelves, the keeper guards a promise older than the kingdom.'},
{id:4,title:'Where Shadows Bloom',region:'Emberdeep Keep',pages:16,rewardXP:140,rewardGold:45,story:'Carry the keeper’s words through the ember-lit halls. The last door is almost within reach.'},
{id:5,title:'The Last Starlight',region:'The Starlight Sanctum',pages:20,rewardXP:180,rewardGold:60,story:'At the heart of the dungeon, a single star still shines. Finish the story and bring its light home.'}];
const fresh=()=>({schemaVersion:2,playerName:'The Wanderer',level:1,xp:0,gold:0,completed:[],equipped:'Traveler’s cloak',sessions:[],bossRewardsClaimed:[],inventory:['Traveler’s cloak'],draft:null});
const integer=(v,max=1e7)=>Number.isInteger(v)&&v>=0&&v<=max;
function validate(raw){const s=fresh();if(!raw||typeof raw!=='object')return s;for(let i=1;i<=5;i++){if(Array.isArray(raw.completed)&&raw.completed.includes(i)&&s.completed.length===i-1)s.completed.push(i);else break;} for(const k of ['level','xp','gold'])if(integer(raw[k])&&(k!=='level'||raw[k]>0))s[k]=raw[k]; while(s.xp>=s.level*100){s.xp-=s.level*100;s.level++;} if(typeof raw.playerName==='string')s.playerName=raw.playerName.slice(0,60);if(Array.isArray(raw.sessions))s.sessions=raw.sessions.filter(x=>x&&typeof x.id==='string'&&integer(x.chapterId,5)&&x.chapterId>0&&integer(x.pagesRead,chapters[x.chapterId-1].pages)&&Number.isFinite(x.activeSeconds)&&x.activeSeconds>=0&&typeof x.notes==='string'&&Number.isFinite(Date.parse(x.startedAt))&&Number.isFinite(Date.parse(x.endedAt)));const d=raw.draft;if(d&&d.chapterId===s.completed.length+1&&integer(d.pagesRead,chapters[d.chapterId-1]?.pages)&&typeof d.notes==='string'&&Number.isFinite(d.seconds)&&d.seconds>=0&&Number.isFinite(Date.parse(d.startedAt)))s.draft={...d,runningSince:null};return s;}
function awardXP(s,xp,gold){let n={...s,xp:s.xp+xp,gold:s.gold+gold};while(n.xp>=n.level*100){n.xp-=n.level*100;n.level++;}return n;}
const canAccessChapter=(s,id)=>integer(id,5)&&id>0&&id<=s.completed.length+1;
function completeChapter(s,id){if(!canAccessChapter(s,id)||s.completed.includes(id)||id!==s.completed.length+1)return s;const c=chapters[id-1];return {...awardXP(s,c.rewardXP,c.rewardGold),completed:[...s.completed,id],draft:null};}
function load(storage){try{return validate(JSON.parse(storage.getItem('bookquest-v2')||storage.getItem('bookquest-v1')||'null'));}catch{return fresh();}}
const api={chapters,fresh,validate,awardXP,canAccessChapter,completeChapter,load};if(typeof module!=='undefined')module.exports=api;else root.Game=api;
})(typeof window==='undefined'?globalThis:window);
