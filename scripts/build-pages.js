// Explicit deployment allowlist: never publish tests, local evidence or backups.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const root=path.join(__dirname,'..'),out=path.join(root,'_site');
const files=['index.html','game.js','style.css','ink-theme.css','input-controls.js','input-controls.css','practice.js','battle-practice.css','online-battle.js','video-background.js','assets/attract-gameplay.mp4','assets/attract-gameplay.webm','assets/attract-gameplay-poster.webp','vendor/trystero-nostr-0.25.3.min.js','vendor/TRYSTERO-LICENSE.txt'];
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const hashes={};for(const file of files){const src=path.join(root,file),dest=path.join(out,file);if(!fs.statSync(src).isFile())throw Error('Not a regular file: '+file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');}
fs.writeFileSync(path.join(out,'.nojekyll'),'');
fs.writeFileSync(path.join(out,'release.json'),JSON.stringify({version:'7.0',commit:process.env.GITHUB_SHA||require('node:child_process').execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),hashes},null,2));
console.log('Packaged '+files.length+' allowlisted assets + release manifest + .nojekyll');
