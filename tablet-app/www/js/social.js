/* social.js — پروفایل، استوری، صفحه ستاره‌ها */
var Social = {};

var POST_EMO = ['⚽','🏆','🔥','😎','🌇','🍕','🏝','🎮','🚗','🐶','🎤','💪','📚','🎯','🌹','☕','🎂','🏀','✈️','🌙','🎬','🥇'];
var POST_CAP = ['یه روز خوب ☀️','خاطره‌ی خوب 😍','تمرین سخت 💪','با رفقا 🤝','سفر آخر هفته ✈️','قهوه و آرامش ☕','بازی دیشب ⚽','لحظه‌های ناب ✨'];

Social.following = function () { return Store.get('following', {}); };
Social.isFollowing = function (id) { var f = Social.following(); return !!f[id]; };
Social.setFollowing = function (id, v) {
  var f = Social.following();
  if (v) f[id] = 1; else delete f[id];
  Store.set('following', f);
  S.following = 312 + (function () { var c = 0, k; for (k in f) if (f.hasOwnProperty(k)) c++; return c; })();
  saveSettings();
  Social.renderProfile();
};

/* ---------- پروفایل خودم ---------- */
Social.renderProfile = function () {
  if (!$('psFol')) return;
  $('profAva').innerHTML = S.emoji;
  $('profName').innerHTML = esc(S.name) + (S.verified ? ' <span class="vbadge">✔</span>' : '');
  $('profBio').innerHTML = esc(S.bio) + '<br>💰 ' + faNum(S.coins) + ' سکه';
  $('psFol').innerHTML = compact(S.followers);
  $('psFing').innerHTML = fa(S.following);
  $('psPosts').innerHTML = fa(S.posts);

  var hl = $('hlRow'), i, h, items = ['⭐ برترین‌ها', '⚽ ورزش', '✈️ سفر', '🎉 تولد', '🍕 غذا'];
  hl.innerHTML = '';
  for (i = 0; i < items.length; i++) {
    h = elc('div', 'story');
    h.innerHTML = '<div class="story-c"><div class="story-in">' + items[i].split(' ')[0] + '</div></div><div class="story-n">' + items[i].split(' ')[1] + '</div>';
    (function (t) { on(h, 'click', function () { toast('هایلایت «' + t + '» خالیه'); }); })(items[i]);
    hl.appendChild(h);
  }

  var g = $('postGrid'), rnd = seedRnd(hashStr(S.name + 'posts')), c;
  g.innerHTML = '';
  for (i = 0; i < 12; i++) {
    var emo = pickS(POST_EMO, rnd), col = AVA_COLORS[Math.floor(rnd() * AVA_COLORS.length)];
    c = elc('div', 'pcell');
    c.innerHTML = '<div class="pcell-in" style="background:' + col + '33">' + emo + '</div>';
    (function (e2, idx) {
      on(c, 'click', function () {
        var likes = Math.round(S.followers * (0.03 + Math.random() * 0.12));
        popup('پست ' + e2, pick(POST_CAP) + '<br><br>❤️ ' + compact(likes) + ' لایک<br>💬 ' + compact(Math.round(likes / 40)) + ' کامنت<br>👁 ' + compact(likes * 6) + ' بازدید', null, 'بستن', false);
      });
    })(emo, i);
    g.appendChild(c);
  }
};

Social.boost = function () {
  var add = rint(1000, 90000), step = Math.max(1, Math.round(add / 40)), got = 0;
  Snd.ok();
  var iv = setInterval(function () {
    got += step; S.followers += step;
    $('psFol').innerHTML = compact(S.followers);
    if (got >= add) {
      clearInterval(iv); saveSettings();
      S.coins += rint(10, 120); saveSettings(); Social.renderProfile();
      toast('🚀 ' + faNum(add) + ' فالوور جدید + سکه گرفتی!');
    }
  }, 45);
};

/* ---------- پروفایل ستاره ---------- */
Social.openStar = function (pid) {
  var p = getPersona(pid);
  $('starTitle').innerHTML = esc(p.name);
  $('starSub').innerHTML = '@' + p.handle;
  var box = $('starScroll'), i, html;
  var fol = Social.isFollowing(p.id);
  html = '<div class="prof-head"><div class="prof-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
    '<div class="prof-stats"><div class="ps"><b>' + fa(rint(300, 4200)) + '</b><span>پست</span></div>' +
    '<div class="ps"><b>' + compact(p.followers) + '</b><span>دنبال‌کننده</span></div>' +
    '<div class="ps"><b>' + fa(rint(40, 700)) + '</b><span>دنبال‌شونده</span></div></div></div>' +
    '<div class="prof-name">' + esc(p.name) + (p.verified ? ' <span class="vbadge">✔</span>' : '') + '</div>' +
    '<div class="prof-bio">' + esc(p.bio) + '<br>' + esc(p.job) + '</div>' +
    '<div class="prof-btns">' +
    '<button class="mini-btn ' + (fol ? '' : 'green') + '" id="stFol">' + (fol ? 'دنبال می‌کنی ✓' : 'دنبال کردن') + '</button>' +
    '<button class="mini-btn" id="stMsg">پیام</button>' +
    '<button class="mini-btn" id="stCall">تماس</button>' +
    '<button class="mini-btn" id="stLive">لایو</button></div><div class="post-grid">';
  var rnd = seedRnd(hashStr(p.id + 'posts'));
  for (i = 0; i < 12; i++) {
    html += '<div class="pcell"><div class="pcell-in" style="background:' + p.color + '33">' + pickS(POST_EMO, rnd) + '</div></div>';
  }
  html += '</div><div class="pad60"></div>';
  box.innerHTML = html;
  on($('stFol'), 'click', function () {
    var nf = !Social.isFollowing(p.id);
    Social.setFollowing(p.id, nf);
    $('stFol').innerHTML = nf ? 'دنبال می‌کنی ✓' : 'دنبال کردن';
    $('stFol').className = nf ? 'mini-btn' : 'mini-btn green';
    if (nf) { Snd.ok(); toast('✅ ' + p.short + ' رو دنبال کردی'); }
  });
  on($('stMsg'), 'click', function () { Chat.open(p.id); });
  on($('stCall'), 'click', function () { Calls.incoming(p.id, 'voice', ''); });
  on($('stLive'), 'click', function () { Live.start(p.id); });
  go('star');
};

/* ---------- استوری ---------- */
Social.storyBox = null;
Social.viewStory = function (pid) {
  var p = pid ? getPersona(pid) : null;
  if (!Social.storyBox) {
    var b = elc('div', 'call-screen');
    b.id = 'storyBox';
    b.style.zIndex = '650';
    document.body.appendChild(b);
    Social.storyBox = b;
  }
  var box = Social.storyBox;
  var txts = p ? [
    'تمرین امروز تموم شد 💪',
    'ممنون از حمایتتون ❤️',
    'فردا بازی مهمی داریم ⚽',
    'یه سلام به ایرانیای عزیز 🇮🇷'
  ] : ['امروز حالم عالیه 😎', 'کی بیداره؟ 🌙', 'روز خوبی داشته باشید ☀️'];
  var t = pick(txts);
  var color = p ? p.color : '#e0284a';
  box.innerHTML =
    '<div class="call-bg" style="background:-webkit-linear-gradient(top,' + color + ',#0a0c14)"></div>' +
    '<div style="position:relative;padding:10px 12px"><div style="height:3px;background:rgba(255,255,255,.3);border-radius:3px"><i id="stPB" style="display:block;height:100%;width:0;background:#fff"></i></div>' +
    '<div style="display:-webkit-box;display:flex;-webkit-box-align:center;align-items:center;margin-top:8px">' +
    '<div class="row-ava" style="background:' + color + ';width:36px;height:36px;line-height:36px;font-size:15px">' + (p ? p.emoji : S.emoji) + '</div>' +
    '<div style="color:#fff;font-size:14px;padding:0 8px;-webkit-box-flex:1;flex:1">' + esc(p ? p.name : S.name) + ' <span style="color:#bbb;font-size:11px">' + fa(rint(1, 9)) + ' ساعت پیش</span></div>' +
    '<button class="ico-btn" style="color:#fff" id="stClose">✕</button></div></div>' +
    '<div style="position:absolute;top:45%;left:8%;right:8%;text-align:center;color:#fff;font-size:20px;line-height:2">' + esc(t) + '</div>' +
    '<div style="position:absolute;bottom:20px;left:12px;right:12px;text-align:center">' +
    '<button class="mini-btn" id="stReply">جواب بده</button> <button class="mini-btn green" id="stLike">❤️ لایک</button></div>';
  show(box);
  var w = 0;
  var iv = setInterval(function () {
    w += 1.4;
    var pb = $('stPB'); if (pb) pb.style.width = w + '%';
    if (w >= 100) { clearInterval(iv); hide(box); }
  }, 70);
  on($('stClose'), 'click', function () { clearInterval(iv); hide(box); });
  on($('stLike'), 'click', function () { Snd.pop(); toast('❤️ لایک شد'); });
  on($('stReply'), 'click', function () {
    clearInterval(iv); hide(box);
    if (p) Chat.open(p.id); else toast('این استوری خودته 😄');
  });
};

Social.init = function () {
  on($('btnBoost'), 'click', function () { Social.boost(); });
  on($('btnGoLive'), 'click', function () {
    popup('شروع لایو', 'می‌خوای لایو بذاری؟ فالوورها میان و بهت هدیه می‌دن 🎁', function () { Live.start(null, true); }, 'شروع کن', 'نه');
  });
  on($('btnEditProf'), 'click', function () { go('set'); });
  on($('psFolBox'), 'click', function () {
    popup('دنبال‌کننده‌ها', 'در ۲۴ ساعت گذشته ' + faNum(rint(200, 9000)) + ' نفر تو رو دنبال کردن 🎉<br>معروف‌ترینشون: ' + pick(PERSONAS).name, null, 'ایول', false);
  });
  on($('starBack'), 'click', function () { goBack(); });
  Social.renderProfile();
};
