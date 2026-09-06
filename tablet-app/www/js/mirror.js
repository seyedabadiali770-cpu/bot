/* mirror.js — آینه‌های جادویی با اسکنر اثر انگشت */
var Mirror = { type: null, busy: false, prog: 0, timer: null, fields: {} };

var MIRRORS = [
  { id: 'job',      t: 'شغل آینده',      s: 'با اثر انگشت',  e: '💼', color: '#6d78ff' },
  { id: 'spouse',   t: 'همسر آینده',     s: 'با اثر انگشت',  e: '💍', color: '#d81b8c' },
  { id: 'marriage', t: 'سن ازدواج',      s: 'با اثر انگشت',  e: '📅', color: '#ff8f1f' },
  { id: 'wealth',   t: 'ثروت آینده',     s: 'با اثر انگشت',  e: '💰', color: '#17a55f' },
  { id: 'kids',     t: 'تعداد فرزند',    s: 'با اثر انگشت',  e: '👶', color: '#0aa5c9' },
  { id: 'person',   t: 'شخصیت‌شناسی',    s: 'با اثر انگشت',  e: '🧠', color: '#a832ff' },
  { id: 'love',     t: 'درصد عشق',       s: 'دو اسم',        e: '❤️', color: '#e0284a' },
  { id: 'lie',      t: 'دروغ‌سنج واقعی', s: 'با حسگرها',     e: '🕵️', color: '#e0284a' },
  { id: 'think',    t: 'کی بهت فکر می‌کنه؟', s: 'با اثر انگشت', e: '💭', color: '#4a5568' },
  { id: 'daily',    t: 'طالع امروز',     s: 'روزانه',        e: '🌙', color: '#6d78ff' },
  { id: 'hafez',    t: 'فال حافظ',       s: 'نیت کن',        e: '📖', color: '#17a55f' },
  { id: 'luck',     t: 'شانس امروز',     s: 'با اثر انگشت',  e: '🍀', color: '#ff8f1f' },
  { id: 'face',     t: 'چهره ۲۰ سال بعد', s: 'با اثر انگشت', e: '🪞', color: '#0aa5c9' },
  { id: 'star',     t: 'کدوم ستاره‌ای؟',  s: 'با اثر انگشت',  e: '⭐', color: '#ffd24a' }
];

Mirror.renderGrid = function () {
  var g = $('mirrorGrid'), i, c;
  g.innerHTML = '';
  for (i = 0; i < MIRRORS.length; i++) {
    c = elc('div', 'gcell');
    c.innerHTML = '<div class="gcell-in"><div class="gcell-ico">' + MIRRORS[i].e + '</div>' +
      '<div class="gcell-t">' + MIRRORS[i].t + '</div><div class="gcell-s">' + MIRRORS[i].s + '</div></div>';
    (function (m) { on(c, 'click', function () { Snd.tap(); Mirror.open(m.id); }); })(MIRRORS[i]);
    g.appendChild(c);
  }
  Mirror.renderHistory();
};

Mirror.renderHistory = function () {
  var box = $('mirrorHistory'), h = Store.get('mirhist', []), i, r;
  if (!box) return;
  box.innerHTML = '';
  if (!h.length) { box.innerHTML = '<div class="empty">هنوز چیزی اسکن نکردی</div>'; return; }
  for (i = 0; i < h.length && i < 12; i++) {
    r = elc('div', 'row');
    r.innerHTML = '<div class="row-ava" style="background:#262c40">' + h[i].e + '</div>' +
      '<div class="row-mid"><div class="row-t">' + esc(h[i].t) + '</div><div class="row-s">' + esc(h[i].s) + '</div></div>' +
      '<div class="row-e">' + ago(h[i].ts) + '</div>';
    box.appendChild(r);
  }
};
Mirror.saveHist = function (e, t, s) {
  var h = Store.get('mirhist', []);
  h.unshift({ e: e, t: t, s: s, ts: Date.now() });
  Store.set('mirhist', h.slice(0, 30));
};

function mirDef(id) { for (var i = 0; i < MIRRORS.length; i++) if (MIRRORS[i].id === id) return MIRRORS[i]; return MIRRORS[0]; }

Mirror.open = function (id) {
  if (id === 'lie') { Lie.open(); return; }
  Mirror.type = id;
  var d = mirDef(id);
  $('scanTitle').innerHTML = d.e + ' ' + d.t;
  $('scanSub').innerHTML = d.s;
  hide($('scanResult'));
  $('scanPct').innerHTML = '';
  $('scanPad').className = 'fp-pad big';
  $('scanHint').innerHTML = 'انگشتت رو روی حسگر بذار و نگه دار';

  /* فرم ورودی */
  var f = $('scanForm'), html = '';
  var savedName = Store.get('uname', S.name);
  if (id === 'love') {
    html = '<label>اسم اول</label><input type="text" id="fA" value="' + esc(savedName) + '">' +
           '<label>اسم دوم</label><input type="text" id="fB" placeholder="اسم طرف مقابل">';
  } else if (id === 'hafez') {
    html = '<label>نیت کن و اسمت رو بنویس</label><input type="text" id="fA" value="' + esc(savedName) + '">';
  } else {
    html = '<label>اسم و فامیل</label><input type="text" id="fA" value="' + esc(savedName) + '">' +
           '<label>سال تولد (شمسی)</label><input type="text" id="fY" value="' + esc(Store.get('ubirth', '1385')) + '">';
    if (id === 'spouse') {
      html += '<label>دنبال چه کسی هستی؟</label><select id="fG"><option value="m">همسر آقا</option><option value="f">همسر خانم</option></select>';
    }
  }
  f.innerHTML = html;
  show($('screen-scan'));
  go('scan');
  hide($('screen-mirror'));
};

Mirror.startScan = function () {
  if (Mirror.busy) return;
  var nameEl = $('fA');
  if (nameEl && !nameEl.value) { toast('اول اسمت رو بنویس ✍️'); return; }
  if (nameEl) Store.set('uname', nameEl.value);
  if ($('fY')) Store.set('ubirth', $('fY').value);
  if (Mirror.type === 'love' && (!$('fB') || !$('fB').value)) { toast('اسم دوم رو هم بنویس ❤️'); return; }

  Mirror.busy = true; Mirror.prog = 0;
  $('scanPad').className = 'fp-pad big on';
  hide($('scanResult'));
  vibe(40);
  var hints = ['در حال خواندن خطوط انگشت...', 'تحلیل الگوی پوستی...', 'اتصال به آینه...', 'محاسبه نتیجه...'];
  Mirror.timer = setInterval(function () {
    Mirror.prog += rint(2, 6);
    if (Mirror.prog > 100) Mirror.prog = 100;
    $('scanPct').innerHTML = fa(Mirror.prog) + '٪';
    $('scanHint').innerHTML = hints[Math.min(3, Math.floor(Mirror.prog / 26))];
    if (Mirror.prog % 12 < 5) Snd.scan();
    if (Mirror.prog >= 100) Mirror.finish();
  }, 90);
};
Mirror.cancelScan = function () {
  if (!Mirror.busy) return;
  if (Mirror.prog < 100) {
    clearInterval(Mirror.timer);
    Mirror.busy = false;
    $('scanPad').className = 'fp-pad big';
    $('scanPct').innerHTML = '';
    $('scanHint').innerHTML = 'انگشتت رو برنداشتی؟ دوباره نگه دار تا کامل بشه';
  }
};
Mirror.finish = function () {
  clearInterval(Mirror.timer);
  Mirror.busy = false;
  $('scanPad').className = 'fp-pad big';
  $('scanHint').innerHTML = 'اثر انگشت شناسایی شد ✅';
  vibe(120); Snd.ok();
  var res = Mirror.compute();
  var box = $('scanResult');
  box.innerHTML = res.html +
    '<div style="text-align:center;margin-top:12px">' +
    '<span class="mini-btn" id="mShare">اشتراک متن</span> <span class="mini-btn green" id="mAgain">اسکن دوباره</span></div>';
  show(box);
  on($('mAgain'), 'click', function () { hide(box); Mirror.startScan(); });
  on($('mShare'), 'click', function () {
    popup('نتیجه', res.text.replace(/\n/g, '<br>'), null, 'بستن', false);
  });
  var d = mirDef(Mirror.type);
  Mirror.saveHist(d.e, d.t, res.short);
  Mirror.renderHistory();
};

/* ---------- محاسبه نتیجه (پایدار بر اساس اسم) ---------- */
Mirror.compute = function () {
  var id = Mirror.type;
  var nameV = $('fA') ? $('fA').value : S.name;
  var yearV = $('fY') ? $('fY').value : '1385';
  var seedBase = normFa(nameV) + '|' + yearV + '|' + id;
  if (id === 'daily' || id === 'luck' || id === 'think' || id === 'hafez') seedBase += '|' + dayKey();
  var rnd = seedRnd(hashStr(seedBase));
  var html = '', text = '', shortT = '';

  function line(k, v) { return '<div class="res-line">' + k + ': <b>' + v + '</b></div>'; }
  function head(t, s) { return '<div class="res-h">' + t + '</div><div class="res-sub">' + s + '</div>'; }
  function bar(p) { return '<div class="bar"><i style="width:' + p + '%"></i></div>'; }

  if (id === 'job') {
    var job = pickS(JOBS, rnd);
    var salary = rintS(35, 400, rnd) * 1000000;
    var age = rintS(22, 33, rnd);
    var city = pickS(CITIES, rnd);
    var succ = rintS(68, 99, rnd);
    html = head(job.e + ' ' + job.t, 'اثر انگشت ' + esc(nameV) + ' تحلیل شد') +
      '<div class="res-line">' + job.d + '</div>' +
      line('سن شروع این شغل', fa(age) + ' سالگی') +
      line('شهر محل کار', city) +
      line('درآمد ماهانه تخمینی', faNum(salary) + ' تومان') +
      line('احتمال موفقیت', fa(succ) + '٪') + bar(succ) +
      line('شغل دوم احتمالی', pickS(JOBS, rnd).t);
    shortT = job.t;
    text = 'شغل آینده‌ی من: ' + job.t + '\nسن شروع: ' + age + '\nشهر: ' + city;

  } else if (id === 'spouse') {
    var g = $('fG') ? $('fG').value : 'f';
    var sname = pickS(g === 'm' ? SPOUSE_M : SPOUSE_F, rnd);
    var scity = pickS(CITIES, rnd);
    var strait = pickS(TRAITS, rnd);
    var sjob = pickS(JOBS, rnd);
    var sage = rintS(19, 34, rnd);
    var meet = pickS(MEET_PLACES, rnd);
    var match = rintS(72, 99, rnd);
    var kids = rintS(0, 4, rnd);
    html = head('💍 ' + sname, 'همسر آینده‌ی ' + esc(nameV)) +
      line('اسم', sname) + line('اهل', scity) + line('شغل', sjob.e + ' ' + sjob.t) +
      line('اخلاق', strait) + line('سن تو موقع ازدواج', fa(sage) + ' سالگی') +
      line('جایی که آشنا می‌شید', meet) + line('تعداد فرزند', fa(kids)) +
      line('درصد تفاهم', fa(match) + '٪') + bar(match);
    shortT = sname + ' از ' + scity;
    text = 'همسر آینده‌ی من: ' + sname + ' از ' + scity + ' • تفاهم ' + match + '٪';

  } else if (id === 'marriage') {
    var mage = rintS(19, 35, rnd), season = pickS(['بهار', 'تابستان', 'پاییز', 'زمستان'], rnd);
    var yy = parseInt(yearV, 10) || 1385;
    html = head('📅 ' + fa(mage) + ' سالگی', 'سال ' + fa(yy + mage) + ' شمسی، فصل ' + season) +
      line('نوع آشنایی', pickS(['سنتی و خانوادگی', 'خودت انتخاب می‌کنی', 'از طریق دوستان', 'محل کار'], rnd)) +
      line('احتمال دقت پیش‌بینی', fa(rintS(70, 96, rnd)) + '٪') +
      '<div class="res-line">قبل از اون سال، یه رابطه‌ی جدی دیگه هم تجربه می‌کنی که باعث پختگیت می‌شه.</div>';
    shortT = fa(mage) + ' سالگی';
    text = 'سن ازدواج من: ' + mage;

  } else if (id === 'wealth') {
    var w = rintS(3, 90, rnd) * 1000000000;
    var wage = rintS(26, 45, rnd);
    var src = pickS(['کسب‌وکار شخصی', 'ارث و ملک', 'سرمایه‌گذاری', 'شغل تخصصی', 'کار در خارج از کشور', 'اینترنت و محتوا'], rnd);
    html = head('💰 ' + faNum(w) + ' تومان', 'دارایی تخمینی در ' + fa(wage) + ' سالگی') +
      line('منبع اصلی ثروت', src) +
      line('اولین ماشین گران‌قیمتت', pickS(['بنز', 'بی‌ام‌و', 'شاسی‌بلند', 'تویوتا', 'پژو ۲۰۷ 😄'], rnd)) +
      line('تعداد سفر خارجی', fa(rintS(2, 30, rnd)) + ' بار') +
      line('شانس ثروتمند شدن', fa(rintS(55, 98, rnd)) + '٪');
    shortT = faNum(w) + ' تومان';
    text = 'ثروت آینده‌ی من حدود ' + faNum(w) + ' تومان';

  } else if (id === 'kids') {
    var n = rintS(0, 4, rnd);
    var names = [], i2;
    for (i2 = 0; i2 < n; i2++) names.push(pickS(i2 % 2 ? SPOUSE_F : SPOUSE_M, rnd));
    html = head('👶 ' + fa(n) + ' فرزند', 'پیش‌بینی بر اساس اثر انگشت') +
      line('اسم‌های احتمالی', names.length ? names.join('، ') : 'فعلاً هیچ‌کدوم') +
      line('اولین فرزند', n ? pickS(['پسر', 'دختر'], rnd) : '—') +
      line('سن تو موقع اولین فرزند', n ? fa(rintS(22, 38, rnd)) + ' سالگی' : '—');
    shortT = fa(n) + ' فرزند';
    text = 'تعداد فرزند من: ' + n;

  } else if (id === 'person') {
    var p = pickS(PERSONALITY, rnd);
    var iq = rintS(105, 149, rnd), eq = rintS(60, 99, rnd), soc = rintS(40, 99, rnd), cre = rintS(50, 99, rnd);
    html = head(p.e + ' ' + p.t, 'تیپ شخصیتی ' + esc(nameV)) +
      '<div class="res-line">' + p.d + '</div>' +
      line('نقاط قوت', p.s.join('، ')) + line('نقطه ضعف', p.w.join('، ')) +
      line('هوش تحلیلی', fa(iq)) + bar(Math.min(100, iq - 50)) +
      line('هوش هیجانی', fa(eq) + '٪') + bar(eq) +
      line('مهارت اجتماعی', fa(soc) + '٪') + bar(soc) +
      line('خلاقیت', fa(cre) + '٪') + bar(cre);
    shortT = p.t;
    text = 'تیپ شخصیتی من: ' + p.t;

  } else if (id === 'love') {
    var a = $('fA').value, b = $('fB').value;
    var r2 = seedRnd(hashStr(normFa(a) + '❤' + normFa(b)));
    var pct = rintS(35, 100, r2);
    var v = ['کشش اولیه', 'تفاهم فکری', 'صبر و گذشت', 'شوخ‌طبعی مشترک', 'آینده مشترک'];
    var lines = '', i3;
    for (i3 = 0; i3 < v.length; i3++) { var q = rintS(30, 100, r2); lines += line(v[i3], fa(q) + '٪') + bar(q); }
    html = head('❤️ ' + fa(pct) + '٪', esc(a) + ' و ' + esc(b)) + bar(pct) + lines +
      '<div class="res-line">' + (pct > 85 ? 'ترکیب فوق‌العاده‌ای هستید! 😍' : pct > 60 ? 'شانس خوبیه، ولی گفتگو لازمه 🙂' : pct > 40 ? 'سخته ولی نشدنی نیست 💪' : 'شاید بهتره فقط دوست بمونید 😅') + '</div>';
    shortT = a + ' و ' + b + ': ' + fa(pct) + '٪';
    text = 'درصد عشق ' + a + ' و ' + b + ': ' + pct + '٪';

  } else if (id === 'think') {
    var who = pickS(SPOUSE_M.concat(SPOUSE_F), rnd);
    var letter = who.charAt(0);
    html = head('💭 حرف «' + letter + '»', 'کسی که امروز بهت فکر کرده') +
      line('حدس اسم', who) +
      line('چند بار امروز', fa(rintS(1, 9, rnd)) + ' بار') +
      line('احساسش', pickS(['دلتنگی', 'علاقه', 'نگرانی', 'خاطره خوب', 'حسادت مثبت'], rnd)) +
      line('تماس می‌گیره؟', pickS(['احتمالاً امشب', 'تا سه روز آینده', 'منتظره تو پیام بدی', 'خجالت می‌کشه'], rnd));
    shortT = 'حرف ' + letter;
    text = 'یه نفر با حرف ' + letter + ' بهم فکر می‌کنه';

  } else if (id === 'daily') {
    var mood = rintS(40, 100, rnd), luck = rintS(30, 100, rnd), money = rintS(20, 100, rnd), love2 = rintS(30, 100, rnd);
    html = head('🌙 طالع امروز', faDate()) +
      line('حال و انرژی', fa(mood) + '٪') + bar(mood) +
      line('شانس', fa(luck) + '٪') + bar(luck) +
      line('مالی', fa(money) + '٪') + bar(money) +
      line('عشق', fa(love2) + '٪') + bar(love2) +
      '<div class="res-line">🔮 ' + pickS(TALES, rnd) + '</div>' +
      line('ساعت خوش‌شانسی', fa(rintS(8, 22, rnd)) + ':' + fa(pickS(['۰۰', '۱۵', '۳۰', '۴۵'], rnd))) +
      line('رنگ امروز', pickS(LUCKY_COLORS, rnd));
    shortT = 'انرژی ' + fa(mood) + '٪';
    text = 'طالع امروز من: انرژی ' + mood + '٪';

  } else if (id === 'hafez') {
    var f = pickS(HAFEZ, rnd);
    html = head('📖 فال حافظ', 'نیت: ' + esc(nameV)) +
      '<div class="res-line" style="text-align:center;line-height:2.2;font-size:15px">' + f.v + '</div>' +
      '<div class="res-line"><b>تعبیر:</b> ' + f.m + '</div>';
    shortT = 'فال گرفته شد';
    text = 'فال حافظ: ' + f.m;

  } else if (id === 'luck') {
    var lk = rintS(25, 100, rnd);
    html = head('🍀 ' + fa(lk) + '٪', 'شانس امروز ' + esc(nameV)) + bar(lk) +
      line('عدد شانس', fa(rintS(1, 99, rnd))) +
      line('رنگ شانس', pickS(LUCKY_COLORS, rnd)) +
      line('جهت خوش‌یمن', pickS(['شمال', 'جنوب', 'شرق', 'غرب'], rnd)) +
      line('کاری که امروز نکن', pickS(['قرض دادن پول', 'سفر طولانی', 'دعوا سر موضوع بی‌اهمیت', 'خرید گران', 'قول دادن'], rnd)) +
      line('کاری که امروز بکن', pickS(['به یه نفر کمک کن', 'زنگ بزن به مامان', 'یه کار عقب‌افتاده رو تموم کن', 'ورزش کن', 'زود بخواب'], rnd));
    shortT = fa(lk) + '٪ شانس';
    text = 'شانس امروز من ' + lk + '٪';

  } else if (id === 'face') {
    html = head('🪞 ۲۰ سال بعد', 'شبیه‌سازی چهره‌ی ' + esc(nameV)) +
      line('حالت مو', pickS(['کم‌پشت‌تر ولی مرتب', 'جوگندمی و جذاب', 'همون مدل الان', 'کوتاه و اسپرت'], rnd)) +
      line('وزن', pickS(['حدود ۵ کیلو بیشتر', 'تقریباً همین', 'فیت و ورزشکاری', 'کمی لاغرتر'], rnd)) +
      line('سبک لباس', pickS(['رسمی و شیک', 'اسپرت راحت', 'کلاسیک', 'خاص و متفاوت'], rnd)) +
      line('چهره', pickS(['خندون با خط لبخند', 'جدی و باوقار', 'مهربون و آروم', 'پرانرژی مثل الان'], rnd)) +
      line('سن ظاهری', fa(rintS(3, 9, rnd)) + ' سال جوان‌تر از سن واقعی') +
      '<div class="res-line">آدم‌ها می‌گن: «هیچ فرقی نکردی!» 😄</div>';
    shortT = 'شبیه‌سازی انجام شد';
    text = 'چهره ۲۰ سال بعد من شبیه‌سازی شد';

  } else if (id === 'star') {
    var st = pickS(PERSONAS, rnd);
    var sim = rintS(62, 99, rnd);
    html = head(st.emoji + ' ' + st.name, 'شبیه‌ترین ستاره به ' + esc(nameV)) + bar(sim) +
      line('شباهت', fa(sim) + '٪') +
      line('وجه اشتراک', pickS(['اراده‌ی آهنین', 'شوخ‌طبعی', 'عشق به خانواده', 'کمال‌گرایی', 'رهبری'], rnd)) +
      line('چیزی که باید ازش یاد بگیری', pickS(['نظم روزانه', 'صبر', 'ریسک‌پذیری', 'تمرکز روی هدف'], rnd));
    shortT = st.name + ' ' + fa(sim) + '٪';
    text = 'من ' + sim + '٪ شبیه ' + st.name + ' هستم';
  }

  return { html: html, text: text, short: shortT };
};

Mirror.init = function () {
  Mirror.renderGrid();
  var pad = $('scanPad');
  on(pad, 'touchstart', function (e) { e.preventDefault(); Mirror.startScan(); });
  on(pad, 'touchend', function () { Mirror.cancelScan(); });
  on(pad, 'mousedown', function () { Mirror.startScan(); });
  on(pad, 'mouseup', function () { Mirror.cancelScan(); });
  on($('scanBack'), 'click', function () { go('mirror', true); Mirror.renderHistory(); });
};
