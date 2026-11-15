/* Pixel space scenery shares the original SVG coordinate system and a rising cratered moon. */
(function(root){
const mix=(a,b,t)=>'#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('');
function palette(p){return {top:mix('#050c25','#1c3050',p),bottom:mix('#12354b','#718ba5',p)};}
function orbit(){return '<g class="orbital-planet" opacity=".65"><path d="M47 28h20v4h8v8h4v16h-4v8h-8v4H47v-4h-8v-8h-4V40h4v-8h8z" fill="#8f94bc"/><path d="M44 35h18v4h8v6H44zM40 51h26v5H40z" fill="#b1c6cc"/><path d="M23 64l68-33 3 5-68 33z" fill="#c6b8d5"/><path d="M22 68l69-33" fill="none" stroke="#d4d7e9" stroke-width="1"/></g>';}
function moon(p,animate,complete){
  const e=p*p*(3-2*p),cy=232-120*e,r=28;
  let out=`<g class="lunar-moon ${animate?'moon-rise':''}" data-progress="${p}"><circle cx="322" cy="${cy}" r="68" fill="#c2d5f2" opacity="${.025+.07*p}"/><g transform="translate(322 ${cy})">`;
  for(let y=-r;y<=r;y+=4)for(let x=-r;x<=r;x+=4){if(x*x+y*y<=r*r){const edge=x*x+y*y>(r-5)*(r-5);out+=`<rect x="${x-2}" y="${y-2}" width="4" height="4" fill="${edge?'#b5bfd3':x>12?'#d7deea':'#f5f6f4'}"/>`;}}
  [[-12,-12,8], [7,-4,10],[-8,13,6],[12,12,5],[-15,3,4]].forEach(([x,y,size])=>{out+=`<g class="moon-crater"><path d="M${x} ${y}h${size}v${size-2}h-${size}z" fill="#acb9cc"/><path d="M${x+2} ${y+2}h${size-2}v${size-2}h-${size-2}z" fill="#d6dfeb"/><path d="M${x} ${y+size}h${size}v2h-${size}z" fill="#ffffff" opacity=".8"/></g>`;});
  return out+`</g>${complete?'<path d="M278 92h3v3h-3zM365 74h3v3h-3zM354 142h2v2h-2z" fill="#e7f1fb"/>':''}</g>`;
}
function terrain(p){return `<g fill="${mix('#121e38','#48536b',p)}"><path d="M0 240v-35h24v-6h32v9h40v-16h30v7h42v-10h36v19h40v-14h40v10h30v-21h42v14h44v43z"/></g><g fill="${mix('#0b182b','#334b62',p)}"><path d="M0 240v-15h48v-7h40v9h70v-10h65v12h50v-8h66v8h61v11z"/></g><g fill="#a8c7d6" opacity=".15"><path d="M15 223h19v2H15zM89 214h13v2H89zM271 224h24v2h-24zM340 208h17v2h-17z"/></g>`;}
function scenery(p,completed,marks,traveler){let out='<g class="space-details" aria-hidden="true">';
for(const [x,y] of [[16,217],[106,223],[195,216],[275,221],[380,207]])out+=`<g transform="translate(${x} ${y})"><path d="M-9 0v-12h3v-5H6v5h3V0z" fill="#536981"/><path d="M-5-10h10v6H-5z" fill="#92c8d1" opacity=".7"/><path d="M-2-17v-8h3v8M-7 0H7" stroke="#b3b0c9" stroke-width="2"/><rect class="station-beacon" x="-1" y="-26" width="2" height="2" fill="#e8bf9b"/></g>`;
marks.slice(0,completed).forEach(pt=>{out+=`<g transform="translate(${(pt.x+8).toFixed(1)} ${(pt.y+12).toFixed(1)})"><path d="M0 0v-4h3v-5h3v9z" fill="#8bd8ce"/><path d="M6 0v-6h3v-3h2v9z" fill="#b5b1ec"/></g>`;});
if(p<1)out+=`<g transform="translate(${Math.min(365,traveler.x+24).toFixed(1)} ${Math.min(223,traveler.y+21).toFixed(1)})"><path d="M-10 0v-7h3v-4H7v4h3v7z" fill="#798ca4"/><path d="M-5-7H5v5H-5z" fill="#9fd3d0"/><path d="M-12 0h24v3h-24z" fill="#3c5873"/><rect class="station-beacon" x="12" y="-9" width="2" height="4" fill="#ffe0a4"/></g>`;
else out+='<g class="arrival-shuttles" fill="#d7e2e0"><path d="M240 45h10v-3h4v3h5v3h-19zM268 33h8v-2h3v2h4v2h-15z"/></g>';
return out+'</g>';}
root.SpaceWorld={palette,orbit,moon,terrain,scenery};
})(window);
