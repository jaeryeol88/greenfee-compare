const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "public");
const types = {".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml"};
const livePriceUrl = "https://raw.githubusercontent.com/jaeryeol88/greenfee-compare/main/public/public-prices.js";

const localPriceFallback = () => new Promise((resolve) => {
  fs.readFile(path.join(root, "public-prices.js"), (err, data) => resolve(err ? Buffer.from("window.PUBLIC_PRICES = [];\n") : data));
});

http.createServer(async (req,res)=>{
  const pathname = decodeURIComponent((req.url||"/").split("?")[0]);

  if (pathname === "/public-prices.js") {
    try {
      const upstream = await fetch(livePriceUrl + "?t=" + Date.now(), {
        headers: {"User-Agent":"greenfee-compare-render/1.0"},
        signal: AbortSignal.timeout(8000)
      });
      if (!upstream.ok) throw new Error("GitHub price feed " + upstream.status);
      const data = Buffer.from(await upstream.arrayBuffer());
      res.writeHead(200, {
        "Content-Type":"application/javascript; charset=utf-8",
        "Cache-Control":"no-store, max-age=0",
        "X-Price-Feed":"github-live"
      });
      return res.end(data);
    } catch (error) {
      const data = await localPriceFallback();
      res.writeHead(200, {
        "Content-Type":"application/javascript; charset=utf-8",
        "Cache-Control":"no-store, max-age=0",
        "X-Price-Feed":"local-fallback"
      });
      return res.end(data);
    }
  }

  const safe = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.join(root, safe);
  if (!file.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file,(err,data)=>{
    if(err){ fs.readFile(path.join(root,"index.html"),(e,html)=>{ res.writeHead(e?404:200,{"Content-Type":"text/html; charset=utf-8"}); res.end(e?"Not found":html); }); return; }
    res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"public, max-age=300"}); res.end(data);
  });
}).listen(process.env.PORT||10000,"0.0.0.0");
