/* chat.js — موتور گفتگو با ستاره‌ها (آفلاین) */
var Chat = {
  cur: null,          /* شخصیت فعلی */
  msgs: [],
  typing: false,
  idleT: null,
  lastUser: 0
};

Chat.key = function (id) { return 'chat_' + id; };
Chat.load = function (id) { return Store.get(Chat.key(id), []); };
Chat.save = function () { if (Chat.cur) Store.set(Chat.key(Chat.cur.id), Chat.msgs.slice(-120)); };

Chat.meta = function () { return Store.get('chatmeta', {}); };
Chat.setMeta = function (id, last, unreadDelta) {
  var m = Chat.meta();
  if (!m[id]) m[id] = { last: '', ts: 0, unread: 0 };
  if (last !== null) { m[id].last = last; m[id].ts = Date.now(); }
  if (unreadDelta === -1) m[id].unread = 0;
  else if (unreadDelta) m[id].unread = (m[id].unread || 0) + unreadDelta;
  Store.set('chatmeta', m);
  Chat.updateBadge();
};
Chat.totalUnread = function () {
  var m = Chat.meta(), t = 0, k;
  for (k in m) if (m.hasOwnProperty(k)) t += (m[k].unread || 0);
  return t;
};
Chat.updateBadge = function () {
  var n = Chat.totalUnread(), tabs = $('tabbar').getElementsByTagName('button'), i, b;
  for (i = 0; i < tabs.length; i++) {
    if (tabs[i].getAttribute('data-s') === 'chats') {
      b = tabs[i].getElementsByTagName('em')[0];
      if (!b) { b = document.createElement('em'); b.className = 'tb-badge'; b.style.fontStyle = 'normal'; tabs[i].appendChild(b); }
      if (n > 0) { b.innerHTML = fa(n); b.style.display = 'block'; } else { b.style.display = 'none'; }
    }
  }
  var cu = $('chatsUnread');
  if (cu) cu.innerHTML = n > 0 ? '<span class="badge">' + fa(n) + '</span>' : '';
};

/* ---------- لیست چت‌ها ---------- */
Chat.renderList = function () {
  var box = $('chatList'), m = Chat.meta(), i, p, mm, r;
  box.innerHTML = '';
  for (i = 0; i < PERSONAS.length; i++) {
    p = PERSONAS[i];
    mm = m[p.id] || { last: 'برای شروع گفتگو بزن...', ts: 0, unread: 0 };
    r = elc('div', 'row');
    r.innerHTML =
      '<div class="row-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="row-mid"><div class="row-t">' + esc(p.name) + (p.verified ? ' <span class="vbadge">✔</span>' : '') +
      '</div><div class="row-s">' + esc(mm.last || 'سلام! پیام بده...') + '</div></div>' +
      '<div class="row-e">' + (mm.ts ? clock(new Date(mm.ts)) : '') +
      (mm.unread ? '<br><span class="badge">' + fa(mm.unread) + '</span>' : '') + '</div>';
    (function (pp) { on(r, 'click', function () { Snd.tap(); Chat.open(pp.id); }); })(p);
    box.appendChild(r);
  }
  Chat.updateBadge();
};

/* ---------- باز کردن اتاق ---------- */
Chat.open = function (id) {
  Chat.cur = getPersona(id);
  Chat.msgs = Chat.load(id);
  $('roomName').innerHTML = esc(Chat.cur.name) + (Chat.cur.verified ? ' <span class="vbadge">✔</span>' : '');
  $('roomState').innerHTML = 'آنلاین';
  var av = $('roomAva');
  av.innerHTML = Chat.cur.emoji; av.style.background = Chat.cur.color;
  Chat.setMeta(id, null, -1);
  Chat.renderMsgs();
  Chat.renderQuick();
  go('room');
  if (Chat.msgs.length === 0) {
    Chat.pushThem(Chat.cur.greet ? pick(Chat.cur.greet).replace(/\{u\}/g, S.name) : 'سلام!', 800);
  }
  Chat.armIdle();
};

Chat.renderQuick = function () {
  var q = $('quickBar'), i, c, list = (Chat.cur.quick || []).concat(['بعداً حرف می‌زنیم 👋']);
  q.innerHTML = '';
  for (i = 0; i < list.length; i++) {
    c = elc('span', 'qchip', esc(list[i]));
    (function (txt) { on(c, 'click', function () { Snd.tap(); Chat.send(txt); }); })(list[i]);
    q.appendChild(c);
  }
};

Chat.bubble = function (m) {
  var row = elc('div', 'mrow'), cls = 'bub ' + (m.who === 'me' ? 'me' : 'them'), inner;
  if (m.type === 'stk') cls += ' stk';
  if (m.type === 'voice') cls += ' voice';
  if (m.type === 'voice') {
    inner = '🎙 <span class="vwave"></span> ' + fa(m.sec) + '"<span class="t">' + clock(new Date(m.ts)) + '</span>';
  } else if (m.type === 'stk') {
    inner = m.t;
  } else {
    inner = esc(m.t).replace(/\n/g, '<br>') + '<span class="t">' + clock(new Date(m.ts)) + (m.who === 'me' ? ' ✓✓' : '') + '</span>';
  }
  var b = elc('div', cls, inner);
  row.appendChild(b);
  return row;
};

Chat.renderMsgs = function () {
  var box = $('msgs'), i;
  box.innerHTML = '';
  var start = Math.max(0, Chat.msgs.length - 60);
  for (i = start; i < Chat.msgs.length; i++) box.appendChild(Chat.bubble(Chat.msgs[i]));
  Chat.scroll();
};
Chat.scroll = function () {
  var box = $('msgs');
  setTimeout(function () { box.scrollTop = box.scrollHeight + 400; }, 30);
};

Chat.add = function (m, silent) {
  Chat.msgs.push(m);
  var box = $('msgs');
  if (curScreen === 'room' && box) { box.appendChild(Chat.bubble(m)); Chat.scroll(); }
  Chat.save();
  var preview = m.type === 'stk' ? m.t : (m.type === 'voice' ? '🎙 پیام صوتی' : m.t);
  Chat.setMeta(Chat.cur.id, (m.who === 'me' ? 'شما: ' : '') + preview, (m.who === 'them' && curScreen !== 'room') ? 1 : 0);
  if (!silent && m.who === 'them') Snd.msg();
};

Chat.showTyping = function (state) {
  var box = $('msgs'), t = $('typingRow');
  if (state) {
    $('roomState').innerHTML = 'در حال نوشتن...';
    if (!t && curScreen === 'room') {
      t = elc('div', 'mrow'); t.id = 'typingRow';
      t.innerHTML = '<div class="typing">•••</div>';
      box.appendChild(t); Chat.scroll();
    }
  } else {
    $('roomState').innerHTML = 'آنلاین';
    if (t && t.parentNode) t.parentNode.removeChild(t);
  }
};

Chat.pushThem = function (text, delay, type) {
  var p = Chat.cur;
  Chat.showTyping(true);
  setTimeout(function () {
    Chat.showTyping(false);
    if (!Chat.cur || Chat.cur.id !== p.id) return;
    if (type === 'stk') Chat.add({ who: 'them', t: text, ts: Date.now(), type: 'stk' });
    else if (type === 'voice') Chat.add({ who: 'them', t: '', sec: rint(3, 25), ts: Date.now(), type: 'voice' });
    else Chat.add({ who: 'them', t: text, ts: Date.now(), type: 'txt' });
  }, delay || (700 + Math.min(2200, String(text).length * 28)));
};

/* ---------- ساخت پاسخ ---------- */
Chat.answer = function (userText) {
  var p = Chat.cur, intent = detectIntent(userText), t = normFa(userText), bank, out;

  /* یادگرفتن اسم کاربر */
  var mName = t.match(/(?:اسمم|من)\s+([آ-ی]{2,12})\s*(?:هستم|ام|م)?/);
  if (mName && mName[1] && mName[1].length > 1 && ['خوبم','خستم','بدم','اینجام'].indexOf(mName[1]) < 0) {
    S.name = mName[1]; saveSettings();
    return 'چه اسم قشنگی، ' + S.name + ' جان! از این به بعد همینطوری صدات می‌کنم 😊';
  }
  if (t.indexOf('چند') >= 0 && t.indexOf('فالوور') >= 0) return 'فالوورهای من ' + compact(p.followers) + ' نفرن، ولی مهم‌ترینشون تویی 😄';
  if (t.indexOf('ساعت چنده') >= 0) return 'الان ساعت ' + clock() + ' هست ⏰';
  if (t.indexOf('امروز چندمه') >= 0 || t.indexOf('تاریخ') >= 0) return 'امروز ' + faDate() + ' هست 📅';

  bank = (p.banks && p.banks[intent]) ? p.banks[intent] : BASE[intent];
  if (!bank) bank = BASE.fallback;
  out = pick(bank);
  out = out.replace(/\{u\}/g, S.name).replace(/\{p\}/g, p.short);

  if (intent === 'fallback' && Math.random() < 0.45) out += '\n' + pick(FOLLOWUP);
  if (intent === 'call') Chat.offerCall = true;
  return out;
};

Chat.send = function (text) {
  if (!text) {
    text = $('msgInput').value;
    $('msgInput').value = '';
  }
  text = String(text).replace(/^\s+|\s+$/g, '');
  if (!text) return;
  Chat.add({ who: 'me', t: text, ts: Date.now(), type: 'txt' });
  Snd.pop();
  Chat.lastUser = Date.now();
  hide($('stickerPan'));

  var ans = Chat.answer(text);
  Chat.pushThem(ans);

  /* گاهی استیکر یا ویس اضافه می‌فرسته */
  if (Math.random() < 0.22) {
    setTimeout(function () { Chat.pushThem(pick(STICKERS), 500, 'stk'); }, 1600);
  } else if (Math.random() < 0.12) {
    setTimeout(function () { Chat.pushThem('', 500, 'voice'); }, 1800);
  }
  if (Chat.offerCall) {
    Chat.offerCall = false;
    setTimeout(function () {
      if (curScreen === 'room') popup('تماس از ' + Chat.cur.short + '؟', 'می‌خوای همین الان ' + Chat.cur.short + ' بهت زنگ بزنه یا برای ساعت دلخواه تنظیمش کنی؟',
        function () { Calls.incoming(Chat.cur.id, 'voice', ''); }, 'همین الان زنگ بزنه', 'بعداً');
    }, 2600);
  }
  Chat.armIdle();
};

Chat.sendSticker = function (s) {
  Chat.add({ who: 'me', t: s, ts: Date.now(), type: 'stk' });
  Snd.pop();
  setTimeout(function () {
    Chat.pushThem(pick(['😂😂','قشنگ بود 😍','ایول 🔥','همینه 💯', pick(STICKERS)]), 700, Math.random() < 0.5 ? 'stk' : null);
  }, 400);
};

/* ---------- پیام خودکار وقتی کاربر ساکته ---------- */
Chat.armIdle = function () {
  if (Chat.idleT) clearTimeout(Chat.idleT);
  if (!S.push) return;
  Chat.idleT = setTimeout(function () {
    if (curScreen === 'room' && Chat.cur) {
      Chat.pushThem(pick(['کجایی؟ 😄','هستی؟','یه چیزی بگو دیگه 😁','رفتی؟ 🥺', pick(FOLLOWUP)]), 600);
    }
  }, 35000 + rint(0, 20000));
};

/* ---------- پیام‌های ناگهانی از ستاره‌ها (کل برنامه) ---------- */
Chat.randomPing = function () {
  if (!S.push) return;
  if (curScreen === 'room' || curScreen === 'live' || Calls.active) return;
  var p = pick(PERSONAS);
  var texts = ['سلام {u}، چیکار می‌کنی؟','یه خبر خوب دارم برات 😄','دلم برات تنگ شده بود 😍','امروز حالت چطوره؟','لایو گذاشتم، بیا ببین 📡','یه سوال ازت دارم...'];
  var txt = pick(texts).replace(/\{u\}/g, S.name);
  var arr = Chat.load(p.id);
  arr.push({ who: 'them', t: txt, ts: Date.now(), type: 'txt' });
  Store.set(Chat.key(p.id), arr.slice(-120));
  var m = Chat.meta();
  if (!m[p.id]) m[p.id] = { last: '', ts: 0, unread: 0 };
  m[p.id].last = txt; m[p.id].ts = Date.now(); m[p.id].unread = (m[p.id].unread || 0) + 1;
  Store.set('chatmeta', m);
  Chat.updateBadge();
  Snd.msg(); vibe(120);
  toast('💬 پیام جدید از ' + p.short + ': ' + txt);
  if (curScreen === 'chats') Chat.renderList();
};

/* ---------- راه‌اندازی ---------- */
Chat.init = function () {
  on($('btnSend'), 'click', function () { Chat.send(); });
  on($('msgInput'), 'keydown', function (e) { if (e.keyCode === 13) { Chat.send(); e.preventDefault(); } });
  on($('roomBack'), 'click', function () { go('chats', true); Chat.renderList(); });
  on($('roomCall'), 'click', function () { Calls.incoming(Chat.cur.id, 'voice', ''); });
  on($('roomVideo'), 'click', function () { Calls.incoming(Chat.cur.id, 'video', ''); });
  on($('roomMenu'), 'click', function () {
    popup('گزینه‌ها', 'می‌خوای گفتگو با ' + Chat.cur.short + ' رو پاک کنی؟', function () {
      Chat.msgs = []; Chat.save(); Chat.renderMsgs(); Chat.setMeta(Chat.cur.id, 'گفتگو پاک شد', 0); toast('پاک شد ✅');
    }, 'پاک کن', 'بی‌خیال');
  });
  on($('btnVoice'), 'click', function () {
    Chat.add({ who: 'me', t: '', sec: rint(2, 18), ts: Date.now(), type: 'voice' });
    Snd.pop();
    setTimeout(function () { Chat.pushThem(pick(['ویس‌ت رو گوش دادم 😄 قشنگ بود','صدات باحاله 😍','آره موافقم 👌','بلند بگو نشنیدم 😁']), 900); }, 700);
  });
  on($('btnSticker'), 'click', function () {
    var pan = $('stickerPan');
    if (pan.className.indexOf('hidden') >= 0) {
      if (!pan.innerHTML) {
        var i, e;
        for (i = 0; i < STICKERS.length; i++) {
          e = elc('div', 'stk-i', STICKERS[i]);
          (function (s) { on(e, 'click', function () { Chat.sendSticker(s); hide(pan); }); })(STICKERS[i]);
          pan.appendChild(e);
        }
      }
      show(pan);
    } else hide(pan);
  });
  Chat.updateBadge();
};
