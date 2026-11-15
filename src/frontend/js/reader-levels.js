/* XP ranks share the existing 250-XP level cadence. */
(function(root){
  const names=['Page Wanderer','Ink Initiate','Story Scout','Chapter Ranger','Lore Seeker','Rune Reader','Quest Scholar','Tome Guardian','Dawn Archivist','Realm Sage','Story Sovereign','Eternal Legend'];
  const colors=['#dfbc87','#89d9b2','#81d4e8','#e9c36b','#bda2ef','#e99dbe','#8fc4f3','#8ad9cc','#f1ba86','#c3b0ff','#f0cb7a','#e8a3e3'];
  const icons=['compass','feather','map','mountain','gem','rune','book','shield','sun','moon','crown','star'];
  function rank(level){
    level=Math.max(1,Math.floor(Number(level)||1));
    const index=Math.min(level-1,names.length-1);
    return {level,name:names[index]+(level>names.length?` ${level-names.length+1}`:''),color:colors[index],icon:icons[index],xp:(level-1)*250};
  }
  function progress(xp){
    xp=Math.max(0,Math.floor(Number(xp)||0));
    const level=Math.floor(xp/250)+1;
    return {xp,level,current:rank(level),next:rank(level+1),intoLevel:xp%250,remaining:250-xp%250};
  }
  const api={rank,progress,ranks:names.map((_,i)=>rank(i+1))};
  root.ReaderLevels=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
