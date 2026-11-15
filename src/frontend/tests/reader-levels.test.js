const {test}=require('node:test');const assert=require('node:assert/strict');const Levels=require('../js/reader-levels');
test('XP boundaries unlock the right named rank without changing the level cadence',()=>{
 for(const rank of Levels.ranks){
  const result=Levels.progress(rank.xp);assert.equal(result.level,rank.level);assert.equal(result.current.name,rank.name);assert.equal(result.intoLevel,0);assert.equal(result.remaining,250);
  if(rank.xp>0)assert.equal(Levels.progress(rank.xp-1).current.level,rank.level-1);
 }
 const almost=Levels.progress(249);assert.equal(almost.remaining,1);assert.equal(almost.next.name,Levels.progress(250).current.name);
 assert.equal(new Set(Levels.ranks.map(r=>r.icon)).size,12);
});
test('ranks continue beyond the named ladder with numbered legend badges',()=>{
 const high=Levels.progress(3500);assert.equal(high.level,15);assert.equal(high.current.name,'Eternal Legend 4');assert.equal(high.next.level,16);assert.equal(high.next.xp,3750);
 assert.equal(Levels.progress(-20).level,1);
});
