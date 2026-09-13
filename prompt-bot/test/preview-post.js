'use strict';

/* ============================================================
   👀 پیش‌نمایش پست‌ها (بدون تلگرام)
   اجرا: node prompt-bot/test/preview-post.js [تعداد]
   چند نمونه‌ی تصادفی از متن پستی که در کانال منتشر می‌شود را
   در ترمینال چاپ می‌کند.
   ============================================================ */

const path = require('path');
const { spawn } = require('child_process');

const COUNT = Number(process.argv[2] || 3);
const PORT = 8099;
const API = `http://127.0.0.1:${PORT}`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const strip = t => String(t).replace(/<\/?[a-z][^>]*>/g, '');

(async () => {
  const mock = spawn(process.execPath, [path.join(__dirname, 'telegram-mock.js'), String(PORT)], { stdio: 'ignore' });
  await sleep(800);

  process.env.PROMPT_BOT_TOKEN = '1:preview';
  process.env.TELEGRAM_API_ROOT = API;
  process.env.PROMPT_STATE_PATH = path.join(require('os').tmpdir(), 'prompt-preview-state.json');
  try { require('fs').unlinkSync(process.env.PROMPT_STATE_PATH); } catch (e) { /* ignore */ }

  const mod = require('../index.js');
  const { PROMPTS } = require('../prompts.js');
  await sleep(1500);

  for (let i = 0; i < COUNT; i++) {
    const item = PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
    const { text } = mod.buildPost(item);
    console.log('\n' + '━'.repeat(58));
    console.log('🖼️  [عکس نمونه‌ی ساخته‌شده با همین پرامپت اینجا می‌آید]');
    console.log('━'.repeat(58));
    console.log(strip(text));
  }
  console.log('\n' + '━'.repeat(58));
  console.log(`🧠 بانک: ${PROMPTS.length} پرامپت`);
  mock.kill();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
