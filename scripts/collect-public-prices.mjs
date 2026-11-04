import fs from "node:fs/promises";
import zlib from "node:zlib";
import vm from "node:vm";

const KST = "Asia/Seoul";
const now = new Date();
const checkedAt = new Intl.DateTimeFormat("sv-SE", {timeZone:KST,dateStyle:"short",timeStyle:"medium"}).format(now).replace(" ","T");
const normalize = (v="") => String(v).replace(/컨트리클럽|골프클럽|CC/gi,"").replace(/[^0-9A-Za-z가-힣]/g,"").toLowerCase();
const isoKst = (d) => new Intl.DateTimeFormat("en-CA",{timeZone:KST,year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const start = isoKst(now);
const endDate = new Date(now.getTime()+14*86400000);
const end = isoKst(endDate);

const loader = await fs.readFile("public/loader.js","utf8");
const blobs = [...loader.matchAll(/unpack\("(H4sI[^"]+)"\)/g)].map(m=>m[1]);
const sandbox = {window:{}};
for (const blob of blobs) {
  try {
    const code=zlib.gunzipSync(Buffer.from(blob,"base64")).toString("utf8");
    vm.runInNewContext(code,sandbox,{timeout:2000});
  } catch {}
}
const rows = sandbox.window.GOLF_DATA?.rows || [];
let previous=[];
try {
  const old=await fs.readFile("public/public-prices.js","utf8");
  const match=old.match(/window\.PUBLIC_PRICES\s*=\s*(\[[\s\S]*\]);?/);
  if(match) previous=JSON.parse(match[1]);
} catch {}

const dates=Array.from({length:8},(_,i)=>isoKst(new Date(now.getTime()+i*86400000)));
const latestByCourse=new Map();
for(const row of rows){
  const prev=latestByCourse.get(row.course);
  if(!prev || row.date>prev.date) latestByCourse.set(row.course,row);
}
const withDate=(raw,date,platform)=>{
  try{
    const url=new URL(raw);
    const compact=date.replaceAll("-","");
    for(const key of ["date","day","roundDay","playDate","bookingDate"]){
      if(url.searchParams.has(key)) url.searchParams.set(key,key==="roundDay"?date:compact);
    }
    return url.toString();
  }catch{return raw;}
};
const candidates=[...latestByCourse.values()].flatMap(r=>dates.flatMap(date=>[
  r.kakaoUrl ? {course:r.course,date,platform:"카카오골프",url:withDate(r.kakaoUrl,date,"카카오골프")}:null,
  r.teeUrl ? {course:r.course,date,platform:"티스캐너",url:withDate(r.teeUrl,date,"티스캐너")}:null
])).filter(Boolean);
const unique=[...new Map(candidates.map(x=>[x.platform+"|"+x.date+"|"+x.course,x])).values()].slice(0,1600);

const fetchPrice=async(item)=>{
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),5000);
  try{
    const res=await fetch(item.url,{signal:ctrl.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; GreenFeeCompare/1.0)","accept-language":"ko-KR,ko;q=0.9"}});
    if(!res.ok) return null;
    const html=await res.text();
    const text=html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ").replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/g," ");
    if(!normalize(text).includes(normalize(item.course))) return null;
    const prices=[];
    for(const m of text.matchAll(/(?:그린피|green\s*fee|할인가|특가|판매가|예약가)[^\d]{0,50}(\d{2,3}(?:,\d{3})?)\s*원/gi)){
      const n=Number(m[1].replaceAll(",","")); if(n>=30000&&n<=400000) prices.push(n);
    }
    if(!prices.length) return null;
    return {...item,price:Math.min(...prices),checkedAt,benefits:[],evidence:"공개 예약 화면 확인"};
  }catch{return null;}finally{clearTimeout(timer);}
};

const found=[];
for(let i=0;i<unique.length;i+=8){
  const batch=await Promise.all(unique.slice(i,i+8).map(fetchPrice));
  found.push(...batch.filter(Boolean));
}
const byKey=new Map(previous.map(x=>[x.platform+"|"+x.date+"|"+x.course,x]));
for(const item of found) byKey.set(item.platform+"|"+item.date+"|"+item.course,item);
const retained=[...byKey.values()].filter(x=>x.date>=start);
await fs.writeFile("public/public-prices.js","window.PUBLIC_PRICES = "+JSON.stringify(retained,null,2)+";\n");
console.log(JSON.stringify({checkedAt,candidates:unique.length,updated:found.length,retained:retained.length}));
