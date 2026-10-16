'use strict';
const $=id=>document.getElementById(id);
let items=[],queue=[],current=null,playing=false,rendering=false,cancelled=false,recorder=null,exportURL=null;
const urls=new Set();
function status(s){$('exportstatus').textContent=s}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function cleanup(){for(const u of urls)URL.revokeObjectURL(u);urls.clear();items=[];queue=[];current=null;playing=false;$('player').pause();$('player').removeAttribute('src');$('player').load();$('count').textContent='Aucune vidéo sélectionnée';$('list').replaceChildren();$('now').textContent='En attente de vidéos'}
$('files').addEventListener('change',e=>{const incoming=[...e.target.files].filter(f=>f.type.startsWith('video/')||/\.(mov|mp4|m4v)$/i.test(f.name));if(!incoming.length)return;for(const f of incoming){const url=URL.createObjectURL(f);urls.add(url);items.push({file:f,url})}$('count').textContent=`${items.length} vidéo(s) sélectionnée(s)`;$('list').replaceChildren(...items.map(x=>{const li=document.createElement('li');li.textContent=x.file.name;return li}));e.target.value='';});
$('clear').onclick=()=>{if(rendering)return;cleanup()};
function next(){if(!items.length){$('now').textContent='Importe d’abord des vidéos.';return}if(!queue.length){queue=shuffle(items);if(items.length>1&&queue[0]===current)[queue[0],queue[1]]=[queue[1],queue[0]]}current=queue.shift();$('player').src=current.url;$('now').textContent='Lecture : '+current.file.name;if(playing)$('player').play().catch(()=>{$('now').textContent+=' — touche Lecture sur la vidéo pour démarrer.'})}
$('play').onclick=()=>{playing=true;if(!$('player').src)next();else $('player').play().catch(()=>next())};$('next').onclick=()=>{playing=true;next()};$('stop').onclick=()=>{playing=false;$('player').pause()};$('player').addEventListener('ended',()=>{if(playing)next()});$('player').addEventListener('error',()=>{if(playing){playing=false;$('now').textContent='Impossible de lire ce fichier. Appuie sur Suivante.'}});
$('duration').onchange=()=>$('customwrap').hidden=$('duration').value!=='custom';
function metadata(item){return new Promise((resolve,reject)=>{const v=document.createElement('video');v.preload='metadata';v.playsInline=true;const t=setTimeout(()=>finish(new Error('Métadonnées indisponibles')),12000);function finish(err){clearTimeout(t);v.removeAttribute('src');v.load();err?reject(err):resolve(d)}let d;v.onloadedmetadata=()=>{d={...item,duration:v.duration,width:v.videoWidth,height:v.videoHeight};if(!Number.isFinite(d.duration)||d.duration<=0)finish(new Error('Durée vidéo inconnue'));else finish()};v.onerror=()=>finish(new Error('Format non lisible'));v.src=item.url})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function seek(v,t){return new Promise((resolve,reject)=>{if(Math.abs(v.currentTime-t)<.04){resolve();return}const timer=setTimeout(()=>{v.removeEventListener('seeked',done);reject(new Error('Recherche vidéo trop lente'))},9000);function done(){clearTimeout(timer);resolve()}v.addEventListener('seeked',done,{once:true});v.currentTime=t})}
function draw(ctx,v,w,h){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);if(!v.videoWidth)return;const ratio=Math.min(w/v.videoWidth,h/v.videoHeight);const dw=v.videoWidth*ratio,dh=v.videoHeight*ratio;ctx.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh)}
function getMime(){if(!window.MediaRecorder)return null;return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||null}
// iOS peut fournir les métadonnées sans jamais émettre loadeddata.
function openClip(v,item){return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>done(new Error('Chargement trop long')),10000);function done(err){if(settled)return;settled=true;clearTimeout(timer);v.removeEventListener('loadeddata',ready);v.removeEventListener('canplay',ready);v.removeEventListener('error',bad);err?reject(err):resolve()}function ready(){done()}function bad(){done(new Error('Décodage impossible'))}v.addEventListener('loadeddata',ready);v.addEventListener('canplay',ready);v.addEventListener('error',bad);v.src=item.url;v.load();if(v.readyState>=2)done()})}
function disposeClip(v){if(!v)return;v.pause();v.removeAttribute('src');v.load()}
$('cancel').onclick=()=>{cancelled=true;status('Annulation en cours…')};
$('make').onclick=async()=>{if(rendering)return;if(!items.length){status('Sélectionne d’abord tes vidéos.');return}const target=$('duration').value==='custom'?Number($('custom').value):Number($('duration').value);if(!Number.isFinite(target)||target<5||target>600){status('Choisis une durée entre 5 et 600 secondes.');return}const mime=getMime();if(!mime){status('Export non pris en charge par cette version de Safari. La lecture aléatoire reste disponible.');return}if(!$('canvas').captureStream){status('Capture vidéo non disponible sur ce navigateur.');return}rendering=true;cancelled=false;$('make').disabled=true;$('cancel').disabled=false;$('progress').value=0;$('download').style.display='none';$('preview').style.display='none';if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null}let stream,live=null;try{status('Analyse des fichiers…');const good=[];for(const item of items){try{good.push(await metadata(item))}catch(e){console.warn(item.file.name,e)}}if(!good.length)throw new Error('Aucune vidéo compatible avec Safari. Essaie des MP4/H.264.');const canvas=$('canvas'),ctx=canvas.getContext('2d');stream=canvas.captureStream(30);const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=()=>reject(new Error('Échec de l’enregistrement'));recorder.onstop=()=>resolve()});recorder.start(1000);let elapsed=0;let bag=[];const mode=$('style').value;status('Montage en cours… garde Safari ouvert.');let failed=new Set(),consecutiveFailures=0;
while(elapsed<target&&!cancelled){
 if(!bag.length)bag=shuffle(good.filter(x=>!failed.has(x.url)));
 if(!bag.length)throw new Error('Aucun extrait exportable. Les fichiers MOV/HEVC peuvent être lisibles mais non exportables dans Safari.');
 const item=bag.shift();
 try{
  live=document.createElement('video');live.muted=true;live.playsInline=true;live.preload='auto';
  await openClip(live,item);
  const remaining=target-elapsed;
  const length=Math.min(remaining,mode==='cuts'?1+Math.random()*2:item.duration,item.duration);
  const start=mode==='cuts'?Math.random()*Math.max(0,item.duration-length):0;
  await seek(live,start);
  await Promise.race([live.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Démarrage trop long')),8000))]);
  const startTime=performance.now();let frames=0;
  while(!cancelled){const t=(performance.now()-startTime)/1000;if(t>=length||live.ended)break;
   if(live.readyState>=2){draw(ctx,live,canvas.width,canvas.height);frames++}
   $('progress').value=Math.min(100,(elapsed+t)/target*100);await sleep(33)}
  if(!cancelled&&frames===0)throw new Error('Aucune image décodée');
  elapsed+=Math.min(length,(performance.now()-startTime)/1000);
  consecutiveFailures=0;
 }catch(err){
  failed.add(item.url);consecutiveFailures++;
  console.warn('Extrait ignoré',item.file.name,err);
  status('Vidéo ignorée : '+item.file.name+' ('+err.message+'). Essai avec une autre…');
  if(consecutiveFailures>=good.length)throw new Error('Toutes les vidéos testées ont échoué à l’export. Essaie un MP4/H.264 court.');
 }finally{disposeClip(live);live=null}
}
if(recorder.state!=='inactive')recorder.stop();await finished;if(cancelled){status('Montage annulé.');return}if(!chunks.length)throw new Error('Aucune donnée enregistrée');const blob=new Blob(chunks,{type:mime});exportURL=URL.createObjectURL(blob);const ext=mime.includes('mp4')?'mp4':'webm';$('download').href=exportURL;$('download').download='mon-mix-'+Date.now()+'.'+ext;$('download').textContent='⬇ Enregistrer le montage ('+ext.toUpperCase()+')';$('download').style.display='inline-block';$('preview').src=exportURL;$('preview').style.display='block';$('progress').value=100;status('Montage terminé. Utilise Enregistrer le montage. Sur iPhone, tu peux ensuite choisir Enregistrer dans Fichiers.');}catch(e){status('Export interrompu : '+e.message+'\nEssaie des MP4 plus courts, ou un montage de 30 secondes.');if(recorder&&recorder.state!=='inactive')try{recorder.stop()}catch(_){}}finally{if(live){live.pause();live.removeAttribute('src');live.load()}if(stream)stream.getTracks().forEach(t=>t.stop());recorder=null;rendering=false;$('make').disabled=false;$('cancel').disabled=true}};
if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
