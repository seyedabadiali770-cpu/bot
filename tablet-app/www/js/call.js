/* call.js — تماس فوری، زمان‌بندی تماس و صفحه تماس */
var Calls = {
  active: false,
  inCall: false,
  cur: null,
  kind: 'voice',
  customMsg: '',
  timer: null,
  subT: null,
  vibT: null,
  sec: 0,
  ringT: null
};

Calls.alarms = function () { return Store.get('alarms', []); };
Calls.saveAlarms = function (a) { Store.set('alarms', a); };
Calls.hist = function () { return Store.get('callhist', []); };
Calls.addHist = function (h) {
  var a = Calls.hist(); a.unshift(h); Store.set('callhist', a.slice(0, 40));
};

/* ---------- زمان‌بندی ---------- */
Calls.nextTime = function (h, m) {
  var d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.getTime();
};
Calls.add = function (pid, h, m, kind, msg, repeat) {
  var a = Calls.alarms();
  var item = { id: 'a' + Date.now() + rint(10, 99), pid: pid, h: h, m: m, at: Calls.nextTime(h, m), kind: kind, msg: msg, repeat: repeat, done: false };
  a.push(item); Calls.saveAlarms(a);
  Bridge.schedule(item.id, pid, getPersona(pid).name, item.at, kind, msg);
  Calls.renderAlarms();
  var mins = Math.round((item.at - Date.now()) / 60000);
  toast('✅ ثبت شد! ' + getPersona(pid).short + ' ساعت ' + fa(pad2(h) + ':' + pad2(m)) + ' زنگ می‌زنه (تا ' + fa(mins) + ' دقیقه دیگه)');
  Snd.ok();
};
Calls.remove = function (id) {
  var a = Calls.alarms(), i;
  for (i = 0; i < a.length; i++) if (a[i].id === id) { Bridge.cancel(id); a.splice(i, 1); break; }
  Calls.saveAlarms(a); Calls.renderAlarms(); App.renderHome();
};
Calls.check = function () {
  var a = Calls.alarms(), now = Date.now(), i, changed = false, fire = null;
  for (i = 0; i < a.length; i++) {
    if (!a[i].done && a[i].at <= now && now - a[i].at < 15 * 60000) {
      fire = a[i];
      if (a[i].repeat === 'daily') { a[i].at = a[i].at + 86400000; Bridge.schedule(a[i].id, a[i].pid, getPersona(a[i].pid).name, a[i].at, a[i].kind, a[i].msg); }
      else a[i].done = true;
      changed = true;
      break;
    } else if (!a[i].done && a[i].at < now) {
      if (a[i].repeat === 'daily') { while (a[i].at < now) a[i].at += 86400000; }
      else a[i].done = true;
      changed = true;
    }
  }
  if (changed) Calls.saveAlarms(a);
  if (fire && !Calls.active) Calls.incoming(fire.pid, fire.kind, fire.msg);
  if (changed) { Calls.renderAlarms(); App.renderHome(); }
};

/* ---------- صفحه تماس ---------- */
Calls.incoming = function (pid, kind, msg) {
  if (Calls.active) return;
  var p = getPersona(pid);
  Calls.active = true; Calls.inCall = false; Calls.cur = p; Calls.kind = kind || 'voice'; Calls.customMsg = msg || '';
  $('callKind').innerHTML = (Calls.kind === 'video' ? '📹 تماس تصویری ورودی' : '📞 تماس ورودی');
  var av = $('callAva');
  av.innerHTML = p.emoji; av.style.background = p.color;
  av.className = 'call-ava ring';
  $('callName').innerHTML = esc(p.name);
  $('callState').innerHTML = 'در حال زنگ خوردن...';
  $('callSub').innerHTML = '';
  show($('callActions')); hide($('callActions2'));
  show($('callScreen'));
  Snd.startRing();
  Calls.vibT = setInterval(function () { vibe(500); }, 1600);
  vibe(500);
  /* اگر جواب نداد */
  Calls.ringT = setTimeout(function () {
    if (Calls.active && !Calls.inCall) {
      Calls.addHist({ pid: p.id, kind: Calls.kind, status: 'missed', dur: 0, ts: Date.now() });
      Calls.hangup();
      toast('📵 تماس بی‌پاسخ از ' + p.short);
    }
  }, 32000);
};

Calls.accept = function () {
  if (!Calls.active) return;
  Calls.inCall = true; Calls.sec = 0;
  Snd.stopRing();
  if (Calls.vibT) { clearInterval(Calls.vibT); Calls.vibT = null; }
  if (Calls.ringT) { clearTimeout(Calls.ringT); Calls.ringT = null; }
  $('callAva').className = 'call-ava';
  $('callKind').innerHTML = (Calls.kind === 'video' ? '📹 تماس تصویری' : '📞 در حال مکالمه');
  hide($('callActions')); show($('callActions2'));
  $('callState').innerHTML = fa('00:00');
  Calls.timer = setInterval(function () {
    Calls.sec++;
    $('callState').innerHTML = fa(pad2(Math.floor(Calls.sec / 60)) + ':' + pad2(Calls.sec % 60));
  }, 1000);

  var lines = [];
  if (Calls.customMsg) lines.push(Calls.customMsg);
  lines = lines.concat(Calls.cur.callLines || ['سلام {u}!']);
  lines = lines.concat(['راستی حالت چطوره؟', 'کاری نداری؟ برم دیگه', 'مواظب خودت باش، خداحافظ 👋']);
  var idx = 0;
  function say() {
    if (!Calls.inCall) return;
    if (idx >= lines.length) { Calls.hangupWithLog(); return; }
    var line = String(lines[idx]).replace(/\{u\}/g, S.name);
    $('callSub').innerHTML = '«' + esc(line) + '»';
    Snd.tone(rint(300, 500), 0.12, 'sine', 0.05);
    idx++;
    Calls.subT = setTimeout(say, 2600 + line.length * 55);
  }
  say();
};

Calls.hangupWithLog = function () {
  if (Calls.cur) Calls.addHist({ pid: Calls.cur.id, kind: Calls.kind, status: 'answered', dur: Calls.sec, ts: Date.now() });
  var s = Calls.sec, name = Calls.cur ? Calls.cur.short : '';
  Calls.hangup();
  if (s > 0) toast('تماس با ' + name + ' تموم شد • مدت ' + fa(pad2(Math.floor(s / 60)) + ':' + pad2(s % 60)));
};

Calls.decline = function () {
  if (Calls.cur) Calls.addHist({ pid: Calls.cur.id, kind: Calls.kind, status: 'declined', dur: 0, ts: Date.now() });
  Calls.hangup();
};

Calls.hangup = function () {
  Snd.stopRing();
  if (Calls.vibT) { clearInterval(Calls.vibT); Calls.vibT = null; }
  if (Calls.timer) { clearInterval(Calls.timer); Calls.timer = null; }
  if (Calls.subT) { clearTimeout(Calls.subT); Calls.subT = null; }
  if (Calls.ringT) { clearTimeout(Calls.ringT); Calls.ringT = null; }
  Calls.active = false; Calls.inCall = false;
  hide($('callScreen'));
  Calls.renderHist();
};

/* ---------- رندر ---------- */
Calls.renderAlarms = function () {
  var box = $('alarmList');
  if (!box) return;
  var a = Calls.alarms(), i, r, p;
  box.innerHTML = '';
  var live = [];
  for (i = 0; i < a.length; i++) if (!a[i].done) live.push(a[i]);
  if (!live.length) { box.innerHTML = '<div class="empty">هنوز تماسی زمان‌بندی نکردی</div>'; return; }
  for (i = 0; i < live.length; i++) {
    p = getPersona(live[i].pid);
    r = elc('div', 'row');
    r.innerHTML = '<div class="row-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="row-mid"><div class="row-t">' + esc(p.name) + ' • ' + fa(pad2(live[i].h) + ':' + pad2(live[i].m)) + '</div>' +
      '<div class="row-s">' + (live[i].kind === 'video' ? '📹 تصویری' : '📞 صوتی') + ' • ' + (live[i].repeat === 'daily' ? 'هر روز' : 'یک‌بار') +
      (live[i].msg ? ' • «' + esc(live[i].msg) + '»' : '') + '</div></div>' +
      '<div class="row-e"><span class="mini-btn">حذف</span></div>';
    (function (id) { on(r.getElementsByTagName('span')[0], 'click', function (e) { e.stopPropagation(); Calls.remove(id); toast('حذف شد'); }); })(live[i].id);
    box.appendChild(r);
  }
};

Calls.renderHist = function () {
  var box = $('callHistory');
  if (!box) return;
  var h = Calls.hist(), i, p, r, st;
  box.innerHTML = '';
  if (!h.length) { box.innerHTML = '<div class="empty">تماسی ثبت نشده</div>'; return; }
  for (i = 0; i < h.length && i < 15; i++) {
    p = getPersona(h[i].pid);
    st = h[i].status === 'missed' ? '<span style="color:#e0284a">بی‌پاسخ</span>' :
         h[i].status === 'declined' ? 'رد شده' : 'مدت ' + fa(pad2(Math.floor(h[i].dur / 60)) + ':' + pad2(h[i].dur % 60));
    r = elc('div', 'row');
    r.innerHTML = '<div class="row-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="row-mid"><div class="row-t">' + esc(p.name) + '</div><div class="row-s">' + st + ' • ' + ago(h[i].ts) + '</div></div>' +
      '<div class="row-e">' + (h[i].kind === 'video' ? '📹' : '📞') + '</div>';
    (function (pid) { on(r, 'click', function () { Calls.incoming(pid, 'voice', ''); }); })(p.id);
    box.appendChild(r);
  }
};

Calls.renderQuick = function () {
  var box = $('callQuick'), i, c;
  box.innerHTML = '';
  for (i = 0; i < PERSONAS.length; i++) {
    c = elc('span', 'chip', PERSONAS[i].emoji + ' ' + PERSONAS[i].short);
    (function (pid) {
      on(c, 'click', function () {
        Snd.tap();
        popup('تماس فوری', 'الان ' + getPersona(pid).name + ' بهت زنگ بزنه؟', function () {
          setTimeout(function () { Calls.incoming(pid, 'voice', ''); }, rint(600, 2500));
          toast('در حال برقراری تماس...');
        }, 'آره زنگ بزنه', 'نه');
      });
    })(PERSONAS[i].id);
    box.appendChild(c);
  }
};

Calls.init = function () {
  /* پر کردن فرم */
  var who = $('calWho'), i, o;
  for (i = 0; i < PERSONAS.length; i++) {
    o = document.createElement('option');
    o.value = PERSONAS[i].id; o.innerHTML = PERSONAS[i].name;
    who.appendChild(o);
  }
  var hs = $('calH'), ms = $('calM'), now = new Date();
  for (i = 0; i < 24; i++) { o = document.createElement('option'); o.value = i; o.innerHTML = fa(pad2(i)); hs.appendChild(o); }
  for (i = 0; i < 60; i++) { o = document.createElement('option'); o.value = i; o.innerHTML = fa(pad2(i)); ms.appendChild(o); }
  hs.value = now.getHours(); ms.value = Math.min(59, now.getMinutes() + 2);

  function segInit(id) {
    var box = $(id), bs = box.getElementsByTagName('button'), j;
    for (j = 0; j < bs.length; j++) {
      (function (b) {
        on(b, 'click', function () {
          var k, all = box.getElementsByTagName('button');
          for (k = 0; k < all.length; k++) all[k].className = 'seg-b';
          b.className = 'seg-b on'; Snd.tap();
        });
      })(bs[j]);
    }
  }
  segInit('calType'); segInit('calRep');
  function segVal(id) {
    var bs = $(id).getElementsByTagName('button'), j;
    for (j = 0; j < bs.length; j++) if (bs[j].className.indexOf('on') >= 0) return bs[j].getAttribute('data-v');
    return '';
  }

  on($('calSave'), 'click', function () {
    Calls.add($('calWho').value, parseInt($('calH').value, 10), parseInt($('calM').value, 10),
      segVal('calType'), $('calMsg').value, segVal('calRep'));
    $('calMsg').value = '';
    App.renderHome();
  });

  on($('callAccept'), 'click', function () { Calls.accept(); });
  on($('callDecline'), 'click', function () { Calls.decline(); });
  on($('callEnd'), 'click', function () { Calls.hangupWithLog(); });
  on($('callMute'), 'click', function () {
    var b = $('callMute'); b.className = b.className.indexOf('on') >= 0 ? 'cbtn2' : 'cbtn2 on';
    toast(b.className.indexOf('on') >= 0 ? 'میکروفون بسته شد 🔇' : 'میکروفون باز شد 🎤');
  });
  on($('callSpk'), 'click', function () {
    var b = $('callSpk'); b.className = b.className.indexOf('on') >= 0 ? 'cbtn2' : 'cbtn2 on';
    toast(b.className.indexOf('on') >= 0 ? 'بلندگو روشن 🔊' : 'بلندگو خاموش');
  });

  Calls.renderQuick(); Calls.renderAlarms(); Calls.renderHist();
  setInterval(Calls.check, 10000);
  Calls.check();
};
