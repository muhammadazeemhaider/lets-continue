(function(root){
const validQuestions=qs=>Array.isArray(qs)&&qs.length===3&&qs.every(q=>q&&typeof q.prompt==='string'&&q.prompt.length>0&&Array.isArray(q.options)&&q.options.length===4&&q.options.every(x=>typeof x==='string'&&x.length>0)&&new Set(q.options).size===4&&Number.isInteger(q.correctIndex)&&q.correctIndex>=0&&q.correctIndex<4&&typeof q.explanation==='string');
function create(questions,source,kind){if(!validQuestions(questions))throw Error('Three questions with four distinct answers are required.');return {version:1,questions,source,kind,answered:[],defeated:false,focusQuestion:null};}
function validate(raw){if(!raw||!validQuestions(raw.questions)||typeof raw.source!=='string'||!['demo','excerpt','catalog'].includes(raw.kind)||!Array.isArray(raw.answered))return null;const answered=[];for(let i=0;i<3;i++){if(raw.answered.includes(i)&&answered.length===i)answered.push(i);else break;}return {...raw,version:1,answered,defeated:answered.length===3,focusQuestion:Number.isInteger(raw.focusQuestion)&&raw.focusQuestion>=0&&raw.focusQuestion<3?raw.focusQuestion:null};}
function answer(battle,index,choice){if(!battle||battle.defeated||index!==battle.answered.length||!Number.isInteger(choice)||choice<0||choice>3)return {battle,accepted:false,correct:false};if(choice!==battle.questions[index].correctIndex)return {battle,accepted:true,correct:false};const answered=[...battle.answered,index];return {battle:{...battle,answered,defeated:answered.length===3},accepted:true,correct:true};}
function focus(battle){
  if(!battle||battle.defeated||battle.focusQuestion!==null)return {battle,eliminated:[]};
  const index=battle.answered.length;
  return {battle:{...battle,focusQuestion:index},eliminated:battle.questions[index].options.map((_,i)=>i).filter(i=>i!==battle.questions[index].correctIndex).slice(0,2)};
}
/* Local exact-text recall. No title-based guesses or API calls. */
function questionsFromExcerpt(text){
  text=String(text||'').trim().slice(0,20000);
  if(!text)throw Error('Add a chapter summary or excerpt to begin.');
  const sentences=(text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).map(s=>s.trim()).filter(Boolean);
  const stopWords=new Set(['the','and','but','for','with','that','this','was','were','are','has','had','have','from','into','then','which','there','their','would','could','should','these','those','about','because','where','while','after','before']);
  const words=[...new Set((text.match(/[A-Za-z][A-Za-z'-]{2,}/g)||[]).map(w=>w.toLowerCase()))];
  const fallback=['forest','castle','garden','shadow','meadow','bridge','silver','winter'];
  const result=[],used=new Set();
  for(const sentence of sentences){
    const targets=[...new Set(sentence.match(/[A-Za-z][A-Za-z'-]{2,}/g)||[])].filter(w=>!stopWords.has(w.toLowerCase())).sort((a,b)=>b.length-a.length);
    for(const target of targets){
      if(used.has(target.toLowerCase()))continue;
      const distractors=[...new Set([...words,...fallback])].filter(w=>w!==target.toLowerCase()&&!stopWords.has(w)).slice(0,3);
      if(distractors.length<3)continue;
      const options=[target,...distractors],correctIndex=(result.length+1)%4;
      [options[0],options[correctIndex]]=[options[correctIndex],options[0]];
      result.push({id:`excerpt-${result.length}`,prompt:`Complete this line from your chapter summary or excerpt: “${sentence.replace(target,'_____')}”`,options,correctIndex,explanation:`The original line reads: “${sentence}”`});
      used.add(target.toLowerCase());
      if(result.length===3)return result;
    }
  }
  throw Error('Add a few concrete details about the chapter so we can create three distinct recall questions.');
}

const api={validQuestions,create,validate,answer,focus,questionsFromExcerpt};if(typeof module!=='undefined')module.exports=api;else root.BossEngine=api;
})(typeof window==='undefined'?globalThis:window);
