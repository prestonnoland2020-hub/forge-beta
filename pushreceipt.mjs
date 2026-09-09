/* THE RECEIPT, AND THE BUTTON THAT READS IT.

   Every push in the log said sent/201 while Preston's phone stayed dark. 201
   means a push service took the message; it says nothing about whether a
   notification was ever drawn. Without that second fact there is no way to
   tell a broken sender from a dead install, and both read to the athlete as
   "I'm not getting notifications".

   The service worker stamps the row when it calls showNotification. These
   checks hold the parts of that which can be checked without an iPhone. */
import { readFileSync } from 'node:fs';
let fails = 0;
const check = (l, c, d = '') => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${d ? ` — ${d}` : ''}`); if (!c) fails++; };

const sw = readFileSync('public/sw.js', 'utf8');
const push = readFileSync('src/lib/push.ts', 'utf8');
const settings = readFileSync('src/components/NotificationSettings.tsx', 'utf8');

console.log('\n  the service worker');
check('it reports the notification it drew', /forge_push_delivered/.test(sw));
/* iOS revokes the subscription outright if a push resolves without something
   visible, so the receipt must never be able to run first or to throw. */
check('the notification is shown before anything else is attempted',
  /showNotification\(title, options\)\.then\(\(\) => receipt\(tag\)\)/.test(sw));
check('and a failing receipt cannot take the notification down with it',
  /\.then\(\(\) => receipt\(tag\)\)\.catch\(\(\) => undefined\)/.test(sw));
check('a replaced notification still alerts', /renotify: true/.test(sw));
check('it sends the endpoint, which is the only credential it has',
  /p_endpoint: subscription\.endpoint/.test(sw));
check('the worker still parses', (() => { try { new Function(sw); return true; } catch { return false; } })());

console.log('\n  the button');
check('Settings can send a test', /sendTestPush/.test(settings));
check('it is only offered once notifications are actually permitted',
  /permission === 'granted' && <div className="notification-test"/.test(settings));
check('delivered is the only word that means it reached a phone',
  /if \(last\.delivered\) return 'Delivered/.test(push));
check('an accepted-but-unseen push says so plainly, and says what to do',
  /Apple accepted it but your phone has not shown it/.test(push) && /Home Screen/.test(push));
check('a retired install is named as a retired install', /no longer registered with Apple/.test(push));
check('an unregistered device is told how to register', /not registered yet/.test(push));
check('it waits several seconds before giving up — a push crosses Apple first',
  /\[1500, 2000, 2500, 3000\]/.test(push));

console.log(fails ? `\n${fails} failing` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
