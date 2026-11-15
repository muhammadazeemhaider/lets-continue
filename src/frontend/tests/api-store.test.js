const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
test('API checkpoints retain worlds and unlocked bosses, reset clears seals after the server saves',async()=>{
 const values={},server={id:1,title:'Test book',chapters:[{n:1},{n:2},{n:3}],completed:0,notes:[],history:[]};
 let resets=0,fail=false;
 const context={TTL_CONFIG:{apiBase:''},navigator:{userAgent:'test'},localStorage:{getItem:k=>values[k],setItem:(k,v)=>values[k]=v},BossBattle:{resetBook:()=>resets++},fetch:async(path,options)=>{
  if(path.endsWith('/checkpoints')){if(fail)return {ok:false,status:500,json:async()=>({error:'Save failed'})};server.completed=JSON.parse(options.body).completed;}
  const data=path.startsWith('/api/books/1')?server:path.startsWith('/api/books?')?[server]:path.startsWith('/api/streak')?{count:1}:path==='/api/user'?{id:1}:{unread:0,items:[]};
  return {ok:true,status:200,json:async()=>JSON.parse(JSON.stringify(data))};
 }};context.window=context;
 for(const file of ['characters','store'])vm.runInNewContext(fs.readFileSync(require.resolve(`../js/${file}.js`),'utf8'),context);
 const S=context.Store;await S.init();await S.loadBook(1);
 S.setBookWorld(1,'pirates');assert.equal(S.setBookCompanion(1,'captain'),true);
 await S.addCheckpoint(1,2,'');await S.startFromChapter(1,1);await S.init();
 assert.equal(S.getBook(1).completed,0);assert.equal(S.canChallengeChapter(S.getBook(1),2),true);
 assert.equal(S.getBook(1).world,'pirates');assert.equal(S.getBook(1).companions.pirates,'captain');
 fail=true;await assert.rejects(S.resetBookProgress(1),/Save failed/);assert.equal(resets,0);
 fail=false;await S.resetBookProgress(1);await S.loadBook(1);
 assert.equal(resets,1);assert.equal(S.canChallengeChapter(S.getBook(1),1),false);assert.equal(S.getBook(1).world,'pirates');
});

test('sign-up stores the device key, sends it on every request, and forgets it when the server rejects it', async () => {
  const values = {}, calls = [];
  let reject = false;
  const context = {
    console, Date, URLSearchParams, location: { search: '', hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' },
    localStorage: { getItem: (k) => values[k] ?? null, setItem: (k, v) => { values[k] = String(v); }, removeItem: (k) => { delete values[k]; } },
    navigator: { userAgent: 'test', platform: 'test', maxTouchPoints: 0 },
    matchMedia: () => ({ matches: false }),
    fetch: async (url, options = {}) => {
      calls.push({ url, auth: (options.headers || {}).Authorization });
      if (url.endsWith('/api/signup')) return { ok: true, status: 201, json: async () => ({ token: 'secret-key', user: { preferredName: 'Azeem' } }) };
      if (reject) return { ok: false, status: 401, json: async () => ({ error: 'Please sign up to continue.' }) };
      return { ok: true, status: 200, json: async () => ({ preferredName: 'Azeem' }) };
    },
  };
  context.window = context;
  context.TTL_CONFIG = { apiBase: '' };
  for (const file of ['characters', 'store']) vm.runInNewContext(fs.readFileSync(require.resolve(`../js/${file}.js`), 'utf8'), context);
  const Store = context.Store;
  assert.equal(Store.isSignedIn(), false);
  const user = await Store.signUp({ name: 'Azeem Haider', preferredName: 'Azeem', email: '' });
  assert.equal(user.preferredName, 'Azeem');
  assert.equal(Store.isSignedIn(), true);
  await Store.updateUser({ preferredName: 'Azeem' });
  assert.equal(calls.at(-1).auth, 'Bearer secret-key');
  reject = true;
  await assert.rejects(Store.updateUser({ preferredName: 'X' }), (err) => err.auth === true);
  assert.equal(Store.isSignedIn(), false);
});
