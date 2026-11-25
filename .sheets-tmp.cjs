const ExcelJS=require('exceljs');const fs=require('fs');const path=require('path');
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)])}
(async()=>{for(const f of walk(process.argv[2])){if(!/\.xls[xm]$/i.test(f))continue;const wb=new ExcelJS.Workbook();try{await wb.xlsx.readFile(f)}catch(e){console.log('ERR',f,e.message);continue}
console.log('\n##',path.relative(process.argv[2],f));wb.eachSheet(ws=>{const t=[];for(let r=1;r<=8&&t.length<3;r++){const row=ws.getRow(r);let s=[];row.eachCell(c=>{let v=c.value;if(v&&typeof v==='object')v=v.result??v.richText?.map(x=>x.text).join('')??v.text??'';if(typeof v==='string'&&v.trim())s.push(v.trim())});if(s.length)t.push(s.join(' | ').slice(0,90))}
console.log(' -',JSON.stringify(ws.name),ws.state!=='visible'?'['+ws.state+']':'',ws.rowCount,'::',t.join(' // ').slice(0,200))})}})();
