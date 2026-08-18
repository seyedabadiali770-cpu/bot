const { Telegraf } = require('telegraf');
const sqlite3 = require('sqlite3').verbose();
const net = require('net');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || '8688771229:AAHJj9Bf9n7cRQU2VgKYBlA-MVlisJl5pjY';
const bot = new Telegraf(BOT_TOKEN);
const db = new sqlite3.Database('./bot.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, telegram_id TEXT UNIQUE, username TEXT)`);
    db.run(`CREATE TABLE IF NOT EXISTS configs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, type TEXT, server TEXT, port INTEGER, config_data TEXT, ping_ms INTEGER)`);
});

function genUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { r = Math.random()*16|0; return (c=='x'?r:(r&0x3|0x8)).toString(16); }); }
function testPing(host, port) { return new Promise(resolve => { const s = new net.Socket(); s.setTimeout(5000); const t = Date.now(); s.on('connect', () => { s.destroy(); resolve(Date.now()-t); }); s.on('error', () => resolve(null)); s.on('timeout', () => { s.destroy(); resolve(null); }); try { s.connect(port, host); } catch(e) { resolve(null); } }); }
function getUser(tid, uname) { return new Promise(res => { db.get('SELECT * FROM users WHERE telegram_id = ?', [tid], (e, u) => { if (u) res(u); else db.run('INSERT INTO users (telegram_id, username) VALUES (?, ?)', [tid, uname||'U'], function() { res({id: this.lastID}); }); }); }); }

const menu = { reply_markup: JSON.stringify({ keyboard: [['📡 ساخت کانفیگ'], ['📋 کانفیگ‌های من'], ['⚡ تست پینگ همه'], ['🏆 بهترین‌ها'], ['🗑️ حذف']], resize_keyboard: true }) };
const types = { reply_markup: JSON.stringify({ keyboard: [['📡 V2Ray'], ['🔴 Trojan'], ['🟡 WireGuard'], ['🟢 Shadowsocks'], ['🔙 منو']], resize_keyboard: true }) };

const servers = [
    {s:'185.244.181.12',p:443,c:'🇩🇪'}, {s:'194.36.88.45',p:443,c:'🇳🇱'}, {s:'195.58.39.78',p:443,c:'🇫🇷'},
    {s:'198.54.128.99',p:443,c:'🇺🇸'}, {s:'185.102.219.33',p:443,c:'🇬🇧'}, {s:'212.80.246.77',p:443,c:'🇨🇦'},
    {s:'185.198.56.89',p:443,c:'🇯🇵'}, {s:'185.244.180.44',p:443,c:'🇸🇬'}, {s:'194.36.89.22',p:443,c:'🇹🇷'},
];

bot.start(async ctx => { await getUser(ctx.from.id+'', ctx.from.username); ctx.reply('🤖 ربات کانفیگ!', {reply_markup: menu.reply_markup}); });
bot.hears('🔙 منو', ctx => ctx.reply('منو:', {reply_markup: menu.reply_markup}));
bot.hears('📡 ساخت کانفیگ', ctx => ctx.reply('نوع:', {reply_markup: types.reply_markup}));

bot.hears('📡 V2Ray', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    const srv = servers[Math.floor(Math.random()*servers.length)];
    const uuid = genUUID();
    const data = JSON.stringify({v:'2',ps:'VPN',add:srv.s,port:srv.p,id:uuid,aid:0,net:'tcp',type:'none',tls:'tls'}, null, 2);
    const ping = await testPing(srv.s, srv.p);
    db.run('INSERT INTO configs (user_id, name, type, server, port, config_data, ping_ms) VALUES (?,?,?,?,?,?,?)', [u.id, srv.c+' V2Ray', 'v2ray', srv.s, srv.p, data, ping]);
    ctx.replyWithMarkdown(`✅ *${srv.c} V2Ray*\n⚡ پینگ: ${ping||'نا'}\n\`\`\`${data}\`\`\``);
});

bot.hears('🔴 Trojan', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    const srv = servers[Math.floor(Math.random()*servers.length)];
    const pass = genUUID();
    const data = `trojan://${pass}@${srv.s}:${srv.p}#Trojan-VPN`;
    const ping = await testPing(srv.s, srv.p);
    db.run('INSERT INTO configs (user_id, name, type, server, port, config_data, ping_ms) VALUES (?,?,?,?,?,?,?)', [u.id, srv.c+' Trojan', 'trojan', srv.s, srv.p, data, ping]);
    ctx.replyWithMarkdown(`✅ *${srv.c} Trojan*\n⚡ پینگ: ${ping||'نا'}\n\`\`\`${data}\`\`\``);
});

bot.hears('🟡 WireGuard', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    const srv = servers[0];
    const data = `[Interface]\nPrivateKey = ${crypto.randomBytes(32).toString('base64url')}\nAddress = 10.0.0.2/24\n\n[Peer]\nPublicKey = ${crypto.randomBytes(32).toString('base64url')}\nEndpoint = ${srv.s}:${srv.p}\nAllowedIPs = 0.0.0.0/0`;
    const ping = await testPing(srv.s, srv.p);
    db.run('INSERT INTO configs (user_id, name, type, server, port, config_data, ping_ms) VALUES (?,?,?,?,?,?,?)', [u.id, srv.c+' WireGuard', 'wireguard', srv.s, srv.p, data, ping]);
    ctx.replyWithMarkdown(`✅ *${srv.c} WireGuard*\n⚡ پینگ: ${ping||'نا'}`);
});

bot.hears('🟢 Shadowsocks', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    const srv = servers[0];
    const uuid = genUUID();
    const data = `ss://${Buffer.from(uuid+':'+uuid).toString('base64')}@${srv.s}:${srv.p}#SS-${srv.c}`;
    const ping = await testPing(srv.s, srv.p);
    db.run('INSERT INTO configs (user_id, name, type, server, port, config_data, ping_ms) VALUES (?,?,?,?,?,?,?)', [u.id, srv.c+' SS', 'ss', srv.s, srv.p, data, ping]);
    ctx.replyWithMarkdown(`✅ *${srv.c} Shadowsocks*\n⚡ پینگ: ${ping||'نا'}`);
});

bot.hears('📋 کانفیگ‌های من', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    db.all('SELECT * FROM configs WHERE user_id = ?', [u.id], (e, rows) => { ctx.reply(rows.length ? rows.map((r,i) => `${i+1}. ${r.name} ${r.ping_ms?'⚡'+r.ping_ms:'❌'}`).join('\n') : '📭 کانفیگی نیست!'); });
});

bot.hears('⚡ تست پینگ همه', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    db.all('SELECT * FROM configs WHERE user_id = ?', [u.id], async (e, rows) => {
        let msg = '⏳ تست...\n';
        for (const r of rows) { const p = await testPing(r.server, r.port); db.run('UPDATE configs SET ping_ms = ? WHERE id = ?', [p, r.id]); msg += `${r.name}: ${p?'✅ '+p+'ms':'❌'}\n`; }
        ctx.reply(msg);
    });
});

bot.hears('🏆 بهترین‌ها', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    db.all('SELECT * FROM configs WHERE user_id = ? AND ping_ms IS NOT NULL ORDER BY ping_ms LIMIT 5', [u.id], (e, rows) => { ctx.reply(rows.length ? rows.map((r,i) => `${['🥇','🥈','🥉'][i]||i+1} ${r.name} ⚡${r.ping_ms}ms`).join('\n') : '🏆 کانفیگی نیست!'); });
});

bot.hears('🗑️ حذف', async ctx => {
    const u = await getUser(ctx.from.id+'', ctx.from.username);
    db.all('SELECT * FROM configs WHERE user_id = ?', [u.id], (e, rows) => {
        if (!rows.length) return ctx.reply('🗑️ کانفیگی نیست!');
        const kb = { inline_keyboard: rows.map(r => [{text: '🗑️ '+r.name, callback_data: 'd'+r.id}]) };
        ctx.reply('انتخاب:', {reply_markup: JSON.stringify(kb)});
    });
});

bot.on('callback_query', ctx => {
    db.run('DELETE FROM configs WHERE id = ?', [ctx.callbackQuery.data.replace('d','')]);
    ctx.answerCbQuery('✅ حذف شد!');
    ctx.editMessageText('✅ حذف شد!');
});

console.log('Starting...');
bot.launch().then(() => console.log('✅ Bot running!')).catch(e => console.log('❌', e.message));
