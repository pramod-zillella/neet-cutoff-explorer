/* Smoke-check the published 2026 Round 1 view in headless Edge. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cutoff-2026-check-'));
const edge = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, contents) => {
    if (error) { response.writeHead(404); return response.end(); }
    response.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    response.end(contents);
  });
});

let browser, socket;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = spawn(edge, ['--headless=new','--disable-gpu','--no-first-run','--disable-extensions',
    '--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
    {windowsHide:true,stdio:'ignore'});
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt=0; attempt<100 && !fs.existsSync(portFile); attempt++) await pause(200);
  assert.ok(fs.existsSync(portFile), 'Edge did not start');
  const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  socket = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject;});
  let id=0; const pending=new Map(), errors=[];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const task=pending.get(message.id); pending.delete(message.id);
      if (message.error) task.reject(new Error(JSON.stringify(message.error))); else task.resolve(message.result);
    }
    if (message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const waitFor=async expression=>{
    for(let attempt=0;attempt<120;attempt++){if(await evaluate(expression))return;await pause(100);}
    throw new Error('Timed out: '+expression);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await waitFor(`document.querySelectorAll('#cutoff-rows tr').length>0`);
  assert.equal(await evaluate(`document.getElementById('year').value`),'2026');
  assert.equal(await evaluate(`document.querySelectorAll('#cutoff-rows tr').length>0`),true);
  assert.equal(await evaluate(`document.querySelectorAll('#cutoff-rows tr .rank-cell:nth-last-child(-n+3) .rank-value').length`),0);
  assert.ok((await evaluate(`document.getElementById('data-quality').textContent`)).includes('28,723'));
  assert.ok((await evaluate(`document.querySelector('.methodology').innerHTML`)).includes('documents/2026/round-1.pdf'));
  await evaluate(`document.querySelector('[data-view="state"]').click()`);
  await waitFor(`document.getElementById('state-panel').hidden===false`);
  await evaluate(`(()=>{const x=document.getElementById('state');x.value='Rajasthan';x.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.getElementById('results-title').textContent==='Rajasthan'`);
  assert.ok((await evaluate(`document.getElementById('row-count').textContent`)).includes('rows'));
  await evaluate(`(()=>{const x=document.getElementById('year');x.value='2025';x.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor(`document.getElementById('year').value==='2025' && document.querySelectorAll('#cutoff-rows tr').length>0`);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('Browser check passed: 2026 Round 1, later-round blanks, state filter and 2025 switch.');
  await send('Browser.close').catch(()=>{});
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  if(socket)socket.close();
  if(browser)browser.kill();
  server.close();
  await pause(300);
  try {fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});} catch {}
});
