/* live.js — لایو اینستاگرامی (شبیه‌سازی) */
var Live = {
  cur: null,
  mine: false,
  viewers: 0,
  timers: [],
  hearts: 0,
  gifts: 0,
  myComments: 0,
  startTs: 0,
  followed: false
};

Live.renderList = function () {
  var box = $('liveList'), i, c, p, v;
  box.innerHTML = '';
  for (i = 0; i < PERSONAS.length; i++) {
    p = PERSONAS[i];
    v = Math.round(p.followers / rint(600, 3000)) + rint(100, 5000);
    c = elc('div', 'lcard');
    c.innerHTML = '<div class="lcard-in" style="background:-webkit-linear-gradient(top,' + p.color + '55,#0f1428)">' +
      '<div class="lcard-live">● زنده</div><div class="lcard-eye">👁 ' + compact(v) + '</div>' +
      '<div class="lcard-ava" style="background:' + p.color + '">' + p.emoji + '</div>' +
      '<div class="lcard-n">' + esc(p.short) + ' • ' + esc(p.live ? p.live.title : '') + '</div></div>';
    (function (pid) { on(c, 'click', function () { Snd.tap(); Live.start(pid); }); })(p.id);
    box.appendChild(c);
  }
  /* استوری‌ها */
  var sr = $('storyRow'), st;
  sr.innerHTML = '';
  st = elc('div', 'story');
  st.innerHTML = '<div class="story-c"><div class="story-in">' + S.emoji + '</div></div><div class="story-n">استوری تو</div>';
  on(st, 'click', function () { Social.viewStory(null); });
  sr.appendChild(st);
  for (i = 0; i < PERSONAS.length; i++) {
    p = PERSONAS[i];
    st = elc('div', 'story');
    st.innerHTML = '<div class="story-c"><div class="story-in">' + p.emoji + '</div></div><div class="story-n">' + esc(p.short) + '</div>';
    (function (pid) { on(st, 'click', function () { Social.viewStory(pid); }); })(p.id);
    sr.appendChild(st);
  }
};

Live.start = function (pid, mine) {
  Live.stop();
  Live.mine = !!mine;
  Live.cur = mine ? { id: 'me', name: S.name, short: S.name, emoji: S.emoji, color: '#e0284a', followers: S.followers, live: { title: 'لایو من', says: [] } } : getPersona(pid);
  Live.viewers = mine ? rint(50, 400) : Math.round(Live.cur.followers / rint(800, 2500)) + rint(500, 6000);
  Live.hearts = 0; Live.gifts = 0; Live.myComments = 0; Live.startTs = Date.now();
  Live.followed = Social.isFollowing(Live.cur.id);

  $('lhAva').innerHTML = Live.cur.emoji; $('lhAva').style.background = Live.cur.color;
  $('lhName').innerHTML = esc(Live.cur.name) + (Live.cur.verified ? ' <span class="vbadge">✔</span>' : '');
  $('liveHostAva').innerHTML = Live.cur.emoji; $('liveHostAva').style.background = Live.cur.color;
  $('lhViewers').innerHTML = '👁 ' + compact(Live.viewers);
  $('lhFollow').innerHTML = Live.followed ? 'دنبال می‌کنی' : 'دنبال کردن';
  $('lhFollow').className = Live.followed ? 'lh-follow on' : 'lh-follow';
  if (Live.mine) hide($('lhFollow')); else show($('lhFollow'));
  $('liveComments').innerHTML = '';
  $('liveJoins').innerHTML = '';
  $('liveSay').innerHTML = Live.mine ? 'دوربین روشنه! داری پخش زنده می‌کنی 🔴' : '';
  hide($('giftPan'));
  go('live');

  /* تایمرها */
  Live.timers.push(setInterval(Live.tickViewers, 1400));
  Live.timers.push(setInterval(Live.tickComment, 1700));
  Live.timers.push(setInterval(Live.tickJoin, 4200));
  Live.timers.push(setInterval(Live.tickSay, 9000));
  Live.timers.push(setInterval(Live.tickHeart, 900));
  Live.timers.push(setInterval(Live.tickTag, 1000));
  if (Live.mine) Live.timers.push(setInterval(Live.tickGiftIn, 7000));
  Live.tickSay();
  Snd.pop();
};

Live.stop = function () {
  var i;
  for (i = 0; i < Live.timers.length; i++) clearInterval(Live.timers[i]);
  Live.timers = [];
};

Live.end = function () {
  var dur = Math.round((Date.now() - Live.startTs) / 1000);
  var name = Live.cur ? Live.cur.short : '';
  var mine = Live.mine;
  Live.stop();
  go('lives', true);
  var body = 'مدت: ' + fa(pad2(Math.floor(dur / 60)) + ':' + pad2(dur % 60)) + '<br>' +
    'بیشترین بیننده: ' + compact(Live.viewers) + '<br>' +
    'قلب‌ها: ' + fa(Live.hearts) + ' • هدیه‌ها: ' + fa(Live.gifts) + '<br>' +
    'کامنت‌های تو: ' + fa(Live.myComments);
  if (mine) {
    var newF = rint(50, 1200) + Live.gifts * 30;
    S.followers += newF; saveSettings(); Social.renderProfile();
    body += '<br>🎉 ' + fa(newF) + ' فالوور جدید گرفتی!';
  }
  popup(mine ? 'لایوت تموم شد' : 'لایو ' + name + ' تموم شد', body, null, 'باشه', false);
};

Live.tickTag = function () {
  var d = Math.round((Date.now() - Live.startTs) / 1000);
  $('liveTag').innerHTML = '🔴 زنده • ' + fa(pad2(Math.floor(d / 60)) + ':' + pad2(d % 60));
};
Live.tickViewers = function () {
  var delta = rint(-40, 260);
  Live.viewers += delta;
  if (Live.viewers < 30) Live.viewers = 30 + rint(0, 50);
  $('lhViewers').innerHTML = '👁 ' + compact(Live.viewers);
};
Live.addComment = function (user, text, cls) {
  var box = $('liveComments');
  var c = elc('div', 'cmt' + (cls ? ' ' + cls : ''));
  c.innerHTML = '<b>' + esc(user) + '</b> ' + esc(text);
  box.appendChild(c);
  while (box.childNodes.length > (S.fx ? 7 : 5)) box.removeChild(box.firstChild);
};
Live.tickComment = function () {
  var t = pick(LIVE_CMTS);
  if (Math.random() < 0.12) t = pick(STICKERS) + ' ' + pick(STICKERS);
  Live.addComment(randUser(), t);
};
Live.tickJoin = function () {
  var box = $('liveJoins');
  var j = elc('div', 'join-i', randUser() + ' ' + pick(LIVE_JOIN));
  box.appendChild(j);
  if (box.childNodes.length > 3) box.removeChild(box.firstChild);
  var n = rint(1, 40);
  Live.viewers += n;
};
Live.tickSay = function () {
  if (Live.mine) return;
  var says = (Live.cur.live && Live.cur.live.says) ? Live.cur.live.says : ['سلام به همه ❤️'];
  var s = pick(says);
  $('liveSay').innerHTML = '«' + esc(s) + '»';
  Snd.tone(rint(320, 460), 0.1, 'sine', 0.04);
};
Live.tickHeart = function () {
  if (!S.fx) return;
  if (Math.random() < 0.55) Live.flyHeart(pick(['❤️', '💖', '💛', '💚', '💙']));
};
Live.flyHeart = function (emo) {
  var box = $('hearts');
  var h = elc('div', 'hrt', emo);
  h.style.left = rint(0, 30) + 'px';
  h.style.bottom = '0px';
  box.appendChild(h);
  Live.hearts++;
  var y = 0, x0 = rint(-10, 14), t = 0;
  var iv = setInterval(function () {
    t++; y += 5;
    h.style.bottom = y + 'px';
    h.style.marginLeft = Math.round(Math.sin(t / 3) * 12 + x0) + 'px';
    h.style.opacity = Math.max(0, 1 - y / 230);
    if (y > 230) { clearInterval(iv); if (h.parentNode) h.parentNode.removeChild(h); }
  }, 45);
};
Live.tickGiftIn = function () {
  var g = pick(GIFTS);
  Live.gifts++;
  Live.addComment(randUser(), 'یه ' + g.n + ' ' + g.e + ' فرستاد!', 'host');
  Live.showGift(g.e);
};
Live.showGift = function (e) {
  var box = $('giftFly');
  box.innerHTML = e;
  box.style.opacity = '1';
  var o = 1;
  var iv = setInterval(function () {
    o -= 0.06; box.style.opacity = o;
    if (o <= 0) { clearInterval(iv); box.innerHTML = ''; }
  }, 60);
};

Live.sendComment = function () {
  var v = $('liveInput').value;
  if (!v) return;
  $('liveInput').value = '';
  Live.addComment(S.name, v, 'mine');
  Live.myComments++;
  Snd.pop();
  if (Live.mine) {
    setTimeout(function () { Live.addComment(randUser(), pick(['آره موافقم', 'چه باحال 😂', 'ادامه بده', 'دمت گرم ❤️'])); }, 1200);
    return;
  }
  /* جواب میزبان به کامنت تو */
  if (Math.random() < 0.7) {
    setTimeout(function () {
      var p = Live.cur;
      var reply = Chat.answerFor(p, v);
      $('liveSay').innerHTML = '«' + esc(S.name) + ' جان، ' + esc(reply) + '»';
      Live.addComment(p.short, '@' + S.name + ' ' + reply, 'host');
      Snd.msg(); vibe(60);
      toast('🎉 ' + p.short + ' به کامنت تو جواب داد!');
    }, rint(1200, 3000));
  }
};

/* پاسخ برای شخصیت دلخواه (بدون تغییر چت فعلی) */
Chat.answerFor = function (p, text) {
  var old = Chat.cur;
  Chat.cur = p;
  var a = Chat.answer(text);
  Chat.cur = old;
  return String(a).split('\n')[0];
};

Live.init = function () {
  on($('lhClose'), 'click', function () { Live.end(); });
  on($('liveSend'), 'click', function () { Live.sendComment(); });
  on($('liveInput'), 'keydown', function (e) { if (e.keyCode === 13) { Live.sendComment(); e.preventDefault(); } });
  on($('liveHeart'), 'click', function () {
    var i;
    for (i = 0; i < 4; i++) setTimeout(function () { Live.flyHeart('❤️'); }, i * 90);
    Snd.tap(); vibe(20);
  });
  on($('lhFollow'), 'click', function () {
    Live.followed = !Live.followed;
    Social.setFollowing(Live.cur.id, Live.followed);
    $('lhFollow').innerHTML = Live.followed ? 'دنبال می‌کنی' : 'دنبال کردن';
    $('lhFollow').className = Live.followed ? 'lh-follow on' : 'lh-follow';
    if (Live.followed) { toast('حالا ' + Live.cur.short + ' رو دنبال می‌کنی ✅'); Snd.ok(); }
  });
  on($('liveGift'), 'click', function () {
    var pan = $('giftPan'), i, g, e;
    if (pan.className.indexOf('hidden') < 0) { hide(pan); return; }
    if (!pan.innerHTML) {
      for (i = 0; i < GIFTS.length; i++) {
        g = GIFTS[i];
        e = elc('div', 'gift-i', '<div class="gift-e">' + g.e + '</div><div class="gift-n">' + g.n + '<br>' + fa(g.c) + ' سکه</div>');
        (function (gg) {
          on(e, 'click', function () {
            if (S.coins < gg.c) { toast('سکه کافی نداری! از بخش پروفایل سکه بگیر'); Snd.err(); return; }
            S.coins -= gg.c; saveSettings();
            Live.gifts++;
            Live.showGift(gg.e);
            Live.addComment(S.name, 'یه ' + gg.n + ' ' + gg.e + ' فرستاد!', 'mine');
            hide($('giftPan'));
            Snd.ok(); vibe(80);
            setTimeout(function () {
              if (!Live.mine && Live.cur) {
                $('liveSay').innerHTML = '«مرسی ' + esc(S.name) + ' بابت ' + gg.n + '! ' + pick(['خیلی لطف کردی ❤️', 'دمت گرم 🙏', 'قربونت 😍']) + '»';
                Live.addComment(Live.cur.short, '@' + S.name + ' مرسی بابت ' + gg.n + ' ' + gg.e, 'host');
                Snd.msg();
              }
            }, 1200);
          });
        })(g);
        pan.appendChild(e);
      }
    }
    show(pan);
  });
};
