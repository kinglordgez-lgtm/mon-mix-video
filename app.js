'use strict';
const $=id=>document.getElementById(id);
// Lecture sans contrôles natifs ni son, y compris après échange des lecteurs.
function configurePlayback(v){v.controls=false;v.muted=true;v.defaultMuted=true;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.disablePictureInPicture=true;}
// V1.3.0 : vitesse locale appliquée aux deux lecteurs et aux transitions.
let playbackSpeed=1;
function applyPlaybackSpeed(v){v.defaultPlaybackRate=playbackSpeed;v.playbackRate=playbackSpeed;}
function updatePlaybackSpeed(){
 playbackSpeed=Number($('speed').value);
 if(![1,.75,.5,.25].includes(playbackSpeed))playbackSpeed=1;
 $('speed-label').textContent=playbackSpeed===1?'Normale (1×)':playbackSpeed.toLocaleString('fr-FR')+'×';
 applyPlaybackSpeed(activeVideo());applyPlaybackSpeed(standbyVideo());
}
$('speed').addEventListener('change',updatePlaybackSpeed);


// V1.2.8 : cadrage par fichier, sans stockage des vidéos ni envoi réseau.
// Le cadrage par défaut sert aux fichiers ajoutés ensuite.
let cropZoom=1,cropVertical=.5;
let cropDefaults={zoom:1,vertical:.5};
let cropEditing=null;
const clipOwners=new WeakMap();
function settings(item){return item?.crop||cropDefaults}
function applyCropToVideo(v,item){
 const s=settings(item),z=s.zoom,p=s.vertical;
 // Dimensions physiques (et non CSS scale) pour préserver le cadrage en mode Cinéma iOS.
 v.style.setProperty('--crop-zoom',String(z));
 v.style.setProperty('--crop-position',String(p*100)+'%');
 v.style.setProperty('--crop-left',((1-z)*50)+'%');v.style.setProperty('--crop-top',((1-z)*p*100)+'%');
 v.style.setProperty('--crop-width',(z*100)+'%');v.style.setProperty('--crop-height',(z*100)+'%');
}
function syncPlaybackCrops(){
 for(const v of [activeVideo(),standbyVideo()])applyCropToVideo(v,clipOwners.get(v));
}
function showCropEditor(){
 const item=items.find(x=>x.id===cropEditing);
 const s=settings(item);
 $('cropzoom').value=Math.round(s.zoom*100/5)*5;
 $('cropvertical').value=Math.round(s.vertical*100/5)*5;
 $('cropzoom-label').textContent=s.zoom.toFixed(2).replace('.',',')+'×';
 $('cropvertical-label').textContent=Math.round(s.vertical*100)+' %';
 $('crop-info').textContent=item?(item.format||'Format en cours de lecture')+' — '+item.file.name:'Ces valeurs seront utilisées pour les prochaines vidéos importées.';
}
function updateCrop(){
 const item=items.find(x=>x.id===cropEditing);
 const s=item?item.crop:cropDefaults;
 s.zoom=Number($('cropzoom').value)/100;
 s.vertical=Number($('cropvertical').value)/100;
 cropZoom=s.zoom;cropVertical=s.vertical;
 showCropEditor();syncPlaybackCrops();
}
$('crop-target').addEventListener('change',()=>{cropEditing=$('crop-target').value||null;showCropEditor()});
$('cropzoom').addEventListener('input',updateCrop);
$('cropvertical').addEventListener('input',updateCrop);
let nextClipId=0;
function refreshCropList(){
 const select=$('crop-target'),keep=cropEditing;
 select.replaceChildren(new Option('Réglages par défaut (nouvelles vidéos)',''),...items.map(x=>new Option(x.file.name,x.id)));
 if(keep&&items.some(x=>x.id===keep))select.value=keep;
 else{cropEditing=items[0]?.id||null;select.value=cropEditing||''}
 showCropEditor();
}
let items=[],queue=[],current=null,playing=false,rendering=false,cancelled=false,recorder=null,exportURL=null;
const urls=new Set();
function status(s){$('exportstatus').textContent=s}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// V1.2.4 : deux vrais lecteurs superposés. Aucun transfert réseau des vidéos.
let transitionToken=0, transitionBusy=false, transitionTimeout=null;
const transitions=['fade','slide','zoom','rotate','wipe'];
function activeVideo(){return $('player')}
function standbyVideo(){return $('player-next')}
function resetPlaybackTransition(){
 transitionToken++;transitionBusy=false;
 if(transitionTimeout){clearTimeout(transitionTimeout);transitionTimeout=null}
 const a=activeVideo(),b=standbyVideo();configurePlayback(a);configurePlayback(b);
 for(const v of [a,b]){applyPlaybackSpeed(v);v.classList.remove('mix-in','mix-out');v.style.removeProperty('--mix-start');v.style.removeProperty('clip-path');v.style.removeProperty('transition');v.style.removeProperty('transform');v.style.removeProperty('opacity')}
 clipOwners.delete(b);b.pause();b.removeAttribute('src');b.load();b.style.opacity='0';b.style.pointerEvents='none';
 a.style.opacity='1';a.style.pointerEvents='auto';
}
function cleanup(){resetPlaybackTransition();for(const u of urls)URL.revokeObjectURL(u);urls.clear();items=[];queue=[];current=null;playing=false;cropEditing=null;refreshCropList();const v=activeVideo();v.pause();v.removeAttribute('src');v.load();$('count').textContent='Aucune vidéo sélectionnée';$('list').replaceChildren();$('now').textContent='En attente de vidéos'}
$('files').addEventListener('change',e=>{const incoming=[...e.target.files].filter(f=>f.type.startsWith('video/')||/\.(mov|mp4|m4v)$/i.test(f.name));if(!incoming.length)return;for(const f of incoming){const url=URL.createObjectURL(f);urls.add(url);items.push({id:String(++nextClipId),file:f,url,crop:{...cropDefaults},format:"Format en attente"})}$('count').textContent=`${items.length} vidéo(s) sélectionnée(s)`;$('list').replaceChildren(...items.map(x=>{const li=document.createElement('li');li.textContent=x.file.name;return li}));refreshCropList();e.target.value='';});
$('clear').onclick=()=>{if(rendering)return;playing=false;cleanup()};
function nextItem(){if(!queue.length){queue=shuffle(items);if(items.length>1&&queue[0]===current)[queue[0],queue[1]]=[queue[1],queue[0]]}return queue.shift()}
function commitSwap(oldV,newV,item,token){
 if(token!==transitionToken)return;
 oldV.pause();oldV.removeAttribute('src');oldV.load();
 oldV.id='player-next';newV.id='player';
 oldV.className='mix-video standby';newV.className='mix-video';
 oldV.style.cssText='opacity:0;pointer-events:none';newV.style.cssText='opacity:1;pointer-events:auto';
 configurePlayback(newV);configurePlayback(oldV);applyPlaybackSpeed(newV);applyPlaybackSpeed(oldV);clipOwners.set(newV,item);clipOwners.delete(oldV);applyCropToVideo(newV,item);current=item;transitionBusy=false;transitionTimeout=null;
 $('now').textContent='Lecture : '+item.file.name;cropEditing=item.id;$('crop-target').value=item.id;showCropEditor();
}
async function next(){
 if(!items.length){$('now').textContent='Importe d’abord des vidéos.';return}
 const token=++transitionToken;
 if(transitionTimeout){clearTimeout(transitionTimeout);transitionTimeout=null}
 transitionBusy=true;
 const oldV=activeVideo(),newV=standbyVideo(),item=nextItem();
 newV.pause();clipOwners.set(newV,item);applyCropToVideo(newV,item);newV.src=item.url;newV.muted=true;newV.playsInline=true;newV.controls=false;applyPlaybackSpeed(newV);
 const kind=transitions[Math.floor(Math.random()*transitions.length)];
 $('now').textContent='Préparation de la transition '+kind+'…';
 const ready=await new Promise(resolve=>{
  if(newV.readyState>=2){resolve(true);return}
  const done=ok=>{clearTimeout(timer);newV.removeEventListener('loadeddata',onReady);newV.removeEventListener('error',onError);resolve(ok)};
  const onReady=()=>done(true),onError=()=>done(false);
  const timer=setTimeout(()=>done(false),6500);
  newV.addEventListener('loadeddata',onReady);newV.addEventListener('error',onError);
 });
 if(token!==transitionToken)return;
 if(newV.videoWidth&&newV.videoHeight){item.format=newV.videoWidth>newV.videoHeight*1.12?'Horizontal':newV.videoHeight>newV.videoWidth*1.12?'Vertical':'Carré';if(cropEditing===item.id)showCropEditor()}
 if(!ready){newV.pause();newV.removeAttribute('src');newV.load();transitionBusy=false;$('now').textContent='Vidéo indisponible : '+item.file.name+' — essaie Suivante';return}
 try{
  await newV.play();
  if(newV.paused)throw new Error('Lecture en pause');
 }catch(_){
  if(token!==transitionToken)return;
  newV.pause();newV.removeAttribute('src');newV.load();
  transitionBusy=false;
  $('now').textContent='Lecture bloquée par iOS : appuie sur Suivante pour réessayer.';
  return;
 }
 // Quand possible, ignorer l'image initiale du site avant de rendre le lecteur visible.
 if(Number.isFinite(newV.duration)&&newV.duration>1.2&&newV.currentTime<.12){
  try{newV.currentTime=.12}catch(_){}
 }
 if(token!==transitionToken)return;
 const duration=1050;
 const initial={fade:'scale(1)',slide:'translateX(100%)',zoom:'scale(1.5)',rotate:'rotate(24deg) scale(.65)',wipe:'scale(1)'}[kind];
 newV.style.transition='none';oldV.style.transition='none';
 newV.style.opacity='0';newV.style.transform=initial;
 newV.style.clipPath=kind==='wipe'?'inset(0 100% 0 0)':'none';
 newV.style.pointerEvents='none';newV.style.zIndex='3';oldV.style.zIndex='2';
 // Forcer le rendu de l'état initial avant de lancer la transition.
 void newV.offsetWidth;
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  if(token!==transitionToken)return;
  newV.style.transition=`opacity ${duration}ms ease, transform ${duration}ms cubic-bezier(.2,.8,.2,1), clip-path ${duration}ms ease`;
  oldV.style.transition=`opacity ${duration}ms ease`;
  newV.style.opacity='1';newV.style.transform='none';newV.style.clipPath='inset(0 0 0 0)';
  oldV.style.opacity=kind==='wipe'?'1':'0';
 }));
 transitionTimeout=setTimeout(()=>{if(token===transitionToken){commitSwap(oldV,newV,item,token);if(newV.paused&&playing)newV.play().catch(()=>{$('now').textContent+=' — touche Lecture sur la vidéo.'})}},duration+130);
}
$('play').onclick=()=>{playing=true;if(!activeVideo().src)next();else activeVideo().play().catch(()=>next())};
$('next').onclick=()=>{playing=true;next()};
$('stop').onclick=()=>{playing=false;resetPlaybackTransition();activeVideo().pause()};
for(const v of [activeVideo(),standbyVideo()]){configurePlayback(v);applyPlaybackSpeed(v);
 v.addEventListener('ended',()=>{if(playing&&!transitionBusy&&v===activeVideo())next()});
 v.addEventListener('error',()=>{if(playing&&!transitionBusy&&v===activeVideo()){$('now').textContent='Impossible de lire ce fichier. Appuie sur Suivante.'}});
}

// Un simple affichage plein écran du même lecteur : aucun mode vidéo séparé.
let fullscreenOn=false;
function setFullscreen(on){
 fullscreenOn=Boolean(on);
 document.body.classList.toggle('fullscreen-on',fullscreenOn);
 const btn=$('fullscreen-toggle');
 btn.textContent=fullscreenOn?'✕ Réduire':'⛶ Plein écran';
 btn.setAttribute('aria-pressed',String(fullscreenOn));
 btn.setAttribute('aria-label',fullscreenOn?'Quitter le plein écran':'Passer en plein écran');
 // Recalculer chaque cadrage sur son lecteur, y compris après les échanges.
 syncPlaybackCrops();
}
$('fullscreen-toggle').onclick=()=>setFullscreen(!fullscreenOn);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&fullscreenOn)setFullscreen(false)});

$('duration').onchange=()=>$('customwrap').hidden=$('duration').value!=='custom';
function metadata(item){return new Promise((resolve,reject)=>{const v=document.createElement('video');v.preload='metadata';v.playsInline=true;const t=setTimeout(()=>finish(new Error('Métadonnées indisponibles')),12000);function finish(err){clearTimeout(t);v.removeAttribute('src');v.load();err?reject(err):resolve(d)}let d;v.onloadedmetadata=()=>{d={...item,duration:v.duration,width:v.videoWidth,height:v.videoHeight};item.format=d.width>d.height*1.12?'Horizontal':d.height>d.width*1.12?'Vertical':'Carré';if(cropEditing===item.id)showCropEditor();if(!Number.isFinite(d.duration)||d.duration<=0)finish(new Error('Durée vidéo inconnue'));else finish()};v.onerror=()=>finish(new Error('Format non lisible'));v.src=item.url})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function seek(v,t){return new Promise((resolve,reject)=>{if(Math.abs(v.currentTime-t)<.04){resolve();return}const timer=setTimeout(()=>{v.removeEventListener('seeked',done);reject(new Error('Recherche vidéo trop lente'))},9000);function done(){clearTimeout(timer);resolve()}v.addEventListener('seeked',done,{once:true});v.currentTime=t})}
// Effets 2D sans bibliothèque externe. Tous les pixels restent sur l'appareil.
function cover(ctx,v,x,y,w,h,scale=1){
 if(!v||v.readyState<2||!v.videoWidth)return false;
 const s=settings(clipOwners.get(v));
 const vw=v.videoWidth,vh=v.videoHeight,ratio=Math.max(w/vw,h/vh)*scale*s.zoom;
 const sw=Math.min(vw,w/ratio),sh=Math.min(vh,h/ratio);
 const sx=(vw-sw)/2,sy=(vh-sh)*s.vertical;
 ctx.drawImage(v,sx,sy,sw,sh,x,y,w,h);
 return true;
}
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
function openClip(v,item){return new Promise((resolve,reject)=>{let settled=false;const timer=setTimeout(()=>done(new Error('Chargement trop long')),10000);function done(err){if(settled)return;settled=true;clearTimeout(timer);v.removeEventListener('loadeddata',ready);v.removeEventListener('canplay',ready);v.removeEventListener('error',bad);err?reject(err):resolve()}function ready(){done()}function bad(){done(new Error('Décodage impossible'))}v.addEventListener('loadeddata',ready);v.addEventListener('canplay',ready);v.addEventListener('error',bad);clipOwners.set(v,item);v.src=item.url;v.load();if(v.readyState>=2)done()})}
function disposeClip(v){if(!v)return;clipOwners.delete(v);v.pause();v.removeAttribute('src');v.load()}
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
  const length=Math.min(remaining,mode==='cuts'?1+Math.random()*2:Math.max(.1,item.duration-(item.duration>1.2?.12:0)),item.duration);
  const start=mode==='cuts'?Math.random()*Math.max(0,item.duration-length):(item.duration>1.2?.12:0);
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
