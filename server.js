// Sous-titres Live — serveur sans dépendance (hébergeable sur Render)
// Page où tu tapes :           https://TON-SITE/?key=TON_MOT_DE_PASSE
// Overlay pour LIVE Studio :   https://TON-SITE/overlay  (source "Lien")

const http = require('http');
const PORT = process.env.PORT || 3939;
const KEY = process.env.KEY || '';
const clients = new Set();
let state = { current: '', sent: null };

function broadcast(msg) {
  const data = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of clients) res.write(data);
}

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700&display=swap" rel="stylesheet">`;

const INPUT_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Sous-titres — saisie</title>${FONT}
<style>
  body{margin:0;background:#1b1b1f;color:#eee;font-family:Montserrat,sans-serif;
    display:flex;flex-direction:column;height:100vh;padding:24px;box-sizing:border-box;gap:12px}
  textarea{flex:1;background:#26262c;color:#fff;border:2px solid #3a3a44;border-radius:12px;
    font:600 32px Montserrat,sans-serif;padding:16px;outline:none;resize:none}
  textarea:focus{border-color:#7c5cff}
  p{margin:0;color:#999;font-size:14px}
  #st{font-size:13px}
</style></head><body>
<p>Tape ici : le texte s'affiche en direct sur l'overlay. <b>Entrée</b> = valider la phrase · <b>Échap</b> = effacer · <b>Shift+Entrée</b> = retour à la ligne</p>
<textarea id="t" autofocus spellcheck="true"></textarea>
<p id="st">Connexion…</p>
<script>
  const t=document.getElementById('t'), st=document.getElementById('st');
  const key=new URLSearchParams(location.search).get('key')||'';
  const send=(body)=>fetch('/send?key='+encodeURIComponent(key),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(r=>st.textContent=r.status===403?'Mot de passe incorrect ✖ (ajoute ?key=... à l’adresse)':'Connecté ✔').catch(()=>st.textContent='Serveur injoignable ✖');
  t.addEventListener('input',()=>send({current:t.value}));
  t.addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();const v=t.value.trim();t.value='';send({current:'',sent:v||null});}
    else if(e.key==='Escape'){t.value='';send({current:''});}
  });
  send({current:''});
</script></body></html>`;

const OVERLAY_PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Sous-titres — overlay</title>${FONT}
<style>
  /* Réglages faciles */
  :root{ --fs:64px; --col:#b46cff; --contour:#000; }
  html,body{margin:0;height:100%;background:transparent;overflow:hidden}
  #wrap{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;
    align-items:center;padding:24px 40px 40px;box-sizing:border-box;gap:6px}
  .l{font-family:Montserrat,sans-serif;font-weight:700;color:var(--col);text-align:center;
    line-height:1.15;max-width:100%;overflow-wrap:break-word;white-space:pre-wrap;
    -webkit-text-stroke:6px var(--contour);paint-order:stroke fill;
    text-shadow:3px 0 0 var(--contour),-3px 0 0 var(--contour),0 3px 0 var(--contour),0 -3px 0 var(--contour),
      2px 2px 0 var(--contour),-2px -2px 0 var(--contour),2px -2px 0 var(--contour),-2px 2px 0 var(--contour),
      0 4px 8px rgba(0,0,0,.6);transition:opacity .5s}
  .h{font-size:calc(var(--fs)*.7);opacity:.75}
  #cur{font-size:var(--fs);min-height:1px}
</style></head><body>
<div id="wrap"><div id="hist"></div><div id="cur" class="l"></div></div>
<script>
  const MAX=2, FADE=20000;
  const cur=document.getElementById('cur'), hist=document.getElementById('hist');
  hist.style.cssText='display:flex;flex-direction:column;align-items:center;gap:6px';
  function add(txt){
    const d=document.createElement('div');d.className='l h';d.textContent=txt;hist.appendChild(d);
    while(hist.children.length>MAX)hist.firstChild.remove();
    setTimeout(()=>{d.style.opacity=0;setTimeout(()=>d.remove(),600)},FADE);
  }
  function connect(){
    const es=new EventSource('/events');
    es.onmessage=e=>{const m=JSON.parse(e.data);
      if(m.sent)add(m.sent);
      if(typeof m.current==='string')cur.textContent=m.current;};
    es.onerror=()=>{es.close();setTimeout(connect,2000)};
  }
  connect();
</script></body></html>`;

http.createServer((req, res) => {
  if (req.url === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(`data: ${JSON.stringify({ current: state.current })}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (req.url.startsWith('/send') && req.method === 'POST') {
    const k = new URL(req.url, 'http://x').searchParams.get('key') || '';
    if (KEY && k !== KEY) { res.writeHead(403); res.end(); return; }
    let b = '';
    req.on('data', c => (b += c));
    req.on('end', () => {
      try {
        const m = JSON.parse(b);
        state.current = m.current ?? '';
        broadcast({ current: state.current, sent: m.sent || null });
      } catch {}
      res.writeHead(204); res.end();
    });
    return;
  }
  const page = req.url.startsWith('/overlay') ? OVERLAY_PAGE : INPUT_PAGE;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
}).listen(PORT, () => {
  console.log(`Serveur prêt sur le port ${PORT}`);
});
