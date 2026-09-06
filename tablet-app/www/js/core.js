/* core.js — ابزارهای پایه (ES5، سازگار با اندروید 4.4) */
var App = {};

/* ---------- DOM ---------- */
function $(id) { return document.getElementById(id); }
function elc(tag, cls, html) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined && html !== null) e.innerHTML = html;
  return e;
}
function show(el) { if (el) el.className = el.className.replace(/\s*hidden/g, ''); }
function hide(el) { if (el && el.className.indexOf('hidden') < 0) el.className += ' hidden'; }
function on(el, ev, fn) { if (el) el.addEventListener(ev, fn, false); }
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ---------- STORAGE (localStorage + پشتیبان SharedPreferences اندروید) ---------- */
var MEM = {};
var LS_OK = (function () {
  try {
    localStorage.setItem('sl_test', '1');
    localStorage.removeItem('sl_test');
    return true;
  } catch (e) { return false; }
})();
function rawGet(k) {
  if (LS_OK) { try { return localStorage.getItem(k); } catch (e) {} }
  try { if (window.Android && window.Android.prefGet) { var v = window.Android.prefGet(k); return v === '' ? null : v; } } catch (e) {}
  return MEM.hasOwnProperty(k) ? MEM[k] : null;
}
function rawSet(k, v) {
  if (LS_OK) { try { localStorage.setItem(k, v); return; } catch (e) {} }
  try { if (window.Android && window.Android.prefSet) { window.Android.prefSet(k, v); return; } } catch (e) {}
  MEM[k] = v;
}
function rawDel(k) {
  if (LS_OK) { try { localStorage.removeItem(k); return; } catch (e) {} }
  try { if (window.Android && window.Android.prefDel) { window.Android.prefDel(k); return; } } catch (e) {}
  delete MEM[k];
}
var Store = {
  get: function (k, def) {
    try {
      var v = rawGet('sl_' + k);
      if (v === null || v === undefined) return def;
      return JSON.parse(v);
    } catch (e) { return def; }
  },
  set: function (k, v) {
    try { rawSet('sl_' + k, JSON.stringify(v)); } catch (e) {}
  },
  del: function (k) { rawDel('sl_' + k); },
  clearAll: function () {
    var i, ks = [], key;
    if (LS_OK) {
      try {
        for (i = 0; i < localStorage.length; i++) {
          key = localStorage.key(i);
          if (key && key.indexOf('sl_') === 0) ks.push(key);
        }
        for (i = 0; i < ks.length; i++) localStorage.removeItem(ks[i]);
      } catch (e) {}
    }
    try { if (window.Android && window.Android.prefClear) window.Android.prefClear(); } catch (e) {}
    MEM = {};
  }
};

/* ---------- SETTINGS / STATE ---------- */
var S = {
  name: 'دوست من',
  emoji: '😎',
  bio: 'اینجا فقط ستاره‌ها میان 🌟',
  followers: 2400000,
  following: 312,
  posts: 87,
  theme: 'dark',
  sound: true,
  vibe: true,
  fx: true,
  lock: false,
  push: true,
  coins: 1200,
  verified: true
};
function loadSettings() {
  var s = Store.get('set', null), k;
  if (s) for (k in s) if (S.hasOwnProperty(k)) S[k] = s[k];
  document.body.className = (S.theme === 'light') ? 'theme-light' : 'theme-dark';
}
function saveSettings() { Store.set('set', S); }

/* ---------- NUMBERS (فارسی) ---------- */
var FA_D = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
function fa(n) {
  var s = String(n), o = '', i, c;
  for (i = 0; i < s.length; i++) {
    c = s.charAt(i);
    o += (c >= '0' && c <= '9') ? FA_D[+c] : c;
  }
  return o;
}
function faNum(n) { /* جداکننده هزارگان */
  var s = String(Math.round(n)), r = '', c = 0, i;
  for (i = s.length - 1; i >= 0; i--) {
    r = s.charAt(i) + r; c++;
    if (c % 3 === 0 && i > 0) r = ',' + r;
  }
  return fa(r);
}
function compact(n) {
  if (n >= 1000000) return fa((Math.round(n / 100000) / 10).toFixed(1)) + ' م';
  if (n >= 1000) return fa((Math.round(n / 100) / 10).toFixed(1)) + ' ه';
  return fa(n);
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clock(d) { d = d || new Date(); return fa(pad2(d.getHours()) + ':' + pad2(d.getMinutes())); }

/* ---------- تاریخ شمسی ---------- */
var FA_MONTH = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
var FA_DAY = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
function toJalali(gy, gm, gd) {
  var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  var gy2 = (gm > 2) ? (gy + 1) : gy;
  var days = (365 * gy) + parseInt((gy2 + 3) / 4, 10) - parseInt((gy2 + 99) / 100, 10) +
             parseInt((gy2 + 399) / 400, 10) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * parseInt(days / 12053, 10); days %= 12053;
  jy += 4 * parseInt(days / 1461, 10); days %= 1461;
  if (days > 365) { jy += parseInt((days - 1) / 365, 10); days = (days - 1) % 365; }
  var jm = (days < 186) ? 1 + parseInt(days / 31, 10) : 7 + parseInt((days - 186) / 30, 10);
  var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}
function faDate(d) {
  d = d || new Date();
  var j = toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return FA_DAY[d.getDay()] + ' ' + fa(j[2]) + ' ' + FA_MONTH[j[1] - 1] + ' ' + fa(j[0]);
}
function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

/* ---------- تصادفی و هش ---------- */
function hashStr(s) {
  var h = 2166136261, i;
  s = String(s);
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
function seedRnd(seed) { /* تولیدکننده عدد شبه‌تصادفی پایدار */
  var x = seed >>> 0;
  return function () {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return (x >>> 0) / 4294967296;
  };
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickS(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }
function rint(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function rintS(a, b, rnd) { return a + Math.floor(rnd() * (b - a + 1)); }

/* ---------- صدا (WebAudio) ---------- */
var Snd = {
  ctx: null, ringTimer: null,
  init: function () {
    if (this.ctx) return this.ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { this.ctx = null; }
    return this.ctx;
  },
  tone: function (freq, dur, type, vol) {
    if (!S.sound) return;
    var c = this.init(); if (!c) return;
    try {
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.value = vol === undefined ? 0.12 : vol;
      o.connect(g); g.connect(c.destination);
      var t = c.currentTime;
      o.start(t);
      g.gain.setValueAtTime(g.gain.value, t + dur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.stop(t + dur + 0.02);
    } catch (e) {}
  },
  tap: function () { this.tone(660, 0.05, 'sine', 0.05); },
  pop: function () { this.tone(880, 0.08, 'triangle', 0.07); },
  msg: function () { this.tone(740, 0.09, 'sine', 0.08); var s = this; setTimeout(function () { s.tone(980, 0.1, 'sine', 0.08); }, 90); },
  ok: function () { var s = this; s.tone(523, 0.1); setTimeout(function () { s.tone(659, 0.1); }, 100); setTimeout(function () { s.tone(784, 0.16); }, 200); },
  err: function () { this.tone(180, 0.22, 'sawtooth', 0.08); },
  scan: function () { this.tone(1200, 0.04, 'square', 0.03); },
  startRing: function () {
    var s = this; this.stopRing();
    function burst() {
      s.tone(880, 0.28, 'sine', 0.13);
      setTimeout(function () { s.tone(1100, 0.28, 'sine', 0.13); }, 320);
      setTimeout(function () { s.tone(880, 0.28, 'sine', 0.13); }, 700);
    }
    burst();
    this.ringTimer = setInterval(burst, 1700);
  },
  stopRing: function () { if (this.ringTimer) { clearInterval(this.ringTimer); this.ringTimer = null; } }
};
function vibe(ms) {
  if (!S.vibe) return;
  try {
    if (window.Android && window.Android.vibrate) { window.Android.vibrate(ms); return; }
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}

/* ---------- TOAST / POPUP ---------- */
var toastT = null;
function toast(msg, ms) {
  var t = $('toast'); if (!t) return;
  t.innerHTML = msg; show(t);
  if (toastT) clearTimeout(toastT);
  toastT = setTimeout(function () { hide(t); }, ms || 2200);
}
function popup(title, body, onOk, okText, noText) {
  $('popTitle').innerHTML = title;
  $('popBody').innerHTML = body;
  $('popOk').innerHTML = okText || 'باشه';
  var no = $('popNo');
  if (noText === false) { hide(no); } else { show(no); no.innerHTML = noText || 'بی‌خیال'; }
  show($('popup'));
  $('popOk').onclick = function () { hide($('popup')); if (onOk) onOk(); };
  no.onclick = function () { hide($('popup')); };
}

/* ---------- ROUTER ---------- */
var SCREENS = ['home', 'chats', 'room', 'lives', 'live', 'mirror', 'scan', 'lie', 'calls', 'profile', 'star', 'set'];
var curScreen = 'home';
var navStack = [];
function go(name, noStack) {
  var i, el;
  if (!noStack && curScreen !== name) navStack.push(curScreen);
  for (i = 0; i < SCREENS.length; i++) {
    el = $('screen-' + SCREENS[i]);
    if (el) { if (SCREENS[i] === name) show(el); else hide(el); }
  }
  curScreen = name;
  /* تب پایین */
  var tabs = $('tabbar').getElementsByTagName('button');
  for (i = 0; i < tabs.length; i++) {
    tabs[i].className = (tabs[i].getAttribute('data-s') === name) ? 'tab on' : 'tab';
  }
  if (name === 'live') hide($('tabbar')); else show($('tabbar'));
  if (App.onScreen) App.onScreen(name);
  var sc = $('screen-' + name);
  if (sc) { var s2 = sc.getElementsByTagName('div'); }
}
function goBack() {
  if (!$('popup').className.match(/hidden/)) { hide($('popup')); return true; }
  if ($('screen-live') && $('screen-live').className.indexOf('hidden') < 0) { Live.stop(); go('lives', true); return true; }
  var prev = navStack.pop();
  if (prev) { go(prev, true); return true; }
  return false;
}

/* ---------- رنگ آواتار ---------- */
var AVA_COLORS = ['#e0284a', '#6d78ff', '#17a55f', '#ff8f1f', '#a832ff', '#0aa5c9', '#d81b8c', '#4a5568'];
function avaColor(key) { return AVA_COLORS[hashStr(key) % AVA_COLORS.length]; }
function initials(name) {
  var p = String(name).split(' ');
  if (p.length > 1) return p[0].charAt(0) + p[1].charAt(0);
  return p[0].substr(0, 2);
}

/* ---------- زمان نسبی ---------- */
function ago(ts) {
  var d = (Date.now() - ts) / 1000;
  if (d < 60) return 'همین الان';
  if (d < 3600) return fa(Math.floor(d / 60)) + ' دقیقه پیش';
  if (d < 86400) return fa(Math.floor(d / 3600)) + ' ساعت پیش';
  return fa(Math.floor(d / 86400)) + ' روز پیش';
}

/* ---------- پل اندروید ---------- */
var Bridge = {
  has: function () { return !!(window.Android && window.Android.scheduleCall); },
  schedule: function (id, pid, name, at, kind, msg) {
    try { if (this.has()) window.Android.scheduleCall(id, pid, name, String(at), kind, msg || ''); } catch (e) {}
  },
  cancel: function (id) { try { if (window.Android && window.Android.cancelCall) window.Android.cancelCall(id); } catch (e) {} },
  exit: function () { try { if (window.Android && window.Android.exitApp) window.Android.exitApp(); } catch (e) {} },
  param: function (k) {
    var m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
};
