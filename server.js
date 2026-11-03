const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "public");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
http.createServer((req,res)=>{
  const pathname = decodeURIComponent((req.url||"/").split("?")[0]);
  const safe = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.join(root, safe);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file,(err,data)=>{
    if(err){ fs.readFile(path.join(root,"index.html"),(e,html)=>{ res.writeHead(e?404:200,{"Content-Type":"text/html; charset=utf-8"}); res.end(e?"Not found":html); }); return; }
    res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"public, max-age=300"}); res.end(data);
  });
}).listen(process.env.PORT||10000,"0.0.0.0");
