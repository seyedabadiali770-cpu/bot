const { Telegraf } = require('telegraf');
const net = require('net');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN || '8688771229:AAHJj9Bf9n7cRQU2VgKYBlA-MVlisJl5pjY';
const bot = new Telegraf(BOT_TOKEN);

function genUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        r = Math.random()*16|0;
        return (c=='x'?r:(r&0x3|0x8)).toString(16);
    });
}

function testPing(host, port) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        const t = Date.now();
        socket.on('connect', () => { socket.destroy(); resolve(Date.now() - t); });
        socket.on('error', () => resolve(null));
        socket.on('timeout', () => { socket.destroy(); resolve(null); });
        try { socket.connect(port, host); } catch(e) { resolve(null); }
    });
}

const menu = { reply_markup: JSON.stringify({ keyboard: [['📡 V2Ray'], ['🔴 Trojan'], ['🟡 WireGuard'], ['🟢 Shadowsocks'], ['🌍 تغییر سرور'], ['❓ راهنما']], resize_keyboard: true }) };

let currentServer = { s: '185.244.181.12', p: 443, c: '🇩🇪 آلمان' };
const serverList = [
    { s: '185.244.181.12', p: 443, c: '🇩🇪 آلمان' },
    { s: '194.36.88.45', p: 443, c: '🇳🇱 هلند' },
    { s: '195.58.39.78', p: 443, c: '🇫🇷 فرانسه' },
    { s: '198.54.128.99', p: 443, c: '🇺🇸 آمریکا' },
    { s: '185.102.219.33', p: 443, c: '🇬🇧 انگلیس' },
    { s: '212.80.246.77', p: 443, c: '🇨🇦 کانادا' },
    { s: '185.198.56.89', p: 443, c: '🇯🇵 ژاپن' },
    { s: '185.244.180.44', p: 443, c: '🇸🇬 سنگاپور' },
    { s: '194.36.89.22', p: 443, c: '🇹🇷 ترکیه' },
];

const serverMenu = { reply_markup: JSON.stringify({ keyboard: serverList.map(s => [{ text: s.c }]).concat([[{ text: '🔙 منو' }]]), resize_keyboard: true }) };

bot.start(async ctx => { await ctx.reply('🤖 ربات سازنده کانفیگ!\n\nسرور فعلی: ' + currentServer.c, { parse_mode: 'Markdown', reply_markup: menu.reply_markup }); });

bot.hears('❓ راهنما', async ctx => { await ctx.replyWithMarkdown('📖 *راهنما*\n\n📡 V2Ray: کانفیگ V2Ray\n🔴 Trojan: کانفیگ Trojan\n🟡 WireGuard: کانفیگ WireGuard\n🟢 Shadowsocks: کانفیگ Shadowsocks\n🌍 تغییر سرور: سرور رو عوض کن\n\n━━━━━━━━━━━━━━━\nهر کانفیگ پینگش هم تست میشه!'); });

bot.hears('🔙 منو', async ctx => { await ctx.reply('📌 منوی اصلی\nسرور فعلی: ' + currentServer.c, { reply_markup: menu.reply_markup }); });

bot.hears('🌍 تغییر سرور', async ctx => { await ctx.reply('🌍 سرور مورد نظر را انتخاب کن:', { reply_markup: serverMenu.reply_markup }); });

serverList.forEach(srv => {
    bot.hears(srv.c, async ctx => {
        currentServer = srv;
        const ping = await testPing(srv.s, srv.p);
        await ctx.reply('✅ سرور تغییر کرد!\n\n' + srv.c + '\n🌍 ' + srv.s + '\n⚡ پینگ: ' + (ping ? ping + 'ms' : 'نا'), { reply_markup: menu.reply_markup });
    });
});

bot.hears('📡 V2Ray', async ctx => {
    await ctx.reply('⏳ در حال ساخت...');
    const srv = currentServer;
    const uuid = genUUID();
    const ping = await testPing(srv.s, srv.p);
    const config = JSON.stringify({v:'2',ps:'VPN',add:srv.s,port:srv.p,id:uuid,aid:0,net:'tcp',type:'none',tls:'tls'}, null, 2);
    await ctx.replyWithMarkdown('✅ *کانفیگ V2Ray*\n\n🌍 ' + srv.c + '\n⚡ پینگ: ' + (ping||'نا') + '\n\n━━━━━━━━━━━━━━━\n```' + config + '```');
});

bot.hears('🔴 Trojan', async ctx => {
    await ctx.reply('⏳ در حال ساخت...');
    const srv = currentServer;
    const pass = genUUID();
    const ping = await testPing(srv.s, srv.p);
    const config = 'trojan://' + pass + '@' + srv.s + ':' + srv.p;
    await ctx.replyWithMarkdown('✅ *کانفیگ Trojan*\n\n🌍 ' + srv.c + '\n⚡ پینگ: ' + (ping||'نا') + '\n\n━━━━━━━━━━━━━━━\n```' + config + '```');
});

bot.hears('🟡 WireGuard', async ctx => {
    await ctx.reply('⏳ در حال ساخت...');
    const srv = currentServer;
    const ping = await testPing(srv.s, srv.p);
    const config = '[Interface]\nPrivateKey = ' + crypto.randomBytes(32).toString('base64url') + '\nAddress = 10.0.0.2/24\nDNS = 1.1.1.1\n\n[Peer]\nPublicKey = ' + crypto.randomBytes(32).toString('base64url') + '\nEndpoint = ' + srv.s + ':' + srv.p + '\nAllowedIPs = 0.0.0.0/0';
    await ctx.replyWithMarkdown('✅ *کانفیگ WireGuard*\n\n🌍 ' + srv.c + '\n⚡ پینگ: ' + (ping||'نا') + '\n\n━━━━━━━━━━━━━━━\n```' + config + '```');
});

bot.hears('🟢 Shadowsocks', async ctx => {
    await ctx.reply('⏳ در حال ساخت...');
    const srv = currentServer;
    const pass = genUUID();
    const ping = await testPing(srv.s, srv.p);
    const config = 'ss://' + Buffer.from(pass + ':' + pass).toString('base64') + '@' + srv.s + ':' + srv.p + '#SS-' + srv.c;
    await ctx.replyWithMarkdown('✅ *کانفیگ Shadowsocks*\n\n🌍 ' + srv.c + '\n⚡ پینگ: ' + (ping||'نا') + '\n\n━━━━━━━━━━━━━━━\n```' + config + '```');
});

bot.on('message', async ctx => {
    if (ctx.message.text && !ctx.message.text.startsWith('/')) {
        await ctx.reply('📌 از منوی زیر انتخاب کن:', { reply_markup: menu.reply_markup });
    }
});

bot.catch(err => console.log('Bot error:', err));
console.log('Starting...');
bot.launch().then(() => console.log('✅ Bot running!')).catch(e => console.log('❌', e.message));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
