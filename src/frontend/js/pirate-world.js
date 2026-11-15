/* Clean island checkpoints, a traveling boat and a progress-powered lighthouse. */
(function(root){
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
const palette=p=>({top:mix('#101c35','#4c6874',p),bottom:mix('#285569','#a3c9bd',p)});
function orbit(){return '<g transform="translate(60 40)" fill="#e3c69c" opacity=".55"><path d="M0-16l3 12L16 0 3 3 0 16-3 3-16 0-3-4z"/><path d="M-8-8l5 5L8 8 3 3z" fill="#8dbbbc"/></g>';}
// The beacon is stationary; progress powers its light rather than moving it.
const focalY=()=>0;
function horizon(p){return `<g class="pirate-lighthouse" transform="translate(28 37)"><path d="M303 157h38v4h-38zM307 151h30v7h-30z" fill="#95a58b"/><path d="M312 151l4-45h12l4 45z" fill="#e1d9ba"/><path d="M315 118h14v6h-14zM314 136h16v6h-16z" fill="#aa7f78"/><path d="M318 141h8v10h-8z" fill="#4e646b"/><path d="M313 105V93h18v12z" fill="#6e7e81"/><path d="M315 95h14v8h-14z" fill="#b8ba9e"/><path d="M310 92l7-7h10l7 7zM311 105h22v3h-22z" fill="#567383"/><path d="M321 81h2v6h-2z" fill="#d4c49a"/><g class="lighthouse-light" aria-hidden="true"><path data-lighthouse-beam d="M322 98L172 52V91z" fill="#fff0bc" opacity="${p*.32}"/><path data-lighthouse-beam d="M322 98L398 52V88z" fill="#fff0bc" opacity="${p*.32}"/><circle data-lighthouse-glow cx="322" cy="98" r="${10+34*p}" fill="#fff0bc" opacity="${p*.11}"/><rect data-lighthouse-window x="316" y="96" width="12" height="6" fill="${mix('#a8b4ab','#fff1b9',p)}"/><path data-lighthouse-spark d="M319 97h6v4h-6z" fill="#fff8da" opacity="${p}"/></g><rect x="311" y="164" width="22" height="2" fill="#294d5b"/><rect data-lighthouse-power x="311" y="164" width="${22*p}" height="2" fill="#ead4a0"/></g>`;}
function setLight(svg,p){
  svg.querySelectorAll('[data-lighthouse-beam]').forEach(el=>el.setAttribute('opacity',(p*.32).toFixed(3)));
  svg.querySelectorAll('[data-lighthouse-glow]').forEach(el=>{el.setAttribute('opacity',(p*.11).toFixed(3));el.setAttribute('r',(10+34*p).toFixed(1));});
  svg.querySelectorAll('[data-lighthouse-window]').forEach(el=>el.setAttribute('fill',mix('#a8b4ab','#fff1b9',p)));
  svg.querySelectorAll('[data-lighthouse-spark]').forEach(el=>el.setAttribute('opacity',p.toFixed(3)));
  svg.querySelectorAll('[data-lighthouse-power]').forEach(el=>el.setAttribute('width',(22*p).toFixed(2)));
}
function sharks(){return `<g class="sea-wildlife" aria-hidden="true">${[[62,106,13,0],[268,160,17,-6],[155,229,15,-10]].map(([x,y,duration,delay],i)=>`<g class="pirate-shark" transform="translate(${x} ${y})"><g class="shark-swim" style="animation-duration:${duration}s;animation-delay:${delay}s"><g transform="scale(${i%2?-1:1} 1)"><ellipse cx="0" cy="2" rx="8" ry="1.5" fill="#153b4c" opacity=".24"/><path d="M-4 0h2v-2h2v-4h2v6h3v2h-9z" fill="#779ba7"/><path d="M0-4h1v4H0z" fill="#a2bab8"/><path d="M-12 2h5M-10 5h7" fill="none" stroke="#a4cfc7" stroke-width=".7" opacity=".4"/></g></g></g>`).join('')}</g>`;}
function terrain(p){return `<g class="pirate-ocean"><path d="M0 91h400v149H0z" fill="${mix('#173f52','#337a81',p)}"/>${[[28,119,14],[102,103,18],[207,111,12],[270,188,18],[35,222,15],[138,222,12],[369,204,16],[204,169,13],[84,175,10]].map(([x,y,w])=>`<path d="M${x} ${y}h${w}v1h-${w}z" fill="#a4cfc7" opacity=".18"/>`).join('')}${sharks()}</g>`;}
function scenery(p,completed,marks){
  const scale=marks.length>12?.65:.9;
  let out='<g class="pirate-details" aria-hidden="true"><g class="starting-harbor" transform="translate(30 203)"><path d="M-10 0h3v-3H7v3h3v6H7v2H-7V6h-3z" fill="#c0b18a"/><path d="M-6-1H6v5H-6z" fill="#739b7e"/><path d="M-2-6h6v4h-6z" fill="#9d8170"/></g>';
  marks.forEach((pt,i)=>{
    out+=`<g class="checkpoint-island" data-island="${i+1}" transform="translate(${(pt.x+6).toFixed(1)} ${(pt.y-5).toFixed(1)}) scale(${scale})"><path d="M-10 0h3v-3H7v3h3v6H7v2H-7V6h-3z" fill="#c0b18a"/><path d="M-6-1H6v5H-6z" fill="#739b7e"/>`;
    if(i%2===0)out+='<path d="M3 0v-9h2V0z" fill="#8c7966"/><path d="M3-10l-5-3-2 2 6 3-5 2 1 2 6-3 4 3 2-2-5-3 5-2-1-2-5 2 1-5H3z" fill="#75ad8c"/>';
    if(i<completed)out+='<path d="M-5 1h5v4h-5z" fill="#a1805e"/><path d="M-3 1h1v4h-1z" fill="#e6ce99"/>';
    out+='</g>';
  });
  return out+'</g>';
}
function boat(passenger){return `<g class="travel-boat"><g class="boat-wake" fill="none" stroke="#b2d5ca" stroke-width="1" opacity=".4"><path d="M-15 18h-6M-12 22h-13M-14 14h-8"/></g><g class="boat-rider" transform="translate(0 5) scale(.65)">${passenger}</g><g class="boat-hull"><path d="M-13 12h26v4l-5 6H-8l-5-6z" fill="#6b5d58"/><path d="M-11 13h22v3H-11z" fill="#c4a780"/><path d="M-8 18H8v2H-8z" fill="#9a7c65"/><path d="M8 1h2v13H8z" fill="#c6b595"/><path d="M10 2l8 7h-8z" fill="#e2d8b1"/></g></g>`;}
function sprite(kind){let out='';for(const direction of ['down','up','right','left'])for(let frame=0;frame<3;frame++){const step=frame===1?-1:frame===2?1:0,back=direction==='up',side=direction==='left'||direction==='right';out+=`<g class="explorer-frame pirate-${kind}" data-facing="${direction}" data-pose="${frame}"${direction==='left'?' transform="scale(-1 1)"':''}>`;
const witch=kind==='sea-witch',deck=kind==='deckhand',coat=kind==='captain'?'#925a67':kind==='navigator'?'#6d9aa7':deck?'#728f79':'#7da998';
out+=`<path d="M-4 ${8+step}h3v5h-3zM1 ${8-step}h3v5H1z" fill="${witch?'#41616a':'#5e4e65'}"/><path d="M-5 ${12+step}h4v2h-4zM1 ${12-step}h4v2H1z" fill="${witch?'#7f9c89':'#b7997c'}"/><path d="M-4-1h8v9h-8z" fill="${coat}"/><path d="M-5 ${2+step}h2v5h-2zM3 ${2-step}h2v5H3z" fill="${witch?'#e4c9ad':'#e6c5a1'}"/><path d="M-3-7h6v7h-6z" fill="${witch?'#e4c9ad':'#e6c5a1'}"/>`;
if(kind==='captain'){out+='<path d="M-7-8h4v-3h6v3h4v4H-7z" fill="#3d4057"/><path d="M-6-5H6v1H-6zM-1-9h2v2h-2z" fill="#e4c993"/><path d="M-5 2h2v10h-3V8h1zM3 2h2v6h1v4H3z" fill="#713e55"/><path d="M-1 1h2v7h-2z" fill="#d8bd8f"/>';if(!back)out+=side?'<rect x="2" y="-3" width="1" height="1" fill="#303349"/>':'<path d="M-2-4h2v2h-2zM1-3h1v1H1z" fill="#303349"/>';out+='<path d="M7-1h2v6H7zM6 5h3v2H6zM4 7h4v1H4z" fill="#d1d8cf"/>';}
if(kind==='navigator'){out+='<path d="M-4-9h8v2h2v6H4v-5H-4v5h-2v-6h2z" fill="#50758e"/><path d="M-3 1h6v2h-6z" fill="#e2c692"/><path d="M-1 4h3v3h-3z" fill="#e6d39f"/><path d="M5 3h7v3H5z" fill="#b7a382"/><rect x="11" y="3" width="2" height="3" fill="#abcbd0"/>';if(!back)out+='<path d="M-2-3h1v1h-1zM1-3h1v1H1z" fill="#344358"/>';}
if(deck){out+='<path d="M-4-8h8v3H-4zM-6-5h3v2h-3z" fill="#d7a27f"/><path d="M-3 0h6v6h-6z" fill="#ddc8a1"/><path d="M-5 5H5v2H-5z" fill="#755665"/><path d="M7 2h2v8h-2zM5 4h6v2H5zM3 8h2v3h6V8h2v4h-2v2H5v-2H3z" fill="#9aafb6"/>';if(!back)out+='<path d="M-2-3h1v1h-1zM1-3h1v1H1z" fill="#394052"/>';}
if(witch){out+='<path d="M-5-8h10v2h2v12H4V0H-4v6h-3V-6h2z" fill="#294f57"/><path d="M-3-10h2v3h-2zM0-12h2v5H0zM3-10h2v3H3z" fill="#dfc99c"/><path d="M-5 6h10v4H3v2H1V9h-2v3h-3v-2h-1z" fill="#a8c3ad"/><path d="M8-4h2v17H8z" fill="#6b8175"/><path d="M7-8h4v2h2v3H5v-3h2z" fill="#e7d8b5"/>';if(!back)out+='<path d="M-2-3h1v1h-1zM1-3h1v1H1z" fill="#304b52"/>';}
if(back)out+=`<path d="M-3-5h6v4h-6z" fill="${witch?'#294f57':coat}"/><path d="M-3 0h6v7h-6z" fill="${coat}"/>`;out+='</g>';}
return out;}
function bossArt(type,color){const forms=[
`<path d="M-14-2h28v14h-28z" fill="#9a7880"/><path d="M-17-8h34v4h-4V2h-26v-6h-4z" fill="#8c7667"/><path d="M-13-6h26v2h-26zM-1-15h2v9h-2z" fill="#e1c393"/><path d="M-18 2h-7v-9h5v6h3zM18 2h7v-9h-5v6h-3z" fill="${color}"/><path d="M-15 9h-6v9h-4v3h7v-9h4zM15 9h6v9h4v3h-7v-9h-4z" fill="#bb9c89"/><path d="M-8 4h3v3h-3zM5 4h3v3H5z" fill="#ecdfb1"/>`,
`<path d="M-10-15h20v4h6v6h-32v-6h6z" fill="#414760"/><path d="M-12-7h24v2h-24z" fill="#e2bf8c"/><path d="M-7-5h14v7h-14z" fill="#d4b394"/><path d="M-10 2h20v16H5v4H-5v-4h-5z" fill="${color}"/><path d="M-2 3h4v15h-4z" fill="#ead09b"/><path d="M-23 2h15v9h-15zM11 3h9v5h-9zM18 7h4v8h-4z" fill="#5b657f"/><path d="M-20 4h-4v5h4z" fill="#a4bac5"/><path d="M-4-3h3v2h-3zM2-3h2v2H2z" fill="#384257"/>`,
`<path d="M-7-13h14v3h4V2H-11v-12h4z" fill="#638b94"/><path d="M-5-9h10v9H-5z" fill="#c0d8c4"/><path d="M-7-16h3v6h-3zM-1-19h3v9h-3zM5-16h3v6H5z" fill="#e1d7b6"/><path d="M-6 1h12v10l-9 9H8v4h-16v-7l5-6H-6z" fill="${color}"/><path d="M-13 1h7v4h-7zM6 1h7v4H6z" fill="#b2d4c2"/><path d="M-3-5h2v1h-2zM2-5h2v1H2z" fill="#3f576c"/>`,
`<path d="M-12-16h24v4h5v6h-34v-6h5z" fill="#536b76"/><path d="M-8-7h16v8H-8z" fill="#b4d2c4"/><path d="M-11 1h22v17H8v6H3v-5h-6v5h-5v-6h-3z" fill="${color}"/><path d="M-7 5h3v6h-3zM4 5h3v6H4z" fill="#779c99"/><path d="M-19 3h8v4h-8zM11 3h8v4h-8zM17 6h4v10h-4z" fill="#9ebeb4"/><path d="M-5-4h3v2h-3zM2-4h3v2H2z" fill="#577180"/><path d="M-2-14h4v4h-4z" fill="#ccdcc3"/>`,
`<path d="M-9-13h18v4h5V7H-14V-9h5z" fill="${color}"/><path d="M-11-16h3v4h-3zM-5-19h3v7h-3zM2-19h3v7H2zM8-16h3v4H8z" fill="#d7c79e"/><path d="M-9-6h6v5h-6zM3-6h6v5H3z" fill="#e1e2bd"/><path d="M-7-5h2v3h-2zM5-5h2v3H5z" fill="#3f415f"/><path d="M-12 5h-8v10h-5v6h8V9h6zM12 5h8v10h5v6h-8V9h-6zM-7 7v13h-6v4h9V7zM7 7v13h6v4H4V7z" fill="#718ea0"/>`];return `<g class="pirate-boss-form pirate-boss-form-${type}">${forms[type]}</g>`;}
function battleSetting(type,height){
  const scenes=[
    '<path d="M38 106h88l-12 18H53z" fill="#5d6866"/><path d="M73 56h4v52h-4zM78 64h28v24H78z" fill="#829e91"/><path d="M42 110h80v3H42z" fill="#b4b596"/>',
    '<path d="M0 125h400v5H0zM0 149h400v3H0zM0 174h400v3H0zM0 202h400v3H0z" fill="#a3937955"/><path d="M22 92h4v40h-4zM102 92h4v40h-4zM182 92h4v40h-4zM262 92h4v40h-4zM342 92h4v40h-4zM0 96h400v3H0z" fill="#6f7c76"/>',
    '<path d="M35 129V96H25V83h4v10h10V72h4v25h12V84h4v17H43v28zM135 129v-21h-9V96h4v8h9V88h4v41zM350 129V96h-8V81h4v12h10V74h4v55z" fill="#8cb7a5"/>',
    '<path d="M60 120V47h4v73zM143 120V63h4v57zM64 52h48v10h-9v10h-7V62H64zM147 67h27v23h-8v-8h-19z" fill="#718c86"/><path d="M55 102h14v6H55zM138 103h14v6h-14z" fill="#b8d7b3"/>',
    '<path d="M18 125v-16h7V90h9v-9h5v12h-8v20h-7v12zM125 125v-9h9V96h9v-9h5v13h-8v20h-8v5zM354 125v-20h8V84h9V73h6v15h-9v21h-8v16z" fill="#587483"/>'
  ];
  return scenes[type]+`<ellipse cx="89" cy="${height*.88}" rx="48" ry="10" fill="#a8ad8d"/><ellipse cx="286" cy="123" rx="67" ry="14" fill="#91a78c"/>`;
}
root.PirateWorld={palette,orbit,focalY,horizon,setLight,terrain,scenery,boat,sprite,bossArt,battleSetting};
})(window);
