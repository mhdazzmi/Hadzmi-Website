const {chromium}=require('playwright');const path=require('path');
(async()=>{const b=await chromium.launch();const dir=__dirname;const out=path.join(dir,'..');
for(const [f,w,h] of [['flyer1',1080,1350],['flyer2',1080,1080],['flyer3',1080,1350]]){
 const p=await b.newPage({viewport:{width:w,height:h}});await p.goto('file://'+dir+'/'+f+'.html');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
 await p.screenshot({path:path.join(out,f+'.png')});await p.close();}
if(process.argv[2]==='pdf'){const p=await b.newPage();await p.goto('file://'+dir+'/portfolio.html');await p.waitForLoadState('networkidle');await p.evaluate(()=>document.fonts.ready);
 await p.pdf({path:path.join(out,'Portfolio-Canva-Social-Media-Flyer.pdf'),format:'A4',printBackground:true,margin:{top:0,bottom:0,left:0,right:0}});}
await b.close();})();
