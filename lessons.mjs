import {randomBytes} from 'node:crypto';

export function setupLessons(db){
 db.exec(`CREATE TABLE IF NOT EXISTS lesson_categories(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE COLLATE NOCASE,description TEXT NOT NULL DEFAULT '');
 CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY,category_id INTEGER NOT NULL REFERENCES lesson_categories(id),title TEXT NOT NULL,paragraph TEXT NOT NULL,examples TEXT NOT NULL DEFAULT '',image BLOB,image_mime TEXT,image_alt TEXT NOT NULL DEFAULT '',image_version TEXT NOT NULL DEFAULT '',created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS trick_lessons(post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,lesson_id INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE);`);
 db.prepare('INSERT OR IGNORE INTO sections(id,title,description) VALUES(?,?,?)').run('lessons','Lessons','Understand the idea, explore an example, and put it into practice.');
}
export function lessonList(db){return db.prepare("SELECT id,category_id,title,paragraph,examples,image_alt,created,CASE WHEN image IS NOT NULL THEN '/api/lesson-images/' || id || '?v=' || image_version ELSE NULL END AS image_url FROM lessons ORDER BY id DESC").all();}
function decodeImage(image,fail){
 if(typeof image!=='string'||image.length>2800000)fail(400,'Choose a PNG, JPEG, or WebP image smaller than 2 MB.');
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
 if(!match)fail(400,'Only PNG, JPEG, or WebP pictures are supported.');
 const bytes=Buffer.from(match[2],'base64'),mime=match[1];
 if(bytes.length>2*1024*1024||bytes.length<12)fail(400,'The picture must be smaller than 2 MB.');
 const valid=mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!valid)fail(400,'The file is not a supported picture.');
 return {bytes,mime};
}
export async function handleLessons({path,method,req,res,db,auth,body,str,fail,send,notify}){
 if(path==='/api/lessons'&&method==='GET'){send(res,200,{categories:db.prepare('SELECT * FROM lesson_categories ORDER BY name COLLATE NOCASE').all(),lessons:lessonList(db)});return true;}
 if(/^\/api\/lesson-images\/\d+$/.test(path)&&method==='GET'){
  const row=db.prepare('SELECT image,image_mime FROM lessons WHERE id=?').get(Number(path.split('/').pop()));if(!row?.image)fail(404,'Picture not found.');res.writeHead(200,{'Content-Type':row.image_mime});res.end(Buffer.from(row.image));return true;
 }
 if(path==='/api/admin/lesson-categories'&&method==='POST'){
  auth(req,true);const b=await body(req),name=str(b.name,1,80),description=str(b.description||'',0,300);let id=b.id?Number(b.id):null;
  if(id&&!db.prepare('SELECT id FROM lesson_categories WHERE id=?').get(id))fail(404,'Category not found.');
  if(db.prepare('SELECT id FROM lesson_categories WHERE name=? AND id<>?').get(name,id||0))fail(409,'A category with this name already exists.');
  if(id)db.prepare('UPDATE lesson_categories SET name=?,description=? WHERE id=?').run(name,description,id);else id=Number(db.prepare('INSERT INTO lesson_categories(name,description) VALUES(?,?)').run(name,description).lastInsertRowid);
  notify();send(res,200,{id});return true;
 }
 if(/^\/api\/admin\/lesson-categories\/\d+$/.test(path)&&method==='DELETE'){
  auth(req,true);const id=Number(path.split('/').pop());if(db.prepare('SELECT id FROM lessons WHERE category_id=?').get(id))fail(409,'Move or remove the lessons in this category before deleting it.');
  db.prepare('DELETE FROM lesson_categories WHERE id=?').run(id);notify();send(res,200,{ok:true});return true;
 }
 if(path==='/api/admin/lessons'&&method==='POST'){
  auth(req,true);const b=await body(req,3000000),category=Number(b.category_id);if(!Number.isSafeInteger(category)||!db.prepare('SELECT id FROM lesson_categories WHERE id=?').get(category))fail(400,'Choose an existing lesson category.');
  const title=str(b.title,1,120),paragraph=str(b.paragraph,1,20000),examples=str(b.examples||'',0,20000),alt=str(b.image_alt||'',0,300);let id=b.id?Number(b.id):null;
  const existing=id?db.prepare('SELECT id,image FROM lessons WHERE id=?').get(id):null;if(id&&!existing)fail(404,'Lesson not found.');
  const picture=b.image?decodeImage(b.image,fail):null;if((picture||(existing?.image&&!b.remove_image))&&!alt)fail(400,'Add a short description of the picture.');
  db.exec('BEGIN IMMEDIATE');try{
   if(id)db.prepare('UPDATE lessons SET category_id=?,title=?,paragraph=?,examples=?,image_alt=? WHERE id=?').run(category,title,paragraph,examples,alt,id);
   else id=Number(db.prepare('INSERT INTO lessons(category_id,title,paragraph,examples,image_alt) VALUES(?,?,?,?,?)').run(category,title,paragraph,examples,alt).lastInsertRowid);
   if(picture)db.prepare('UPDATE lessons SET image=?,image_mime=?,image_version=? WHERE id=?').run(picture.bytes,picture.mime,randomBytes(8).toString('hex'),id);
   else if(b.remove_image)db.prepare("UPDATE lessons SET image=NULL,image_mime=NULL,image_alt='',image_version='' WHERE id=?").run(id);
   db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
  notify();send(res,200,{id});return true;
 }
 if(/^\/api\/admin\/lessons\/\d+$/.test(path)&&method==='DELETE'){auth(req,true);db.prepare('DELETE FROM lessons WHERE id=?').run(Number(path.split('/').pop()));notify();send(res,200,{ok:true});return true;}
 return false;
}
