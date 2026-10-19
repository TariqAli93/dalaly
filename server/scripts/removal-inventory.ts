import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pool} from '../src/infrastructure/database/pool.js';
import {config} from '../src/infrastructure/config.js';
const output=path.resolve('data/removal-review');
await fs.mkdir(output,{recursive:true});
const names=['contract_templates','contracts','contract_parties','party_snapshots','contract_office_snapshots','contract_asset_snapshots','contract_attachments','contract_legal_snapshots','contract_procedures','contract_procedure_attachments','legal_reviewers','legal_formulations','legal_contract_templates','legal_contract_clauses','legal_content_events','legal_task_notifications'];
const identifier=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const hash=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
async function files(root:string){
 const rows:Array<{path:string,bytes:number,sha256:string}>=[];
 async function walk(dir:string){for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(()=>[])){
  if(entry.isSymbolicLink())throw new Error('Symlink requires review: '+path.join(dir,entry.name));
  const absolute=path.join(dir,entry.name);if(entry.isDirectory())await walk(absolute);else{const bytes=await fs.readFile(absolute);rows.push({path:path.relative(root,absolute).replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});}
 }}await walk(root);return rows;
}
try{
 await pool.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const tables=(await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
 const inventory=[];
 for(const {tablename}of tables){const rows=(await pool.query(`SELECT to_jsonb(t) AS row FROM public.${identifier(tablename)} t ORDER BY to_jsonb(t)::text`)).rows;inventory.push({name:tablename,rows:rows.length,sha256:hash(JSON.stringify(rows)),exclusive:tablename.startsWith('studio_')||names.includes(tablename)});}
 const foreignKeys=(await pool.query("SELECT c.conname,cl.relname AS source,ref.relname AS target,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE c.contype='f' AND n.nspname='public' ORDER BY cl.relname,c.conname")).rows;
 const triggers=(await pool.query("SELECT t.tgname,c.relname AS table_name,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.tgname")).rows;
 const functions=(await pool.query("SELECT p.proname,pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND (p.proname LIKE 'studio_%' OR p.proname LIKE '%contract%' OR p.proname LIKE '%party_snapshot%') ORDER BY p.proname")).rows;
 const indexes=(await pool.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 const permissions=(await pool.query("SELECT id,key,name,module FROM permissions WHERE key LIKE 'contracts.%' OR key LIKE 'contract_templates.%' OR key LIKE 'legal_content.%' OR key LIKE 'studio.%' ORDER BY key")).rows;
 const settings=(await pool.query("SELECT key FROM app_settings WHERE key LIKE 'studio.%' OR key LIKE 'contract%' OR key LIKE 'legal_content.%' ORDER BY key")).rows;
 const database=(await pool.query('SELECT current_database() AS name')).rows[0].name;
 const journal=(await pool.query("SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at")).rows;
 await pool.query('COMMIT');
 const manifest={created_at:new Date().toISOString(),database,source_read_only:true,tables:inventory,foreignKeys,triggers,functions,indexes,permissions,settings,journal,documentsRoot:path.resolve(config.documentsDir),documents:await files(config.documentsDir),imagesRoot:path.resolve(config.imagesDir),images:await files(config.imagesDir)};
 await fs.writeFile(path.join(output,'source-inventory.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify({output:path.join(output,'source-inventory.json'),database,candidates:inventory.filter(t=>t.exclusive),incoming_shared_foreign_keys:foreignKeys.filter(f=>!inventory.find(t=>t.name===f.source)?.exclusive&&inventory.find(t=>t.name===f.target)?.exclusive),functions,permissions:permissions.map(p=>p.key),documents:manifest.documents.length,images:manifest.images.length}));
}finally{await pool.end();}
