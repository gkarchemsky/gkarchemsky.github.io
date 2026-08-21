/* Client-side signal collection.
 *
 * Everything here is read out of the reader's device, which is the category
 * ePrivacy Art. 5(3) requires consent for. The gate below is therefore the
 * whole point of the file: it runs only where the edge has said the request
 * is not from an EU country, and only when the reader has not asked to be
 * left alone.
 *
 * Two things that gate is not:
 *
 *  - It is not airtight. cf.isEUCountry is IP geolocation, so a VPN, a mobile
 *    carrier or a corporate proxy can place an EU reader outside the EU. GDPR
 *    follows the person, not the address. The UK, the EEA and Switzerland are
 *    covered by their own regimes and are not "EU" here either.
 *  - It is not a substitute for a policy. Whether this file should exist at
 *    all is a decision about the site, not about the code.
 *
 * HONOUR_PRIVACY_SIGNALS is on deliberately. DNT and Sec-GPC are the reader
 * stating a preference in the only channel the web gives them, and the site
 * already records both. Set it false to collect regardless — the flag is here
 * so that choice is explicit and visible rather than buried.
 */
(function () {
  'use strict';

  var HONOUR_PRIVACY_SIGNALS = true;
  var ENDPOINT = '/api/collect';

  /* The edge decides eligibility, not this script: only the server knows the
     country, and a client-side check could be edited by the reader. The value
     is stamped into the document by the middleware. */
  var gate = document.documentElement.getAttribute('data-collect');
  if (gate !== 'on') return;

  if (HONOUR_PRIVACY_SIGNALS) {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' ||
        navigator.msDoNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  }

  /* Nothing here may run before the page is usable. Every signal below costs
     main-thread time — the font probe and the audio one especially — and a
     reader waiting on layout must not pay for it. */
  var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 1200); };

  /* --------------------------------------------------------------- helpers */

  /* FNV-1a. Not a cryptographic hash and not meant to be one: it turns a long
     unstable string into a short stable label. */
  function hash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(16);
  }

  /* Every probe is wrapped: one unavailable API must not cost every other
     signal, and none of them may take the page down. */
  function safe(fn, fallback) {
    try { var v = fn(); return v === undefined || v === null ? (fallback || '') : v; }
    catch (e) { return fallback || ''; }
  }

  /* ---------------------------------------------------------------- probes */

  function canvasHash() {
    var c = document.createElement('canvas');
    c.width = 240; c.height = 60;
    var ctx = c.getContext('2d');
    if (!ctx) return '';
    /* Mixed text, a curve and a gradient: the three things whose rasterisation
       differs most between GPU, driver and font stack. */
    ctx.textBaseline = 'alphabetic';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(8, 4, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('gk☠️ 0O1lI', 4, 26);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('gk☠️ 0O1lI', 6, 30);
    ctx.globalCompositeOperation = 'multiply';
    ctx.beginPath(); ctx.arc(60, 40, 18, 0, Math.PI * 2, true); ctx.fill();
    return hash(c.toDataURL());
  }

  function webgl() {
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { vendor: '', renderer: '', ext: '', params: '' };
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    var params = [
      gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      gl.getParameter(gl.MAX_VIEWPORT_DIMS), gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
      gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE), gl.getParameter(gl.SHADING_LANGUAGE_VERSION)
    ].join('|');
    return {
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || '') : '',
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '',
      ext: hash((gl.getSupportedExtensions() || []).join(',')),
      params: hash(params)
    };
  }

  /* Offline, so it never reaches the speakers and never needs a gesture. */
  function audioHash(done) {
    var AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!AC) return done('');
    try {
      var ctx = new AC(1, 44100, 44100);
      var osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50; comp.knee.value = 40; comp.ratio.value = 12;
      comp.attack.value = 0; comp.release.value = 0.25;
      osc.connect(comp); comp.connect(ctx.destination);
      osc.start(0); ctx.startRendering();
      var settled = false;
      ctx.oncomplete = function (e) {
        if (settled) return; settled = true;
        var d = e.renderedBuffer.getChannelData(0), sum = 0;
        for (var i = 4500; i < 5000; i++) sum += Math.abs(d[i]);
        done(hash(String(sum)));
      };
      setTimeout(function () { if (!settled) { settled = true; done(''); } }, 800);
    } catch (e) { done(''); }
  }

  /* Width of a string in a candidate font against three fallbacks. A font that
     is not installed measures identically to its fallback. */
  function fonts() {
    var BASE = ['monospace', 'sans-serif', 'serif'];
    var LIST = ['Arial','Arial Black','Arial Narrow','Calibri','Cambria','Candara','Comic Sans MS',
      'Consolas','Courier','Courier New','Georgia','Helvetica','Helvetica Neue','Impact',
      'Lucida Console','Lucida Grande','Menlo','Monaco','Palatino','Segoe UI','Tahoma',
      'Times','Times New Roman','Trebuchet MS','Verdana','SF Mono','SF Pro Text','Roboto',
      'Ubuntu','Cantarell','DejaVu Sans','Liberation Sans','Noto Sans','Fira Code',
      'JetBrains Mono','Source Code Pro','Inconsolata','Hack','PT Sans','Open Sans'];
    var span = document.createElement('span');
    span.style.cssText = 'position:absolute;left:-9999px;top:-9999px;font-size:72px;' +
      'line-height:normal;visibility:hidden;white-space:nowrap';
    span.textContent = 'mmmmmmmmmmlli WWW@';
    document.body.appendChild(span);
    var base = {};
    BASE.forEach(function (b) {
      span.style.fontFamily = b;
      base[b] = [span.offsetWidth, span.offsetHeight].join('x');
    });
    var found = [];
    LIST.forEach(function (f) {
      for (var i = 0; i < BASE.length; i++) {
        span.style.fontFamily = '"' + f + '",' + BASE[i];
        if ([span.offsetWidth, span.offsetHeight].join('x') !== base[BASE[i]]) { found.push(f); break; }
      }
    });
    document.body.removeChild(span);
    return found;
  }

  function mediaQueries() {
    var q = ['(prefers-color-scheme: dark)','(prefers-reduced-motion: reduce)',
             '(prefers-contrast: more)','(forced-colors: active)','(pointer: coarse)',
             '(hover: hover)','(any-pointer: fine)','(dynamic-range: high)',
             '(prefers-reduced-transparency: reduce)','(inverted-colors: inverted)'];
    return q.map(function (s) { return window.matchMedia(s).matches ? '1' : '0'; }).join('');
  }

  /* A random value in localStorage. Not a fingerprint — an identifier, and the
     only signal here the reader can actually erase. */
  function storedId() {
    try {
      var k = 'gk.vid', v = localStorage.getItem(k);
      if (!v) {
        v = (crypto && crypto.randomUUID) ? crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(16).slice(2);
        localStorage.setItem(k, v);
      }
      return v;
    } catch (e) { return ''; }
  }

  /* ------------------------------------------------------------- assemble */

  function collect() {
    var gl = safe(webgl, { vendor:'', renderer:'', ext:'', params:'' });
    var f = safe(fonts, []);
    var nav = navigator;
    var scr = window.screen || {};

    var d = {
      v: 1,
      p: location.pathname,
      sid: safe(storedId),

      canvas: safe(canvasHash),
      glVendor: String(gl.vendor).slice(0, 60),
      glRenderer: String(gl.renderer).slice(0, 90),
      glExt: gl.ext, glParams: gl.params,

      fonts: f.join(','), fontHash: hash(f.join(',')), fontN: f.length,

      screen: [scr.width, scr.height, scr.availWidth, scr.availHeight,
               scr.colorDepth, scr.pixelDepth].join('x'),
      dpr: window.devicePixelRatio || 0,
      vp: [window.innerWidth, window.innerHeight].join('x'),
      orient: safe(function () { return (scr.orientation || {}).type; }),

      tz: safe(function () { return Intl.DateTimeFormat().resolvedOptions().timeZone; }),
      tzOff: new Date().getTimezoneOffset(),
      locale: safe(function () { return Intl.DateTimeFormat().resolvedOptions().locale; }),
      langs: (nav.languages || [nav.language || '']).join(','),

      cores: nav.hardwareConcurrency || 0,
      mem: nav.deviceMemory || 0,
      touch: nav.maxTouchPoints || 0,
      plat: nav.platform || '',
      plugins: safe(function () {
        return Array.prototype.map.call(nav.plugins || [], function (p) { return p.name; }).join(','); }),

      mq: safe(mediaQueries),
      voices: safe(function () {
        var v = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
        return v.length + ':' + hash(v.map(function (x) { return x.name + x.lang; }).join(',')); }),
      net: safe(function () {
        var c = nav.connection || nav.mozConnection || nav.webkitConnection;
        return c ? [c.effectiveType, c.downlink, c.rtt, c.saveData ? 1 : 0].join('|') : ''; }),

      pdf: safe(function () { return nav.pdfViewerEnabled ? 1 : 0; }, 0),
      cookieEnabled: nav.cookieEnabled ? 1 : 0,
      webdriver: nav.webdriver ? 1 : 0
    };

    /* These two are async but cheap; the payload goes out either way after a
       short grace period, so a browser that never answers costs nothing. */
    var pending = 3, sent = false;
    function maybeSend() { if (--pending <= 0) send(); }
    function send() {
      if (sent) return; sent = true;
      d.fp = hash([d.canvas, d.glRenderer, d.glExt, d.glParams, d.audio, d.fontHash,
                   d.screen, d.dpr, d.tz, d.langs, d.cores, d.mem, d.plat, d.mq].join('~'));
      var body = JSON.stringify(d);
      try {
        if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
        else fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true,
                               headers: { 'content-type': 'application/json' } });
      } catch (e) { /* a lost measurement is not worth an error */ }
    }

    audioHash(function (h) { d.audio = h; maybeSend(); });

    safe(function () {
      if (!nav.mediaDevices || !nav.mediaDevices.enumerateDevices) { maybeSend(); return; }
      nav.mediaDevices.enumerateDevices().then(function (list) {
        var k = { audioinput: 0, audiooutput: 0, videoinput: 0 };
        list.forEach(function (x) { if (k[x.kind] !== undefined) k[x.kind]++; });
        d.devices = k.audioinput + '/' + k.audiooutput + '/' + k.videoinput;
        maybeSend();
      })['catch'](maybeSend);
    }, maybeSend());

    safe(function () {
      if (!nav.userAgentData || !nav.userAgentData.getHighEntropyValues) { maybeSend(); return; }
      nav.userAgentData.getHighEntropyValues(
        ['architecture','bitness','model','platformVersion','uaFullVersion','fullVersionList']
      ).then(function (h) { d.uaHigh = JSON.stringify(h).slice(0, 300); maybeSend(); })['catch'](maybeSend);
    }, maybeSend());

    /* Whatever has not answered in two seconds is not going to. */
    setTimeout(send, 2000);
  }

  idle(function () { try { collect(); } catch (e) {} });
})();
