/** Opt-in local network hosting. Works with npm on Windows, macOS, Linux. */
import { networkInterfaces } from 'node:os';
process.env.HOST='0.0.0.0';
const port=Number(process.env.PORT||4173);
const addresses=[...new Set(Object.values(networkInterfaces()).flat().filter(x=>x&&x.family==='IPv4'&&!x.internal).map(x=>x.address))];
console.log('\nCoursewise is visible to other devices on your trusted local network.');
console.log('On this computer: http://localhost:'+port);
for(const address of addresses)console.log('On the same Wi-Fi: http://'+address+':'+port);
if(!addresses.length)console.log('No LAN IPv4 address detected. Check your Wi-Fi connection.');
console.log('If Windows asks about the firewall, allow Node.js on Private networks only.');
console.log('Stop with Ctrl+C. Never port-forward this development server to the internet.\n');
await import('../server.mjs');
