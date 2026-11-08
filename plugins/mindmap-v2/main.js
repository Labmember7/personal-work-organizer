import trk from "trk:sdk";

/* ============================================================
   DONNÉES — le contenu vit dans le document du plugin
   (host:init / host:doc), plus dans DATA en mémoire pendant l'édition.
   Champs : label, prio (P0/P1/P2), stat (todo|doing|done|decision),
            owner, deps[], note, children[], color/side (phases),
            refs[] (lien lecture seule vers une tâche de l'app).
   ============================================================ */
function DEFAULT_DATA(){
  return {id:"root", label:T("plugin_mindmap_default_root","Nouvelle carte"), children:[
    {id:uid(), label:T("plugin_mindmap_default_axis","Phase 1"), color:PALETTE[0], side:"R", stat:"todo", children:[]}
  ]};
}
let DATA = {id:"root", label:"…", children:[]}; // remplacé au premier rendu, avant même host:init

/* ============================================================
   MOTEUR
   ============================================================ */
/* Palette des phases : sept teintes séparées d'au moins 40° et assez
   soutenues pour rester lisibles sur fond clair comme sur fond sombre —
   la précédente virait au pastel sur le thème clair et confondait
   turquoise/vert et rose/rouge sur les pastilles de 8 px. */
const PALETTE=["#3FBFA8","#7C6CF0","#3D9BE9","#D98A2B","#D9536B","#5FA83D","#B563C9"];
/* L'état d'un point emprunte les jetons de l'hôte (--ok/--warn/--danger) :
   un seul thème à suivre, et les couleurs restent justes en clair. */
const STAT={todo:{l:"À faire",v:"--muted"},doing:{l:"En cours",v:"--warn"},
            done:{l:"Terminé",v:"--ok"},decision:{l:"À décider",v:"--decision"}};
const STAT_ORDER=["todo","doing","done","decision"];
/* Une « phase » est une branche de premier niveau (n._d===1) : son id, son
   libellé et sa couleur en font foi. Les tâches y sont attribuées en devenant
   ses enfants directs — l'appartenance est structurelle (l'arbre). */
const W=[250,268,236], PADX=15, PADY=12, LH=16.5, GY=13, GX=64, BUS=44, ELB=22;
const FF="Inter, 'Segoe UI', system-ui, -apple-system, Roboto, Arial, sans-serif";
const FM="ui-monospace, Menlo, Consolas, monospace";

const S={sel:null, link:null, view:"map", pres:false, full:false, folded:new Set(), deps:true,
         prio:"", phase:"", vx:0, vy:0, k:1, hits:new Set(), hitList:[], hitAt:-1, armFrom:null};

const $=id=>document.getElementById(id);
const svg=$("svg"), scene=$("scene"), canvas=$("canvas");
const mc=document.createElement("canvas").getContext("2d");
const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
const rgba=(h,a)=>{h=String(h||"").replace("#","");if(h.length!==6)return`rgba(128,128,128,${a})`;
  return`rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`};
/* Raccourci i18n : le SDK n'est interrogeable qu'une fois chargé, mais ce
   fichier s'exécute aussi hors hôte (aperçu) — d'où le repli systématique. */
const T=(k,f)=>(trk&&trk.t)?trk.t(k,f):f;
const cssVar=(name,fallback)=>getComputedStyle(document.documentElement).getPropertyValue(name).trim()||fallback;
const ink=()=>cssVar("--ink","#E8EBEE");
const muted=()=>cssVar("--muted","#8B95A1");
const bgc=()=>cssVar("--bg","#10141A");
const panelc=()=>cssVar("--panel","#181E26");
const linec=()=>cssVar("--line","#2A323D");
const accentc=()=>cssVar("--accent","#35A7A0");
const statColor=k=>cssVar((STAT[k]||STAT.todo).v,"#8B95A1");
let DARK=true; // affiné par applyHostTheme : pilote ce qu'un jeton seul ne capture pas (alpha des remplissages)

function walk(n,f,p=null,d=0){f(n,p,d);(n.children||[]).forEach(c=>walk(c,f,n,d+1))}
function index(){const m=new Map();walk(DATA,(n,p,d)=>{n._p=p;n._d=d;m.set(n.id,n)});return m}
let IDX=index();
const branchOf=n=>{let c=n;while(c&&c._d>1)c=c._p;return c};
const colorOf=n=>n._d===0?accentc():(branchOf(n)?.color||accentc());
const uid=()=>"n"+Math.random().toString(36).slice(2,8);
const firstLine=n=>String(n&&n.label||"").split("\n")[0];

function passFilter(n){
  if(S.prio&&n.prio&&!S.prio.split(",").includes(n.prio))return false;
  if(S.phase){const b=branchOf(n);if(!b||b.id!==S.phase)return false}
  return true;
}
/* points réellement actionnables : tout sauf la racine et les phases elles-mêmes */
function actionables(){const out=[];walk(DATA,n=>{if(n._d<=1)return;out.push(n)});return out}
/* rang = longueur du plus long chemin de dépendances en amont */
function ranks(){
  const memo=new Map(), stack=new Set(); let cyc=false;
  const r=n=>{
    if(memo.has(n.id))return memo.get(n.id);
    if(stack.has(n.id)){cyc=true;return 0}
    stack.add(n.id);let m=0;
    (n.deps||[]).forEach(d=>{const s=IDX.get(d.id);if(s)m=Math.max(m,r(s)+1)});
    stack.delete(n.id);memo.set(n.id,m);return m;
  };
  [...IDX.values()].forEach(n=>{if(n._d>0)r(n)});
  return {rank:id=>memo.get(id)??0,cyc};
}
function visible(n){
  if(n._d===0)return true;
  if(S.phase){const b=branchOf(n);if(!b||b.id!==S.phase)return false}
  if(n._d<=1)return true;
  if(S.prio&&n.prio&&!S.prio.split(",").includes(n.prio))return false;
  return true;
}
const kids=n=>S.folded.has(n.id)?[]:(n.children||[]).filter(visible);
/* une dépendance = "id" (auto) ou {id, from:{s,t}, to:{s,t}, bow} */
function normDeps(){walk(DATA,n=>{if(n.deps)n.deps=n.deps.map(d=>typeof d==="string"?{id:d}:d)})}
function anchorPt(n,a){
  const l=n.x,r=n.x+n.w,t=n.y-n.h/2,b=n.y+n.h/2;
  if(a.s==="l")return{x:l,y:t+a.t*n.h,nx:-1,ny:0};
  if(a.s==="r")return{x:r,y:t+a.t*n.h,nx:1,ny:0};
  if(a.s==="t")return{x:l+a.t*n.w,y:t,nx:0,ny:-1};
  return{x:l+a.t*n.w,y:b,nx:0,ny:1};
}
function nearestAnchor(n,px,py){
  const l=n.x,r=n.x+n.w,t=n.y-n.h/2,b=n.y+n.h/2;
  const cx=Math.max(l,Math.min(r,px)),cy=Math.max(t,Math.min(b,py));
  const d={l:Math.abs(px-l),r:Math.abs(px-r),t:Math.abs(py-t),b:Math.abs(py-b)};
  const s=Object.keys(d).reduce((a,k)=>d[k]<d[a]?k:a);
  const cl=v=>Math.max(.08,Math.min(.92,v));
  return (s==="l"||s==="r")?{s,t:cl((cy-t)/n.h)}:{s,t:cl((cx-l)/n.w)};
}
function anchorsFor(src,dst,d){
  const rightward=src.x+src.w/2>dst.x+dst.w/2;
  return [d.from||{s:rightward?"l":"r",t:.5}, d.to||{s:rightward?"r":"l",t:.5}];
}
function applyOff(n,ax,ay){
  const x=ax+(n.dx||0), y=ay+(n.dy||0);
  n.x+=x;n.y+=y;kids(n).forEach(c=>applyOff(c,x,y));
}

const _wc=new Map();
function wrap(t,max,font){
  const key=max+"|"+font+"|"+t;if(_wc.has(key))return _wc.get(key);
  mc.font=font;const out=[];
  String(t).split("\n").forEach(par=>{
    let line="";
    par.split(" ").forEach(w=>{
      const test=line?line+" "+w:w;
      if(mc.measureText(test).width>max&&line){out.push(line);line=w}else line=test;
    });out.push(line);
  });_wc.set(key,out);return out;
}
function size(n){
  const d=Math.min(n._d,2), w=n.w0||(n._d===0?260:W[d]);
  const fs=n._d===0?15:(n._d===1?13.5:12.5), fw=n._d<=1?650:500;
  const font=`${fw} ${fs}px ${FF}`;
  n._lines=wrap(n.label,w-2*PADX,font);n._fs=fs;n._fw=fw;
  const meta=(n.prio||n.stat||n.owner)&&n._d>0?17:0;
  n.w=w;n.h=Math.max(42,n._lines.length*LH+2*PADY+meta,n.h0||0);
}
function measure(n){
  size(n);const ch=kids(n);
  if(!ch.length){n._sub=n.h;return n._sub}
  let t=0;ch.forEach(c=>t+=measure(c));t+=GY*(ch.length-1);
  n._sub=Math.max(n.h,t);return n._sub;
}
function place(n,dir){
  const ch=kids(n);if(!ch.length)return;
  let t=0;ch.forEach(c=>t+=c._sub);t+=GY*(ch.length-1);
  let y=n.y-t/2;
  ch.forEach(c=>{
    c.y=y+c._sub/2;
    c.x=dir>0?n.x+n.w+GX:n.x-GX-c.w;
    y+=c._sub+GY;place(c,dir);
  });
}
function layout(){
  IDX=index();
  const roots=(DATA.children||[]).filter(visible);
  roots.forEach(measure);size(DATA);
  const L=roots.filter(r=>r.side==="L"), R=roots.filter(r=>r.side!=="L");
  DATA.x=-130;DATA.y=0;DATA.w=260;
  [[R,1],[L,-1]].forEach(([grp,dir])=>{
    let t=0;grp.forEach(c=>t+=c._sub);t+=GY*2*(grp.length-1);
    let y=-t/2;
    grp.forEach(c=>{
      c.y=y+c._sub/2;
      c.x=dir>0?DATA.x+DATA.w+BUS+GX:DATA.x-BUS-GX-c.w;
      y+=c._sub+GY*2;place(c,dir);
    });
    grp._bus=dir>0?DATA.x+DATA.w+BUS:DATA.x-BUS;
    grp._dir=dir;
  });
  [...R,...L].forEach(r=>applyOff(r,0,0));
  return {L,R};
}

function elbow(px,py,cx,cy,dir){
  if(Math.abs(cy-py)<1.5)return `M${px},${py} L${cx},${cy}`;
  const mx=px+dir*ELB, sy=Math.sign(cy-py), r=Math.min(10,Math.abs(cy-py)/2,ELB-2);
  return `M${px},${py} L${mx-dir*r},${py} Q${mx},${py} ${mx},${py+sy*r} L${mx},${cy-sy*r} Q${mx},${cy} ${mx+dir*r},${cy} L${cx},${cy}`;
}
/* Pastille de statut d'une tâche liée (lecture seule) : coin haut-droit du
   nœud. La donnée vient de TASKS (dernière projection reçue de l'hôte),
   jamais recopiée dans le document — seul l'id de la tâche y est stocké. */
function taskBadge(n){
  const ref=(n.refs||[]).find(r=>r.kind==="task");
  if(!ref)return"";
  const task=TASKS.get(ref.id);
  const bx=n.w-2, by=2;
  if(!task){
    return `<g transform="translate(${bx},${by})"><circle r="7" fill="${bgc()}" stroke="${cssVar("--danger","#D64545")}" stroke-width="1.5"/>
      <text y="3.5" text-anchor="middle" font-size="10" font-weight="700" fill="${cssVar("--danger","#D64545")}">!</text>
      <title>${esc(T("plugin_mindmap_task_missing","Tâche introuvable"))}</title></g>`;
  }
  const mins=task.minutes?` · ${task.minutes} ${T("plugin_mindmap_minutes_suffix","min")}`:"";
  return `<g transform="translate(${bx},${by})"><circle r="7" fill="${bgc()}" stroke="${task.statutColor}" stroke-width="1.5"/>
    <circle r="3" fill="${task.statutColor}"/>
    <title>${esc(task.titre)} — ${esc(task.statutLabel)}${esc(mins)}</title></g>`;
}
function nodeSVG(n){
  const c=colorOf(n), isRoot=n._d===0, sel=S.sel===n.id, hit=S.hits.has(n.id);
  const st=STAT[n.stat]||null;
  let g=`<g class="nd" data-id="${n.id}" transform="translate(${n.x},${n.y-n.h/2})">`;
  if(sel)g+=`<rect x="-4" y="-4" width="${n.w+8}" height="${n.h+8}" rx="${isRoot?13:11}" fill="none"
       stroke="${rgba(c,.3)}" stroke-width="2"/>`;
  if(hit&&!sel)g+=`<rect x="-3" y="-3" width="${n.w+6}" height="${n.h+6}" rx="${isRoot?12:10}" fill="none"
       stroke="${accentc()}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  g+=`<rect class="box" width="${n.w}" height="${n.h}" rx="${isRoot?10:8}"
       fill="${isRoot?rgba(c,DARK?.2:.16):rgba(c,DARK?.15:.1)}"
       stroke="${sel?c:rgba(c,DARK?.5:.55)}" stroke-width="${sel?2:1.1}"/>`;
  if(!isRoot)g+=`<rect width="3" height="${n.h}" rx="1.5" fill="${c}" opacity="${n.prio==="P0"?1:n.prio==="P1"?.6:.3}"/>`;
  let ty=PADY+12;
  n._lines.forEach(l=>{g+=`<text x="${PADX}" y="${ty}" font-family="${FF}"
      font-size="${n._fs}" font-weight="${n._fw}" fill="${ink()}">${esc(l)}</text>`;ty+=LH});
  if(!isRoot&&(n.prio||st||n.owner)){
    let x=PADX, my=n.h-PADY+1;
    if(n.prio){g+=`<rect x="${x}" y="${my-9}" width="20" height="13" rx="3" fill="${rgba(c,.28)}" stroke="${rgba(c,.5)}"/>
      <text x="${x+10}" y="${my}" text-anchor="middle" font-family="${FM}" font-size="9" font-weight="700" fill="${ink()}">${n.prio}</text>`;x+=25}
    if(st){g+=`<circle cx="${x+4}" cy="${my-4}" r="3.6" fill="${statColor(n.stat)}"/>
      <text x="${x+13}" y="${my}" font-family="${FF}" font-size="10" fill="${muted()}">${esc(st.l)}</text>`;
      mc.font=`400 10px ${FF}`;x+=17+mc.measureText(st.l).width}
    if(n.owner)g+=`<text x="${n.w-PADX}" y="${my}" text-anchor="end" font-family="${FF}" font-size="10" fill="${muted()}">${esc(n.owner)}</text>`;
  }
  const hid=(n.children||[]).length&&S.folded.has(n.id);
  if(hid){const dir=(branchOf(n)?.side==="L")?-1:1;
    g+=`<g data-fold="${n.id}" style="cursor:pointer"><circle cx="${dir>0?n.w+11:-11}" cy="${n.h/2}" r="9" fill="${bgc()}" stroke="${rgba(c,.6)}"/>
      <text x="${dir>0?n.w+11:-11}" y="${n.h/2+3.5}" text-anchor="middle" font-size="10" font-weight="700" fill="${c}">${n.children.length}</text></g>`}
  if(sel&&!isRoot&&!S.pres&&S.view==="map"){
    g+=`<rect x="${n.w-11}" y="${n.h-11}" width="11" height="11" rx="2.5" fill="${c}"
       data-rz="${n.id}" style="cursor:nwse-resize"/>`;
    /* poignée de liaison : tirer d'ici vers un autre point crée la dépendance */
    const dir=(branchOf(n)?.side==="L")?-1:1, hx=dir>0?n.w+9:-9;
    g+=`<g data-cn="${n.id}" style="cursor:crosshair"><circle cx="${hx}" cy="${n.h/2}" r="8" fill="transparent"/>
      <circle cx="${hx}" cy="${n.h/2}" r="4.5" fill="${bgc()}" stroke="${c}" stroke-width="1.6"/>
      <circle cx="${hx}" cy="${n.h/2}" r="1.8" fill="${c}"/>
      <title>${esc(T("plugin_mindmap_act_connect","Relier à…"))}</title></g>`;
  }
  g+=taskBadge(n);
  return g+"</g>";
}

function curve(A,B,bow){
  const b=bow==null?1:+bow;
  const k=Math.max(30,Math.hypot(B.x-A.x,B.y-A.y)*.34)*b;
  return `M${A.x},${A.y} C${A.x+(A.nx||0)*k},${A.y+(A.ny||0)*k} ${B.x+(B.nx||0)*k},${B.y+(B.ny||0)*k} ${B.x},${B.y}`;
}
const PRO={P0:0,P1:1,P2:2};
function sizeFlow(n){
  const w=250, font=`600 13px ${FF}`;
  n._lines=wrap(n.label,w-2*PADX,font);n._fs=13;n._fw=600;
  n.w=w;n.h=Math.max(62,15+n._lines.length*LH+2*PADY+17);
}
function cardSVG(n){
  const c=colorOf(n), sel=S.sel===n.id, st=STAT[n.stat]||STAT.todo, hit=S.hits.has(n.id);
  let g=`<g class="nd" data-id="${n.id}" transform="translate(${n.x},${n.y-n.h/2})">`;
  if(sel)g+=`<rect x="-4" y="-4" width="${n.w+8}" height="${n.h+8}" rx="11" fill="none" stroke="${rgba(c,.3)}" stroke-width="2"/>`;
  if(hit&&!sel)g+=`<rect x="-3" y="-3" width="${n.w+6}" height="${n.h+6}" rx="10" fill="none" stroke="${accentc()}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
  g+=`<rect class="box" width="${n.w}" height="${n.h}" rx="8" fill="${rgba(c,DARK?.15:.1)}"
       stroke="${sel?c:rgba(c,DARK?.5:.55)}" stroke-width="${sel?2:1.1}"/>`;
  g+=`<rect width="3" height="${n.h}" rx="1.5" fill="${c}" opacity="${n.prio==="P0"?1:n.prio==="P1"?.6:.3}"/>`;
  g+=`<text x="${PADX}" y="${PADY+8}" font-family="${FM}" font-size="8.5" letter-spacing="1.2"
       fill="${rgba(c,.95)}">${esc(firstLine(branchOf(n)).toUpperCase())}</text>`;
  let ty=PADY+26;
  n._lines.forEach(l=>{g+=`<text x="${PADX}" y="${ty}" font-family="${FF}" font-size="13" font-weight="600"
       fill="${ink()}">${esc(l)}</text>`;ty+=LH});
  const my=n.h-PADY+1;let x=PADX;
  if(n.prio){g+=`<rect x="${x}" y="${my-9}" width="20" height="13" rx="3" fill="${rgba(c,.28)}" stroke="${rgba(c,.5)}"/>
    <text x="${x+10}" y="${my}" text-anchor="middle" font-family="${FM}" font-size="9" font-weight="700" fill="${ink()}">${n.prio}</text>`;x+=26}
  g+=`<circle cx="${x+4}" cy="${my-4}" r="3.6" fill="${statColor(n.stat)}"/>
    <text x="${x+13}" y="${my}" font-family="${FF}" font-size="10" fill="${muted()}">${esc(st.l)}</text>`;
  if(n.owner)g+=`<text x="${n.w-PADX}" y="${my}" text-anchor="end" font-family="${FF}" font-size="10" fill="${muted()}">${esc(n.owner)}</text>`;
  return g+"</g>";
}
function renderFlow(){
  IDX=index();
  const {rank,cyc}=ranks();
  const list=actionables().filter(passFilter);
  const phaseNodes=(DATA.children||[]).filter(p=>!S.phase||p.id===S.phase);
  const CW=250,GC=96;
  const colOf=new Map(), cols=[];
  phaseNodes.forEach((ph,i)=>{
    const items=list.filter(n=>branchOf(n)===ph)
      .sort((a,b)=>rank(a.id)-rank(b.id)||(PRO[a.prio]??9)-(PRO[b.prio]??9)||a.label.localeCompare(b.label));
    items.forEach(sizeFlow);
    const H=items.reduce((s,n)=>s+n.h,0)+12*Math.max(0,items.length-1);
    let y=-H/2;
    items.forEach(n=>{n.x=i*(CW+GC);n.y=y+n.h/2;y+=n.h+12;colOf.set(n.id,i)});
    cols.push({ph,items,H,x:i*(CW+GC)});
  });
  const maxH=Math.max(120,...cols.map(c=>c.H),120);
  let bands="",cards="",links="",back=0;
  cols.forEach(c=>{
    const col=c.ph.color||accentc();
    bands+=`<rect x="${c.x-18}" y="${-maxH/2-52}" width="${CW+36}" height="${maxH+72}" rx="12"
      fill="${rgba(DARK?"#FFFFFF":"#0B1418",DARK?.03:.04)}" stroke="${rgba(col,.45)}" stroke-dasharray="3 5"/>`;
    bands+=`<text x="${c.x}" y="${-maxH/2-28}" font-family="${FM}" font-size="10" letter-spacing="1.6"
      fill="${col}">${esc(firstLine(c.ph).toUpperCase())}</text>`;
    bands+=`<text x="${c.x}" y="${-maxH/2-13}" font-family="${FF}" font-size="11" fill="${muted()}">${c.items.length?T("plugin_mindmap_points_count","{n} point{s}").replace("{n}",c.items.length).replace("{s}",c.items.length>1?"s":""):T("plugin_mindmap_phase_no_tasks","Aucune tâche attribuée")}</text>`;
  });
  list.forEach(n=>{
    (n.deps||[]).forEach(d=>{
      const s=IDX.get(d.id);if(!s||colOf.get(s.id)===undefined)return;
      const cs=colOf.get(s.id), cn=colOf.get(n.id), bad=cs>cn;if(bad)back++;
      let A,B,bow=bad?1.5:1;
      if(cs===cn){const dn=s.y<n.y, mx=s.x+s.w-34;bow=.45;
        A={x:mx,y:s.y+(dn?s.h/2:-s.h/2),nx:0,ny:dn?1:-1};
        B={x:n.x+n.w-34,y:n.y+(dn?-n.h/2:n.h/2),nx:0,ny:dn?-1:1};
      }else{A={x:s.x+s.w,y:s.y,nx:1,ny:0};B={x:n.x,y:n.y,nx:-1,ny:0}}
      const col=bad?cssVar("--danger","#D64545"):rgba(colorOf(s),.5);
      links+=`<path d="${curve(A,B,bow)}" stroke="${col}" stroke-width="${bad?1.7:1.1}"
        stroke-dasharray="${bad?"6 3":"4 4"}" fill="none" marker-end="url(#ar)"/>`;
    });
  });
  cards=list.map(cardSVG).join("");
  let warn="";
  if(back||cyc){
    const backTxt=back?T("plugin_mindmap_warn_backward","{n} dépendance(s) remonte(nt) vers une phase antérieure").replace("{n}",back):"";
    const cycTxt=cyc?T("plugin_mindmap_warn_cycle","dépendance circulaire détectée"):"";
    warn=`<text x="${-18}" y="${-maxH/2-76}" font-family="${FF}" font-size="12.5" fill="${cssVar("--danger","#D64545")}">⚠ ${backTxt}${back&&cyc?" · ":""}${cycTxt}</text>`;
  }
  scene.innerHTML=`<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
    <path d="M0,1 L7,4 L0,7 z" fill="${muted()}"/></marker></defs>
    <g>${bands}</g>${warn}<g opacity=".9">${links}</g><g>${cards}</g>`;
  scene.setAttribute("transform",`translate(${S.vx},${S.vy}) scale(${S.k})`);
}
function render(){
  if(S.view==="flow")return renderFlow();
  const {L,R}=layout();
  let edges="",nodes="",dep="",hnd="";
  const H=(x,y,end,col)=>{hnd+=`<circle cx="${x}" cy="${y}" r="6.5" fill="${bgc()}" stroke="${col}" stroke-width="2" data-h="${end}" style="cursor:crosshair"/>`};
  [[R,1],[L,-1]].forEach(([grp,dir])=>{
    if(!grp.length)return;
    const bx=grp._bus, ys=grp.map(c=>c.y);
    edges+=`<path d="M${DATA.x+(dir>0?DATA.w:0)},0 L${bx},0" stroke="${linec()}" stroke-width="1.6" fill="none"/>`;
    edges+=`<path d="M${bx},${Math.min(...ys,0)} L${bx},${Math.max(...ys,0)}" stroke="${linec()}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    grp.forEach(c=>{
      const lk=c.link, on=S.link==="t:"+c.id;
      const A={x:bx,y:c.y+(lk&&lk.busDy||0),nx:dir,ny:0};
      let B,d0;
      if(lk&&(lk.to||lk.busDy!=null||lk.bow!=null)){
        B=anchorPt(c,lk.to||{s:dir>0?"l":"r",t:.5});d0=curve(A,B,lk.bow);
      }else{B={x:dir>0?c.x:c.x+c.w,y:c.y};d0=`M${A.x},${A.y} L${B.x},${B.y}`}
      edges+=`<path d="${d0}" stroke="rgba(0,0,0,0)" stroke-width="14" fill="none" data-tlink="${c.id}" style="cursor:pointer"/>`;
      edges+=`<path d="${d0}" stroke="${rgba(c.color,on?1:.75)}" stroke-width="${on?2.6:1.6}" fill="none" pointer-events="none"/>`;
      edges+=`<rect x="${A.x-3}" y="${A.y-3}" width="6" height="6" fill="${c.color}" pointer-events="none"/>`;
      if(on){H(A.x,A.y,"from",c.color);H(B.x,B.y,"to",c.color)}
    });
  });
  walk(DATA,n=>{
    if(n._d===0||!isShown(n))return;
    const dir=branchOf(n)?.side==="L"?-1:1, col=colorOf(n);
    if(n._d>=2&&n._p&&kids(n._p).includes(n)){
      const lk=n.link, on=S.link==="t:"+n.id;
      let A,B,d0;
      if(lk&&(lk.from||lk.to||lk.bow!=null)){
        A=anchorPt(n._p,lk.from||{s:dir>0?"r":"l",t:.5});
        B=anchorPt(n,lk.to||{s:dir>0?"l":"r",t:.5});
        d0=curve(A,B,lk.bow);
      }else{
        A={x:dir>0?n._p.x+n._p.w:n._p.x,y:n._p.y};B={x:dir>0?n.x:n.x+n.w,y:n.y};
        d0=elbow(A.x,A.y,B.x,B.y,dir);
      }
      edges+=`<path d="${d0}" stroke="rgba(0,0,0,0)" stroke-width="14" fill="none" data-tlink="${n.id}" style="cursor:pointer"/>`;
      edges+=`<path d="${d0}" stroke="${rgba(col,on?1:(n._d===2?.55:.4))}" stroke-width="${on?2.4:1.3}" fill="none" pointer-events="none"/>`;
      if(on){H(A.x,A.y,"from",col);H(B.x,B.y,"to",col)}
    }
    nodes+=nodeSVG(n);
  });
  nodes=nodeSVG(DATA)+nodes;
  if(S.deps){
    walk(DATA,n=>{
      if(!n.deps||n._d===0||!isShown(n))return;
      n.deps.forEach(d=>{
        const s=IDX.get(d.id);if(!s||!isShown(s))return;
        const [af,at]=anchorsFor(s,n,d), A=anchorPt(s,af), B=anchorPt(n,at);
        const path=curve(A,B,d.bow), key="d:"+n.id+"|"+d.id, on=S.link===key, col=colorOf(s);
        dep+=`<path d="${path}" stroke="rgba(0,0,0,0)" stroke-width="16" fill="none" data-link="${key}" style="cursor:pointer"/>`;
        dep+=`<path d="${path}" stroke="${on?col:rgba(col,.55)}" stroke-width="${on?2:1.2}"
          stroke-dasharray="${on?"7 3":"4 4"}" fill="none" marker-end="url(#ar)" pointer-events="none"/>`;
        if(on){H(A.x,A.y,"from",col);H(B.x,B.y,"to",col)}
      });
    });
  }
  scene.innerHTML=`<defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
    <path d="M0,1 L7,4 L0,7 z" fill="${muted()}"/></marker></defs>
    <g>${edges}</g><g opacity=".85">${dep}</g><g>${nodes}</g><g>${hnd}</g><g id="ghost"></g>`;
  scene.setAttribute("transform",`translate(${S.vx},${S.vy}) scale(${S.k})`);
}
function isShown(n){let c=n;while(c&&c._d>0){if(!visible(c))return false;if(c!==n&&S.folded.has(c.id))return false;c=c._p}return true}

/* ---------- vue ---------- */
function applyView(){scene.setAttribute("transform",`translate(${S.vx},${S.vy}) scale(${S.k})`)}
function fit(){
  render();const b=scene.getBBox(), r=canvas.getBoundingClientRect();
  if(!b.width||!b.height)return;
  S.k=Math.min(1.05,Math.min((r.width-80)/b.width,(r.height-80)/b.height));
  S.vx=r.width/2-(b.x+b.width/2)*S.k;S.vy=r.height/2-(b.y+b.height/2)*S.k;
  applyView();
}
function zoomBy(f){
  const r=canvas.getBoundingClientRect(), mx=r.width/2, my=r.height/2;
  const k=Math.min(2.2,Math.max(.28,S.k*f));
  S.vx=mx-(mx-S.vx)*k/S.k;S.vy=my-(my-S.vy)*k/S.k;S.k=k;applyView();
}
function centerOn(n){
  if(!n||n.x==null)return;
  const r=canvas.getBoundingClientRect();
  const insp=$("insp").classList.contains("open")&&innerWidth>760?346:0;
  S.vx=(r.width-insp)/2-(n.x+n.w/2)*S.k;S.vy=r.height/2-n.y*S.k;applyView();
}

/* ============================================================
   HISTORIQUE
   Une pile de versions de l'arbre. Le pli et le mode de vue en sont
   volontairement exclus : ce sont des réglages d'affichage, et les voir
   sauter à chaque Ctrl+Z serait déroutant.
   `BASE` = l'arbre tel qu'il était au dernier point d'annulation ; chaque
   `commit()` l'empile puis le rafraîchit. Les frappes successives dans un
   même champ se regroupent (clé de fusion) pour qu'un Ctrl+Z défasse la
   saisie entière, pas une lettre.
   ============================================================ */
const HIST={past:[],future:[]};
const HIST_MAX=80;
let BASE=null;
function treeSnapshot(){
  return JSON.parse(JSON.stringify(DATA,(k,v)=>k.startsWith("_")||["x","y","w","h"].includes(k)?undefined:v));
}
function commit(label,mergeKey){
  const now=Date.now(), top=HIST.past[HIST.past.length-1];
  if(mergeKey&&top&&top.key===mergeKey&&now-top.t<1400){top.t=now;top.label=label}
  else{
    HIST.past.push({tree:BASE,label,key:mergeKey||null,t:now});
    if(HIST.past.length>HIST_MAX)HIST.past.shift();
  }
  HIST.future.length=0;
  BASE=treeSnapshot();
  updateHistoryUI();
  scheduleSave();
}
function restoreTree(tree){
  DATA=JSON.parse(JSON.stringify(tree));
  normDeps();IDX=index();
  if(S.sel&&!IDX.has(S.sel))S.sel=null;
  if(S.link){const id=S.link.startsWith("d:")?S.link.slice(2).split("|")[0]:S.link.slice(2);
    if(!IDX.has(id)){S.link=null;$("lnk").classList.remove("open")}}
  syncPhaseUI();
  if(S.sel)select(S.sel);else{$("insp").classList.remove("open");render()}
  runSearch($("qFind").value,false);
}
function undo(){
  const e=HIST.past.pop();
  if(!e){flash(T("plugin_mindmap_history_empty","Rien à annuler"));return}
  HIST.future.push({tree:treeSnapshot(),label:e.label,key:e.key,t:Date.now()});
  restoreTree(e.tree);BASE=treeSnapshot();
  updateHistoryUI();scheduleSave();
  flash(T("plugin_mindmap_history_undone","Annulé : {a}").replace("{a}",e.label||"—"),
        {label:T("plugin_mindmap_redo","Rétablir"),keys:"Ctrl "+K("shift")+" Z",run:redo});
}
function redo(){
  const e=HIST.future.pop();
  if(!e)return;
  HIST.past.push({tree:treeSnapshot(),label:e.label,key:e.key,t:Date.now()});
  restoreTree(e.tree);BASE=treeSnapshot();
  updateHistoryUI();scheduleSave();
  flash(T("plugin_mindmap_history_redone","Rétabli : {a}").replace("{a}",e.label||"—"));
}
function resetHistory(){HIST.past.length=0;HIST.future.length=0;BASE=treeSnapshot();updateHistoryUI()}
function updateHistoryUI(){
  const u=$("bUndo"), r=$("bRedo");
  u.disabled=!HIST.past.length;r.disabled=!HIST.future.length;
  const last=HIST.past[HIST.past.length-1], next=HIST.future[HIST.future.length-1];
  u.title=T("plugin_mindmap_undo","Annuler")+(last&&last.label?" : "+last.label:"")+" — Ctrl Z";
  r.title=T("plugin_mindmap_redo","Rétablir")+(next&&next.label?" : "+next.label:"")+" — Ctrl "+K("shift")+" Z";
}
const H=k=>T("plugin_mindmap_h_"+k,{add:"ajout",del:"suppression",move:"déplacement",size:"redimensionnement",
  edit:"modification",link:"lien",task:"tâche",sort:"tri",layout:"disposition",order:"ordre",color:"couleur"}[k]||k);

/* Noms de touches : écrits en toutes lettres plutôt qu'en symboles (⏎, ⇧, ⌫).
   Les polices à chasse fixe disponibles selon les postes ne les portent pas
   toutes, et une touche affichée en tofu ne s'apprend pas. Traduisibles,
   donc « Entrée » en français et « Enter » en anglais. */
const K=k=>T("plugin_mindmap_key_"+k,{enter:"Entrée",shift:"Maj",del:"Suppr",esc:"Échap",
  tab:"Tab",alt:"Alt",ctrl:"Ctrl",drag:"glisser"}[k]||k);

/* ---------- pastille d'état : dire ce qui vient de se passer, et l'offrir à défaire ---------- */
let pillTimer=null;
function flash(text,action){
  const p=$("pill"), b=$("pillAct");
  $("pillText").textContent=text;
  if(action){
    b.style.display="";
    b.firstElementChild.textContent=action.label||T("plugin_mindmap_undo","Annuler");
    b.lastElementChild.textContent=action.keys||"Ctrl Z";
    b.onclick=()=>{hidePill();action.run()};
  }else b.style.display="none";
  p.classList.add("show");
  clearTimeout(pillTimer);pillTimer=setTimeout(hidePill,action?4600:2600);
}
function hidePill(){$("pill").classList.remove("show");clearTimeout(pillTimer)}

/* ============================================================
   MUTATIONS
   Toutes passent par commit() : rien ne change dans l'arbre sans être
   annulable. C'est ce qui autorise à supprimer sans confirmation —
   la seule action encore confirmée est l'import, que l'annulation ne
   couvre pas (il remplace le document et vide l'historique).
   ============================================================ */
function addNode(parent,after,opts){
  const isPhase=parent._d===0;
  const n={id:uid(),label:isPhase?T("plugin_mindmap_new_phase","Nouvelle phase"):T("plugin_mindmap_new_point","Nouveau point"),
    stat:"todo",deps:[],children:[]};
  if(!isPhase)n.prio="P1";
  if(isPhase){n.color=PALETTE[(parent.children||[]).length%PALETTE.length];
    const l=(parent.children||[]).filter(c=>c.side==="L").length;n.side=l*2<(parent.children||[]).length?"L":"R"}
  parent.children=parent.children||[];
  parent.children.splice(after!=null?after+1:parent.children.length,0,n);
  S.folded.delete(parent.id);IDX=index();
  commit(H("add"));
  if(isPhase)syncPhaseUI();
  select(n.id);
  if(!opts||opts.focus!==false){$("iLabel").focus();$("iLabel").select()}
  return n;
}
function cloneSubtree(n){
  const copy=JSON.parse(JSON.stringify(n,(k,v)=>k.startsWith("_")||["x","y","w","h"].includes(k)?undefined:v));
  const remap=new Map();
  walk(copy,x=>{const nid=uid();remap.set(x.id,nid);x.id=nid});
  /* les dépendances internes au sous-arbre suivent la copie ; celles qui
     pointent au-dehors sont conservées telles quelles. */
  walk(copy,x=>{if(x.deps)x.deps=x.deps.map(d=>remap.has(d.id)?{...d,id:remap.get(d.id)}:d)});
  return copy;
}
function duplicateNode(n){
  if(!n||!n._p)return;
  const copy=cloneSubtree(n);
  copy.label=n.label;
  n._p.children.splice(n._p.children.indexOf(n)+1,0,copy);
  IDX=index();commit(H("add"));
  if(n._d===1)syncPhaseUI();
  select(copy.id);
  flash(T("plugin_mindmap_pill_duplicated","Dupliqué : {n}").replace("{n}",firstLine(copy)),
        {keys:"Ctrl Z",run:undo});
}
function deleteNode(n){
  if(!n||!n._p)return;
  let count=0;walk(n,()=>count++);
  const name=firstLine(n), wasPhase=n._d===1;
  n._p.children.splice(n._p.children.indexOf(n),1);
  walk(DATA,x=>{if(x.deps)x.deps=x.deps.filter(d=>d.id!==n.id)});
  S.sel=null;$("insp").classList.remove("open");IDX=index();
  if(wasPhase){if(S.phase===n.id){S.phase="";$("fPhase").value=""}syncPhaseUI()}
  commit(H("del"));render();
  const msg=count>1
    ? T("plugin_mindmap_pill_deleted_sub","Supprimé : {n} et {c} sous-points").replace("{n}",name).replace("{c}",count-1)
    : T("plugin_mindmap_pill_deleted","Supprimé : {n}").replace("{n}",name);
  flash(msg,{keys:"Ctrl Z",run:undo});
}
function moveNode(n,d){
  if(!n||!n._p)return;
  const a=n._p.children,i=a.indexOf(n),j=i+d;
  if(j<0||j>=a.length)return;
  a.splice(i,1);a.splice(j,0,n);
  IDX=index();commit(H("order"));
  if(n._d===1)syncPhaseUI();
  render();
}
function setField(n,key,value,mergeKey){
  if(!n)return;
  if(value===null||value==="")delete n[key];else n[key]=value;
  commit(H("edit"),mergeKey);render();
}
function toggleFold(n){
  if(!n||!(n.children||[]).length)return;
  S.folded.has(n.id)?S.folded.delete(n.id):S.folded.add(n.id);
  render();scheduleSave();
}
/* dépendances : n dépend de src (la flèche va de src vers n) */
function dependsOn(a,b,seen){
  seen=seen||new Set();
  if(!a||seen.has(a.id))return false;
  seen.add(a.id);
  return (a.deps||[]).some(d=>d.id===b.id||dependsOn(IDX.get(d.id),b,seen));
}
function inSubtree(root,id){let f=false;walk(root,x=>{if(x.id===id)f=true});return f}
function connect(srcId,dstId){
  const src=IDX.get(srcId), dst=IDX.get(dstId);
  if(!src||!dst||src===dst||dst._d===0)return;
  if(inSubtree(src,dst.id)||inSubtree(dst,src.id)){
    flash(T("plugin_mindmap_pill_link_kin","Un point ne peut pas dépendre de sa propre branche"));return;
  }
  if((dst.deps||[]).some(d=>d.id===srcId)){
    flash(T("plugin_mindmap_pill_link_exists","Ce lien existe déjà"));return;
  }
  if(dependsOn(src,dst)){
    flash(T("plugin_mindmap_pill_link_cycle","Lien refusé : il créerait une dépendance circulaire"));return;
  }
  dst.deps=dst.deps||[];dst.deps.push({id:srcId});
  IDX=index();commit(H("link"));
  if(S.sel===dst.id)select(dst.id);else render();
  flash(T("plugin_mindmap_pill_linked","{a} → {b}").replace("{a}",firstLine(src)).replace("{b}",firstLine(dst)),
        {keys:"Ctrl Z",run:undo});
}

/* ============================================================
   MENU CONTEXTUEL
   Une surface unique pour quatre cibles (point, phase, trait, fond).
   Les libellés sont exactement ceux de la feuille de raccourcis et de
   la barre d'outils : un seul vocabulaire pour toute l'interface.
   ============================================================ */
const CTX={items:[],cur:-1,open:false};
function closeMenu(){
  if(!CTX.open)return;
  CTX.open=false;CTX.items=[];CTX.cur=-1;
  $("ctx").classList.remove("open");$("ctx").innerHTML="";
}
function openMenu(x,y,spec){
  closeMenu();
  const el=$("ctx");
  const tone=spec.color||accentc();
  el.style.borderLeftColor=tone;
  el.style.setProperty("--ctx-accent",tone);
  let html="";
  if(spec.kind||spec.name){
    html+=`<div class="ctx-head">${spec.kind?`<div class="ctx-kind">${esc(spec.kind)}</div>`:""}`+
          `${spec.name?`<div class="ctx-name">${esc(spec.name)}</div>`:""}</div>`;
  }
  (spec.strips||[]).forEach(st=>{
    html+=`<div class="ctx-strip"><span class="eyebrow">${esc(st.label)}</span>`;
    st.options.forEach((o,i)=>{
      if(st.type==="status")html+=`<button class="swatch${o.on?" on":""}" data-strip="${esc(st.id)}" data-val="${esc(o.value)}" title="${esc(o.title)}"><i style="background:${o.color}"></i></button>`;
      else if(st.type==="color")html+=`<button class="cswatch${o.on?" on":""}" data-strip="${esc(st.id)}" data-val="${esc(o.value)}" style="background:${o.color}" title="${esc(o.title)}"></button>`;
      else html+=`<button class="pchip${o.on?" on":""}" data-strip="${esc(st.id)}" data-val="${esc(o.value)}" title="${esc(o.title)}">${esc(o.label)}</button>`;
    });
    html+=`</div>`;
  });
  CTX.items=[];
  (spec.items||[]).forEach(it=>{
    if(it===null){html+=`<div class="ctx-sep"></div>`;return}
    const i=CTX.items.length;CTX.items.push(it);
    html+=`<button class="ctx-item${it.danger?" danger":""}" data-i="${i}"${it.disabled?" disabled":""}>`+
          `<span>${esc(it.label)}</span>${it.keys?`<span class="key">${esc(it.keys)}</span>`:""}</button>`;
  });
  el.innerHTML=html;
  el.classList.add("open");
  // repositionnement après mesure : le menu reste toujours entier à l'écran
  const r=el.getBoundingClientRect();
  const px=Math.min(x,innerWidth-r.width-8), py=Math.min(y,innerHeight-r.height-8);
  el.style.left=Math.max(8,px)+"px";el.style.top=Math.max(8,py)+"px";
  CTX.open=true;CTX.cur=-1;
  el.focus({preventScroll:true});
}
$("ctx").addEventListener("click",e=>{
  const strip=e.target.closest("[data-strip]");
  if(strip){
    const spec=CTX.spec;if(!spec)return;
    const st=(spec.strips||[]).find(s=>s.id===strip.dataset.strip);
    if(st){st.run(strip.dataset.val);closeMenu()}
    return;
  }
  const b=e.target.closest(".ctx-item");if(!b||b.disabled)return;
  const it=CTX.items[+b.dataset.i];closeMenu();if(it&&it.run)it.run();
});
$("ctx").addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeMenu();canvas.focus();e.preventDefault();return}
  const nodes=[...$("ctx").querySelectorAll(".ctx-item:not(:disabled)")];
  if(!nodes.length)return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    const d=e.key==="ArrowDown"?1:-1;
    CTX.cur=(CTX.cur+d+nodes.length+(CTX.cur<0&&d<0?1:0))%nodes.length;
    nodes.forEach(n=>n.classList.remove("cur"));
    nodes[CTX.cur].classList.add("cur");nodes[CTX.cur].scrollIntoView({block:"nearest"});
  }else if(e.key==="Enter"||e.key===" "){
    e.preventDefault();if(CTX.cur>=0)nodes[CTX.cur].click();
  }
});
addEventListener("pointerdown",e=>{if(CTX.open&&!e.target.closest("#ctx"))closeMenu()},true);

function statusStrip(n){
  return {id:"stat",type:"status",label:T("plugin_mindmap_legend_state","État"),
    options:STAT_ORDER.map(k=>({value:k,color:statColor(k),on:(n.stat||"todo")===k,title:STAT[k].l})),
    run:v=>{setField(n,"stat",v);if(S.sel===n.id)select(n.id)}};
}
function prioStrip(n){
  const vals=["P0","P1","P2",""];
  return {id:"prio",type:"chip",label:T("plugin_mindmap_legend_priority","Priorité"),
    options:vals.map(v=>({value:v,label:v||"—",on:(n.prio||"")===v,title:v||T("plugin_mindmap_none_option","—")})),
    run:v=>{setField(n,"prio",v||null);if(S.sel===n.id)select(n.id)}};
}
function colorStrip(n){
  return {id:"color",type:"color",label:T("plugin_mindmap_field_color","Couleur"),
    options:PALETTE.map(c=>({value:c,color:c,on:(n.color||"").toLowerCase()===c.toLowerCase(),title:c})),
    run:v=>{setField(n,"color",v);if(S.sel===n.id)select(n.id);else render()}};
}

function menuForNode(n,x,y){
  const editable=!S.pres;
  const isPhase=n._d===1, isRoot=n._d===0;
  const ref=(n.refs||[]).find(r=>r.kind==="task");
  const folded=S.folded.has(n.id), hasKids=(n.children||[]).length>0;
  const spec={color:colorOf(n),name:firstLine(n),
    kind:isRoot?T("plugin_mindmap_kind_root","Racine"):isPhase?T("plugin_mindmap_phase_word","Phase"):pathOf(n),
    strips:[],items:[]};
  if(!editable){
    if(ref)spec.items.push({label:T("plugin_mindmap_task_open","Ouvrir la tâche"),run:()=>trk.revealTask(ref.id)});
    if(hasKids)spec.items.push({label:folded?T("plugin_mindmap_act_unfold","Déplier"):T("plugin_mindmap_act_fold","Replier"),keys:"E",run:()=>toggleFold(n)});
    spec.items.push({label:T("plugin_mindmap_recenter","Recentrer"),keys:"0",run:fit});
    return openMenuWith(spec,x,y);
  }
  if(isPhase)spec.strips.push(colorStrip(n));
  if(!isRoot&&!isPhase){spec.strips.push(statusStrip(n));spec.strips.push(prioStrip(n))}

  spec.items.push({label:isRoot?T("plugin_mindmap_act_add_phase","Nouvelle phase"):T("plugin_mindmap_act_add_child","Ajouter un sous-point"),
    keys:"Tab",run:()=>addNode(n)});
  if(!isRoot)spec.items.push({label:T("plugin_mindmap_act_add_sibling","Ajouter un point voisin"),keys:K("enter"),
    run:()=>addNode(n._p,n._p.children.indexOf(n))});
  if(isPhase)spec.items.push({label:T("plugin_mindmap_act_attach_task","Attribuer une tâche…"),
    run:()=>{select(n.id);$("iPhaseTaskSearch").focus()}});
  if(!isRoot&&!isPhase)spec.items.push({label:T("plugin_mindmap_act_connect","Relier à…"),
    keys:"Alt "+K("drag"),run:()=>armConnect(n.id)});
  if(!isRoot)spec.items.push({label:T("plugin_mindmap_act_duplicate","Dupliquer"),keys:"Ctrl D",run:()=>duplicateNode(n)});

  spec.items.push(null);
  spec.items.push({label:T("plugin_mindmap_act_rename","Renommer"),keys:"F2",run:()=>{select(n.id);$("iLabel").focus();$("iLabel").select()}});
  if(hasKids)spec.items.push({label:folded?T("plugin_mindmap_act_unfold","Déplier"):T("plugin_mindmap_act_fold","Replier"),keys:"E",run:()=>toggleFold(n)});
  if(isPhase)spec.items.push({label:n.side==="L"?T("plugin_mindmap_act_side_right","Basculer à droite"):T("plugin_mindmap_act_side_left","Basculer à gauche"),
    run:()=>{n.side=n.side==="L"?"R":"L";commit(H("move"));render()}});
  if(!isRoot){
    spec.items.push({label:T("plugin_mindmap_move_up","Monter"),disabled:n._p.children.indexOf(n)===0,run:()=>moveNode(n,-1)});
    spec.items.push({label:T("plugin_mindmap_move_down","Descendre"),disabled:n._p.children.indexOf(n)===n._p.children.length-1,run:()=>moveNode(n,1)});
  }
  if(ref)spec.items.push({label:T("plugin_mindmap_task_open","Ouvrir la tâche"),run:()=>trk.revealTask(ref.id)});

  if(!isRoot){
    spec.items.push(null);
    spec.items.push({label:isPhase?T("plugin_mindmap_act_delete_phase","Supprimer la phase"):T("plugin_mindmap_delete","Supprimer"),
      keys:K("del"),danger:true,run:()=>deleteNode(n)});
  }
  openMenuWith(spec,x,y);
}
function menuForLink(key,x,y){
  const isDep=key.startsWith("d:");
  let name="",color=accentc();
  if(isDep){const[o,i]=key.slice(2).split("|");
    name=firstLine(IDX.get(i))+"  →  "+firstLine(IDX.get(o));color=colorOf(IDX.get(i)||DATA)}
  else{const n=IDX.get(key.slice(2));
    name=(n._d===1?T("plugin_mindmap_link_bus","Axe central"):firstLine(n._p))+"  →  "+firstLine(n);color=colorOf(n)}
  const spec={color,name,kind:isDep?T("plugin_mindmap_link_dep","Dépendance"):T("plugin_mindmap_link_link","Liaison"),items:[]};
  spec.items.push({label:T("plugin_mindmap_act_shape_link","Régler le tracé…"),run:()=>selectLink(key)});
  spec.items.push({label:T("plugin_mindmap_act_auto_anchor","Accroches automatiques"),run:()=>{
    S.link=key;const d=curLink();if(!d)return;
    delete d.from;delete d.to;delete d.bow;delete d.busDy;
    S.link=null;commit(H("link"));render();}});
  if(isDep){
    spec.items.push(null);
    spec.items.push({label:T("plugin_mindmap_act_delete_link","Supprimer le lien"),keys:K("del"),danger:true,
      run:()=>{const[o,i]=key.slice(2).split("|");const own=IDX.get(o);if(!own)return;
        own.deps=(own.deps||[]).filter(d=>d.id!==i);
        S.link=null;$("lnk").classList.remove("open");commit(H("link"));render();
        flash(T("plugin_mindmap_pill_link_removed","Lien supprimé"),{keys:"Ctrl Z",run:undo})}});
  }
  openMenuWith(spec,x,y);
}
function menuForCanvas(x,y){
  const spec={color:accentc(),kind:null,name:null,items:[]};
  if(!S.pres){
    spec.items.push({label:T("plugin_mindmap_act_add_phase","Nouvelle phase"),keys:"Ctrl "+K("enter"),run:()=>addNode(DATA)});
    spec.items.push(null);
  }
  spec.items.push({label:T("plugin_mindmap_recenter","Recentrer"),keys:"0",run:fit});
  spec.items.push({label:S.folded.size?T("plugin_mindmap_act_unfold_all","Tout déplier"):T("plugin_mindmap_act_fold_all","Tout replier"),keys:"E",run:foldAll});
  if(!S.pres){
    spec.items.push({label:T("plugin_mindmap_auto_layout","Disposition automatique"),run:autoLayout});
    spec.items.push(null);
    spec.items.push({label:T("plugin_mindmap_undo","Annuler"),keys:"Ctrl Z",disabled:!HIST.past.length,run:undo});
    spec.items.push({label:T("plugin_mindmap_redo","Rétablir"),keys:"Ctrl "+K("shift")+" Z",disabled:!HIST.future.length,run:redo});
  }
  openMenuWith(spec,x,y);
}
function openMenuWith(spec,x,y){CTX.spec=spec;openMenu(x,y,spec)}

/* ============================================================
   INTERACTIONS POINTEUR — un seul gestionnaire.
   La cible est relevée au pointerdown (fiable) : après un
   setPointerCapture, l'événement click est réattribué à l'élément
   capteur et ne désigne plus la carte cliquée.
   ============================================================ */
let nd=null,hd=null,rd=null,pan=null,press=null,wire=null,lastTap={id:null,t:0};
const toScene=e=>{const r=canvas.getBoundingClientRect();
  return{x:(e.clientX-r.left-S.vx)/S.k,y:(e.clientY-r.top-S.vy)/S.k}};
function exitEdit(){S.sel=null;S.link=null;
  $("insp").classList.remove("open");$("lnk").classList.remove("open");render()}

function hitOf(t){
  const cl=s=>t.closest?t.closest(s):null;
  const h=cl("[data-h]"), fo=cl("[data-fold]"), rz=cl("[data-rz]"), cn=cl("[data-cn]"),
        g=cl(".nd"), dl=cl("[data-link]"), tl=cl("[data-tlink]");
  return {kind:h?"handle":cn?"connect":fo?"fold":rz?"resize":g?"node":dl?"dep":tl?"tree":"bg",
    id:cn?cn.dataset.cn:fo?fo.dataset.fold:rz?rz.dataset.rz:g?g.dataset.id:dl?dl.dataset.link:tl?("t:"+tl.dataset.tlink):null,
    end:h?h.dataset.h:null};
}
/* « Relier à… » sans glisser : on arme la source, le clic suivant désigne la
   cible. Même effet qu'Alt + glisser, pour qui préfère deux clics nets. */
function armConnect(id){
  S.armFrom=id;canvas.classList.add("wiring");
  flash(T("plugin_mindmap_pill_pick_target","Cliquez le point qui dépend de « {n} »").replace("{n}",firstLine(IDX.get(id))),
        {label:T("plugin_mindmap_cancel","Abandonner"),keys:K("esc"),run:cancelConnect});
}
function cancelConnect(){S.armFrom=null;canvas.classList.remove("wiring")}
function startWire(id,e){
  const n=IDX.get(id);if(!n)return;
  const dir=(branchOf(n)?.side==="L")?-1:1;
  wire={from:id,ax:dir>0?n.x+n.w:n.x,ay:n.y,over:null};
  canvas.classList.add("wiring");
  drawWire(toScene(e));
}
function drawWire(p){
  const g=$("ghost");if(!g||!wire)return;
  const A={x:wire.ax,y:wire.ay,nx:wire.ax>p.x?-1:1,ny:0}, B={x:p.x,y:p.y,nx:wire.ax>p.x?1:-1,ny:0};
  const col=colorOf(IDX.get(wire.from)||DATA);
  g.innerHTML=`<path d="${curve(A,B,1)}" stroke="${col}" stroke-width="1.8" stroke-dasharray="6 4" fill="none" marker-end="url(#ar)"/>
    <circle cx="${p.x}" cy="${p.y}" r="4" fill="${col}"/>`;
}
canvas.addEventListener("pointerdown",e=>{
  if(e.button)return;
  closeMenu();closePops();
  const t=hitOf(e.target);
  press={x:e.clientX,y:e.clientY,moved:false,kind:t.kind,id:t.id,end:t.end};
  const edit=!S.pres&&S.view==="map";
  if(edit&&t.kind==="connect"){startWire(t.id,e)}
  else if(edit&&t.kind==="node"&&e.altKey){const n=IDX.get(t.id);if(n&&n._d>1)startWire(t.id,e)}
  else if(edit&&t.kind==="resize"){const n=IDX.get(t.id);if(n)rd={n,sx:e.clientX,sy:e.clientY,w0:n.w,h0:n.h}}
  else if(edit&&t.kind==="handle"&&S.link)hd={end:t.end};
  else if(edit&&t.kind==="node"){const n=IDX.get(t.id);
    if(n&&n._d>0)nd={n,sx:e.clientX,sy:e.clientY,x0:n.dx||0,y0:n.dy||0}}
  if(!rd&&!hd&&!nd&&!wire){pan={x:e.clientX-S.vx,y:e.clientY-S.vy};canvas.classList.add("drag")}
  try{canvas.setPointerCapture(e.pointerId)}catch(_){}
});

canvas.addEventListener("pointermove",e=>{
  if(!press)return;
  if(Math.abs(e.clientX-press.x)+Math.abs(e.clientY-press.y)>4)press.moved=true;
  if(wire){
    const p=toScene(e);drawWire(p);
    const el=document.elementFromPoint(e.clientX,e.clientY);
    const g=el&&el.closest?el.closest(".nd"):null;
    wire.over=g&&g.dataset.id!==wire.from?g.dataset.id:null;
    return;
  }
  if(rd){const n=rd.n;
    n.w0=Math.max(150,Math.min(540,rd.w0+(e.clientX-rd.sx)/S.k));
    n.h0=Math.max(42,rd.h0+(e.clientY-rd.sy)/S.k);render();return}
  if(hd&&S.link){
    const p=toScene(e);
    if(S.link.startsWith("d:")){
      const[o,i]=S.link.slice(2).split("|"), own=IDX.get(o);
      const d=(own&&own.deps||[]).find(x=>x.id===i);if(!d)return;
      d[hd.end]=nearestAnchor(hd.end==="from"?IDX.get(i):own,p.x,p.y);
    }else{
      const n=IDX.get(S.link.slice(2));if(!n)return;n.link=n.link||{};
      if(hd.end==="to")n.link.to=nearestAnchor(n,p.x,p.y);
      else if(n._d>=2)n.link.from=nearestAnchor(n._p,p.x,p.y);
      else n.link.busDy=Math.max(-200,Math.min(200,p.y-n.y));
    }
    render();return;
  }
  if(nd){nd.n.dx=nd.x0+(e.clientX-nd.sx)/S.k;nd.n.dy=nd.y0+(e.clientY-nd.sy)/S.k;render();return}
  if(pan){S.vx=e.clientX-pan.x;S.vy=e.clientY-pan.y;applyView()}
});

function finish(e){
  const p=press, wasWire=wire, wasDrag=nd, wasResize=rd, wasHandle=hd;
  press=null;nd=hd=rd=pan=wire=null;
  canvas.classList.remove("drag","wiring");
  try{if(e&&e.pointerId!=null&&canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId)}catch(_){}
  if(wasWire){
    const g=$("ghost");if(g)g.innerHTML="";
    if(wasWire.over)connect(wasWire.from,wasWire.over);else render();
    return;
  }
  if(p&&p.moved){
    if(wasDrag)commit(H("move"));
    else if(wasResize)commit(H("size"));
    else if(wasHandle)commit(H("link"));
    return;
  }
  if(!p)return;
  // « Relier à… » armé depuis le menu : le clic suivant désigne la cible.
  if(S.armFrom){
    const from=S.armFrom;cancelConnect();
    if(p.kind==="node"||p.kind==="resize"||p.kind==="connect")connect(from,p.id);
    return;
  }
  if(S.pres)return;
  if(p.kind==="handle"||p.kind==="connect")return;
  if(p.kind==="fold"){S.folded.delete(p.id);render();scheduleSave();return}
  if(p.kind==="node"||p.kind==="resize"){
    const now=Date.now();
    if(lastTap.id===p.id&&now-lastTap.t<400&&S.view==="map"){
      lastTap={id:null,t:0};const n=IDX.get(p.id);
      if(n&&(n.children||[]).length){toggleFold(n);return}
    }
    lastTap={id:p.id,t:now};select(p.id);return;
  }
  if(p.kind==="dep"||p.kind==="tree"){selectLink(p.id);return}
  exitEdit();
}
canvas.addEventListener("pointerup",finish);
canvas.addEventListener("pointercancel",finish);
addEventListener("blur",()=>{press=null;nd=hd=rd=pan=wire=null;canvas.classList.remove("drag","wiring")});

canvas.addEventListener("contextmenu",e=>{
  e.preventDefault();
  const t=hitOf(e.target);
  if(t.kind==="node"||t.kind==="resize"||t.kind==="connect"||t.kind==="fold"){
    const n=IDX.get(t.id);if(!n)return;
    if(!S.pres&&n._d>0)select(n.id);
    menuForNode(n,e.clientX,e.clientY);
  }else if((t.kind==="dep"||t.kind==="tree")&&!S.pres){
    menuForLink(t.id,e.clientX,e.clientY);
  }else{
    menuForCanvas(e.clientX,e.clientY);
  }
});

canvas.addEventListener("wheel",e=>{e.preventDefault();
  const r=canvas.getBoundingClientRect(),mx=e.clientX-r.left,my=e.clientY-r.top;
  const k=Math.min(2.2,Math.max(.28,S.k*(e.deltaY<0?1.12:.89)));
  S.vx=mx-(mx-S.vx)*k/S.k;S.vy=my-(my-S.vy)*k/S.k;S.k=k;applyView()},{passive:false});

/* ============================================================
   CLAVIER
   Rien ici qui n'existe aussi dans le menu contextuel : ce sont deux
   accès au même vocabulaire, et la feuille « ? » les récapitule.
   ============================================================ */
function isTyping(){
  const a=document.activeElement;
  return !!a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA"||a.tagName==="SELECT"||a.isContentEditable);
}
function anyModalOpen(){return $("modal").classList.contains("open")||$("help").classList.contains("open")}
function closeModals(){$("modal").classList.remove("open");$("help").classList.remove("open")}
/* Navigation : ↑↓ entre voisins, ←→ vers le parent ou le premier enfant.
   Les branches de gauche sont symétriques — ← y descend, → y remonte. */
function navigate(dir){
  const n=IDX.get(S.sel);
  if(!n){const first=(DATA.children||[])[0];if(first)focusNode(first.id);return}
  const flip=(branchOf(n)?.side==="L")?-1:1;
  if(dir==="up"||dir==="down"){
    if(!n._p)return;
    const a=n._p.children.filter(visible), i=a.indexOf(n);
    const j=i+(dir==="down"?1:-1);
    if(j>=0&&j<a.length)focusNode(a[j].id);
    return;
  }
  const outward=(dir==="right"?1:-1)*flip;
  if(outward>0){
    S.folded.delete(n.id);
    const c=kids(n)[0];if(c)focusNode(c.id);
  }else if(n._p&&n._p._d>0)focusNode(n._p.id);
}
function focusNode(id){select(id);const n=IDX.get(id);if(n)centerOn(n)}

addEventListener("keydown",e=>{
  const mod=e.ctrlKey||e.metaKey;

  if(e.key==="Escape"){
    if(CTX.open){closeMenu();return}
    if(S.armFrom){cancelConnect();hidePill();return}
    if(anyModalOpen()){closeModals();return}
    if(document.querySelector(".pop.open")){closePops();return}
    if(document.activeElement===$("qFind")){clearSearch();$("qFind").blur();return}
    hidePill();exitEdit();
    if(S.full)setFull(false);
    return;
  }
  if(mod&&(e.key==="z"||e.key==="Z")&&!isTyping()){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&(e.key==="y"||e.key==="Y")&&!isTyping()){e.preventDefault();redo();return}
  if(mod&&(e.key==="f"||e.key==="F")){e.preventDefault();$("qFind").focus();$("qFind").select();return}
  if(mod&&e.key==="Enter"&&!S.pres){e.preventDefault();addNode(DATA);return}
  if(mod&&(e.key==="s"||e.key==="S")){e.preventDefault();flushSave();return}

  if(document.activeElement===$("qFind")){
    if(e.key==="Enter"){e.preventDefault();stepSearch(e.shiftKey?-1:1)}
    return;
  }
  if(e.key==="F3"){e.preventDefault();stepSearch(e.shiftKey?-1:1);return}
  if(isTyping()){
    if(e.key==="Escape")document.activeElement.blur();
    return;
  }
  if(anyModalOpen())return;

  const n=IDX.get(S.sel);
  switch(e.key){
    case "Tab":
      if(S.pres)return;
      e.preventDefault();addNode(n||DATA);return;
    case "Enter":
      if(S.pres)return;
      e.preventDefault();
      if(n&&n._p)addNode(n._p,n._p.children.indexOf(n));else addNode(DATA);
      return;
    case "Delete":case "Backspace":
      if(S.pres)return;
      e.preventDefault();
      if(S.link&&S.link.startsWith("d:")){
        const[o,i]=S.link.slice(2).split("|");const own=IDX.get(o);
        if(own){own.deps=(own.deps||[]).filter(d=>d.id!==i);S.link=null;
          $("lnk").classList.remove("open");commit(H("link"));render();
          flash(T("plugin_mindmap_pill_link_removed","Lien supprimé"),{keys:"Ctrl Z",run:undo})}
        return;
      }
      if(n)deleteNode(n);
      return;
    case "F2":
      if(S.pres||!n)return;
      e.preventDefault();select(n.id);$("iLabel").focus();$("iLabel").select();return;
    case "ArrowUp":e.preventDefault();navigate("up");return;
    case "ArrowDown":e.preventDefault();navigate("down");return;
    case "ArrowLeft":e.preventDefault();navigate("left");return;
    case "ArrowRight":e.preventDefault();navigate("right");return;
    case "0":e.preventDefault();fit();return;
    case "1":e.preventDefault();S.k=1;applyView();if(n)centerOn(n);return;
    case "+":case "=":e.preventDefault();zoomBy(1.15);return;
    case "-":e.preventDefault();zoomBy(.87);return;
    case "?":e.preventDefault();openHelp();return;
  }
  switch(e.key.toLowerCase()){
    case "d":if(mod){e.preventDefault();if(n)duplicateNode(n);return}
      e.preventDefault();setDeps(!S.deps);return;
    case "e":e.preventDefault();if(n&&(n.children||[]).length)toggleFold(n);else foldAll();return;
    case "v":e.preventDefault();setView(S.view==="map"?"flow":"map");return;
    case "p":e.preventDefault();setPres(!S.pres);return;
    case "s":e.preventDefault();openSummary();return;
  }
});
/* Ctrl+D est capté avant la table ci-dessus (le navigateur le réserve au
   marque-page), d'où ce doublon volontaire en amont. */
addEventListener("keydown",e=>{
  if((e.ctrlKey||e.metaKey)&&(e.key==="d"||e.key==="D")&&!isTyping()){
    e.preventDefault();const n=IDX.get(S.sel);if(n)duplicateNode(n);
  }
},true);

/* ============================================================
   RECHERCHE
   ============================================================ */
function runSearch(q,announce){
  const needle=String(q||"").trim().toLowerCase();
  S.hits=new Set();S.hitList=[];
  if(needle){
    walk(DATA,n=>{
      if(n._d===0)return;
      const hay=(n.label+" "+(n.owner||"")+" "+(n.note||"")).toLowerCase();
      if(hay.includes(needle)){S.hits.add(n.id);S.hitList.push(n.id)}
    });
  }
  S.hitAt=-1;
  const wrapEl=$("findWrap");
  wrapEl.classList.toggle("miss",!!needle&&!S.hitList.length);
  $("qCount").textContent=needle?(S.hitList.length?"0/"+S.hitList.length:T("plugin_mindmap_search_none","0")):"";
  render();
  if(announce&&needle&&S.hitList.length)stepSearch(1);
}
function stepSearch(d){
  if(!S.hitList.length)return;
  S.hitAt=(S.hitAt+d+S.hitList.length)%S.hitList.length;
  const id=S.hitList[S.hitAt];
  $("qCount").textContent=(S.hitAt+1)+"/"+S.hitList.length;
  // un point masqué par un pli ou un filtre doit redevenir visible pour être atteint
  let c=IDX.get(id);while(c&&c._p){if(S.folded.has(c._p.id))S.folded.delete(c._p.id);c=c._p}
  select(id);const n=IDX.get(id);if(n)centerOn(n);
}
function clearSearch(){$("qFind").value="";runSearch("",false)}
let findTimer=null;
$("qFind").addEventListener("input",e=>{
  clearTimeout(findTimer);
  const v=e.target.value;
  findTimer=setTimeout(()=>runSearch(v,false),120);
});

/* ============================================================
   INSPECTEUR
   ============================================================ */
function pathOf(n){const p=[];let c=n;while(c){p.unshift(firstLine(c));c=c._p}
  return p.slice(1,-1).join(" › ")||T("plugin_mindmap_root_label","Racine")}
function select(id){
  S.sel=id;S.link=null;$("lnk").classList.remove("open");
  const n=IDX.get(id);if(!n)return;
  const isPhase=n._d===1, isRoot=n._d===0;
  $("insp").classList.add("open");
  $("iSpine").style.background=colorOf(n);
  $("iPath").textContent=isRoot?T("plugin_mindmap_kind_root","Racine"):isPhase?T("plugin_mindmap_phase_word","Phase"):pathOf(n);
  $("iName").textContent=firstLine(n);
  $("iLabel").value=n.label;$("iPrio").value=n.prio||"";
  $("iStat").value=n.stat||"todo";$("iOwner").value=n.owner||"";$("iNote").value=n.note||"";
  const sub=new Set();walk(n,x=>sub.add(x.id));
  $("iDeps").innerHTML=[...IDX.values()].filter(x=>x._d>0&&!sub.has(x.id))
    .map(x=>`<label><input type="checkbox" value="${x.id}" ${(n.deps||[]).some(d=>d.id===x.id)?"checked":""}>
      <span class="grow">${esc(firstLine(x))}</span></label>`).join("")
    ||`<div class="hint" style="padding:6px">${esc(T("plugin_mindmap_deps_none","Aucun autre point à relier"))}</div>`;
  $("iColorRow").style.display=isPhase?"":"none";
  if(isPhase)$("iColorSwatches").innerHTML=PALETTE.map(c=>
    `<button class="cswatch${(n.color||"").toLowerCase()===c.toLowerCase()?" on":""}" data-col="${c}" style="background:${c}" title="${c}"></button>`).join("");
  $("iMetaRow").style.display=isRoot||isPhase?"none":"";
  $("secLinks").style.display=isRoot?"none":"";
  $("iDepsBlock").style.display=isRoot||isPhase?"none":"";
  $("iPhaseTasks").style.display=isPhase?"":"none";
  $("iTaskLinkBlock").style.display=isRoot||isPhase?"none":"";
  $("aDel").disabled=isRoot;$("aUp").disabled=isRoot;$("aDown").disabled=isRoot;
  if(isPhase){$("iPhaseTaskSearch").value="";renderPhaseTasks(n)}else if(!isRoot)renderTaskLink(n);
  render();
}
function cur(){return IDX.get(S.sel)}
$("iLabel").addEventListener("input",()=>{const n=cur();if(!n)return;
  n.label=$("iLabel").value;$("iName").textContent=firstLine(n);
  if(n._d===1)syncPhaseUI();
  commit(H("edit"),"label:"+n.id);render()});
$("iColorSwatches").addEventListener("click",e=>{
  const b=e.target.closest("[data-col]");if(!b)return;
  const n=cur();if(!n||n._d!==1)return;
  setField(n,"color",b.dataset.col,"color:"+n.id);select(n.id);
});
const bind=(el,fn,key)=>$(el).addEventListener("input",()=>{const n=cur();if(!n)return;fn(n);
  commit(H("edit"),key+":"+n.id);render()});
bind("iPrio",n=>{const v=$("iPrio").value;if(v)n.prio=v;else delete n.prio},"prio");
bind("iStat",n=>n.stat=$("iStat").value,"stat");
bind("iOwner",n=>{const v=$("iOwner").value;if(v)n.owner=v;else delete n.owner},"owner");
bind("iNote",n=>{const v=$("iNote").value;if(v)n.note=v;else delete n.note},"note");
$("iDeps").addEventListener("change",()=>{const n=cur();if(!n)return;
  const old=n.deps||[];
  n.deps=[...$("iDeps").querySelectorAll("input:checked")].map(i=>old.find(d=>d.id===i.value)||{id:i.value});
  IDX=index();commit(H("link"));render()});
$("iClose").onclick=()=>exitEdit();
$("aUp").onclick=()=>moveNode(cur(),-1);
$("aDown").onclick=()=>moveNode(cur(),1);
$("aSize").onclick=()=>{const n=cur();if(!n)return;delete n.w0;delete n.h0;commit(H("size"));render()};
$("aDel").onclick=()=>deleteNode(cur());

/* ---------- lien vers une tâche (lecture seule) ---------- */
let TASKS=new Map();
function updateTasks(){
  TASKS=new Map(((trk&&trk.tasks())||[]).map(t=>[t.id,t]));
  render();
  const n=cur();if(n){if(n._d===1)renderPhaseTasks(n);else if(n._d>1)renderTaskLink(n)}
}
function renderTaskLink(n){
  const ref=(n.refs||[]).find(r=>r.kind==="task");
  const linked=$("iTaskLinked"), search=$("iTaskSearchWrap");
  if(ref){
    linked.style.display="";search.style.display="none";
    const task=TASKS.get(ref.id);
    $("iTaskLinkedInfo").innerHTML=task
      ?`<b>${esc(task.titre)}</b><span class="hint">${esc(task.statutLabel)}${task.minutes?" · "+task.minutes+" "+esc(T("plugin_mindmap_minutes_suffix","min")):""}</span>`
      :`<span class="warn">${esc(T("plugin_mindmap_task_missing","Tâche introuvable"))}</span>`;
  }else{
    linked.style.display="none";search.style.display="";
    $("iTaskSearch").value="";renderTaskSearch("");
  }
}
function renderTaskSearch(q){
  const needle=q.trim().toLowerCase();
  const list=[...TASKS.values()].filter(t=>!needle||t.titre.toLowerCase().includes(needle)).slice(0,30);
  $("iTaskList").innerHTML=list.length?list.map(t=>
    `<label data-task="${t.id}"><span class="grow">${esc(t.titre)}</span><span class="chip">${esc(t.projet)}</span></label>`
  ).join(""):`<div class="hint" style="padding:6px">${esc(T("plugin_mindmap_task_none","Aucune tâche"))}</div>`;
}
$("iTaskSearch").addEventListener("input",e=>renderTaskSearch(e.target.value));
$("iTaskList").addEventListener("click",e=>{
  const row=e.target.closest("[data-task]");if(!row)return;
  const n=cur();if(!n)return;
  n.refs=[{kind:"task",id:row.dataset.task}];commit(H("task"));render();renderTaskLink(n);
});
$("iTaskOpen").onclick=()=>{const n=cur();const ref=n&&(n.refs||[]).find(r=>r.kind==="task");if(ref)trk.revealTask(ref.id)};
$("iTaskUnlink").onclick=()=>{const n=cur();if(!n)return;n.refs=[];commit(H("task"));render();renderTaskLink(n)};

/* ---------- attribution de tâches du backlog à une phase ----------
   Une phase se peuple en choisissant des tâches déjà créées ailleurs dans
   l'appli (jamais créées ici : capacité "tasks:read" seulement). Chaque choix
   crée un point enfant qui hérite la priorité et l'état de la tâche ; toute
   tâche déjà attribuée disparaît des résultats de recherche. */
function mapPrio(p){return p==="critique"?"P0":p==="haute"?"P1":"P2"}
function mapStat(s){return(s==="done"||s==="termine")?"done":(s==="todo"||s==="analyser")?"todo":"doing"}
function attachedTaskIds(){return new Set(collectRefs().filter(r=>r.kind==="task").map(r=>r.id))}
function attachTaskToPhase(phase,task){
  const n={id:uid(),label:task.titre,prio:mapPrio(task.priorite),stat:mapStat(task.statut),deps:[],children:[],refs:[{kind:"task",id:task.id}]};
  phase.children=phase.children||[];phase.children.push(n);
  S.folded.delete(phase.id);IDX=index();
  commit(H("task"));
  renderPhaseTasks(phase);render();
  flash(T("plugin_mindmap_pill_added","Ajouté : {n}").replace("{n}",task.titre),{keys:"Ctrl Z",run:undo});
}
function renderPhaseTasks(phase){
  const items=(phase.children||[]).map(c=>({node:c,ref:(c.refs||[]).find(r=>r.kind==="task")})).filter(x=>x.ref);
  $("iPhaseTaskList").innerHTML=items.length?items.map(({node,ref})=>{
    const task=TASKS.get(ref.id);
    const label=task?esc(task.titre):`<span class="warn" style="color:var(--danger)">${esc(T("plugin_mindmap_task_missing","Tâche introuvable"))}</span>`;
    const chip=node.prio?`<span class="chip">${node.prio}</span>`:"";
    const title=task?task.titre:"";
    return `<label style="cursor:default"><span class="grow">${label}</span>${chip}
      <button class="x" data-detach="${node.id}"
        aria-label="${esc(T('plugin_mindmap_detach_task','Retirer {t}').replace('{t}',title))}"
        title="${esc(T('plugin_mindmap_detach_task','Retirer {t}').replace('{t}',title))}">
        <svg fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" viewBox="0 0 24 24"><use href="#i-x"/></svg></button></label>`;
  }).join(""):`<div class="hint" style="padding:6px">${esc(T("plugin_mindmap_phase_no_tasks","Aucune tâche attribuée"))}</div>`;
  renderPhaseTaskPicker(phase);
}
function renderPhaseTaskPicker(phase){
  const used=attachedTaskIds(), q=($("iPhaseTaskSearch").value||"").trim().toLowerCase();
  const list=[...TASKS.values()].filter(t=>!used.has(t.id)&&(!q||t.titre.toLowerCase().includes(q))).slice(0,30);
  $("iPhaseTaskPicker").innerHTML=list.length?list.map(t=>
    `<label data-pick="${t.id}"><span class="grow">${esc(t.titre)}</span>
      <span class="chip" style="border-color:${t.prioriteColor};color:${t.prioriteColor}">${esc(t.prioriteLabel)}</span></label>`
  ).join(""):`<div class="hint" style="padding:6px">${esc(T(q?"plugin_mindmap_task_none":"plugin_mindmap_backlog_empty",q?"Aucune correspondance":"Backlog vide"))}</div>`;
}
$("iPhaseTaskSearch").addEventListener("input",()=>{const n=cur();if(n&&n._d===1)renderPhaseTaskPicker(n)});
$("iPhaseTaskList").addEventListener("click",e=>{
  const b=e.target.closest("[data-detach]");if(!b)return;
  const n=cur();if(!n||n._d!==1)return;
  n.children=(n.children||[]).filter(c=>c.id!==b.dataset.detach);
  IDX=index();commit(H("task"));renderPhaseTasks(n);render();
  flash(T("plugin_mindmap_pill_detached","Tâche retirée de la phase"),{keys:"Ctrl Z",run:undo});
});
$("iPhaseTaskPicker").addEventListener("click",e=>{
  const row=e.target.closest("[data-pick]");if(!row)return;
  const phase=cur();if(!phase||phase._d!==1)return;
  const task=TASKS.get(row.dataset.pick);if(!task)return;
  attachTaskToPhase(phase,task);
});

/* ---------- panneau de tracé d'un trait ---------- */
function curLink(){
  if(!S.link)return null;
  if(S.link.startsWith("d:")){const[o,i]=S.link.slice(2).split("|");
    return (IDX.get(o)?.deps||[]).find(x=>x.id===i)||null}
  const n=IDX.get(S.link.slice(2));if(!n)return null;n.link=n.link||{};return n.link;
}
function selectLink(key){
  S.link=key;S.sel=null;$("insp").classList.remove("open");
  const d=curLink();if(!d)return;
  let bus=false;
  if(key.startsWith("d:")){const[o,i]=key.slice(2).split("|");
    $("lKind").textContent=T("plugin_mindmap_link_dep","Dépendance");
    $("lTitle").textContent=firstLine(IDX.get(i))+"  →  "+firstLine(IDX.get(o));
  }else{const n=IDX.get(key.slice(2));bus=n._d===1;
    $("lKind").textContent=T("plugin_mindmap_link_link","Liaison");
    $("lTitle").textContent=(bus?T("plugin_mindmap_link_bus","Axe central"):firstLine(n._p))+"  →  "+firstLine(n);}
  $("lDel").style.display=key.startsWith("d:")?"":"none";
  $("lFrom").disabled=bus;
  $("lFrom").value=d.from?d.from.s:"";$("lTo").value=d.to?d.to.s:"";
  $("lBow").value=d.bow==null?1:d.bow;$("lBowV").textContent=(+$("lBow").value).toFixed(1);
  $("lnk").classList.add("open");render();
}
const setEnd=(k,v)=>{const d=curLink();if(!d)return;
  if(!v)delete d[k];else d[k]={s:v,t:d[k]?d[k].t:.5};commit(H("link"),"anchor:"+S.link);render()};
$("lFrom").onchange=e=>setEnd("from",e.target.value);
$("lTo").onchange=e=>setEnd("to",e.target.value);
$("lBow").oninput=e=>{const d=curLink();if(!d)return;d.bow=+e.target.value;
  $("lBowV").textContent=(+e.target.value).toFixed(1);commit(H("link"),"bow:"+S.link);render()};
$("lAuto").onclick=()=>{const d=curLink();if(!d)return;
  delete d.from;delete d.to;delete d.bow;delete d.busDy;commit(H("link"));selectLink(S.link)};
$("lDel").onclick=()=>{if(!S.link||!S.link.startsWith("d:"))return;
  const[o,i]=S.link.slice(2).split("|");const own=IDX.get(o);if(!own)return;
  own.deps=(own.deps||[]).filter(x=>x.id!==i);
  S.link=null;$("lnk").classList.remove("open");commit(H("link"));render();
  flash(T("plugin_mindmap_pill_link_removed","Lien supprimé"),{keys:"Ctrl Z",run:undo})};
$("lClose").onclick=()=>{S.link=null;$("lnk").classList.remove("open");render()};

/* ============================================================
   BARRE D'OUTILS
   ============================================================ */
function closePops(){
  document.querySelectorAll(".pop.open").forEach(p=>p.classList.remove("open"));
  document.querySelectorAll("[aria-haspopup]").forEach(b=>b.setAttribute("aria-expanded","false"));
}
function wirePop(btnId,popId){
  $(btnId).addEventListener("click",e=>{
    e.stopPropagation();
    const p=$(popId), was=p.classList.contains("open");
    closePops();closeMenu();
    if(!was){p.classList.add("open");$(btnId).setAttribute("aria-expanded","true")}
  });
}
wirePop("bFilters","popFilters");wirePop("bDisplay","popDisplay");wirePop("bMore","popMore");
addEventListener("click",e=>{if(!e.target.closest(".pop-host"))closePops()});
$("popFilters").addEventListener("click",e=>{if(e.target.id==="fClear")closePops()});
// L'import garde son menu ouvert : la confirmation en deux temps s'y affiche.
$("popMore").addEventListener("click",e=>{if(e.target.closest(".pop-row")&&!e.target.closest("#bImport"))closePops()});

function setView(v){
  S.view=v;
  $("segMap").classList.toggle("on",v==="map");
  $("segFlow").classList.toggle("on",v==="flow");
  exitEdit();fit();scheduleSave();
}
$("segMap").onclick=()=>setView("map");
$("segFlow").onclick=()=>setView("flow");

function syncFilterBadge(){
  const active=!!(S.prio||S.phase);
  $("bFilters").classList.toggle("on",active);
}
$("fPrio").onchange=e=>{S.prio=e.target.value;syncFilterBadge();render()};
$("fPhase").onchange=e=>{S.phase=e.target.value;syncFilterBadge();render()};
$("fClear").onclick=()=>{S.prio="";S.phase="";$("fPrio").value="";$("fPhase").value="";syncFilterBadge();fit()};

function setDeps(on){S.deps=on;$("cDeps").checked=on;render()}
$("cDeps").onchange=e=>setDeps(e.target.checked);
function foldAll(){
  if(S.folded.size)S.folded.clear();
  else walk(DATA,n=>{if(n._d>=1&&(n.children||[]).length)S.folded.add(n.id)});
  $("cFold").checked=S.folded.size>0;
  fit();scheduleSave();
}
$("cFold").onchange=foldAll;
function setPres(on){
  S.pres=on;document.body.classList.toggle("pres",on);
  $("cPres").checked=on;
  if(on)exitEdit();else render();
}
$("cPres").onchange=e=>setPres(e.target.checked);
/* Le plein écran est un changement de mise en page côté hôte (capacité
   "fullscreen") : ce plugin ne fait que le demander/le relâcher et refléter
   l'état — l'hôte peut aussi le couper, d'où setFullscreen() côté réception. */
function setFullscreen(on){S.full=on;$("cFull").checked=on}
function setFull(on){setFullscreen(on);if(trk)trk.requestFullscreen(on)}
$("cFull").onchange=e=>setFull(e.target.checked);
$("bFit").onclick=()=>{fit();closePops()};
function autoLayout(){
  walk(DATA,n=>{delete n.dx;delete n.dy;delete n.w0;delete n.h0;delete n.link;
    (n.deps||[]).forEach(d=>{delete d.from;delete d.to;delete d.bow})});
  S.link=null;$("lnk").classList.remove("open");
  commit(H("layout"));fit();
  flash(T("plugin_mindmap_pill_layout","Disposition réinitialisée"),{keys:"Ctrl Z",run:undo});
}
$("bReset").onclick=()=>{autoLayout();closePops()};
$("bSort").onclick=()=>{
  IDX=index();const {rank}=ranks();
  walk(DATA,n=>{if(n._d===0||!n.children)return;
    n.children.sort((a,b)=>rank(a.id)-rank(b.id)||(PRO[a.prio]??9)-(PRO[b.prio]??9))});
  commit(H("sort"));fit();closePops();
  flash(T("plugin_mindmap_pill_sorted","Branches triées"),{keys:"Ctrl Z",run:undo});
};
$("bAdd").onclick=()=>addNode(DATA);
$("bUndo").onclick=undo;$("bRedo").onclick=redo;

/* liste de phases du filtre : reconstruite après toute création/suppression/
   renommage de phase, jamais à chaque frame de rendu. */
function syncPhaseUI(){
  const phases=DATA.children||[], sel=$("fPhase"), prev=sel.value;
  sel.innerHTML=`<option value="">${esc(T("plugin_mindmap_phase_all","Toutes phases"))}</option>`+
    phases.map(p=>`<option value="${p.id}">${esc(firstLine(p))}</option>`).join("");
  sel.value=phases.some(p=>p.id===prev)?prev:"";
  S.phase=sel.value;syncFilterBadge();
}

/* ============================================================
   FEUILLE DE RACCOURCIS — un seul vocabulaire, trois accès
   (barre d'outils, clic droit, clavier). Elle reprend aussi les
   repères de lecture, qui n'ont plus besoin d'occuper le canevas
   en permanence.
   ============================================================ */
function keyRow(label,keys){
  return `<div class="krow"><span>${esc(label)}</span><span class="keys">${keys.map(k=>`<span class="key">${esc(k)}</span>`).join("")}</span></div>`;
}
function openHelp(){
  const g=(title,rows)=>`<div class="kgroup"><div class="eyebrow">${esc(title)}</div>${rows.join("")}</div>`;
  let html=`<div class="kgrid">`;
  html+=g(T("plugin_mindmap_help_g_build","Construire"),[
    keyRow(T("plugin_mindmap_act_add_child","Ajouter un sous-point"),["Tab"]),
    keyRow(T("plugin_mindmap_act_add_sibling","Ajouter un point voisin"),[K("enter")]),
    keyRow(T("plugin_mindmap_act_add_phase","Nouvelle phase"),["Ctrl",K("enter")]),
    keyRow(T("plugin_mindmap_act_duplicate","Dupliquer"),["Ctrl","D"]),
    keyRow(T("plugin_mindmap_act_rename","Renommer"),["F2"]),
    keyRow(T("plugin_mindmap_delete","Supprimer"),[K("del")]),
    keyRow(T("plugin_mindmap_act_connect","Relier à…"),["Alt",K("drag")]),
  ]);
  html+=g(T("plugin_mindmap_help_g_history","Historique"),[
    keyRow(T("plugin_mindmap_undo","Annuler"),["Ctrl","Z"]),
    keyRow(T("plugin_mindmap_redo","Rétablir"),["Ctrl",K("shift"),"Z"]),
    keyRow(T("plugin_mindmap_help_save","Enregistrer maintenant"),["Ctrl","S"]),
  ]);
  html+=g(T("plugin_mindmap_help_g_move","Naviguer"),[
    keyRow(T("plugin_mindmap_help_siblings","Point précédent / suivant"),["↑","↓"]),
    keyRow(T("plugin_mindmap_help_updown","Parent / premier sous-point"),["←","→"]),
    keyRow(T("plugin_mindmap_help_find","Rechercher"),["Ctrl","F"]),
    keyRow(T("plugin_mindmap_help_findnext","Occurrence suivante"),[K("enter")]),
  ]);
  html+=g(T("plugin_mindmap_help_g_view","Vue"),[
    keyRow(T("plugin_mindmap_recenter","Recentrer"),["0"]),
    keyRow(T("plugin_mindmap_help_zoom","Zoom avant / arrière"),["+","−"]),
    keyRow(T("plugin_mindmap_help_fold","Replier / déplier"),["E"]),
    keyRow(T("plugin_mindmap_help_switch","Carte ⇄ Flux"),["V"]),
    keyRow(T("plugin_mindmap_disp_deps","Flèches de dépendance"),["D"]),
    keyRow(T("plugin_mindmap_disp_present","Mode présentation"),["P"]),
    keyRow(T("plugin_mindmap_summary","Synthèse"),["S"]),
    keyRow(T("plugin_mindmap_help_title","Raccourcis et repères"),["?"]),
  ]);
  html+=`</div>`;
  html+=`<div class="ph">${esc(T("plugin_mindmap_help_pointer","Au pointeur"))}</div>`;
  html+=`<div class="krow"><span>${esc(T("plugin_mindmap_help_rightclick","Clic droit — le menu s'adapte à ce qui est sous le pointeur : point, phase, trait ou fond de carte."))}</span></div>`;
  html+=`<div class="krow"><span>${esc(T("plugin_mindmap_help_dblclick","Double-clic sur un point — replie ou déplie sa branche."))}</span></div>`;
  html+=`<div class="krow"><span>${esc(T("plugin_mindmap_help_handle","Poignée ronde d'un point sélectionné — tirer vers un autre point crée une dépendance."))}</span></div>`;
  html+=`<div class="krow"><span>${esc(T("plugin_mindmap_help_resize","Carré en bas à droite — redimensionner ; « Taille auto » revient au calcul."))}</span></div>`;

  html+=`<div class="ph">${esc(T("plugin_mindmap_help_key_reading","Repères de lecture"))}</div><div class="kread">`;
  html+=`<div><div class="eyebrow" style="margin-bottom:4px">${esc(T("plugin_mindmap_legend_priority","Priorité"))}</div>
    <i><span class="chip">P0</span> ${esc(T("plugin_mindmap_legend_p0","critique — à lancer maintenant"))}</i>
    <i><span class="chip">P1</span> ${esc(T("plugin_mindmap_legend_p1","important — dépend du P0"))}</i>
    <i><span class="chip">P2</span> ${esc(T("plugin_mindmap_legend_p2","souhaitable — plus tard"))}</i></div>`;
  html+=`<div><div class="eyebrow" style="margin-bottom:4px">${esc(T("plugin_mindmap_legend_state","État"))}</div>`+
    STAT_ORDER.map(k=>`<i><span class="dot" style="background:${statColor(k)}"></span> ${esc(STAT[k].l)}</i>`).join("")+`</div>`;
  html+=`</div>`;
  $("hBody").innerHTML=html;
  $("help").classList.add("open");
}
$("bHelp").onclick=openHelp;
$("hClose").onclick=()=>$("help").classList.remove("open");
$("help").onclick=e=>{if(e.target.id==="help")$("help").classList.remove("open")};

/* ============================================================
   SYNTHÈSE
   ============================================================ */
function openSummary(){
  IDX=index();
  const order={P0:0,P1:1,P2:2,"":3};
  let html="";let total=0;
  (DATA.children||[]).forEach(ph=>{
    const list=actionables().filter(n=>branchOf(n)===ph).sort((a,b)=>(order[a.prio||""]-order[b.prio||""]));
    total+=list.length;
    html+=`<div class="ph" style="color:${ph.color||accentc()};border-color:${rgba(ph.color||accentc(),.5)}">${esc(firstLine(ph))} · ${T("plugin_mindmap_points_count","{n} point{s}").replace("{n}",list.length).replace("{s}",list.length>1?"s":"")}</div>`;
    if(!list.length){html+=`<div class="hint" style="margin:0 0 10px">${esc(T("plugin_mindmap_phase_no_tasks","Aucune tâche attribuée"))}</div>`;return}
    html+="<table>";
    list.forEach(n=>{
      const deps=(n.deps||[]).map(d=>firstLine(IDX.get(d.id))).filter(Boolean);
      html+=`<tr><td class="p">${n.prio||"—"}</td><td class="b">${esc(firstLine(branchOf(n)))}</td>
        <td>${esc(n.label)}${deps.length?`<span class="dep-note">${esc(T("plugin_mindmap_after","après :"))} ${esc(deps.join(" · "))}</span>`:""}</td>
        <td class="s">${esc((STAT[n.stat]||STAT.todo).l)}${n.owner?" · "+esc(n.owner):""}</td></tr>`;
    });html+="</table>";
  });
  $("mSub").textContent=T("plugin_mindmap_plan_sub","{n} points, triés par phase puis par priorité. Les dépendances indiquent ce qui doit être fait avant.").replace("{n}",total);
  $("mBody").innerHTML=html;$("modal").classList.add("open");
}
$("bSynth").onclick=openSummary;
$("mClose").onclick=()=>$("modal").classList.remove("open");
$("modal").onclick=e=>{if(e.target.id==="modal")$("modal").classList.remove("open")};

/* ============================================================
   PERSISTANCE — document du plugin
   ============================================================ */
function collectRefs(){
  const out=[],seen=new Set();
  walk(DATA,n=>{(n.refs||[]).forEach(r=>{const key=r.kind+":"+r.id;if(!seen.has(key)){seen.add(key);out.push(r)}})});
  return out;
}
function cleanData(){return treeSnapshot()}
let saveTimer=null;
function doSave(){
  saveTimer=null;
  if(!trk)return;
  trk.save({data:{root:cleanData(),view:S.view,folded:[...S.folded]},dataVersion:1,refs:collectRefs()});
  trk.markDirty(false);
}
function scheduleSave(){
  if(trk)trk.markDirty(true);
  if(saveTimer)clearTimeout(saveTimer);
  saveTimer=setTimeout(doSave,300);
}
function flushSave(){
  if(saveTimer)clearTimeout(saveTimer);
  doSave();flash(T("plugin_mindmap_pill_saved","Enregistré"));
}
$("bExport").onclick=()=>{
  const payload={root:cleanData(),view:S.view,folded:[...S.folded]};
  trk.saveFile({name:(document.title||"carte-mentale")+".json",mime:"application/json",text:JSON.stringify(payload,null,2)});
};
/* Import : remplace la carte en cours par un JSON exporté (même format que
   `bExport`). Fichier lu par le navigateur (`FileReader`), jamais par l'hôte.
   Le clic sur le bouton doit rester le DÉCLENCHEUR DIRECT de `fImport.click()`
   (aucun armement avant) : Chrome n'ouvre le sélecteur natif que dans la pile
   d'un vrai geste utilisateur. La confirmation à deux clics s'arme donc APRÈS
   coup, une fois le fichier choisi et validé.
   C'est la seule action encore confirmée du plugin : tout le reste est
   annulable, l'import non — il vide l'historique avec le document. */
function importError(reason){
  console.warn("[mindmap] import refusé"+(reason?" : "+reason:""));
  if(trk)trk.toast(T("plugin_mindmap_import_error","Fichier invalide : ce n'est pas une carte exportée depuis ce plugin."));
}
let pendingImport=null,importArmTimer=null;
function disarmImport(){
  const btn=$("bImport");
  if(btn.dataset.armed){delete btn.dataset.armed;btn.textContent=btn.dataset.label}
  pendingImport=null;
}
function armImport(payload){
  pendingImport=payload;
  const btn=$("bImport");
  btn.dataset.label=btn.dataset.label||btn.textContent;
  btn.dataset.armed="1";
  btn.textContent=T("plugin_mindmap_confirm_prompt","Confirmer ?");
  clearTimeout(importArmTimer);
  importArmTimer=setTimeout(disarmImport,4000);
  $("popMore").classList.add("open");
}
$("bImport").onclick=e=>{
  const btn=e.currentTarget;
  if(btn.dataset.armed&&pendingImport){
    clearTimeout(importArmTimer);
    const payload=pendingImport;disarmImport();
    DATA=payload.root;
    S.view=payload.view==="flow"?"flow":"map";
    S.folded=new Set(Array.isArray(payload.folded)?payload.folded:[]);
    S.sel=null;S.link=null;$("insp").classList.remove("open");$("lnk").classList.remove("open");
    normDeps();IDX=index();setView(S.view);syncPhaseUI();clearSearch();fit();
    resetHistory();scheduleSave();closePops();
    console.log("[mindmap] import : carte remplacée et sauvegarde programmée");
    if(trk)trk.toast(T("plugin_mindmap_import_success","Carte importée."));
    return;
  }
  console.log("[mindmap] import : ouverture du sélecteur de fichier");
  $("fImport").click();
};
$("fImport").addEventListener("change",e=>{
  const file=e.target.files&&e.target.files[0];
  e.target.value=""; // pour pouvoir réimporter le même fichier ensuite
  if(!file){console.log("[mindmap] import : sélection annulée");return}
  console.log("[mindmap] import : fichier choisi",file.name,file.size+" o");
  const reader=new FileReader();
  reader.onerror=()=>importError("lecture du fichier échouée");
  reader.onload=()=>{
    let payload;
    try{payload=JSON.parse(String(reader.result))}catch(err){importError("JSON invalide ("+err.message+")");return}
    if(!payload||typeof payload!=="object"||!payload.root||typeof payload.root.id!=="string"){importError("structure inattendue (pas de champ root.id)");return}
    console.log("[mindmap] import : fichier valide, confirmation demandée");
    armImport(payload);
  };
  reader.readAsText(file);
});
$("bPng").onclick=()=>{
  const b=scene.getBBox(),m=40,w=b.width+2*m,h=b.height+2*m,s=2;
  const out=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${b.x-m} ${b.y-m} ${w} ${h}">
    <rect x="${b.x-m}" y="${b.y-m}" width="${w}" height="${h}" fill="${bgc()}"/>${scene.innerHTML}</svg>`;
  const img=new Image();
  img.onload=()=>{const c=document.createElement("canvas");c.width=w*s;c.height=h*s;
    const x=c.getContext("2d");x.scale(s,s);x.drawImage(img,0,0);
    try{
      const dataUrl=c.toDataURL("image/png");
      trk.saveFile({name:(document.title||"carte-mentale")+".png",mime:"image/png",base64:dataUrl.split(",")[1]});
    }catch(err){trk.toast(T("plugin_mindmap_png_error","Export PNG bloqué ici. Enregistrez le fichier et ouvrez-le dans un navigateur."))}};
  img.onerror=()=>trk.toast(T("plugin_mindmap_png_unavailable","Export PNG indisponible dans ce contexte. Utilisez « Enregistrer » puis ouvrez le fichier localement."));
  img.src="data:image/svg+xml;charset=utf-8,"+encodeURIComponent(out);
};

/* ---------- mise en page réactive ---------- */
const barEl=document.querySelector(".bar");
const syncBar=()=>{canvas.style.top=barEl.offsetHeight+"px"};
new ResizeObserver(syncBar).observe(barEl);syncBar();
// L'app hôte redimensionne l'iframe (bascule de vue, sidebar…) sans que la
// fenêtre de haut niveau change de taille : un ResizeObserver sur le corps
// capte ce cas, que le `resize` de window ne couvre pas toujours.
new ResizeObserver(()=>{syncBar();render()}).observe(document.body);
addEventListener("resize",()=>{syncBar();render()});

/* ---------- i18n ---------- */
function applyI18n(){
  document.querySelectorAll("[data-i18n]").forEach(el=>{el.textContent=T(el.getAttribute("data-i18n"),el.textContent)});
  document.querySelectorAll("[data-i18n-title]").forEach(el=>{el.title=T(el.getAttribute("data-i18n-title"),el.title)});
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{el.placeholder=T(el.getAttribute("data-i18n-placeholder"),el.placeholder)});
  document.querySelectorAll("[data-i18n-aria-label]").forEach(el=>{el.setAttribute("aria-label",T(el.getAttribute("data-i18n-aria-label"),el.getAttribute("aria-label")))});
}
function applyDomainI18n(){
  STAT.todo.l=T("plugin_mindmap_stat_todo","À faire");
  STAT.doing.l=T("plugin_mindmap_stat_doing","En cours");
  STAT.done.l=T("plugin_mindmap_stat_done","Terminé");
  STAT.decision.l=T("plugin_mindmap_stat_decision","À décider");
  updateHistoryUI();
}

/* ---------- thème et titre pilotés par l'hôte ---------- */
function applyHostTheme(theme){
  if(!theme||!theme.tokens)return;
  DARK=!!theme.dark;
  const t=theme.tokens, r=document.documentElement.style;
  const map={"--bg":"--bg","--panel":"--panel","--panel-alt":"--panel-2","--text":"--ink",
    "--text-dim":"--muted","--accent":"--accent","--accent-contrast":"--accent-ink",
    "--inset":"--inset","--danger":"--danger","--warn":"--warn","--ok":"--ok"};
  Object.keys(map).forEach(k=>{if(t[k])r.setProperty(map[k],t[k])});
  if(t["--border"]){r.setProperty("--line",t["--border"]);
    r.setProperty("--line-2",`color-mix(in srgb, ${t["--border"]} 60%, ${t["--text-dim"]||"#8B95A1"})`)}
  if(t["--shadow"])r.setProperty("--shadow",`0 18px 44px ${t["--shadow"]}, 0 2px 8px ${t["--shadow"]}`);
  render();
}
function applyTitle(title){
  document.title=title||T("plugin_mindmap_untitled","Sans titre");
  $("brandTitle").textContent=document.title;
}

/* ---------- document du plugin ---------- */
let loadedDocId=null;
function loadDoc(doc){
  applyTitle(doc&&doc.title);
  // Un même id de document ne peut changer ici que par un renommage côté
  // hôte : recharger l'arbre entier écraserait la sélection, le pan/zoom, le
  // pli et l'historique pour rien (et créerait un écho après notre propre
  // sauvegarde, puisque l'hôte nous renvoie le document à chaque patch).
  if(doc&&doc.id===loadedDocId)return;
  loadedDocId=doc?doc.id:null;
  const data=doc&&doc.data;
  DATA=(data&&data.root)?data.root:DEFAULT_DATA();
  S.view=(data&&data.view)||"map";S.folded=new Set((data&&data.folded)||[]);
  S.sel=null;S.link=null;$("insp").classList.remove("open");$("lnk").classList.remove("open");
  normDeps();IDX=index();
  $("segMap").classList.toggle("on",S.view==="map");
  $("segFlow").classList.toggle("on",S.view==="flow");
  $("cFold").checked=S.folded.size>0;
  syncPhaseUI();clearSearch();resetHistory();fit();
}

/* ---------- amorçage ---------- */
DATA=DEFAULT_DATA();normDeps();syncPhaseUI();resetHistory();fit(); // premier rendu, avant la connexion à l'hôte
if(trk){
  trk.ready().then(init=>{
    applyI18n();applyDomainI18n();
    applyHostTheme(init.theme);
    updateTasks();
    loadDoc(init.doc);
  });
  trk.on("doc",loadDoc);
  trk.on("snapshot",updateTasks);
  trk.on("theme",applyHostTheme);
  trk.on("lang",()=>{applyI18n();applyDomainI18n();render()});
  // L'hôte peut couper le plein écran de son propre chef (bouton de sortie
  // côté hôte, Échap) : on aligne juste notre case, sans renvoyer
  // `requestFullscreen` (cf. setFullscreen, pas de round-trip infini).
  trk.on("fullscreen",setFullscreen);
}