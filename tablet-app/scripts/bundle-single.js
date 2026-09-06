#!/usr/bin/env node
/* ساخت نسخه‌ی تک‌فایلی (همه چیز داخل یک HTML) برای اجرا با مرورگر تبلت */
var fs = require('fs'), path = require('path');
var root = path.join(__dirname, '..', 'www');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

html = html.replace(/<link rel="stylesheet" href="css\/app.css">/,
  '<style>\n' + fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8') + '\n</style>');

html = html.replace(/<script src="js\/([a-z]+)\.js"><\/script>/g, function (m, name) {
  return '<script>\n' + fs.readFileSync(path.join(root, 'js', name + '.js'), 'utf8') + '\n</script>';
});

var out = path.join(__dirname, '..', 'StarLive-single.html');
fs.writeFileSync(out, html, 'utf8');
console.log('✅ ' + out + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KB)');
