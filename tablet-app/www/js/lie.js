/* lie.js — دروغ‌سنج مبتنی بر حسگرهای واقعی تبلت
   چیزهایی که واقعاً اندازه‌گیری می‌شن:
   1) زمان واکنش و مکث قبل از جواب (میلی‌ثانیه)
   2) لرزش دست با شتاب‌سنج (انحراف معیار شتاب)
   3) فشار و سطح تماس انگشت روی صفحه (از MotionEvent اندروید)
   4) بی‌ثباتی صدا با میکروفون (RMS)
   با یک مرحله کالیبراسیون (سوال‌های کنترلی) پایه‌ی شخصی ساخته می‌شه و
   جواب‌های بعدی با انحراف از همون پایه سنجیده می‌شن.
*/
var Lie = {
  step: 'intro',
  cal: [],          /* نمونه‌های کالیبراسیون */
  runs: [],         /* نتیجه سوالات */
  qList: [],
  qIndex: 0,
  sampling: false,
  samples: null,
  tStart: 0,
  sampT: null,
  hold: false,
  sensors: { accel: false, pressure: false, mic: false }
};

var LIE_QUESTIONS = [
  'تا حالا به کسی دروغ گفتی؟',
  'الان راست می‌گی؟',
  'از کسی خوشت میاد؟',
  'تکالیفت رو انجام دادی؟',
  'چیزی رو از خانواده‌ات پنهان کردی؟',
  'گوشی کسی رو بدون اجازه چک کردی؟',
  'به بهترین دوستت همه چیز رو می‌گی؟'
];

/* ---------- خواندن حسگرها ---------- */
Lie.nativeSensor = function () {
  try {
    if (window.Android && window.Android.sensors) {
      var s = window.Android.sensors();   /* "ax,ay,az,pressure,size,mic" */
      if (s) {
        var p = String(s).split(',');
        return { ax: +p[0], ay: +p[1], az: +p[2], pr: +p[3], sz: +p[4], mic: +p[5] };
      }
    }
  } catch (e) {}
  return null;
};
Lie.detect = function () {
  var n = Lie.nativeSensor();
  if (n) {
    Lie.sensors.accel = !(n.ax === 0 && n.ay === 0 && n.az === 0);
    Lie.sensors.pressure = n.pr >= 0;
    Lie.sensors.mic = n.mic >= 0;
  } else {
    Lie.sensors.accel = !!window.DeviceMotionEvent;
    Lie.sensors.pressure = false;
    Lie.sensors.mic = false;
  }
};

/* شتاب‌سنج مرورگری (وقتی پل اندروید نیست) */
Lie.webAccel = { x: 0, y: 0, z: 0, ok: false };
Lie.motionHandler = function (e) {
  var a = e.accelerationIncludingGravity || e.acceleration;
  if (a && a.x !== null) { Lie.webAccel.x = a.x || 0; Lie.webAccel.y = a.y || 0; Lie.webAccel.z = a.z || 0; Lie.webAccel.ok = true; }
};

/* لمس: مدت تماس، جابه‌جایی انگشت (لرزش دست روی صفحه) */
Lie.touchTrack = { moves: 0, dist: 0, lastX: 0, lastY: 0, down: false };

Lie.startSampling = function () {
  Lie.sampling = true;
  Lie.samples = { acc: [], pr: [], mic: [], t0: Date.now() };
  Lie.touchTrack.moves = 0; Lie.touchTrack.dist = 0;
  if (window.Android && window.Android.startMic) { try { window.Android.startMic(); } catch (e) {} }
  Lie.sampT = setInterval(function () {
    var n = Lie.nativeSensor(), mag;
    if (n) {
      mag = Math.sqrt(n.ax * n.ax + n.ay * n.ay + n.az * n.az);
      Lie.samples.acc.push(mag);
      if (n.pr >= 0) Lie.samples.pr.push(n.pr);
      if (n.mic >= 0) Lie.samples.mic.push(n.mic);
    } else if (Lie.webAccel.ok) {
      mag = Math.sqrt(Lie.webAccel.x * Lie.webAccel.x + Lie.webAccel.y * Lie.webAccel.y + Lie.webAccel.z * Lie.webAccel.z);
      Lie.samples.acc.push(mag);
    }
  }, 60);
};
Lie.stopSampling = function () {
  Lie.sampling = false;
  if (Lie.sampT) { clearInterval(Lie.sampT); Lie.sampT = null; }
  if (window.Android && window.Android.stopMic) { try { window.Android.stopMic(); } catch (e) {} }
};

function stat(arr) {
  var i, s = 0, m, v = 0;
  if (!arr || !arr.length) return { m: 0, sd: 0, n: 0, max: 0 };
  for (i = 0; i < arr.length; i++) s += arr[i];
  m = s / arr.length;
  for (i = 0; i < arr.length; i++) v += (arr[i] - m) * (arr[i] - m);
  var mx = arr[0];
  for (i = 1; i < arr.length; i++) if (arr[i] > mx) mx = arr[i];
  return { m: m, sd: Math.sqrt(v / arr.length), n: arr.length, max: mx };
}

/* ---------- رابط کاربری ---------- */
Lie.open = function () {
  Lie.detect();
  Lie.step = 'intro';
  Lie.cal = []; Lie.runs = []; Lie.qIndex = 0;
  Lie.render();
  go('lie');
};

Lie.render = function () {
  var box = $('lieScroll');
  if (Lie.step === 'intro') Lie.renderIntro(box);
  else if (Lie.step === 'cal' || Lie.step === 'test') Lie.renderTest(box);
  else if (Lie.step === 'pick') Lie.renderPick(box);
  else if (Lie.step === 'result') Lie.renderResult(box);
};

Lie.renderIntro = function (box) {
  var s = Lie.sensors;
  function badge(ok, t) { return '<div class="res-line">' + (ok ? '✅' : '⚠️') + ' ' + t + (ok ? '' : ' <span style="color:#8a93ad">(روی این دستگاه در دسترس نیست)</span>') + '</div>'; }
  box.innerHTML =
    '<div class="card" style="margin-top:10px">' +
      '<div class="res-h">🕵️ دروغ‌سنج حسگری</div>' +
      '<div class="res-sub">این دروغ‌سنج از داده‌ی واقعی حسگرهای تبلت استفاده می‌کنه</div>' +
      badge(true, 'زمان واکنش و مکث قبل از جواب') +
      badge(s.accel, 'لرزش دست با شتاب‌سنج') +
      badge(s.pressure, 'فشار و سطح تماس انگشت') +
      badge(s.mic, 'بی‌ثباتی صدا با میکروفون') +
      '<div class="res-line" style="color:#8a93ad;font-size:12.5px;line-height:1.9">' +
      'اول ۳ سؤال کنترلی می‌پرسیم تا حالت عادی بدنت اندازه‌گیری بشه (کالیبراسیون)، ' +
      'بعد جواب‌های تو با همون پایه مقایسه می‌شه. صادقانه: این روش علمیِ قطعی نیست و برای سرگرمیه، ' +
      'ولی اعدادش واقعی و از خود حسگرهاست، نه رندوم.</div>' +
      '<button class="big-btn" id="lieStart">شروع کالیبراسیون</button>' +
    '</div>';
  on($('lieStart'), 'click', function () {
    Lie.step = 'cal'; Lie.qIndex = 0;
    Lie.qList = [
      { q: 'انگشتت روی صفحه هست؟ (جواب: بله)', truth: true },
      { q: 'الان روی کره‌ی مریخ هستی؟ (جواب: خیر)', truth: false },
      { q: 'اسمت ' + S.name + ' هست؟ (راستش رو بگو)', truth: true }
    ];
    Lie.render();
  });
};

Lie.renderPick = function (box) {
  var i, html = '<div class="card" style="margin-top:10px"><div class="res-h">سؤال‌ها رو انتخاب کن</div>' +
    '<div class="res-sub">کالیبراسیون انجام شد ✅ حالا سؤال بپرس</div>' +
    '<label>سؤال دلخواه</label><input type="text" id="lieCustom" placeholder="مثلا: شیشه رو تو شکستی؟">' +
    '<button class="mini-btn green" id="lieAddQ">اضافه کن</button>' +
    '<div style="margin-top:10px" class="res-sub">یا از سؤال‌های آماده بزن:</div><div class="chip-row" id="lieChips">';
  for (i = 0; i < LIE_QUESTIONS.length; i++) html += '<span class="chip" data-i="' + i + '">' + LIE_QUESTIONS[i] + '</span>';
  html += '</div><div id="lieQueue" style="margin-top:10px"></div>' +
    '<button class="big-btn" id="lieGo">شروع بازجویی 🕵️</button></div>';
  box.innerHTML = html;

  function drawQueue() {
    var q = $('lieQueue'), i2, h = '';
    for (i2 = 0; i2 < Lie.qList.length; i2++) h += '<div class="res-line">' + fa(i2 + 1) + '. ' + esc(Lie.qList[i2].q) + '</div>';
    q.innerHTML = h || '<div class="empty">هنوز سؤالی اضافه نکردی</div>';
  }
  Lie.qList = [];
  drawQueue();
  var chips = $('lieChips').getElementsByTagName('span'), j;
  for (j = 0; j < chips.length; j++) {
    (function (idx) {
      on(chips[idx], 'click', function () {
        if (Lie.qList.length >= 6) { toast('حداکثر ۶ سؤال'); return; }
        Lie.qList.push({ q: LIE_QUESTIONS[idx], truth: null }); Snd.tap(); drawQueue();
      });
    })(j);
  }
  on($('lieAddQ'), 'click', function () {
    var v = $('lieCustom').value;
    if (!v) { toast('سؤال رو بنویس'); return; }
    if (Lie.qList.length >= 6) { toast('حداکثر ۶ سؤال'); return; }
    Lie.qList.push({ q: v, truth: null }); $('lieCustom').value = ''; drawQueue();
  });
  on($('lieGo'), 'click', function () {
    if (!Lie.qList.length) { toast('حداقل یه سؤال اضافه کن'); return; }
    Lie.step = 'test'; Lie.qIndex = 0; Lie.runs = []; Lie.render();
  });
};

Lie.renderTest = function (box) {
  var item = Lie.qList[Lie.qIndex];
  var isCal = (Lie.step === 'cal');
  box.innerHTML =
    '<div class="card" style="margin-top:10px;text-align:center">' +
      '<div class="res-sub">' + (isCal ? 'کالیبراسیون' : 'بازجویی') + ' • سؤال ' + fa(Lie.qIndex + 1) + ' از ' + fa(Lie.qList.length) + '</div>' +
      '<div id="lieQ" style="font-size:18px;font-weight:bold;margin:14px 6px;line-height:1.9">انگشتت رو روی حسگر بذار و نگه دار...</div>' +
      '<div class="fp-pad big" id="liePad" style="margin:0 auto"><div class="fp-ring"></div><div class="fp-icon">☝</div><div class="fp-scan"></div><div class="fp-pct" id="liePct"></div></div>' +
      '<div id="lieLive" class="res-sub" style="margin-top:8px">—</div>' +
      '<div id="lieAns" class="hidden" style="margin-top:12px">' +
        '<div class="res-sub">بلند و واضح جواب بده، بعد دکمه رو بزن</div>' +
        '<button class="cbtn green" id="lieYes" style="width:96px;height:56px;border-radius:14px;font-size:18px">بله</button>' +
        '<button class="cbtn red" id="lieNo" style="width:96px;height:56px;border-radius:14px;font-size:18px">خیر</button>' +
      '</div>' +
    '</div><div class="pad60"></div>';

  var pad = $('liePad'), started = false, qShown = false, delayT = null, liveT = null;

  function beginHold() {
    if (started) return;
    started = true;
    pad.className = 'fp-pad big on';
    Lie.startSampling();
    vibe(30);
    var wait = 900 + rint(400, 1800);
    $('lieQ').innerHTML = 'آماده...';
    delayT = setTimeout(function () {
      qShown = true;
      Lie.tStart = Date.now();
      $('lieQ').innerHTML = esc(item.q);
      Snd.tone(880, 0.12, 'sine', 0.1);
      show($('lieAns'));
    }, wait);
    liveT = setInterval(function () {
      if (!Lie.samples) return;
      var a = stat(Lie.samples.acc), m = stat(Lie.samples.mic);
      $('lieLive').innerHTML = 'لرزش: ' + fa(Math.round(a.sd * 100) / 100) +
        (Lie.sensors.mic ? ' • صدا: ' + fa(Math.round(m.m * 100)) : '') +
        ' • نمونه: ' + fa(Lie.samples.acc.length);
    }, 300);
  }
  function endHold(answer) {
    if (!started) return;
    if (delayT) clearTimeout(delayT);
    if (liveT) clearInterval(liveT);
    var rt = qShown ? (Date.now() - Lie.tStart) : 0;
    Lie.stopSampling();
    pad.className = 'fp-pad big';
    if (!qShown) { started = false; $('lieQ').innerHTML = 'زود برداشتی! دوباره انگشتت رو نگه دار'; return; }

    var a = stat(Lie.samples.acc), p = stat(Lie.samples.pr), mi = stat(Lie.samples.mic);
    var rec = {
      q: item.q, ans: answer, rt: rt,
      tremor: a.sd, accM: a.m,
      prSd: p.sd, prM: p.m,
      micM: mi.m, micSd: mi.sd,
      moves: Lie.touchTrack.moves, dist: Lie.touchTrack.dist
    };
    if (Lie.step === 'cal') Lie.cal.push(rec); else Lie.runs.push(rec);
    Snd.pop(); vibe(60);

    Lie.qIndex++;
    if (Lie.qIndex >= Lie.qList.length) {
      if (Lie.step === 'cal') { Lie.step = 'pick'; }
      else { Lie.step = 'result'; }
    }
    setTimeout(Lie.render, 350);
  }

  on(pad, 'touchstart', function (e) { e.preventDefault(); Lie.touchTrack.down = true; beginHold(); });
  on(pad, 'mousedown', function () { beginHold(); });
  on(pad, 'touchmove', function (e) {
    if (!Lie.sampling) return;
    var t = e.touches[0];
    if (Lie.touchTrack.lastX) {
      var dx = t.clientX - Lie.touchTrack.lastX, dy = t.clientY - Lie.touchTrack.lastY;
      Lie.touchTrack.dist += Math.sqrt(dx * dx + dy * dy);
      Lie.touchTrack.moves++;
    }
    Lie.touchTrack.lastX = t.clientX; Lie.touchTrack.lastY = t.clientY;
  });
  on(pad, 'touchend', function () {
    if (!qShown) { if (delayT) clearTimeout(delayT); if (liveT) clearInterval(liveT); Lie.stopSampling(); started = false; pad.className = 'fp-pad big'; $('lieQ').innerHTML = 'انگشتت رو تا آخر نگه دار ☝'; }
  });
  on($('lieYes'), 'click', function () { endHold('بله'); });
  on($('lieNo'), 'click', function () { endHold('خیر'); });
};

/* ---------- محاسبه نتیجه ---------- */
Lie.analyze = function () {
  var i, rts = [], trs = [], prs = [], mcs = [];
  for (i = 0; i < Lie.cal.length; i++) {
    rts.push(Lie.cal[i].rt); trs.push(Lie.cal[i].tremor);
    prs.push(Lie.cal[i].prSd); mcs.push(Lie.cal[i].micSd);
  }
  var bRT = stat(rts), bTR = stat(trs), bPR = stat(prs), bMC = stat(mcs);
  function z(x, b, minSd) {
    var sd = b.sd > minSd ? b.sd : minSd;
    if (!b.n) return 0;
    return (x - b.m) / sd;
  }
  var out = [];
  for (i = 0; i < Lie.runs.length; i++) {
    var r = Lie.runs[i];
    var zRT = z(r.rt, bRT, 220);
    var zTR = z(r.tremor, bTR, 0.05);
    var zPR = Lie.sensors.pressure ? z(r.prSd, bPR, 0.005) : 0;
    var zMC = Lie.sensors.mic ? z(r.micSd, bMC, 0.01) : 0;

    var wSum = 0.40 + 0.30, sum = 0.40 * zRT + 0.30 * zTR;
    if (Lie.sensors.pressure) { sum += 0.15 * zPR; wSum += 0.15; }
    if (Lie.sensors.mic) { sum += 0.25 * zMC; wSum += 0.25; }
    var zc = sum / wSum;
    var stress = Math.round(100 / (1 + Math.exp(-1.25 * (zc - 0.15))));
    if (stress < 3) stress = 3; if (stress > 97) stress = 97;
    out.push({
      q: r.q, ans: r.ans, stress: stress, rt: r.rt, tremor: r.tremor,
      zRT: zRT, zTR: zTR, zPR: zPR, zMC: zMC,
      verdict: stress >= 70 ? 'دروغ محتمل' : (stress >= 45 ? 'مشکوک' : 'راست')
    });
  }
  return { rows: out, base: { rt: bRT, tr: bTR, pr: bPR, mc: bMC } };
};

Lie.renderResult = function (box) {
  var res = Lie.analyze(), i, r, html, total = 0;
  for (i = 0; i < res.rows.length; i++) total += res.rows[i].stress;
  var avg = res.rows.length ? Math.round(total / res.rows.length) : 0;
  var honesty = 100 - avg;

  html = '<div class="card" style="margin-top:10px">' +
    '<div class="res-h">' + (honesty >= 70 ? '🟢' : honesty >= 45 ? '🟡' : '🔴') + ' صداقت کلی: ' + fa(honesty) + '٪</div>' +
    '<div class="res-sub">بر پایه‌ی ' + fa(Lie.cal.length) + ' نمونه‌ی کالیبراسیون</div>' +
    '<div class="bar"><i style="width:' + honesty + '%"></i></div>';
  for (i = 0; i < res.rows.length; i++) {
    r = res.rows[i];
    html += '<div class="res-line" style="border-bottom:1px solid #2b3145;padding:10px 0">' +
      '<div style="font-weight:bold">' + fa(i + 1) + '. ' + esc(r.q) + '</div>' +
      '<div style="font-size:12.5px;color:#8a93ad;margin:4px 0">جواب داد: <b>' + r.ans + '</b> • ' +
      'نتیجه: <b style="color:' + (r.stress >= 70 ? '#e0284a' : r.stress >= 45 ? '#ff8f1f' : '#17a55f') + '">' + r.verdict + '</b>' +
      ' (استرس ' + fa(r.stress) + '٪)</div>' +
      '<div class="bar"><i style="width:' + r.stress + '%"></i></div>' +
      '<div style="font-size:11.5px;color:#767f99;margin-top:5px">' +
      'زمان واکنش ' + fa((r.rt / 1000).toFixed(2)) + ' ثانیه (' + (r.zRT >= 0 ? '+' : '') + fa(r.zRT.toFixed(1)) + 'σ) • ' +
      'لرزش ' + fa(r.tremor.toFixed(2)) + ' (' + (r.zTR >= 0 ? '+' : '') + fa(r.zTR.toFixed(1)) + 'σ)' +
      (Lie.sensors.pressure ? ' • فشار ' + (r.zPR >= 0 ? '+' : '') + fa(r.zPR.toFixed(1)) + 'σ' : '') +
      (Lie.sensors.mic ? ' • صدا ' + (r.zMC >= 0 ? '+' : '') + fa(r.zMC.toFixed(1)) + 'σ' : '') +
      '</div></div>';
  }
  html += '<div class="res-line" style="color:#8a93ad;font-size:12px;line-height:1.9">σ یعنی انحراف از حالت عادی خودت. ' +
    'عدد بالاتر = واکنش غیرعادی‌تر. این نتیجه قطعی نیست و ارزش قضایی نداره 🙂</div>' +
    '<button class="big-btn" id="lieAgain">تست دوباره</button>' +
    '<button class="big-btn danger" id="lieExit">بستن</button></div><div class="pad60"></div>';
  box.innerHTML = html;
  Snd.ok();
  Mirror.saveHist('🕵️', 'دروغ‌سنج', 'صداقت ' + fa(honesty) + '٪');
  on($('lieAgain'), 'click', function () { Lie.open(); });
  on($('lieExit'), 'click', function () { go('mirror', true); Mirror.renderHistory(); });
};

Lie.init = function () {
  if (window.DeviceMotionEvent) window.addEventListener('devicemotion', Lie.motionHandler, false);
  on($('lieBack'), 'click', function () { Lie.stopSampling(); go('mirror', true); Mirror.renderHistory(); });
  on($('lieInfo'), 'click', function () {
    popup('چطور کار می‌کنه؟',
      'زمان واکنش، لرزش دست (شتاب‌سنج)، فشار انگشت و بی‌ثباتی صدا اندازه‌گیری می‌شه و با حالت عادی خودت (کالیبراسیون) مقایسه می‌شه.<br>' +
      'اختلاف زیاد از حالت عادی = استرس بیشتر. برای نتیجه‌ی بهتر: تبلت رو توی دست بگیر، بلند جواب بده و همیشه یک انگشت ثابت رو روی حسگر بذار.',
      null, 'فهمیدم', false);
  });
};
