const WebSocket = require('ws');
const http = require('http');

function cdpSend(ws, id, method, params = {}) {
  return new Promise((resolve) => {
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function evaluate(ws, id, expression) {
  const result = await cdpSend(ws, id, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.result && result.result.exceptionDetails) {
    console.error('JS Exception:', result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text);
  }
  return result.result.result.value;
}

async function run() {
  const tabs = await new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    }).on('error', reject);
  });

  const pageTab = tabs.find((t) => t.type === 'page');
  if (!pageTab) throw new Error('No page tab found');
  console.log('Tab:', pageTab.title, '—', pageTab.url);

  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  let msgId = 1;

  // Get DPR for coordinate scaling
  const metrics = JSON.parse(await evaluate(ws, msgId++, `
    JSON.stringify({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, dpr: window.devicePixelRatio })
  `));
  console.log('Viewport metrics:', metrics);
  const dpr = metrics.dpr || 1;

  // Get pill position in CSS pixels
  const pillInfo = JSON.parse(await evaluate(ws, msgId++, `
    JSON.stringify((function() {
      const btn = document.querySelector('button.__composer-pill');
      if (!btn) return null;
      btn.scrollIntoView({ behavior: 'instant', block: 'center' });
      const r = btn.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width/2, cy: r.top + r.height/2, text: btn.innerText.trim() };
    })())
  `));

  if (!pillInfo) {
    console.log('Pill not found!');
    ws.close();
    return;
  }
  console.log('Pill (CSS px):', pillInfo);

  // CDP Input coords are in CSS pixels (NOT physical pixels) when no deviceScaleFactor override
  // BUT if the page has devicePixelRatio=1.5 from the OS, CDP still wants CSS coords
  // Use raw CSS coordinates from getBoundingClientRect
  const cx = Math.round(pillInfo.cx);
  const cy = Math.round(pillInfo.cy);
  console.log(`Clicking at CSS coords (${cx}, ${cy}), DPR=${dpr}`);

  // Method 1: PointerEvent dispatch through JS (React uses pointer events)
  const jsClickResult = await evaluate(ws, msgId++, `
    JSON.stringify((async function() {
      const btn = document.querySelector('button.__composer-pill');
      if (!btn) return 'not found';

      // React 16+ uses PointerEvents for click handling
      const evts = [
        new PointerEvent('pointerover', { bubbles: true, cancelable: true }),
        new PointerEvent('pointerenter', { bubbles: false }),
        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true }),
        new PointerEvent('pointerup', { bubbles: true, cancelable: true, isPrimary: true }),
        new PointerEvent('pointerout', { bubbles: true }),
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      ];
      evts.forEach(e => btn.dispatchEvent(e));

      await new Promise(r => setTimeout(r, 100));
      return {
        state: btn.getAttribute('data-state'),
        expanded: btn.getAttribute('aria-expanded')
      };
    })())
  `);
  console.log('JS PointerEvent click result:', jsClickResult);

  await sleep(1000);

  // Method 2: Try React fiber __reactFiber__ click handler
  const fiberClickResult = await evaluate(ws, msgId++, `
    JSON.stringify((async function() {
      const btn = document.querySelector('button.__composer-pill');
      if (!btn) return 'not found';

      // Find React fiber
      const fiberKey = Object.keys(btn).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
      if (!fiberKey) return 'no fiber key found';

      let fiber = btn[fiberKey];
      // Walk up to find onClick
      let node = fiber;
      let depth = 0;
      while (node && depth < 10) {
        if (node.memoizedProps && node.memoizedProps.onClick) {
          node.memoizedProps.onClick({ type: 'click', bubbles: true, preventDefault: () => {}, stopPropagation: () => {}, nativeEvent: {} });
          await new Promise(r => setTimeout(r, 200));
          return { firedAt: depth, state: btn.getAttribute('data-state'), expanded: btn.getAttribute('aria-expanded') };
        }
        node = node.return;
        depth++;
      }
      return 'no onClick found in fiber chain depth=' + depth;
    })())
  `);
  console.log('React fiber click result:', fiberClickResult);

  await sleep(1500);

  // Check state after all click attempts
  const finalState = await evaluate(ws, msgId++, `
    JSON.stringify((function() {
      const btn = document.querySelector('button.__composer-pill');
      return btn ? { expanded: btn.getAttribute('aria-expanded'), state: btn.getAttribute('data-state') } : 'not found';
    })())
  `);
  console.log('Final pill state:', finalState);

  // Scan for any menu/dropdown that opened
  const scan = JSON.parse(await evaluate(ws, msgId++, `
    JSON.stringify((function() {
      const byRole = Array.from(document.querySelectorAll(
        '[role="menu"], [role="menuitem"], [role="option"], [role="listbox"]'
      )).map(el => ({
        tag: el.tagName, role: el.getAttribute('role'),
        text: el.innerText.trim().substring(0, 150),
        class: el.className.substring(0, 100),
        dataState: el.getAttribute('data-state'),
        dataAttrs: Object.fromEntries(Array.from(el.attributes).filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value.substring(0,60)]))
      }));

      const portals = Array.from(document.querySelectorAll(
        '[data-radix-popper-content-wrapper], [data-radix-portal]'
      )).map(el => ({
        tag: el.tagName, class: el.className.substring(0, 100),
        text: el.innerText.trim().substring(0, 300),
        html: el.innerHTML.substring(0, 1000)
      }));

      const openEls = Array.from(document.querySelectorAll('[data-state="open"]')).map(el => ({
        tag: el.tagName, role: el.getAttribute('role'),
        class: el.className.substring(0, 100),
        text: el.innerText.trim().substring(0, 200),
        html: el.innerHTML.substring(0, 800)
      }));

      const bodyChildren = Array.from(document.body.children).map(el => ({
        tag: el.tagName, id: el.id || '',
        class: el.className ? el.className.substring(0, 80) : '',
        ch: el.children.length,
        text: (el.innerText || '').trim().substring(0, 100)
      }));

      return { byRole, portals, openEls, bodyChildren };
    })())
  `));

  console.log('\n=== ROLE=MENU/MENUITEM/OPTION/LISTBOX (' + scan.byRole.length + ') ===');
  scan.byRole.forEach((el, i) => {
    console.log(`[${i}] role=${el.role} <${el.tag}> state=${el.dataState}`);
    console.log(`     "${el.text.substring(0,100)}"`);
    console.log(`     class: ${el.class}`);
    if (Object.keys(el.dataAttrs).length) console.log(`     data: ${JSON.stringify(el.dataAttrs)}`);
  });

  console.log('\n=== RADIX PORTALS (' + scan.portals.length + ') ===');
  scan.portals.forEach((el, i) => {
    console.log(`[${i}] <${el.tag}> class="${el.class}"`);
    console.log(`     text: "${el.text.substring(0,150)}"`);
    console.log(`     html: "${el.html.substring(0,500)}"`);
  });

  console.log('\n=== data-state=open (' + scan.openEls.length + ') ===');
  scan.openEls.forEach((el, i) => {
    console.log(`[${i}] <${el.tag}> role=${el.role} class=${el.class}`);
    console.log(`     text: "${el.text.substring(0,150)}"`);
    console.log(`     html: "${el.html.substring(0,500)}"`);
  });

  console.log('\n=== BODY CHILDREN (' + scan.bodyChildren.length + ') ===');
  scan.bodyChildren.forEach((el, i) => {
    if (el.text || el.ch > 0) {
      console.log(`[${i}] <${el.tag}> id="${el.id}" ch=${el.ch} "${el.text.substring(0,80)}"`);
    }
  });

  ws.close();
  console.log('\nDone.');
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
