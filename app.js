'use strict';
const $=id=>document.getElementById(id);
let items=[],queue=[],current=null,playing=false,rendering=false,cancelled=false,recorder=null,exportURL=null;
const urls=new Set();
function status(s){$('exportstatus').textContent=s}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// Lecture aléatoire : transitions légères, sans téléchargement ni transfert réseau.
const playbackTransitions=['fade','flash','slide-left','slide-right','zoom','spin'];
let playbackGeneration=0;
let playbackTimer=null;
function resetPlaybackTransition(){
 playbackGeneration++;
 if(playbackTimer!==null){clearTimeout(playbackTimer);playbackTimer=null}
 const player=$('player');player.classList.remove('mix-enter','mix-leave');
 player.style.removeProperty('--mix-enter-transform');
 const overlay=$('playback-transition');if(overlay){overlay.className='playback-transition';overlay.style.opacity='0'}
}
function cleanup(){resetPlaybackTransition();for(const u of urls)URL.revokeObjectURL(u);urls.clear();items=[];queue=[];current=null;playing=false;$('player').pause();$('player').removeAttribute('src');$('player').load();$('count').textContent='Aucune vidéo sélectionnée';$('list').replaceChildren();$('now').textContent='En attente de vidéos'}
$('files').addEventListener('change',e=>{const incoming=[...e.target.files].filter(f=>f.type.startsWith('video/')||/\.(mov|mp4|m4v)$/i.test(f.name));if(!incoming.length)return;for(const f of incoming){const url=URL.createObjectURL(f);urls.add(url);items.push({file:f,url})}$('count').textContent=`${items.length} vidéo(s) sélectionnée(s)`;$('list').replaceChildren(...items.map(x=>{const li=document.createElement('li');li.textContent=x.file.name;return li}));e.target.value='';});
$('clear').onclick=()=>{if(rendering)return;cleanup()};
function nextItem(){if(!queue.length){queue=shuffle(items);if(items.length>1&&queue[0]===current)[queue[0],queue[1]]=[queue[1],queue[0]]}return queue.shift()}
function showNext(item,kind,token){
 if(token!==playbackGeneration||!playing)return;
 const v=$('player'),overlay=$('playback-transition');
 current=item;v.pause();v.src=item.url;$('now').textContent='Lecture : '+item.file.name;
 const enter={fade:'scale(1)',flash:'scale(1)', 'slide-left':'translateX(100%)','slide-right':'translateX(-100%)',zoom:'scale(1.6)',spin:'rotate(28deg) scale(.65)'};
 v.style.setProperty('--mix-enter-transform',enter[kind]||'scale(1)');
 v.classList.remove('mix-leave','mix-enter');void v.offsetWidth;v.classList.add('mix-enter');
 if(overlay){overlay.className='playback-transition mix-'+kind;overlay.style.opacity='1';void overlay.offsetWidth;overlay.style.opacity='0'}
 v.play().catch(()=>{$('now').textContent+=' — touche Lecture sur la vidéo pour démarrer.'});
 playbackTimer=setTimeout(()=>{if(token===playbackGeneration){v.classList.remove('mix-enter');if(overlay)overlay.className='playback-transition';playbackTimer=null}},1050);
}
function next(){
 if(!items.length){$('now').textContent='Importe d’abord des vidéos.';return}
 const v=$('player');resetPlaybackTransition();const token=playbackGeneration;
 const item=nextItem();const kind=playbackTransitions[Math.floor(Math.random()*playbackTransitions.length)];
 if(!playing||!v.currentSrc||v.ended||v.readyState<2){showNext(item,kind,token);return}
 v.classList.add('mix-leave');
 const overlay=$('playback-transition');if(overlay){overlay.className='playback-transition mix-'+kind;overlay.style.opacity='1'}
 playbackTimer=setTimeout(()=>{playbackTimer=null;showNext(item,kind,token)},330);
}
$('play').onclick=()=>{playing=true;if(!$('player').src)next();else $('player').play().catch(()=>next())};
$('next').onclick=()=>{playing=true;next()};
$('stop').onclick=()=>{playing=false;resetPlaybackTransition();$('player').pause()};
$('player').addEventListener('ended',()=>{if(playing)next()});
$('player').addEventListener('error',()=>{if(playing){playing=false;resetPlaybackTransition();$('now').textContent='Impossible de lire ce fichier. Appuie sur Suivante.'}});
$('duration').onchange=()=>$('customwrap').hidden=$('duration').value!=='custom';
function metadata(item){return new Promise((resolve,reject)=>{const v=document.createElement('video');v.preload='metadata';v.playsInline=true;const t=setTimeout(()=>finish(new Error('Métadonnées indisponibles')),12000);function finish(err){clearTimeout(t);v.removeAttribute('src');v.load();err?reject(err):resolve(d)}let d;v.onloadedmetadata=()=>{d={...item,duration:v.duration,width:v.videoWidth,height:v.videoHeight};if(!Number.isFinite(d.duration)||d.duration<=0)finish(new Error('Durée vidéo inconnue'));else finish()};v.onerror=()=>finish(new Error('Format non lisible'));v.src=item.url})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function seek(v,t){return new Promise((resolve,reject)=>{if(Math.abs(v.currentTime-t)<.04){resolve();return}const timer=setTimeout(()=>{v.removeEventListener('seeked',done);reject(new Error('Recherche vidéo trop lente'))},9000);function done(){clearTimeout(timer);resolve()}v.addEventListener('seeked',done,{once:true});v.currentTime=t})}
// Effets 2D sans bibliothèque externe. Tous les pixels restent sur l'appareil.
function cover(ctx,v,x,y,w,h,scale=1){if(!v||v.readyState<2||!v.videoWidth)return false;const r=Math.max(w/v.videoWidth,h/v.videoHeight)*scale;const dw=v.videoWidth*r,dh=v.videoHeight*r;ctx.drawImage(v,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return true}
function contain(ctx,v,x,y,w,h){if(!v||v.readyState<2||!v.videoWidth)return false;const r=Math.min(w/v.videoWidth,h/v.videoHeight);const dw=v.videoWidth*r,dh=v.videoHeight*r;ctx.drawImage(v,x+(w-dw)/2,y+(h-dh)/2,dw,dh);return true}
const effects=['normal','zoom','mirror','rotate','tint','inset','mosaic','split','stripes'];
function chooseEffect(){return effects[Math.floor(Math.random()*effects.length)]}
function drawEffect(ctx,v,other,w,h,effect,t,length){
 ctx.save();ctx.fillStyle='#05070e';ctx.fillRect(0,0,w,h);
 const phase=Math.min(1,t/Math.max(.01,length));
 try{
  if(effect==='mosaic'||effect==='split'){
   const second=other&&other.readyState>=2?other:v;
   if(effect==='split'){ctx.save();ctx.beginPath();ctx.rect(0,0,w/2,h);ctx.clip();cover(ctx,v,0,0,w/2,h);ctx.restore();ctx.save();ctx.beginPath();ctx.rect(w/2,0,w/2,h);ctx.clip();cover(ctx,second,w/2,0,w/2,h);ctx.restore()}
   else{const slots=[[0,0,w/2,h/2],[w/2,0,w/2,h/2],[0,h/2,w/2,h/2],[w/2,h/2,w/2,h/2]];slots.forEach(([x,y,a,b],i)=>{ctx.save();ctx.beginPath();ctx.rect(x,y,a,b);ctx.clip();cover(ctx,i%2?second:v,x,y,a,b);ctx.restore()})}
  }else if(effect==='inset'){
   cover(ctx,v,0,0,w,h);ctx.fillStyle='rgba(0,0,0,.42)';ctx.fillRect(0,0,w,h);const x=w*(.08+.50*(.5+.5*Math.sin(t*1.7))),y=h*(.12+.43*(.5+.5*Math.cos(t*1.3))),a=w*.38,b=h*.32;ctx.fillStyle='#fff';ctx.fillRect(x-5,y-5,a+10,b+10);ctx.save();ctx.beginPath();ctx.rect(x,y,a,b);ctx.clip();cover(ctx,other&&other.readyState>=2?other:v,x,y,a,b);ctx.restore();
  }else if(effect==='stripes'){
   cover(ctx,v,0,0,w,h);ctx.save();ctx.globalAlpha=.48;for(let i=0;i<7;i++){const y=((i/7+phase*.4)%1)*h;ctx.fillStyle=i%2?'#10d9ff':'#ff2aab';ctx.fillRect(0,y,w,h*.016)}ctx.restore();
  }else{
   ctx.save();if(effect==='mirror'){ctx.translate(w,0);ctx.scale(-1,1)}
   if(effect==='rotate'){ctx.translate(w/2,h/2);ctx.rotate(Math.sin(t*2)*.15);ctx.translate(-w/2,-h/2)}
   if(effect==='tint')ctx.filter='saturate(1.8) contrast(1.2) hue-rotate('+Math.round(t*75)+'deg)';
   ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();cover(ctx,v,0,0,w,h,effect==='zoom'?1+.16*phase:1.08);ctx.restore();
  }
 }catch(err){console.warn('Effet ignoré',err);ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);contain(ctx,v,0,0,w,h)}
 ctx.restore();
}
function drawTransition(ctx,w,h,elapsed,transition){
 const t=Math.max(0,Math.min(1,elapsed/.35));if(t>=1)return;
 ctx.save();if(transition==='flash'){ctx.fillStyle='rgba(255,255,255,'+(1-t)*.85+')';ctx.fillRect(0,0,w,h)}
 else if(transition==='wipe'){ctx.fillStyle='rgba(0,0,0,'+(.7*(1-t))+')';ctx.fillRect(w*t,0,w*(1-t),h)}
 else{ctx.fillStyle='rgba(0,0,0,'+(.8*(1-t))+')';ctx.fillRect(0,0,w,h)}ctx.restore()
}
async function openSecondary(item){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';try{await openClip(v,item);await seek(v,Math.random()*Math.max(0,item.duration-2));await Promise.race([v.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Secondaire lente')),3000))]);return v}catch(_){disposeClip(v);return null}}
function getMime(){if(!window.MediaRecorder)return null;return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp8','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||null}
// iOS peut fournir les métadonnées sans jamais émettre loadeddata.
function openClip(v,item){return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>done(new Error('Chargement trop long')),10000);function done(err){if(settled)return;settled=true;clearTimeout(timer);v.removeEventListener('loadeddata',ready);v.removeEventListener('canplay',ready);v.removeEventListener('error',bad);err?reject(err):resolve()}function ready(){done()}function bad(){done(new Error('Décodage impossible'))}v.addEventListener('loadeddata',ready);v.addEventListener('canplay',ready);v.addEventListener('error',bad);v.src=item.url;v.load();if(v.readyState>=2)done()})}
function disposeClip(v){if(!v)return;v.pause();v.removeAttribute('src');v.load()}
$('cancel').onclick=()=>{cancelled=true;status('Annulation en cours…')};
$('make').onclick=async()=>{if(rendering)return;if(!items.length){status('Sélectionne d’abord tes vidéos.');return}const target=$('duration').value==='custom'?Number($('custom').value):Number($('duration').value);if(!Number.isFinite(target)||target<5||target>600){status('Choisis une durée entre 5 et 600 secondes.');return}const mime=getMime();if(!mime){status('Export non pris en charge par cette version de Safari. La lecture aléatoire reste disponible.');return}if(!$('canvas').captureStream){status('Capture vidéo non disponible sur ce navigateur.');return}rendering=true;cancelled=false;$('make').disabled=true;$('cancel').disabled=false;$('progress').value=0;$('download').style.display='none';$('preview').style.display='none';if(exportURL){URL.revokeObjectURL(exportURL);exportURL=null}let stream,live=null,secondary=null;try{status('Analyse des fichiers…');const good=[];for(const item of items){try{good.push(await metadata(item))}catch(e){console.warn(item.file.name,e)}}if(!good.length)throw new Error('Aucune vidéo compatible avec Safari. Essaie des MP4/H.264.');const canvas=$('canvas'),ctx=canvas.getContext('2d');stream=canvas.captureStream(24);const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2500000});const finished=new Promise((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onerror=()=>reject(new Error('Échec de l’enregistrement'));recorder.onstop=()=>resolve()});recorder.start(1000);let elapsed=0;let bag=[];const mode=$('style').value;status('Montage spectaculaire en cours… garde Safari ouvert.');let failed=new Set(),consecutiveFailures=0;
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
  const effect=chooseEffect();const transition=['fade','flash','wipe'][Math.floor(Math.random()*3)];
  // Une deuxième source est facultative : si son décodage échoue, le montage continue.
  if(['mosaic','split','inset'].includes(effect)&&good.length>1){const candidates=good.filter(x=>x.url!==item.url&&!failed.has(x.url));if(candidates.length)secondary=await openSecondary(candidates[Math.floor(Math.random()*candidates.length)])}
  await Promise.race([live.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Démarrage trop long')),8000))]);
  const startTime=performance.now();let frames=0;
  while(!cancelled){const t=(performance.now()-startTime)/1000;if(t>=length||live.ended)break;
   if(live.readyState>=2){drawEffect(ctx,live,secondary,canvas.width,canvas.height,effect,t,length);drawTransition(ctx,canvas.width,canvas.height,t,transition);frames++}
   $('progress').value=Math.min(100,(elapsed+t)/target*100);await sleep(33)}
  if(!cancelled&&frames===0)throw new Error('Aucune image décodée');
  elapsed+=Math.min(length,(performance.now()-startTime)/1000);
  consecutiveFailures=0;
 }catch(err){
  failed.add(item.url);consecutiveFailures++;
  console.warn('Extrait ignoré',item.file.name,err);
  status('Vidéo ignorée : '+item.file.name+' ('+err.message+'). Essai avec une autre…');
  if(consecutiveFailures>=good.length)throw new Error('Toutes les vidéos testées ont échoué à l’export. Essaie un MP4/H.264 court.');
 }finally{disposeClip(live);live=null;disposeClip(secondary);secondary=null}
}
if(recorder.state!=='inactive')recorder.stop();await finished;if(cancelled){status('Montage annulé.');return}if(!chunks.length)throw new Error('Aucune donnée enregistrée');const blob=new Blob(chunks,{type:mime});exportURL=URL.createObjectURL(blob);const ext=mime.includes('mp4')?'mp4':'webm';$('download').href=exportURL;$('download').download='mon-mix-'+Date.now()+'.'+ext;$('download').textContent='⬇ Enregistrer le montage ('+ext.toUpperCase()+')';$('download').style.display='inline-block';$('preview').src=exportURL;$('preview').style.display='block';$('progress').value=100;status('Montage terminé. Utilise Enregistrer le montage. Sur iPhone, tu peux ensuite choisir Enregistrer dans Fichiers.');}catch(e){status('Export interrompu : '+e.message+'\nEssaie des MP4 plus courts, ou un montage de 30 secondes.');if(recorder&&recorder.state!=='inactive')try{recorder.stop()}catch(_){}}finally{if(live){disposeClip(live)}if(secondary){disposeClip(secondary)}if(stream)stream.getTracks().forEach(t=>t.stop());recorder=null;rendering=false;$('make').disabled=false;$('cancel').disabled=true}};
if('serviceWorker'in navigator&&location.protocol==='https:'){navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>reg.update().catch(()=>{})).catch(()=>{});}
