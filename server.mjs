import http from 'node:http';
import {setupLessons,lessonList,handleLessons} from './lessons.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3210);
const origin = new URL(process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`).origin;
const dbPath = process.env.DB_PATH || join(root, 'data', 'math.sqlite');
mkdirSync(dirname(dbPath), {recursive:true});
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member');
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sections(id TEXT PRIMARY KEY,title TEXT NOT NULL,description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY,section TEXT NOT NULL REFERENCES sections(id),title TEXT NOT NULL,body TEXT NOT NULL,formula TEXT NOT NULL DEFAULT '',tag TEXT NOT NULL DEFAULT '',answer TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS feedback(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),body TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'New',reply TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
// Add columns in place so existing accounts and content survive upgrades.
const userColumns = db.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
if(!userColumns.includes('banned')) db.exec('ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0');
if(!userColumns.includes('created')) db.exec('ALTER TABLE users ADD COLUMN created TEXT');
db.exec(`CREATE TABLE IF NOT EXISTS messages(id INTEGER PRIMARY KEY, sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL, recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sender_name TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, read_at TEXT);
CREATE TRIGGER IF NOT EXISTS users_created AFTER INSERT ON users BEGIN UPDATE users SET created=CURRENT_TIMESTAMP WHERE id=NEW.id; END;`);
const derive = promisify(scrypt);
async function hash(password) { const salt = randomBytes(16).toString('hex'); return salt + ':' + (await derive(password,salt,64)).toString('hex'); }
async function matches(password, encoded) { const [salt, digest] = encoded.split(':'); return timingSafeEqual(Buffer.from(digest,'hex'), await derive(password,salt,64)); }
// This seed contains only a salted password hash; plaintext credentials are never sent to browsers.
const adminHash = 'c04cc59ec35ce3f5cb706f9c77400f1e:dd9f5200ec708783e655da842579fd7fc4ecea7f76b2ba6c715656ea8dca857c5f3399069810be98080013e44807dc87cf4c986cd4721038bb24611c727151ec';
if (!db.prepare('SELECT id FROM users WHERE username=?').get('yhyAdminQ')) db.prepare('INSERT INTO users(username,password,role) VALUES(?,?,?)').run('yhyAdminQ',adminHash,'admin');
const ownerId = db.prepare('SELECT id FROM users WHERE username=?').get('yhyAdminQ').id;
const publicUser = u=>u?{id:u.id,username:u.username,role:u.role,isOwner:u.id===ownerId}:null;
db.exec(`CREATE TRIGGER IF NOT EXISTS protect_owner_delete BEFORE DELETE ON users WHEN OLD.id=${ownerId} BEGIN SELECT RAISE(ABORT,'Original admin is protected'); END;
CREATE TRIGGER IF NOT EXISTS protect_owner_update BEFORE UPDATE ON users WHEN OLD.id=${ownerId} AND (NEW.id<>OLD.id OR NEW.username<>OLD.username OR NEW.role<>'admin' OR NEW.banned<>0 OR NEW.password<>OLD.password) BEGIN SELECT RAISE(ABORT,'Original admin is protected'); END;`);
const sectionSeeds = [
 ['tricks','Math Tricks','Small shortcuts. Big mathematical ideas.'],
 ['exercises','Math Exercises','Put an idea into practice, one problem at a time.'],
 ['solver','Math AI Solver','Work through a math problem with a step-by-step explanation.'],
 ['credits','Credits','The people behind this little corner of mathematics.'],
 ['feedback','Feedback','Have an idea or spot a mistake? Send a note to the admin.'],
 ['announcements','Announcements','The latest from Math SM Lab.']
];
if (!db.prepare('SELECT id FROM sections LIMIT 1').get()) {
 const add = db.prepare('INSERT INTO sections VALUES(?,?,?)'); sectionSeeds.forEach(s=>add.run(...s));
 const p = db.prepare('INSERT INTO posts(section,title,body,formula,tag,answer) VALUES(?,?,?,?,?,?)');
 p.run('tricks','Multiply by 11 in your head','For a two-digit number, add its digits and place the sum between them.\n\nFor 23: 2 + 3 = 5, so the answer is 253.\n\nIf the sum is 10 or more, carry the extra 1 to the first digit: 78 × 11 = 858.','23 × 11 = 253','Mental math','');
 p.run('tricks','Square numbers ending in 5','Take the number before the final 5. Multiply it by the next whole number, then attach 25.\n\nFor 35²: 3 × 4 = 12. Attach 25 to get 1225.\n\nWhy it works: (10n + 5)² = 100n(n + 1) + 25.','35² = 1225','Number patterns','');
 p.run('tricks','Flip a percentage','x% of y is equal to y% of x. Choose the direction that is easier to calculate.\n\n8% of 50 looks awkward, but 50% of 8 is just half of 8: 4.','8% of 50 = 50% of 8','Percentages','');
 p.run('tricks','Multiply by 9','Multiply the number by 10, then subtract the original number.\n\nFor 47 × 9: 470 − 47 = 423.','47 × 9 = 470 − 47','Mental math','');
 p.run('exercises','A little mental multiplication','Use the multiply-by-11 trick. What is 42 × 11?','42 × 11 = ?','Warm-up','462');
 p.run('exercises','Find the missing number','Subtract 7 from both sides, then divide by 3.','3x + 7 = 28','Algebra','7');
 p.run('exercises','A percentage switch','Try swapping the percentage and the number. What is 16% of 25?','16% of 25 = ?','Percentages','4');
 p.run('credits','Created by YHY','Math SM Lab is a space for sharing math shortcuts, practicing ideas, and learning together.\n\nContent is curated by yhyAdminQ.','∑','Creator','');
 p.run('announcements','Welcome to Math Lab','Start with a math trick, try an exercise, and tell us what you would like to learn next. New lessons will appear here as they are published.','','Welcome','');
}
// Update the former brand in saved content without resetting admin edits.
db.exec(`UPDATE sections SET description=replace(description,'YHY Math Lab','Math SM Lab') WHERE instr(description,'YHY Math Lab')>0;
UPDATE posts SET title=replace(title,'YHY Math Lab','Math SM Lab'),body=replace(body,'YHY Math Lab','Math SM Lab') WHERE instr(title,'YHY Math Lab')>0 OR instr(body,'YHY Math Lab')>0;`);
setupLessons(db);
if(!db.prepare('PRAGMA table_info(messages)').all().some(c=>c.name==='reply_to')) db.exec('ALTER TABLE messages ADD COLUMN reply_to INTEGER REFERENCES messages(id) ON DELETE SET NULL');
const subscribers = new Set();
const notify = () => {for(const s of subscribers) s.write('event: update\ndata: {}\n\n');};
function fail(status,message){throw Object.assign(new Error(message),{status});}
function str(value,min=1,max=10000){if(typeof value!=='string'||value.trim().length<min||value.length>max)fail(400,`Please enter text between ${min} and ${max} characters.`);return value.trim();}
function limited(key,max,ms){ const now=Date.now();const row=db.prepare('SELECT * FROM limits WHERE key=?').get(key); if(row && row.expires>now && row.count>=max)fail(429,'Too many attempts. Please try again later.');db.prepare('INSERT INTO limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,expires=excluded.expires').run(key,row&&row.expires>now?row.count+1:1,row&&row.expires>now?row.expires:now+ms); }
const digest = token=>createHash('sha256').update(token).digest('hex');
function getUser(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(!token)return null;return publicUser(db.prepare('SELECT u.id,u.username,u.role FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.banned=0').get(digest(token),Date.now()));}
function auth(req,admin=false){const u=getUser(req);if(!u)fail(401,'Please log in to continue.');if(admin&&u.role!=='admin')fail(403,'Only the admin can make this change.');return u;}
const cookie = token=>`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token?604800:0}${process.env.SECURE_COOKIES==='true'?'; Secure':''}`;
function session(res,u){const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),u.id,Date.now()+604800000);res.setHeader('Set-Cookie',cookie(token));return publicUser(u);}
async function body(req,max=24000){if(!(req.headers['content-type']||'').startsWith('application/json'))fail(415,'Expected JSON.');let b='';for await(const c of req){b+=c;if(Buffer.byteLength(b)>max)fail(413,'This message is too long.');}try{return JSON.parse(b);}catch{fail(400,'Invalid request.');}}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 try {
 const url=new URL(req.url,origin), path=url.pathname, method=req.method;
 if(!['GET','HEAD'].includes(method) && req.headers.origin!==origin)fail(403,'Request origin is not allowed.');
 if(await handleLessons({path,method,req,res,db,auth,body,str,fail,send,notify}))return;
 if(path==='/api/state'&&method==='GET') {const user=getUser(req);return send(res,200,{user,unread:user?db.prepare('SELECT COUNT(*) AS n FROM messages WHERE recipient_id=? AND read_at IS NULL').get(user.id).n:0,sections:db.prepare('SELECT * FROM sections ORDER BY rowid').all(),posts:db.prepare('SELECT p.id,p.section,p.title,p.body,p.formula,p.tag,p.created,t.lesson_id FROM posts p LEFT JOIN trick_lessons t ON t.post_id=p.id ORDER BY p.id DESC').all(),lessonCategories:db.prepare('SELECT * FROM lesson_categories ORDER BY name COLLATE NOCASE').all(),lessons:lessonList(db),aiReady:!!process.env.OPENAI_API_KEY});}
 if(path==='/api/events'&&method==='GET'){if(subscribers.size>=300)fail(503,'Live updates are busy. Please refresh.');res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');subscribers.add(res);const beat=setInterval(()=>res.write(': heartbeat\n\n'),20000);req.on('close',()=>{clearInterval(beat);subscribers.delete(res);});return;}
 if(['/api/login','/api/register'].includes(path)&&method==='POST') {
 limited('auth:'+req.socket.remoteAddress,30,900000);const b=await body(req);const username=str(b.username,3,32),password=str(b.password,8,128);if(!/^[a-zA-Z0-9_]+$/.test(username))fail(400,'Use letters, numbers, or underscores in your username.');
 if(path==='/api/register'){const hashed=await hash(password);try{db.prepare('INSERT INTO users(username,password) VALUES(?,?)').run(username,hashed);}catch(e){if(e.code?.startsWith('ERR_SQLITE'))fail(409,'That username is already taken.');throw e;}}
 const u=db.prepare('SELECT * FROM users WHERE username=?').get(username);const valid=await matches(password,u?.password||adminHash);if(!u||!valid)fail(401,'Incorrect username or password.');if(u.banned)fail(403,'This account is banned. Please contact the site owner.');return send(res,200,{user:session(res,u)});
 }
 if(path==='/api/logout'&&method==='POST'){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);if(token)db.prepare('DELETE FROM sessions WHERE token=?').run(digest(token));res.setHeader('Set-Cookie',cookie(''));return send(res,200,{ok:true});}
 if(path==='/api/admin/users'&&method==='GET'){auth(req,true);return send(res,200,db.prepare('SELECT id,username,role,banned,created FROM users ORDER BY id DESC').all().map(u=>({...u,isOwner:u.id===ownerId})));}
 if(path==='/api/admin/users'&&method==='POST'){
  const actor=auth(req,true),b=await body(req),id=Number(b.id);
  if(!Number.isSafeInteger(id)||id<1)fail(400,'Choose a valid user.');
  if(!['ban','unban','promote','demote','delete'].includes(b.action))fail(400,'Choose a valid action.');
  const target=db.prepare('SELECT id,role,banned FROM users WHERE id=?').get(id);if(!target)fail(404,'Account not found.');
  if(id===ownerId)fail(403,'The original admin yhyAdminQ cannot be changed, banned, or removed.');
  if(id===actor.id)fail(403,'You cannot change your own account here.');
  if(target.role==='admin'&&!actor.isOwner)fail(403,'Only yhyAdminQ can demote, ban, or remove another admin.');
  if(b.action==='demote'&&!actor.isOwner)fail(403,'Only yhyAdminQ can remove admin privileges.');
  if(b.action==='promote'&&target.banned)fail(400,'Unban this account before making it an admin.');
  db.exec('BEGIN IMMEDIATE');
  try{
   if(b.action==='delete'){
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    db.prepare('DELETE FROM feedback WHERE user_id=?').run(id);
    db.prepare('DELETE FROM users WHERE id=?').run(id);
   }else if(b.action==='ban'||b.action==='unban'){
    db.prepare('UPDATE users SET banned=? WHERE id=?').run(b.action==='ban'?1:0,id);
    if(b.action==='ban')db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
   }else db.prepare('UPDATE users SET role=? WHERE id=?').run(b.action==='promote'?'admin':'member',id);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  notify();return send(res,200,{ok:true});
 }
 if(path==='/api/messages'&&method==='GET'){
 const u=auth(req),sent=url.searchParams.get('box')==='sent';
 return send(res,200,db.prepare('SELECT m.id,m.sender_id,m.recipient_id,m.sender_name,m.body,m.created,m.read_at,m.reply_to,p.body AS reply_body,p.sender_name AS reply_sender,r.username AS recipient_name,CASE WHEN s.id IS NOT NULL AND s.banned=0 THEN 1 ELSE 0 END AS can_reply FROM messages m LEFT JOIN messages p ON p.id=m.reply_to LEFT JOIN users r ON r.id=m.recipient_id LEFT JOIN users s ON s.id=m.sender_id WHERE '+(sent?'m.sender_id':'m.recipient_id')+'=? ORDER BY m.id DESC').all(u.id));
 }
 if(path==='/api/messages/reply'&&method==='POST'){
  const u=auth(req),b=await body(req),parent=db.prepare('SELECT * FROM messages WHERE id=? AND recipient_id=?').get(Number(b.id),u.id);
  if(!parent)fail(404,'Message not found.');const recipient=db.prepare('SELECT id FROM users WHERE id=? AND banned=0').get(parent.sender_id);
  if(!recipient)fail(409,'This sender can no longer receive replies.');limited('messages:'+u.id,60,3600000);
  const content=str(b.body,1,3000);const id=Number(db.prepare('INSERT INTO messages(sender_id,recipient_id,sender_name,body,reply_to) VALUES(?,?,?,?,?)').run(u.id,recipient.id,u.username,content,parent.id).lastInsertRowid);
  db.prepare('UPDATE messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=?').run(parent.id);return send(res,200,{id});
 }
 if(path==='/api/messages/read'&&method==='POST'){const u=auth(req),b=await body(req);const r=db.prepare('UPDATE messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE id=? AND recipient_id=?').run(Number(b.id),u.id);if(!r.changes)fail(404,'Message not found.');return send(res,200,{ok:true});}
 if(path==='/api/admin/messages'&&method==='POST'){
  const u=auth(req,true),b=await body(req),recipient=Number(b.recipient_id);if(!Number.isSafeInteger(recipient)||!db.prepare('SELECT id FROM users WHERE id=?').get(recipient))fail(404,'Recipient not found.');
  limited('messages:'+u.id,60,3600000);db.prepare('INSERT INTO messages(sender_id,recipient_id,sender_name,body) VALUES(?,?,?,?)').run(u.id,recipient,u.username,str(b.body,1,3000));return send(res,200,{ok:true});
 }
 if(path==='/api/admin/posts'&&method==='GET'){auth(req,true);return send(res,200,db.prepare('SELECT p.*,t.lesson_id FROM posts p LEFT JOIN trick_lessons t ON t.post_id=p.id ORDER BY p.id DESC').all());}
 if(path==='/api/admin/posts'&&method==='POST') {auth(req,true);const b=await body(req);if(!['tricks','exercises','credits','announcements','solver','feedback'].includes(b.section))fail(400,'Choose a category.');const lessonId=b.lesson_id?Number(b.lesson_id):null;if(lessonId&&(!Number.isSafeInteger(lessonId)||b.section!=='tricks'||!db.prepare('SELECT id FROM lessons WHERE id=?').get(lessonId)))fail(400,'Choose an existing lesson for a math trick.');const vals=[str(b.section),str(b.title,1,120),str(b.body,1,10000),str(b.formula||'',0,180),str(b.tag||'',0,40),str(b.answer||'',0,200)];if(b.section==='exercises'&&!vals[5])fail(400,'Add an answer for this exercise.');let id=b.id;if(id){const result=db.prepare('UPDATE posts SET section=?,title=?,body=?,formula=?,tag=?,answer=? WHERE id=?').run(...vals,Number(id));if(!result.changes)fail(404,'Post not found.');}else{id=Number(db.prepare('INSERT INTO posts(section,title,body,formula,tag,answer) VALUES(?,?,?,?,?,?)').run(...vals).lastInsertRowid);}if(lessonId)db.prepare('INSERT INTO trick_lessons(post_id,lesson_id) VALUES(?,?) ON CONFLICT(post_id) DO UPDATE SET lesson_id=excluded.lesson_id').run(Number(id),lessonId);else db.prepare('DELETE FROM trick_lessons WHERE post_id=?').run(Number(id));notify();return send(res,200,{id});}
 if(/^\/api\/admin\/posts\/\d+$/.test(path)&&method==='DELETE'){auth(req,true);db.prepare('DELETE FROM posts WHERE id=?').run(Number(path.split('/').pop()));notify();return send(res,200,{ok:true});}
 if(path==='/api/admin/sections'&&method==='POST'){auth(req,true);const b=await body(req);const r=db.prepare('UPDATE sections SET title=?,description=? WHERE id=?').run(str(b.title,1,50),str(b.description,0,300),str(b.id,1,30));if(!r.changes)fail(404,'Section not found.');notify();return send(res,200,{ok:true});}
 if(path==='/api/feedback'&&method==='GET'){const u=auth(req);return send(res,200,u.role==='admin'?db.prepare('SELECT f.*,u.username FROM feedback f JOIN users u ON u.id=f.user_id ORDER BY f.id DESC').all():db.prepare('SELECT * FROM feedback WHERE user_id=? ORDER BY id DESC').all(u.id));}
 if(path==='/api/feedback'&&method==='POST'){const u=auth(req);limited('feedback:'+u.id,10,3600000);const b=await body(req);db.prepare('INSERT INTO feedback(user_id,body) VALUES(?,?)').run(u.id,str(b.body,3,3000));return send(res,200,{ok:true});}
 if(path==='/api/admin/feedback'&&method==='POST'){auth(req,true);const b=await body(req);if(!['New','Reviewed','Resolved'].includes(b.status))fail(400,'Choose a valid status.');db.prepare('UPDATE feedback SET status=?,reply=? WHERE id=?').run(b.status,str(b.reply||'',0,3000),Number(b.id));return send(res,200,{ok:true});}
 if(/^\/api\/admin\/feedback\/\d+$/.test(path)&&method==='DELETE'){auth(req,true);db.prepare('DELETE FROM feedback WHERE id=?').run(Number(path.split('/').pop()));return send(res,200,{ok:true});}
 if(path==='/api/check'&&method==='POST'){auth(req);const b=await body(req);const p=db.prepare("SELECT answer FROM posts WHERE id=? AND section='exercises'").get(Number(b.id));if(!p)fail(404,'Exercise not found.');const answer=str(b.answer,1,200);const norm=x=>x.trim().toLowerCase().replace(/\s+/g,'').replace(/−/g,'-');return send(res,200,{correct:norm(answer)===norm(p.answer),answer:p.answer});}
 if(path==='/api/solve'&&method==='POST') {const u=auth(req);if(!process.env.OPENAI_API_KEY)fail(503,'The AI solver is not connected yet. The site owner needs to add an API key on the server.');limited('ai:'+u.id,10,3600000);limited('ai:global',100,86400000);const b=await body(req);const question=str(b.question,3,3000);let upstream;try{upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-6-astra',instructions:'You are a patient math tutor. Only answer math questions. Explain useful solution steps and show a final answer. Use plain text and Unicode math, no Markdown or LaTeX. Check arithmetic. Say when a question is ambiguous.',input:question,max_output_tokens:2500,store:false}),signal:AbortSignal.timeout(60000)});}catch{fail(502,'The solver could not connect. Please try again.');}if(!upstream.ok)fail(502,'The AI provider could not complete this request. Please try again later.');const data=await upstream.json();const answer=(data.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('\n');if(!answer)fail(502,'No solution was returned. Try a shorter question.');return send(res,200,{answer});}
 const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/lessons-ui.js':['lessons-ui.js','text/javascript'],'/style.css':['style.css','text/css'],'/favicon.svg':['favicon.svg','image/svg+xml']};
 if(assets[path]&&['GET','HEAD'].includes(method)){const [file,type]=assets[path];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});return res.end(method==='HEAD'?undefined:readFileSync(join(root,'public',file)));}
 fail(404,'Not found.');
 }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error(e);}
});
setInterval(()=>{db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('DELETE FROM limits WHERE expires<?').run(Date.now());},3600000).unref();
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Math SM Lab ready: ${origin}`));
