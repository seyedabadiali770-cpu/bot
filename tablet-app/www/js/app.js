/* app.js — راه‌اندازی و صفحه خانه */

var HOME_ITEMS = [
  { e: '💬', t: 'چت با رونالدو', s: 'پیام فارسی', go: function () { Chat.open('cr7'); } },
  { e: '📞', t: 'زنگ بزنه بهم', s: 'زمان‌بندی', go: function () { go('calls'); } },
  { e: '💼', t: 'شغل آینده', s: 'اثر انگشت', go: function () { go('mirror'); Mirror.open('job'); } },
  { e: '💍', t: 'همسر آینده', s: 'اثر انگشت', go: function () { go('mirror'); Mirror.open('spouse'); } },
  { e: '🕵️', t: 'دروغ‌سنج', s: 'حسگر واقعی', go: function () { Lie.open(); } },
  { e: '📡', t: 'لایو ستاره‌ها', s: 'مثل اینستا', go: function () { go('lives'); } },
  { e: '❤️', t: 'درصد عشق', s: 'دو اسم', go: function () { go('mirror'); Mirror.open('love'); } },
  { e: '📖', t: 'فال حافظ', s: 'نیت کن', go: function () { go('mirror'); Mirror.open('hafez'); } },
  { e: '🧠', t: 'شخصیت‌شناسی', s: 'اثر انگشت', go: function () { go('mirror'); Mirror.open('person'); } },
  { e: '🍀', t: 'شانس امروز', s: 'روزانه', go: function () { go('mirror'); Mirror.open('luck'); } },
  { e: '🔴', t: 'لایو خودم', s: 'فالوور بگیر', go: function () { Live.start(null, true); } },
  { e: '⭐', t: 'صفحه ستاره‌ها', s: 'پروفایل', go: function () { Social.openStar(pick(PERSONAS).id); } },
  { e: '👶', t: 'تعداد فرزند', s: 'اثر انگشت', go: function () { go('mirror'); Mirror.open('kids'); } },
  { e: '💰', t: 'ثروت آینده', s: 'اثر انگشت', go: function () { go('mirror'); Mirror.open('wealth'); } },
  { e: '📘', t: 'راهنما', s: 'آموزش کامل', go: function () { App.openHelp(); } },
  { e: '⚙', t: 'تنظیمات', s: 'رمزدار 🔒', go: function () { go('set'); } }
];

App.renderHome = function () {
  if (!$('homeGrid')) return;
  $('homeName').innerHTML = esc(S.name);
  $('homeDate').innerHTML = faDate();
  $('homeClock').innerHTML = clock();

  var g = $('homeGrid'), i, c;
  if (!g.innerHTML) {
    for (i = 0; i < HOME_ITEMS.length; i++) {
      c = elc('div', 'gcell');
      c.innerHTML = '<div class="gcell-in"><div class="gcell-ico">' + HOME_ITEMS[i].e + '</div>' +
        '<div class="gcell-t">' + HOME_ITEMS[i].t + '</div><div class="gcell-s">' + HOME_ITEMS[i].s + '</div></div>';
      (function (fn) { on(c, 'click', function () { Snd.tap(); fn(); }); })(HOME_ITEMS[i].go);
      g.appendChild(c);
    }
  }

  /* آمار امروز */
  var rnd = seedRnd(hashStr(S.name + dayKey()));
  var energy = rintS(45, 100, rnd), luck = rintS(30, 100, rnd);
  var alarms = Calls.alarms(), live = 0, j;
  for (j = 0; j < alarms.length; j++) if (!alarms[j].done) live++;
  var st = $('homeStats');
  st.innerHTML =
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + compact(S.followers) + '</div><div class="stat-l">فالوور</div></div></div>' +
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + fa(energy) + '٪</div><div class="stat-l">انرژی امروز</div></div></div>' +
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + fa(luck) + '٪</div><div class="stat-l">شانس امروز</div></div></div>' +
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + fa(Chat.totalUnread()) + '</div><div class="stat-l">پیام نخوانده</div></div></div>' +
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + fa(live) + '</div><div class="stat-l">تماس ثبت‌شده</div></div></div>' +
    '<div class="stat"><div class="stat-in"><div class="stat-v">' + faNum(S.coins) + '</div><div class="stat-l">سکه</div></div></div>';

  /* تماس‌های نزدیک */
  var box = $('homeAlarms'), r, p, k, cnt = 0;
  box.innerHTML = '';
  for (k = 0; k < alarms.length; k++) {
    if (alarms[k].done) continue;
    p = getPersona(alarms[k].pid);
    r = elc('div', 'row');
    var mins = Math.max(0, Math.round((alarms[k].at - Date.now()) / 60000));
    r.innerHTML = '<div class="row-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="row-mid"><div class="row-t">' + esc(p.short) + ' • ' + fa(pad2(alarms[k].h) + ':' + pad2(alarms[k].m)) + '</div>' +
      '<div class="row-s">' + (mins > 60 ? fa(Math.round(mins / 60)) + ' ساعت دیگه' : fa(mins) + ' دقیقه دیگه') + '</div></div>' +
      '<div class="row-e">' + (alarms[k].kind === 'video' ? '📹' : '📞') + '</div>';
    box.appendChild(r); cnt++;
    if (cnt >= 3) break;
  }
  if (!cnt) box.innerHTML = '<div class="empty">تماسی تنظیم نشده — از بخش «تماس» ساعت بذار</div>';

  /* کارت ستاره بالای صفحه */
  var hp = getPersona('cr7');
  $('heroAva').innerHTML = hp.emoji; $('heroAva').style.background = hp.color;
  $('heroLine').innerHTML = pick(['آنلاین است • همین الان', 'الان لایو داره 🔴', 'تازه استوری گذاشت', 'منتظر پیام توئه 💬']);
};

App.onScreen = function (name) {
  if (name === 'home') App.renderHome();
  else if (name === 'chats') Chat.renderList();
  else if (name === 'lives') Live.renderList();
  else if (name === 'mirror') Mirror.renderHistory();
  else if (name === 'calls') { Calls.renderAlarms(); Calls.renderHist(); }
  else if (name === 'profile') Social.renderProfile();
  else if (name === 'set') App.fillSettings();
};

/* ---------- تنظیمات ---------- */
var EMOJIS = ['😎','🦁','👑','⚽','🔥','🐐','🎮','🌹','🐶','🦅','💎','🎤','🚀','🌙','🧠','🕶'];
App.fillSettings = function () {
  $('setName').value = S.name;
  $('setBio').value = S.bio;
  var e = $('setEmoji'), i, d;
  if (!e.innerHTML) {
    for (i = 0; i < EMOJIS.length; i++) {
      d = elc('div', 'emo' + (EMOJIS[i] === S.emoji ? ' on' : ''), EMOJIS[i]);
      (function (em) {
        on(d, 'click', function () {
          S.emoji = em; saveSettings();
          var all = e.getElementsByTagName('div'), j;
          for (j = 0; j < all.length; j++) all[j].className = (all[j].innerHTML === em) ? 'emo on' : 'emo';
          Snd.tap(); Social.renderProfile();
        });
      })(EMOJIS[i]);
      e.appendChild(d);
    }
  }
  var sel = $('setFol'), opts = [1200, 25000, 150000, 900000, 2400000, 12000000, 88000000], o;
  if (!sel.innerHTML) {
    for (i = 0; i < opts.length; i++) { o = document.createElement('option'); o.value = opts[i]; o.innerHTML = compact(opts[i]); sel.appendChild(o); }
  }
  sel.value = S.followers > 88000000 ? 88000000 : (opts.indexOf ? (opts.indexOf(S.followers) >= 0 ? S.followers : opts[4]) : opts[4]);
  if ($('setRing')) $('setRing').value = S.ring || 'iphone';
  if ($('setPass')) $('setPass').value = S.pass || '';
  function sw(id, val) { $(id).className = val ? 'sw on' : 'sw'; }
  sw('swTheme', S.theme === 'light'); sw('swSound', S.sound); sw('swVibe', S.vibe);
  sw('swFx', S.fx); sw('swLock', S.lock); sw('swPush', S.push); sw('swCam', S.cam !== false);
};

App.initSettings = function () {
  function toggle(id, key, after) {
    on($(id), 'click', function () {
      var b = $(id), nv = b.className.indexOf('on') < 0;
      b.className = nv ? 'sw on' : 'sw';
      if (key) { S[key] = nv; saveSettings(); }
      Snd.tap();
      if (after) after(nv);
    });
  }
  toggle('swTheme', null, function (v) {
    S.theme = v ? 'light' : 'dark'; saveSettings();
    document.body.className = v ? 'theme-light' : 'theme-dark';
  });
  toggle('swSound', 'sound'); toggle('swVibe', 'vibe'); toggle('swFx', 'fx');
  toggle('swCam', 'cam', function (v) { if (!v && Live.cam.on) Live.stopCam(); });
  toggle('swLock', 'lock'); toggle('swPush', 'push');
  on($('setSave'), 'click', function () {
    S.name = $('setName').value || 'دوست من';
    S.bio = $('setBio').value || S.bio;
    S.followers = parseInt($('setFol').value, 10) || S.followers;
    S.ring = $('setRing').value;
    if ($('setPass').value) S.pass = $('setPass').value;
    saveSettings(); Social.renderProfile(); App.renderHome();
    Snd.ok(); toast('ذخیره شد ✅');
  });
  on($('setRingTest'), 'click', function () {
    S.ring = $('setRing').value; saveSettings();
    Snd.startRing();
    toast('🔔 در حال پخش زنگ... (۵ ثانیه)');
    setTimeout(function () { Snd.stopRing(); }, 5000);
  });
  on($('btnHelp2'), 'click', function () { App.openHelp(); });
  on($('helpBack'), 'click', function () { goBack(); });
  on($('setReset'), 'click', function () {
    popup('پاک کردن همه چیز', 'همه‌ی چت‌ها، تماس‌ها و نتیجه‌ها پاک بشه؟', function () {
      Store.clearAll(); location.reload();
    }, 'آره پاک کن', 'نه');
  });
};

/* ---------- قفل رمز تنظیمات ---------- */
App.setUnlocked = false;
App.gateSettings = function () {
  if (App.setUnlocked) return true;
  if (!S.pass) return true;
  var box = $('passBox');
  $('passInput').value = '';
  $('passInput').type = 'password';
  $('passMsg').innerHTML = 'رمز رو وارد کن';
  show(box);
  setTimeout(function () { try { $('passInput').focus(); } catch (e) {} }, 200);
  return false;
};
App.initPass = function () {
  function tryPass() {
    var v = $('passInput').value;
    if (v === S.pass) {
      App.setUnlocked = true;
      hide($('passBox'));
      Snd.ok(); vibe(60);
      toast('✅ خوش اومدی ' + esc(S.name));
      go('set');
    } else {
      Snd.err(); vibe(200);
      $('passMsg').innerHTML = '<span style="color:#e0284a">رمز اشتباهه! دوباره امتحان کن</span>';
      $('passInput').value = '';
    }
  }
  on($('passOk'), 'click', tryPass);
  on($('passInput'), 'keydown', function (e) { if (e.keyCode === 13) { tryPass(); e.preventDefault(); } });
  on($('passCancel'), 'click', function () { hide($('passBox')); go('home', true); });
  on($('passShow'), 'click', function () {
    var i = $('passInput');
    i.type = (i.type === 'password') ? 'text' : 'password';
    $('passShow').innerHTML = (i.type === 'password') ? 'نمایش رمز' : 'مخفی کردن';
  });
};

/* ---------- راهنما ---------- */
var HELP = [
  { e: '🏠', t: 'صفحه خانه', d: 'بالای صفحه اسم تو، تاریخ شمسی و ساعت رو نشون می‌ده. کارت بالایی رونالدوئه؛ دکمه «پیام» می‌بردت به چت و «تماس» همون لحظه بهت زنگ می‌زنه. پایین‌تر آمار امروز (انرژی، شانس، سکه) و تماس‌های زمان‌بندی‌شده رو می‌بینی.' },
  { e: '💬', t: 'چت با ستاره‌ها', d: 'از تب «پیام» یکی از ۸ ستاره رو انتخاب کن. می‌تونی تایپ کنی یا از نوار پیام‌های آماده بالای کیبورد یکی رو بزنی. دکمه 😊 استیکر می‌فرسته، 🎤 پیام صوتی و ⋮ گفتگو رو پاک می‌کنه. اگه بنویسی «اسمم علیه» اسمت رو یاد می‌گیره.' },
  { e: '📞', t: 'تماس و زمان‌بندی', d: 'تب «تماس»: بالای صفحه با یک ضربه روی اسم هر ستاره، همون لحظه بهت زنگ می‌زنه. پایین‌تر فرم زمان‌بندی هست: شخص، ساعت، صوتی یا تصویری، یک‌بار یا هر روز، و جمله‌ای که موقع تماس می‌گه. بزن «ثبت تماس». سر ساعت، حتی اگه برنامه بسته باشه، تبلت زنگ می‌خوره.' },
  { e: '📡', t: 'لایو', d: 'تب «لایو»: بالا استوری‌ها و پایین لایوهای زنده. وارد لایو که بشی بیننده‌ها، کامنت‌ها و قلب‌ها میان. اگه کامنت بذاری، ستاره با اسم خودت بهت جواب می‌ده. دکمه 🎁 هدیه می‌فرسته (سکه کم می‌شه) و ❤️ قلب پرت می‌کنه.' },
  { e: '🔴', t: 'لایو خودت', d: 'از پروفایل دکمه «لایو من» رو بزن. بیننده و کامنت و هدیه می‌گیری و آخرش فالوور جدید بهت اضافه می‌شه.' },
  { e: '🔮', t: 'آینه‌های اثر انگشت', d: 'تب «آینه»: ۱۴ آینه مثل شغل آینده، همسر آینده، سن ازدواج، ثروت، تعداد فرزند، شخصیت‌شناسی، درصد عشق، فال حافظ و شانس امروز. اسمت رو بنویس، بعد انگشتت رو روی دایره بذار و تا ۱۰۰٪ نگه دار. نتیجه هر اسم همیشه ثابت می‌مونه.' },
  { e: '🕵️', t: 'دروغ‌سنج', d: 'اول ۳ سؤال کنترلی می‌پرسه تا حالت عادی بدنت اندازه‌گیری بشه. انگشتت رو نگه دار، صبر کن سؤال بیاد، بلند جواب بده و بعد «بله» یا «خیر» رو بزن. زمان واکنش، لرزش دستت، فشار انگشت و صدات اندازه‌گیری می‌شه. آخرش درصد صداقت هر جواب رو نشون می‌ده.' },
  { e: '👤', t: 'پروفایل', d: 'فالوور، پست، بیو و تیک آبی. «افزایش فالوور 🚀» فالوور و سکه اضافه می‌کنه، «لایو من» لایوت رو شروع می‌کنه.' },
  { e: '⚙️', t: 'تنظیمات (رمزدار)', d: 'فقط با رمز باز می‌شه. می‌تونی اسم، آواتار، بیو، تعداد فالوور، صدای زنگ (آیفون/کلاسیک/بی‌صدا) و رمز رو عوض کنی. اگه تبلت کند شد، «جلوه‌ها» رو خاموش کن. «قفل اثر انگشت» یعنی موقع باز کردن برنامه باید انگشتت رو نگه داری.' },
  { e: '🔑', t: 'رمز تو', d: 'رمز فعلی ورود به تنظیمات همون رمزیه که خودت انتخاب کردی. اگه عوضش کردی و یادت رفت، تنها راه پاک کردن اطلاعات برنامه از تنظیمات اندروید (Clear data) هست.' },
  { e: '💡', t: 'نکته‌ها', d: 'برای نتیجه بهتر دروغ‌سنج تبلت رو دستت بگیر. برای زنگ خوردن سر ساعت، برنامه رو از لیست برنامه‌های اخیر پاک نکن. همه شخصیت‌ها شبیه‌سازی و برای سرگرمی‌ان.' }
];
App.openHelp = function () {
  var box = $('helpScroll'), i, h = '<div class="card" style="margin-top:10px">';
  h += '<div class="res-h">📘 راهنمای ستاره لایو</div><div class="res-sub">هر بخش رو کوتاه توضیح دادم</div></div>';
  for (i = 0; i < HELP.length; i++) {
    h += '<div class="card" style="margin-top:8px"><div style="font-weight:bold;font-size:15px;margin-bottom:5px">' +
      HELP[i].e + ' ' + HELP[i].t + '</div><div style="font-size:13.5px;line-height:2;color:#a7b0c9">' + HELP[i].d + '</div></div>';
  }
  h += '<div class="pad60"></div>';
  box.innerHTML = h;
  go('help');
};

/* ---------- بوت ---------- */
App.boot = function () {
  loadSettings();

  /* تب‌ها */
  var tabs = $('tabbar').getElementsByTagName('button'), i;
  for (i = 0; i < tabs.length; i++) {
    (function (b) {
      on(b, 'click', function () { Snd.tap(); go(b.getAttribute('data-s'), true); navStack = []; });
    })(tabs[i]);
  }

  Chat.init(); Calls.init(); Mirror.init(); Lie.init(); Live.init(); Social.init(); App.initSettings(); App.initPass();

  on($('heroChat'), 'click', function () { Chat.open('cr7'); });
  on($('heroCall'), 'click', function () { Calls.incoming('cr7', 'voice', ''); });
  on($('heroCard'), 'click', function (e) {
    if (e.target.className.indexOf('mini-btn') >= 0) return;
    Social.openStar('cr7');
  });

  App.renderHome();
  Chat.updateBadge();

  /* ساعت */
  setInterval(function () {
    if (curScreen === 'home') $('homeClock').innerHTML = clock();
    if ($('lockClock')) $('lockClock').innerHTML = clock();
  }, 10000);

  /* رفرش خانه */
  setInterval(function () { if (curScreen === 'home') App.renderHome(); }, 60000);

  /* پیام‌های تصادفی ستاره‌ها */
  setInterval(function () { if (Math.random() < 0.35) Chat.randomPing(); }, 90000);

  /* دکمه برگشت اندروید */
  window.handleBack = function () {
    if (Calls.active) { Calls.decline(); return true; }
    if (goBack()) return true;
    return false;
  };

  /* اگر از طریق نوتیفیکیشن تماس باز شده */
  var pid = Bridge.param('call');
  if (pid) {
    setTimeout(function () { Calls.incoming(pid, Bridge.param('kind') || 'voice', Bridge.param('msg') || ''); }, 900);
  }
  if (window.Android && window.Android.pendingCall) {
    try {
      var pc = window.Android.pendingCall();
      if (pc) {
        var parts = String(pc).split('|');
        setTimeout(function () { Calls.incoming(parts[0], parts[1] || 'voice', parts[2] || ''); }, 900);
      }
    } catch (e) {}
  }
};

/* ---------- اسپلش و قفل ---------- */
(function () {
  var w = 0;
  var iv = setInterval(function () {
    w += 7;
    var b = $('splashBar'); if (b) b.style.width = Math.min(100, w) + '%';
    if (w >= 100) {
      clearInterval(iv);
      loadSettings();
      hide($('splash'));
      if (S.lock) {
        show($('lockScreen'));
        $('lockClock').innerHTML = clock();
        $('lockDate').innerHTML = faDate();
        var pad = $('lockFp'), t = null, prog = 0;
        function start() {
          pad.className = 'fp-pad on'; prog = 0;
          t = setInterval(function () {
            prog += 8; Snd.scan();
            if (prog >= 100) { clearInterval(t); unlock(); }
          }, 80);
        }
        function stop() { if (t) { clearInterval(t); t = null; } pad.className = 'fp-pad'; }
        function unlock() {
          stop(); vibe(80); Snd.ok();
          hide($('lockScreen')); show($('app')); App.boot();
        }
        on(pad, 'touchstart', function (e) { e.preventDefault(); start(); });
        on(pad, 'touchend', stop);
        on(pad, 'mousedown', start);
        on(pad, 'mouseup', stop);
        on($('lockSkip'), 'click', unlock);
      } else {
        show($('app'));
        App.boot();
      }
    }
  }, 60);
})();
