/* Progressive enhancement only — the site is fully readable without this. */
(function () {
  'use strict';

  /* ------------------------------------------------------------- preload */
  /* Let transitions run again, now that every value on the page has settled.
     The head marks the document `is-preload` before any stylesheet loads; see
     the note there for what it prevents. Released after `load` and one frame
     beyond it, so the release itself cannot be what a transition animates
     from. */
  (function () {
    var root = document.documentElement;
    var release = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.remove('is-preload');
        });
      });
    };
    if (document.readyState === 'complete') release();
    else window.addEventListener('load', release);
  })();

  /* --------------------------------------------------------- press states */
  /* iOS Safari does not apply :active to an arbitrary element unless the
     document has a touch listener bound somewhere. Without this the press
     feedback added for touch — the whole point of guarding every :hover
     behind (hover: hover) — silently never fires on the one platform it was
     written for. An empty passive listener is the whole fix; it binds nothing
     and cannot block a scroll. */
  document.addEventListener('touchstart', function () {}, { passive: true });

  /* ------------------------------------------------------- reduced motion */
  /* Every programmatic scroll goes through this.
   *
   * A stylesheet cannot decide this. `scrollTo({behavior: 'smooth'})` states a
   * behavior explicitly, and an explicit value beats any rule — so two call
   * sites were animating for readers who had asked the OS for no animation,
   * the exact people the reduced-motion query exists for. The choice has to be
   * made where the call is made, which is here.
   *
   * These are also the only scrolls on the site that animate at all: there is
   * no global `scroll-behavior: smooth`, because it would apply to scrolls the
   * browser performs on its own — restoring your position after a refresh
   * among them. See the note on `html` in main.css.
   *
   * Read per call rather than cached: the setting can change mid-session. */
  function scrollBehavior() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 'instant'
      : 'smooth';
  }

  /* ------------------------------------------------------ modal background */
  /* Take the page behind a dialog out of the tab order and the accessibility
   * tree, and put it back.
   *
   * `aria-modal="true"` is a claim, not a mechanism: it tells assistive tech
   * the rest of the page is unavailable and then does nothing to make that
   * true. Both dialogs here declare it. The command palette backed it up; the
   * lightbox did not, so one Tab from its close button walked into 158 still-
   * focusable elements underneath a dialog that had said they were gone.
   *
   * `inert` is ignored where unsupported, so this only ever adds correctness.
   * Always clear it before restoring focus — focusing inside an inert subtree
   * silently does nothing. */
  function inertBackground(state) {
    ['header', 'main', 'footer'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) el.inert = state;
    });
  }

  /* ------------------------------------------------ archive follows page */
  function syncArchiveToPage(container) {
    var rail = document.querySelector('.archive-rail');
    if (!rail || !container) return;

    var byHref = {};
    Array.prototype.forEach.call(rail.querySelectorAll('a[href]'), function (a) {
      byHref[a.getAttribute('href')] = a;
    });

    var shown = 0;
    Array.prototype.forEach.call(container.children, function (el) {
      if (!el.classList.contains('post-item')) return;      // skip year/month rules
      var link = el.querySelector('h2 a[href], h3 a[href]');
      if (!link) return;
      var rl = byHref[link.getAttribute('href')];
      if (!rl) return;
      var li = rl.closest('li');
      if (!li) return;
      li.hidden = !!el.hidden;
      if (!el.hidden) shown++;
    });

    /* A year whose every entry is off this page has nothing left to show, and
       an empty <details> still renders its summary and count. */
    Array.prototype.forEach.call(rail.querySelectorAll('.archive-year'), function (group) {
      var live = group.querySelectorAll('li:not([hidden])').length;
      group.hidden = live === 0;
      var n = group.querySelector('summary .n');
      if (n) n.textContent = live;
    });

    /* The total keeps naming the whole archive — the rail is scoped, the
       archive is not, and hiding its real size would be the wrong trade. */
    var total = rail.querySelector('.archive-total');
    if (total && !total.dataset.full) total.dataset.full = total.textContent.trim();
    if (total) {
      var all = parseInt(total.dataset.full, 10);
      total.textContent = shown < all
        ? shown + ' of ' + all + ' posts'
        : total.dataset.full;
    }
  }

  /* ------------------------------------------------------ first/last shown */
  /* Marks the first and last *visible* children of a list.
   *
   * CSS `:first-child` and `:last-child` count DOM position and take no notice
   * of `hidden`, but two features here hide list items in place — pagination
   * and the tag filter. So on page two of the archive the top entry was not
   * :first-child and kept the margin meant to be stripped from the first one,
   * opening a gap above the list; and a filtered tag list ended on a post that
   * was not :last-child and so kept the separator that should close the list,
   * leaving a rule under the final entry with nothing beneath it.
   *
   * No selector can express "first one that is not hidden", so whoever does
   * the hiding says so, and the stylesheet pairs .is-first-shown with
   * :first-child everywhere it matters. */
  function markEdges(container) {
    if (!container) return;
    var shown = [];
    Array.prototype.forEach.call(container.children, function (el) {
      el.classList.remove('is-first-shown', 'is-last-shown');
      if (!el.hidden) shown.push(el);
    });
    if (!shown.length) return;
    shown[0].classList.add('is-first-shown');
    shown[shown.length - 1].classList.add('is-last-shown');
  }

  /* ------------------------------------------------------ lazy scheduling */
  /* Run `fn` once, when `el` comes within `margin` px of the viewport.
   *
   * Deliberately a rect check on a passive scroll handler rather than an
   * IntersectionObserver: observers silently never fire in some embedded and
   * headless browsers, and every caller here is loading something the reader
   * is meant to see. A comment box or a diagram that never appears is a worse
   * failure than one that loads a little early.
   *
   * One shared listener for all callers, removed once nothing is waiting. */
  var lazyQueue = [];
  var lazyBound = false;

  function runLazyQueue() {
    lazyQueue = lazyQueue.filter(function (item) {
      var r = item.el.getBoundingClientRect();
      // Below the fold and further away than its margin: keep waiting.
      if (r.top > window.innerHeight + item.margin) return true;
      // Entirely above the viewport by more than its margin: it was skipped
      // past (an in-page anchor, say) — run it anyway rather than never.
      item.fn(item.el);
      return false;
    });

    if (!lazyQueue.length && lazyBound) {
      window.removeEventListener('scroll', runLazyQueue);
      window.removeEventListener('resize', runLazyQueue);
      lazyBound = false;
    }
  }

  function whenNear(el, fn, margin) {
    if (!el) return;
    lazyQueue.push({ el: el, fn: fn, margin: margin == null ? 400 : margin });
    if (!lazyBound) {
      window.addEventListener('scroll', runLazyQueue, { passive: true });
      window.addEventListener('resize', runLazyQueue, { passive: true });
      lazyBound = true;
    }
    runLazyQueue();   // may already be on screen
  }

  /* ---------------------------------------------------------------- theme */
  /* What the page is actually showing right now: an explicit choice if one has
     been made, otherwise whatever the OS asked for. */
  function effectiveTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'light' || t === 'dark') return t;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  /* ------------------------------------------------------- tab icon ---- */
  /* The favicon follows the site's theme, not the operating system's.
   *
   * assets/img/favicon.svg carries its own `prefers-color-scheme` rule, which
   * is the right fallback with JavaScript off — but that rule is evaluated by
   * the browser chrome, which knows nothing about this site's toggle. Switch
   * the site to light while the OS is dark and the tab icon stayed dark.
   *
   * So the artwork is re-emitted here as a data: URI with the colours already
   * chosen. Same geometry as the file; only the two colours differ, and they
   * are the same pair the stylesheet uses.
   *
   * The <link> is replaced rather than re-pointed: several browsers ignore an
   * href change on an existing icon element and keep painting the old one. */
  function faviconFor(theme) {
    var bg = theme === 'dark' ? '#0b0d10' : '#ffffff';
    var fg = theme === 'dark' ? '#3cd3fe' : '#007eae';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
      + '<rect width="64" height="64" rx="13" fill="' + bg + '"/>'
      + '<path d="M16 21 L29 32 L16 43" fill="none" stroke="' + fg + '"'
      + ' stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
      + '<rect x="36" y="40" width="14" height="6" rx="1" fill="none"'
      + ' stroke="' + fg + '" stroke-width="6"/>'
      + '</svg>';
  }

  var faviconTheme = '';
  function syncFavicon() {
    var theme = effectiveTheme();
    if (theme === faviconTheme) return;   /* nothing to repaint */
    faviconTheme = theme;
    var link = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
    if (!link) return;
    var next = link.cloneNode(false);
    next.setAttribute('href', 'data:image/svg+xml,' + encodeURIComponent(faviconFor(theme)));
    link.parentNode.replaceChild(next, link);
  }
  syncFavicon();
  /* Outside the toggle block on purpose: with no explicit choice stored the
     icon still has to follow the OS, and that is true whether or not the
     button happens to exist on the page. */
  var faviconOS = window.matchMedia('(prefers-color-scheme: dark)');
  if (faviconOS.addEventListener) faviconOS.addEventListener('change', syncFavicon);

  var toggle = document.querySelector('.theme-toggle');
  if (toggle) {
    /* Which theme is on was shown by swapping a sun icon for a moon — visual
       only, so a screen reader was told there was a toggle but never what it
       was toggled to. aria-pressed carries that, and it has to be set on load
       as well as on click because the theme can come from localStorage or the
       OS without this button ever being touched. */
    var syncPressed = function () {
      toggle.setAttribute('aria-pressed', String(effectiveTheme() === 'dark'));
    };
    syncPressed();
    /* And when the OS flips while no explicit choice is set. */
    var osTheme = window.matchMedia('(prefers-color-scheme: dark)');
    if (osTheme.addEventListener) osTheme.addEventListener('change', syncPressed);

    toggle.addEventListener('click', function () {
      var root = document.documentElement;
      var current = root.getAttribute('data-theme');
      if (!current) {
        // No explicit choice yet: flip away from whatever the OS gave us.
        current = window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark';
      }
      var next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      syncPressed();
      syncFavicon();

      // The giscus iframe is configured to follow the OS, which is wrong the
      // moment this toggle disagrees with it. Tell it explicitly.
      var giscus = document.querySelector('iframe.giscus-frame');
      if (giscus && giscus.contentWindow) {
        giscus.contentWindow.postMessage(
          { giscus: { setConfig: { theme: next } } },
          'https://giscus.app'
        );
      }
    });
  }

  /* ------------------------------------------------------------ mobile nav */
  var navBtn = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');
  /* Assigned by the search expander further down, and only ever called after
     a click, so the hoisted `var` is enough to bridge the two blocks. */
  var closeSearchPanel = null;
  if (navBtn && nav) {
    navBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      navBtn.setAttribute('aria-expanded', String(open));
      /* Both panels dock at the bar's bottom edge, and the search panel is
         later in the markup, so with both open it paints over the menu's first
         two links. One of them has to yield, and it is the one the reader did
         not just ask for. */
      if (open && closeSearchPanel) closeSearchPanel();
    });

    /* Clicking the page dismisses the menu.
       Everything inside .site-header is exempt, and that one test covers the
       whole list on purpose: the panel itself, the hamburger (whose own
       handler already toggles, and which would otherwise close the menu in
       the same click that opened it), the search expander and the theme
       toggle are all descendants of the header. None of them is "away" — they
       are the bar the menu belongs to. Anything below it is the page, and a
       click there means the reader is done with the menu. */
    document.addEventListener('click', function (e) {
      if (!nav.classList.contains('open')) return;
      if (e.target.closest && e.target.closest('.site-header')) return;
      nav.classList.remove('open');
      navBtn.setAttribute('aria-expanded', 'false');
    });

    /* Pointer over the open menu should not scroll the page behind it.
       `overscroll-behavior: contain` in the CSS handles the case where the menu
       is long enough to scroll; when it is shorter than its max-height there is
       no scrolling for the browser to contain, and the wheel falls straight
       through to the document. Cancel it in that case. Not passive, because
       preventDefault is the entire point. */
    nav.addEventListener('wheel', function (e) {
      if (!nav.classList.contains('open')) return;
      var canScroll = nav.scrollHeight > nav.clientHeight;
      if (!canScroll) { e.preventDefault(); return; }
      var atTop = nav.scrollTop <= 0 && e.deltaY < 0;
      var atEnd = nav.scrollTop + nav.clientHeight >= nav.scrollHeight - 1 && e.deltaY > 0;
      if (atTop || atEnd) e.preventDefault();
    }, { passive: false });

    // Same for touch drags on a phone.
    nav.addEventListener('touchmove', function (e) {
      if (nav.classList.contains('open') && nav.scrollHeight <= nav.clientHeight) e.preventDefault();
    }, { passive: false });
  }

  /* ------------------------------------------------ header fit measurement */
  (function () {
    var hdr = document.querySelector('.site-header');
    if (!hdr) return;
    var wrap = hdr.querySelector('.wrap');
    var brand = hdr.querySelector('.brand');
    var navEl = document.getElementById('site-nav');
    var controls = hdr.querySelector('.nav-controls');
    var hamburger = hdr.querySelector('.nav-toggle');
    if (!wrap || !brand || !navEl || !controls) return;

    var HYSTERESIS = 48;     /* extra room demanded before expanding again */
    var navWidth = 0;        /* natural inline width of the links, once seen */
    var collapsedAtRail = 0; /* rail width when the bar last collapsed */
    var collapsedByRule = false; /* true when the CSS collapsed it, not this code */
    var busy = false;

    var widthRuleOwns = function () {
      /* Must match the breakpoint in main.css — below it the CSS has already
         collapsed the bar and this code stays out of the way. */
      return window.matchMedia('(max-width: 1040px)').matches;
    };

    /* Inner width of the bar, gutters excluded — the space the row has to fit
       inside. */
    var railWidth = function () {
      var cs = window.getComputedStyle(wrap);
      return wrap.clientWidth
        - (parseFloat(cs.paddingLeft) || 0)
        - (parseFloat(cs.paddingRight) || 0);
    };

    /* Does the whole row fit, with the links laid out inline?
    
       This is the question, and an earlier version of this code asked a
       narrower one: whether the links cleared the wordmark. They did — the
       squeeze showed up at the *other* end. At a 1150px window with the field
       open, the links sat a comfortable 32px from the cursor while the control
       group was shoved 54px past the right gutter, carrying the theme icon
       toward the edge of the window and, on a narrower screen, out of it.
    
       Measuring the total instead catches both ends with one number: the
       wordmark through its cursor, the natural width of the links, whatever the
       control group currently claims (which is where an open search field shows
       up), and the two gaps between them. */
    var field = hdr.querySelector('.nav-search-input');

    /* The two numbers the bar is decided from, read from the stylesheet so they
       are declared in one place — see --search-w and --nav-clearance on
       .site-header .wrap. Custom properties come back as their token text
       ("12rem"), not as resolved pixels, so rem is converted here. Reading them
       live also means a reader's text zoom moves the thresholds with the type,
       which is what should happen. */
    var remPx = function () {
      return parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    };
    var token = function (name, fallbackRem) {
      var raw = window.getComputedStyle(wrap).getPropertyValue(name).trim();
      var n = parseFloat(raw);
      if (isNaN(n)) return fallbackRem * remPx();
      return /rem\s*$/.test(raw) ? n * remPx() : n;
    };

    var gapPx = function () {
      return parseFloat(window.getComputedStyle(wrap).columnGap) || 0;
    };

    /* What the control group measures with the field shut.
    
       This is the number the row is planned against, and it has to be the
       *closed* one for both decisions below: the menu must not change because
       the search opened, and the field cannot be asked whether it fits by
       measuring a row that already contains it.
    
       Three states to normalise. Shut, the group is already the right width.
       Open as a card, the field is absolutely positioned and out of flow, so
       the group is again the right width. Open inline, its width has to come
       back out — leaving the form's own 0.35rem gap, which overstates by 6px
       in the safe direction. */
    var controlsClosed = function () {
      var w = controls.getBoundingClientRect().width;
      if (!field) return w;
      if (hdr.classList.contains('search-panel')) return w;
      if (!hdr.classList.contains('search-open')) return w;
      return w - field.getBoundingClientRect().width;
    };

    /* DECISION 1 — the menu.
    
       Taken from the closed row and nothing else. Opening the search used to
       feed into this through controlSlack(), which tried to guess how much of
       the open field's width the row could claw back; between 1060 and 1120px
       the guess came out short and the full menu collapsed into a hamburger the
       moment you clicked search. A decision that does not know the field is
       open cannot be changed by opening it. */
    var menuFits = function (extra) {
      var gap = gapPx();
      var need = brand.scrollWidth
        + gap + navWidth
        + gap + controlsClosed()
        + token('--nav-clearance', 3);
      return need + (extra || 0) <= railWidth();
    };

    /* ------------------------------------------------- panel fallback ----- */

    /* Extra room demanded before the field comes back into the bar. Small on
       purpose: .brand keeps its natural width in both states, so the same
       number decides both directions and there is no feedback loop to damp —
       this is only here so a resize that lands on the threshold cannot flap. */
    var PANEL_SLACK = 16;

    /* DECISION 2 — the shape of the field.
    
       Inline if its declared width and the clearance both still fit beside
       whatever the row is showing right now; otherwise it drops as the card.
       The card takes no room in the row, so the alternative to "it fits" is
       never "squeeze something", which is why the field no longer needs a
       min-width to be crushed back to.
    
       Note this asks about the row *as it stands*, hamburger or full menu.
       That is deliberate and has a visible consequence: widening past the point
       where the nav links appear can move the field from inline to card,
       because the links take the room it was using. The alternative — always
       reserving space for the links — would deny an inline field to every
       width below 1256px, including the ones with obvious room for it. */
    var fieldFitsInline = function (extra) {
      var gap = gapPx();
      var menuPart = hdr.classList.contains('nav-collapsed') || widthRuleOwns()
        ? (hamburger ? hamburger.getBoundingClientRect().width : 0)
        : navWidth;
      var need = brand.scrollWidth
        + gap + menuPart
        + gap + controlsClosed()
        + token('--search-w', 12)
        + token('--nav-clearance', 3);
      return need + (extra || 0) <= railWidth();
    };

    /* Every cached number here is in pixels, and a reader changing their text
       size changes what a pixel is worth without touching the window. The rail
       stays the width it was, so `resize` does not fire and the hysteresis in
       measureNav() reads the rail as unchanged — while the cached width of the
       links, measured at the old size, is now wrong by hundreds of pixels.

       Left alone that is a one-way door: zoom in far enough for the bar to
       collapse, zoom back out, and the links never come back, because the
       cached width they are judged against grew with the zoom and never
       shrank.

       The theme toggle is the sentinel. It is sized in rem, it is on screen at
       every width, and no decision taken here changes it — so its box moves
       when, and only when, the text scale does. That last part matters:
       watching anything the header itself resizes would make this a feedback
       loop rather than a signal. */
    var scaleSentinel = hdr.querySelector('.theme-toggle');
    var lastScale = 0;
    var scaleChanged = function () {
      if (!scaleSentinel) return false;
      var now = scaleSentinel.getBoundingClientRect().width;
      if (!now) return false;
      var moved = lastScale > 0 && Math.abs(now - lastScale) > 0.5;
      lastScale = now;
      return moved;
    };

    /* Start over from nothing rather than from a decision taken with worse
       information. The class is dropped and re-derived in the same task, so
       nothing paints between the two states. */
    function forgetCachedWidths() {
      navWidth = 0;
      collapsedAtRail = 0;
      hdr.classList.remove('nav-collapsed');
    }

    /* Which of the two shapes the field has is a property of the bar's width,
       not of whether the field happens to be open, and it is decided here for
       both states at once.

       Tying it to the open state instead is a trap worth naming. The field
       carries a width transition for its in-bar shape and no width at all as a
       panel, so taking the class off while the field is closing lands the
       element back on the rule that animates width in the same frame its width
       changes — and the browser animates it. Whatever the class is keyed to
       must therefore not change during a close.

       Keyed to the width it never does. The panel takes no room in the row, so
       the bar is identical open and closed, and this only has an answer to
       revise when the window changes. */
    /* Changing shape is a cut, never a tween. The two shapes have different
       geometry and different transition lists — in the bar the field animates
       its width, as a panel it has no width of its own — so switching between
       them hands the browser a pair of values on a property that animates, and
       it obliges. Dragging a window past the threshold with the field shut ran
       its hidden box from 602px down to zero over 150ms, shunting the icons
       along for the ride; dragging back the other way brought the caret in
       under a field that had not arrived yet.

       So the class change is committed with transitions off. The forced reflow
       is what makes that stick: it recalculates style while `none` is in
       effect, and a transition with no start value never begins. Restoring
       them a task later cannot start one retroactively — a transition needs a
       property to change while it is in force, and by then nothing is. */
    function setPanelMode(on) {
      if (hdr.classList.contains('search-panel') === on) return;
      hdr.classList.add('shape-switch');
      hdr.classList.toggle('search-panel', on);
      void hdr.offsetWidth;
      /* setTimeout rather than rAF: rAF is paused in a background tab, and a
         tab left mid-switch would come back with its transitions still off. */
      setTimeout(function () { hdr.classList.remove('shape-switch'); }, 0);
    }

    /* No width restriction here any more, and that is the change.
    
       This used to run only below 1040px, on the reasoning that above it the
       links were inline and .nav-collapsed was the mechanism that made room —
       two of them competing over one row would fight. They no longer compete:
       the menu is decided from the closed row and cannot be moved by the
       field, so the field is free to take whichever shape fits wherever it is.
    
       The consequence is that the card is not a narrow-screen treatment. It is
       what happens whenever the row cannot spare --search-w, which includes
       wide windows where the nav links have taken the space — between roughly
       1080px and 1300px the bar shows the full menu and the card together. */
    function measureFieldShape() {
      if (hdr.classList.contains('search-panel')) {
        if (fieldFitsInline(PANEL_SLACK)) setPanelMode(false);
      } else if (!fieldFitsInline(0)) {
        setPanelMode(true);
      }
    }

    /* Both panels — the menu and the search field — are pinned directly under
       the bar, so the CSS needs its height as a number. Measured rather than
       hardcoded: the bar is 3.75rem, and a reader who has raised their default
       font size is not on the same rem as the stylesheet's author. Reading it
       back also forces any layout a class change has invalidated. */
    var publishHeight = function () {
      document.documentElement.style.setProperty(
        '--header-h', hdr.getBoundingClientRect().height + 'px');
    };

    function measure() {
      /* A prerendered document runs its scripts before it is ever shown, against
         a layout it will not be activated into — so nothing here is measured
         until the document is real. default.html opts into prerendering with
         speculation rules at eagerness "moderate". */
      if (document.prerendering) return;
      /* And never before the stylesheet has applied. A deferred script is not
         guaranteed to wait for a pending one, and against unstyled markup .wrap
         is not a flex row, there are no gutters, and .site-nav is a plain block
         filling its parent — every number below would be wrong.

         `display: flex` on .wrap comes from the stylesheet and nowhere else, so
         it is a reliable answer to "has the CSS landed". */
      if (window.getComputedStyle(wrap).display !== 'flex') {
        setTimeout(measure, 50);
        return;
      }
      if (scaleChanged()) forgetCachedWidths();
      measureNav();
      measureFieldShape();
      publishHeight();
    }

    function measureNav() {
      /* Below the breakpoint the CSS has already collapsed the bar, so the
         class adds nothing visually — but it is *set* rather than removed, and
         that matters at the boundary.

         Removing it left the class off across the whole range the CSS owns, so
         widening past 1040px meant the media query stopped hiding the nav one
         frame before the script decided to hide it again: a painted frame of
         the full menu at a width too narrow to hold it, every single crossing.
         That is the flash. Carrying the class through the CSS range means the
         crossing needs no new decision — the bar is already collapsed and stays
         collapsed until it genuinely fits.

         The return still matters for the other reason: below the breakpoint the
         nav is `position: fixed` and reports a viewport-wide box, so measuring
         it here would poison the cached natural width. */
      if (widthRuleOwns()) {
        hdr.classList.add('nav-collapsed');
        collapsedByRule = true;
        return;
      }

      if (!hdr.classList.contains('nav-collapsed')) {
        /* Inline: the links are laid out, so this is the one chance to learn
           how wide they really are. */
        /* The latest reading, not the largest ever seen: the links are only
           measured here, in the inline state, where the value is their natural
           width, so the newest reading is the best one and a bad one is
           corrected by the next. */
        var navNow = Math.round(navEl.getBoundingClientRect().width);
        if (navNow > 0) navWidth = navNow;
        if (!menuFits(0)) {
          hdr.classList.add('nav-collapsed');
          collapsedAtRail = railWidth();
          collapsedByRule = false;
        }
        return;
      }

      /* Collapsed: the links are off in a fixed panel, so whether they would
         fit has to be predicted from the cached width rather than read off the
         layout. Without a cached width there is nothing to predict from, so
         stay collapsed. HYSTERESIS keeps the two thresholds apart — deciding
         both directions from one number makes the header flap at the width
         where collapsing is what creates the room to expand. */
      if (!navWidth) {
        /* A page that *loaded* collapsed has never had the links laid out
           inline, so there is nothing cached to predict from. Returning here
           was wrong: it meant widening the window could never bring the menu
           back, at any width, however much room appeared. Only a reload fixed
           it — because a reload at the wider width runs the inline branch
           above and learns the number there. Reproduced at 900->1500,
           1000->1400 and 500->1500; loading wide was the one case that worked.

           So take the reading now instead of giving up. Drop the class, read
           the natural width, put it back — all synchronously, so no frame is
           painted in between: getBoundingClientRect forces layout, not paint.
           Transitions are frozen for the duration because .nav-collapsed also
           moves the controls' order and margins, which would otherwise animate
           through the intermediate state.

           widthRuleOwns() is already false here — the early return at the top
           of this function guarantees it — so the inline layout the probe asks
           for is one the CSS will actually give.

           Runs once per page: after this navWidth is cached like any other. */
        var root = document.documentElement;
        var probe = 0;
        root.classList.add('is-measuring');
        try {
          hdr.classList.remove('nav-collapsed');
          probe = Math.round(navEl.getBoundingClientRect().width);
        } finally {
          /* finally, not straight-line code: if the read ever threw, the page
             would be left collapsed with .is-measuring stuck on the root — and
             that class kills every transition on the site, not just this one.
             The restore has to happen whatever occurs above. */
          hdr.classList.add('nav-collapsed');
          void navEl.getBoundingClientRect();   /* commit the restored state */
          root.classList.remove('is-measuring');
        }
        if (probe > 0) navWidth = probe;
        else return;
      }
      /* HYSTERESIS guards against flapping while the window is being resized, so
         it is charged only when the rail has actually changed width since the
         collapse. At the same width the collapse was caused by something else —
         a text zoom, and the clearance alone decides when they come back. The
         open search field is no longer one of those reasons: menuFits() is
         computed from the closed row, so opening the field cannot collapse
         anything. */
      /* Hysteresis is charged only against a collapse this code decided on.
         A collapse the CSS owns below the breakpoint is not a decision and
         cannot flap: the breakpoint is a fixed number that does not move when
         the bar changes shape, so crossing it upward happens once. Charging it
         there left the bar a hamburger from 1040 up to about 1124 — widths
         where loading the page directly gives the full menu, because the
         inline branch above never charges anything. Resizing and loading
         disagreed for 84px, which is the bug this whole tier exists to catch.

         collapsedAtRail is also meaningless after a rule-owned collapse: the
         early return above never records it, so the comparison below was
         against 0 and railUnchanged was false for that reason alone. */
      var railUnchanged = Math.abs(railWidth() - collapsedAtRail) < 1;
      var charge = collapsedByRule || railUnchanged ? 0 : HYSTERESIS;
      if (menuFits(charge)) {
        hdr.classList.remove('nav-collapsed');
        collapsedByRule = false;
        /* An open panel must not survive into the inline layout, where nothing
           would ever close it again. */
        navEl.classList.remove('open');
        if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
      }
    }

    function schedule() {
      if (busy) return;
      busy = true;
      var run = function () { busy = false; measure(); };
      /* requestAnimationFrame while the page is on screen, because its callback
         runs before that frame is painted — so the decision lands in the same
         frame as the resize that prompted it.

         A setTimeout(0) does not: it runs after the frame has been painted, so
         dragging a window across the threshold showed one frame of the full
         menu at a width too small to hold it, and then the hamburger. That is
         the flash, and it is a whole frame wide.

         The timer is still the fallback, for the reason it was chosen
         originally: rAF is paused in a background tab, and a window resized
         while the tab was hidden must not come back showing the old decision.
         Nothing is on screen to flash there. */
      if (document.visibilityState === 'visible' && window.requestAnimationFrame) {
        window.requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    }

    /* The search field changing width is the state this exists for, and
       observing the field means no wiring back into the search code. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(schedule);
      ro.observe(wrap);
      ro.observe(brand);
      /* The field is deliberately NOT observed. Its width is a declared
         constant now (--search-w), so watching it tells the header nothing it
         does not already know — and watching it meant the whole measurement
         re-ran on every frame of the open animation, against a row that was
         mid-reflow. */
    }
    window.addEventListener('resize', schedule);
    /* The search field opening is the case this exists for, and the observer
       above covers it — but ResizeObserver delivery is tied to the rendering
       lifecycle and is throttled in a background tab, whereas a click is not.
       Capture phase so it runs whatever the control does with the event, and
       `busy` collapses the pair into one measurement. */
    document.addEventListener('click', function () {
      /* Whether the field opens in the bar or as a panel is settled by the
         width alone, so a click cannot change it. What a click can change is
         whether the nav links still fit beside an open field, which is
         measureNav()'s business — hence schedule() and nothing more. */
      schedule();
    }, true);
    /* In the bar the field animates its width, so the geometry the links are
       judged against only exists once that transition has finished. */
    hdr.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'width') schedule();
    });
    /* A late webfont changes the wordmark's width after first layout. */
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    /* The moment a prerendered document becomes the page on screen. This is
       the first point at which any of the measurements above mean anything. */
    if (document.prerendering) {
      document.addEventListener('prerenderingchange', measure, { once: true });
    }
    /* And back/forward: Safari restores from its cache without re-running any
       of this, so a bar that was collapsed when the page was cached comes back
       collapsed regardless of the width it is restored into. */
    window.addEventListener('pageshow', function (e) { if (e.persisted) measure(); });
    /* At `load` everything is settled — stylesheet, fonts, the avatar's box —
       so the cache is thrown away and the measurement started from nothing
       rather than inherited from a decision taken with less information.

       While the bar is collapsed the links sit in a fixed panel and their
       natural width is never re-read, so this is the only point that can
       correct a cached width. The class is dropped and re-derived in the same
       task, so nothing paints between the two states. */
    window.addEventListener('load', function () {
      forgetCachedWidths();
      measure();
    });
    measure();
  })();

  /* ------------------------------------------------- heading anchor links */
  var body = document.getElementById('post-body');
  var headings = body
    ? body.querySelectorAll('h2[id], h3[id]')
    : [];

  Array.prototype.forEach.call(headings, function (h) {
    /* Read the heading's text before the anchor goes in, so the label can name
       which section it links to. Two things were wrong with a fixed label:

       - Appended, not prepended. As the heading's first child the link was
         part of the heading's own accessible name, so every heading announced
         as "Link to this section, A Section Heading". Placing it
         last still leaks into the name, so the anchor is marked
         aria-hidden and given a tabindex of -1: it is a convenience for
         pointer users, and the heading id is already reachable from the TOC
         and from the address bar for everyone else.
       - Identical on every heading. A screen reader's list-of-links view
         showed a page's worth of indistinguishable "Link to this section". */
    var label = h.textContent.trim();
    var a = document.createElement('a');
    a.className = 'anchor';
    a.href = '#' + h.id;
    a.setAttribute('aria-hidden', 'true');
    a.tabIndex = -1;
    a.title = 'Link to “' + label + '”';
    a.textContent = '#';
    h.appendChild(a);
  });

  /* ------------------------------------------------------------------ toc */
  var toc = document.getElementById('toc');
  var tocList = document.getElementById('toc-list');

  if (toc && tocList && headings.length >= 3) {
    Array.prototype.forEach.call(headings, function (h) {
      var li = document.createElement('li');
      li.className = 'lvl-' + h.tagName.charAt(1);

      var a = document.createElement('a');
      a.href = '#' + h.id;
      /* Strip the injected '#' anchor from the label. It is appended now
         rather than prepended — see the anchor block above — so a leading-#
         regex would silently stop working and every TOC entry would end in a
         stray hash. Ask the DOM for the anchor instead of pattern-matching
         the text, which is correct wherever it sits. */
      var heading = h.cloneNode(true);
      var mark = heading.querySelector('.anchor');
      if (mark) heading.removeChild(mark);
      a.textContent = (heading.textContent || '').trim();
      a.dataset.target = h.id;

      li.appendChild(a);
      tocList.appendChild(li);
    });

    toc.hidden = false;

    var links = tocList.querySelectorAll('a');
    var active = null;

    var setActive = function (id) {
      if (id === active) return;
      active = id;
      var activeLink = null;
      Array.prototype.forEach.call(links, function (l) {
        var on = l.dataset.target === id;
        l.classList.toggle('active', on);
        /* Which section you are in was conveyed by colour alone. `location`
           is the right token here: the entry is not the current *page*, it
           is the current place within it. */
        if (on) l.setAttribute('aria-current', 'location');
        else l.removeAttribute('aria-current');
        if (on) activeLink = l;
      });
      keepVisible(activeLink);
    };

    /* The rail is capped at the viewport height and scrolls on its own. On a
       long post the active entry can therefore be outside it, which makes the
       highlight useless precisely when there are enough headings for it to
       matter. Nudge the rail only when the entry is actually out of view, and
       only by the rail — never scroll the page. */
    function keepVisible(link) {
      if (!link || toc.scrollHeight <= toc.clientHeight) return;
      var lr = link.getBoundingClientRect();
      var tr = toc.getBoundingClientRect();
      var pad = 24;
      var next = toc.scrollTop;
      if (lr.top < tr.top + pad) {
        next -= (tr.top + pad) - lr.top;
      } else if (lr.bottom > tr.bottom - pad) {
        next += lr.bottom - (tr.bottom - pad);
      } else {
        return;
      }
      /* Within a padding of either end, go the whole way. The padding exists to
         stop the active entry sitting flush against an edge; near the ends
         there is nothing to sit flush against, and insisting on it leaves the
         rail short of its own top or bottom. */
      var max = toc.scrollHeight - toc.clientHeight;
      if (next <= pad) next = 0;
      else if (next >= max - pad) next = max;
      toc.scrollTop = next;
    }

    /* Which heading is being read: the last one that has passed the reading
       line near the top of the viewport.

       This replaced an IntersectionObserver that only reported headings inside
       a narrow band (top 80px to 30% down). If no heading was in that band —
       which is the case whenever a section is taller than the band, and always
       the case right after jumping to the end of a post — nothing fired and
       the highlight stayed wherever it was last set, usually the first entry.
       Scrolling back up from the bottom never corrected it, because the band
       had to be crossed exactly to register.

       A position query has no such gap: it returns an answer for every scroll
       position, in both directions, including positions arrived at by a jump. */
    var READING_LINE = 100;

    /* Heading positions are measured once and cached, so the scroll handler is
       pure arithmetic against scrollY — no getBoundingClientRect per heading
       per scroll event, and therefore no forced layout on a hot path.

       Re-measured on resize, on load (late images and webfonts move things),
       and whenever the document height changes, which covers the lazy embeds
       inserting themselves as the reader approaches them. */
    var offsets = [];
    var lastHeight = 0;
    var lastMeasured = 0;

    function measure() {
      offsets = Array.prototype.map.call(headings, function (h) {
        return h.getBoundingClientRect().top + window.scrollY;
      });
      lastHeight = document.documentElement.scrollHeight;
      lastMeasured = Date.now();
    }

    function currentHeadingId() {
      /* Re-measure when the document has changed height, but at most a few
         times a second.
         The height is not stable during a first read-through: every
         `content-visibility: auto` section that comes into range swaps its
         estimated height for its real one, and every lazy embed inserts
         itself. On a long post that is a continuous trickle of changes, and
         the unthrottled version bought a full set of getBoundingClientRect
         calls — one per heading, 32 on the reference post — on the next
         scroll event each time. The throttle keeps the correction while
         capping the cost; a stale offset for up to 250ms is invisible, since
         the reading line moves far slower than that. */
      var h = document.documentElement.scrollHeight;
      if (h !== lastHeight && Date.now() - lastMeasured > 250) measure();

      // Same sweep as the archive rail: over the last viewport of scrolling the
      // line moves down the screen, so sections too close to the end to reach a
      // fixed line still each get a turn instead of the last one taking all of
      // them. See the note by readingLine() there.
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var f = 0;
        if (max > 0 && max <= window.innerHeight) {
          f = window.scrollY / max;
        } else if (max > 0) {
          var remaining = max - window.scrollY;
          if (remaining < window.innerHeight) {
            f = 1 - Math.max(0, remaining) / window.innerHeight;
          }
        }
        var line = READING_LINE + f * (window.innerHeight - READING_LINE - 40);
        var y = window.scrollY + line;
      var current = headings[0].id;
      for (var i = 0; i < offsets.length; i++) {
        if (offsets[i] <= y) current = headings[i].id;
        else break;
      }
      return current;
    }

    var lockedTo = null;
    var lockTimer = null;
    /* Bumped on every TOC click. The settle loop below runs for up to ~1.2s
       after a click, so clicking a second entry while the first is still
       correcting left two loops running: the older one would finish last and
       drag the page back to the heading the reader had already moved on from.
       Each loop stops as soon as it is no longer the newest. */
    var settleToken = 0;

    function onScroll() {
      if (lockedTo) return;          // a click is driving the page; leave it alone
      setActive(currentHeadingId());
    }

    /* Clicking an entry is handled explicitly rather than left to the browser's
       native anchor jump.

       Three reasons. The jump is a no-op in some embedded browsers, so the
       feature cannot be verified where it is developed. It also lands the
       heading wherever `scroll-margin-top` says, with no chance to mark the
       entry or bring it into the rail's own view in the same frame — both end
       up happening later, as a side effect of the scroll event, if at all.
       Doing it here makes the end state deterministic: the page is at the
       heading, the entry is marked, and the rail has scrolled to show it. */
    tocList.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[data-target]');
      if (!a) return;
      var h = document.getElementById(a.dataset.target);
      if (!h) return;

      e.preventDefault();

      var offset = parseFloat(getComputedStyle(h).scrollMarginTop) || 80;
      var y = h.getBoundingClientRect().top + window.scrollY - offset;
      if (y < 0) y = 0;

      window.scrollTo({ top: y, behavior: scrollBehavior() });

      // Mark it now, and hold it. An animated scroll fires a scroll event for
      // every frame, and the spy would re-mark each heading it passes on the
      // way — so the entry you clicked lights up, flickers through everything
      // between, and only settles at the end. The lock keeps the answer stable
      // and is released as soon as the page stops moving.
      setActive(a.dataset.target);
      lockedTo = a.dataset.target;
      if (lockTimer) clearTimeout(lockTimer);
      lockTimer = setTimeout(function () { lockedTo = null; onScroll(); }, 700);

      /* The target is computed from the layout as it stands *now*, and on a
         post opened a moment ago that layout is provisional: sections carrying
         `content-visibility: auto` are still sized by their intrinsic-size
         estimate rather than their real height. If an estimate above the target
         is too tall, the page shrinks while the scroll is in flight and the
         heading ends up above where the animation is heading — which is how
         clicking the last entry lands in the comments.

         So once the page stops moving, check where the heading actually is and
         close the gap. Abandoned the moment the reader touches the page, or as
         soon as a later click starts its own loop. */
      var myToken = ++settleToken;
      var cancelled = false;
      function abandon() { cancelled = true; }
      /* Not `{once:true}` alone: those only unbind if they actually fire, and
         on a click the reader never follows up they stayed bound for the life
         of the page — one more set per click. Every exit path unbinds. */
      function unbind() {
        window.removeEventListener('wheel', abandon);
        window.removeEventListener('touchstart', abandon);
        window.removeEventListener('keydown', abandon);
      }
      window.addEventListener('wheel', abandon, { once: true, passive: true });
      window.addEventListener('touchstart', abandon, { once: true, passive: true });
      window.addEventListener('keydown', abandon, { once: true });

      var lastY = null, still = 0, tries = 0;
      (function settle() {
        if (cancelled || myToken !== settleToken || tries++ > 20) { unbind(); return; }
        var y = Math.round(window.scrollY);
        still = (y === lastY) ? still + 1 : 0;
        lastY = y;

        if (still < 2) { setTimeout(settle, 60); return; }   // still moving

        var drift = Math.round(h.getBoundingClientRect().top - offset);
        if (Math.abs(drift) > 4) {
          var corrected = window.scrollY + drift;
          var max = document.documentElement.scrollHeight - window.innerHeight;
          window.scrollTo({ top: Math.max(0, Math.min(corrected, max)), behavior: 'instant' });
          still = 0;
          setTimeout(settle, 60);       // layout may shift again; verify once more
          return;
        }
        unbind();                        // landed
      })();

      if (history.pushState) history.pushState(null, '', '#' + a.dataset.target);
      else location.hash = a.dataset.target;
    });

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { measure(); onScroll(); }, { passive: true });
    window.addEventListener('load', function () { measure(); onScroll(); });
    // An in-page jump moves the page without a scroll gesture.
    window.addEventListener('hashchange', onScroll);
    onScroll();
  }

  /* ------------------------------------ code block filenames + highlights */
  /* Convention, written immediately above a fenced block in the Markdown:
   *
   *   <!-- code: decode.c | hl: 12-14,18 -->
   *   ```c
   *   ...
   *   ```
   *
   * Both parts are optional. An HTML comment is used rather than a Liquid tag
   * or a kramdown IAL because github.com renders the same file, and a comment
   * is the only form that leaves the Markdown looking untouched there. */

  function parseCodeSpec(raw) {
    // "decode.c | hl: 12-14,18 | ln | side-by-side"
    var spec = { file: '', lines: [], lineNumbers: false, sideBySide: false, address: false };
    var parts = raw.split('|');

    var head = parts.shift().trim();
    if (head && !/^(hl\s*:|ln$|side-by-side$|addr$)/i.test(head)) spec.file = head;
    else if (head) parts.unshift(head);

    parts.forEach(function (part) {
      var flag = part.trim().toLowerCase();
      if (flag === 'ln') { spec.lineNumbers = true; return; }
      if (flag === 'side-by-side' || flag === 'sbs') { spec.sideBySide = true; return; }
      if (flag === 'addr') { spec.address = true; return; }

      var m = /^\s*hl\s*:\s*(.+)$/i.exec(part);
      if (!m) return;
      m[1].split(',').forEach(function (range) {
        var bounds = range.trim().split('-');
        var from = parseInt(bounds[0], 10);
        var to = parseInt(bounds[1] !== undefined ? bounds[1] : bounds[0], 10);
        if (isNaN(from) || isNaN(to)) return;
        for (var n = from; n <= to; n++) spec.lines.push(n);
      });
    });

    return spec;
  }

  // The comment sits before the block, possibly separated by whitespace nodes.
  function specFor(block) {
    var node = block.previousSibling;
    while (node && node.nodeType === 3 && !node.nodeValue.trim()) {
      node = node.previousSibling;
    }
    if (!node || node.nodeType !== 8) return null;
    var m = /^\s*code:\s*(.*?)\s*$/i.exec(node.nodeValue);
    return m ? parseCodeSpec(m[1]) : null;
  }

  /* Rouge emits one flat run of token spans with newlines inside the text, so
     highlighting a line means re-wrapping the content one line per element.
     Tokens never nest, but a block comment or string can span lines, so those
     get split across clones of their own span. */
  function wrapLines(code) {
    var out = document.createDocumentFragment();
    var line = document.createElement('span');
    var pending = [];

    function flush() {
      pending.push(line);
      line = document.createElement('span');
    }

    Array.prototype.slice.call(code.childNodes).forEach(function (node) {
      var text = node.nodeType === 3 ? node.nodeValue : node.textContent;

      if (text.indexOf('\n') === -1) {
        line.appendChild(node.cloneNode(true));
        return;
      }

      text.split('\n').forEach(function (part, i) {
        if (i > 0) flush();
        if (!part) return;
        if (node.nodeType === 3) {
          line.appendChild(document.createTextNode(part));
        } else {
          var clone = node.cloneNode(false);
          clone.textContent = part;
          line.appendChild(clone);
        }
      });
    });

    // Rouge always ends with a newline; that produces one trailing empty line.
    if (line.childNodes.length) pending.push(line);

    pending.forEach(function (el, i) {
      el.className = 'ln';
      el.dataset.line = String(i + 1);
      out.appendChild(el);
    });

    code.textContent = '';
    code.appendChild(out);
    return pending;
  }

  /* IDA and objdump listings put an address at the head of every line, often
     behind a segment name. It is reference material, not the argument the post
     is making — a reader follows the mnemonics and only looks at an address
     when chasing a specific one. Dimming it into a gutter makes the code
     readable without throwing away information you cannot regenerate.

     Matches `__text:00000001000023F4`, `100003f2c:`, `0x1000023f4` and a bare
     hex run. Deliberately requires 4+ hex digits and trailing whitespace, so a
     line of C starting with a short identifier is never mistaken for one. */
  var ADDR_RE = /^([ \t]*(?:[A-Za-z_][\w.$]*:)?(?:0x)?[0-9A-Fa-f]{4,16}:?[ \t]+)/;

  function dimAddresses(lines) {
    lines.forEach(function (line) {
      var m = ADDR_RE.exec(line.textContent);
      if (!m) return;

      // Consume the prefix off the front of the line, node by node: Rouge has
      // already split the text into token spans, and the address may sit
      // inside one of them rather than aligning to a node boundary.
      var need = m[1].length;
      var span = document.createElement('span');
      span.className = 'addr';

      while (need > 0 && line.firstChild) {
        var node = line.firstChild;
        var text = node.textContent;
        if (text.length <= need) {
          span.appendChild(node);            // moves the node out of `line`
          need -= text.length;
        } else {
          span.appendChild(document.createTextNode(text.slice(0, need)));
          node.textContent = text.slice(need);
          need = 0;
        }
      }
      line.insertBefore(span, line.firstChild);
    });
  }

  var codeFileSeq = 0;

  if (body) {
    Array.prototype.forEach.call(
      body.querySelectorAll('div.highlighter-rouge, figure.highlight'),
      function (block) {
        var spec = specFor(block);
        if (!spec) return;

        if (spec.file) {
          var head = document.createElement('div');
          head.className = 'code-head';
          var name = document.createElement('span');
          name.className = 'code-file';
          name.textContent = spec.file;
          /* Referenced by the block's copy button via aria-describedby, so
             the buttons are told apart by filename instead of all announcing
             the same bare "copy". */
          name.id = 'code-file-' + (++codeFileSeq);
          head.appendChild(name);
          block.insertBefore(head, block.firstChild);
          block.classList.add('has-head');
        }

        if (spec.sideBySide) block.classList.add('side-by-side');

        if (spec.lines.length || spec.lineNumbers || spec.address) {
          var code = block.querySelector('pre > code') || block.querySelector('pre');
          if (!code) return;
          var lines = wrapLines(code);
          spec.lines.forEach(function (n) {
            if (lines[n - 1]) lines[n - 1].classList.add('hl');
          });
          if (spec.lines.length) block.classList.add('has-hl');
          if (spec.lineNumbers) block.classList.add('has-lineno');
          if (spec.address) { dimAddresses(lines); block.classList.add('has-addr'); }
        }
      }
    );
  }

  /* -------------------------------------------------- code copy buttons */
  // The outermost Rouge wrapper is the positioned box the button anchors to.
  var blocks = document.querySelectorAll(
    '#post-body div.highlighter-rouge, #post-body figure.highlight'
  );

  /* The text to put on the clipboard.

     `innerText` is deliberate: it reads the *rendered* text, so Rouge's
     per-token spans collapse correctly and the newlines survive. textContent
     would run the whole block onto one line.

     But a block with `| ln` has an <a class="ln-num"> injected into every
     line, and it is `position: absolute` — which makes it its own box, so
     innerText picks it up and every copied line arrives with its line number
     glued to the front. Pasting a 40-line function meant deleting 40 numbers
     by hand.

     So when the gutter is present, walk the lines instead and read each one
     without its number. Within a single line there is no block-level box, so
     textContent is exactly right there, and joining with "\n" reproduces what
     innerText would have given. Blocks with no gutter take the plain path. */
  function codeText(pre) {
    var lines = pre.querySelectorAll('.ln');
    if (!lines.length) return pre.innerText;

    return Array.prototype.map.call(lines, function (line) {
      var copy = line.cloneNode(true);
      var num = copy.querySelector('.ln-num');
      if (num) copy.removeChild(num);
      return copy.textContent;
    }).join('\n');
  }

  Array.prototype.forEach.call(blocks, function (block) {
    var pre = block.querySelector('pre');
    if (!pre || !navigator.clipboard) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-btn';
    btn.textContent = 'copy';
    /* No aria-label. It would override the visible text, so every button on
       the page announced the same static string and the copied/failed result
       was never spoken. The label instead names which block this is, and the
       live region announces the outcome. */
    var file = block.querySelector('.code-file');
    if (file && file.id) btn.setAttribute('aria-describedby', file.id);
    btn.setAttribute('aria-live', 'polite');

    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(codeText(pre)).then(
        function () {
          btn.textContent = 'copied';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.textContent = 'copy';
            btn.classList.remove('copied');
          }, 1600);
        },
        function () {
          btn.textContent = 'failed';
          setTimeout(function () { btn.textContent = 'copy'; }, 1600);
        }
      );
    });

    block.appendChild(btn);
  });

  /* ---------------------------------------------------------- callouts */
  /* Upgrades GitHub-style alert blockquotes (`> [!WARNING]`) into styled
     boxes. The same Markdown renders natively on github.com, and without JS
     it stays a readable blockquote. */
  var ALERT_ICONS = {
    NOTE: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z',
    TIP: 'M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-3 18a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1H9v1Z',
    IMPORTANT: 'M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z',
    WARNING: 'M12 2 1 21h22L12 2Zm1 14h-2v2h2v-2Zm0-7h-2v5h2V9Z',
    CAUTION: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm5 11H7v-2h10v2Z'
  };

  if (body) {
    Array.prototype.forEach.call(body.querySelectorAll('blockquote'), function (bq) {
      var first = bq.querySelector('p');
      if (!first) return;

      var match = /^\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?/.exec(
        first.textContent
      );
      if (!match) return;

      var kind = match[1];

      // Strip the marker from the leading text node only, preserving markup.
      for (var i = 0; i < first.childNodes.length; i++) {
        var node = first.childNodes[i];
        if (node.nodeType === 3 && node.nodeValue.indexOf('[!' + kind + ']') !== -1) {
          node.nodeValue = node.nodeValue.replace(
            /^\s*\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*\n?\s*/,
            ''
          );
          // An empty leading text node still renders as a space before inline
          // markup, so drop it entirely.
          if (node.nodeValue === '') node.parentNode.removeChild(node);
          break;
        }
      }
      if (!first.textContent.trim() && !first.querySelector('*')) first.remove();

      var box = document.createElement('div');
      box.className = 'callout callout-' + kind.toLowerCase();

      var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('aria-hidden', 'true');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', ALERT_ICONS[kind]);
      icon.appendChild(path);

      var inner = document.createElement('div');
      inner.className = 'callout-body';

      var title = document.createElement('p');
      title.className = 'callout-title';
      title.textContent = kind;
      inner.appendChild(title);

      while (bq.firstChild) inner.appendChild(bq.firstChild);

      box.appendChild(icon);
      box.appendChild(inner);
      bq.parentNode.replaceChild(box, bq);
    });
  }

  /* ------------------------------------------------------------ image zoom */
  /* Diagrams in a write-up are often unreadable at column width, especially on
     a phone. Any image in the body that is not already a link opens full size.
     Nothing here runs until the first click. */
  if (body) {
    var lightbox = null;
    var lastFocus = null;

    var closeLightbox = function () {
      if (!lightbox) return;
      lightbox.hidden = true;
      // Clear inert before restoring focus, or the focus() below is a no-op.
      inertBackground(false);
      document.body.classList.remove('lb-open');
      if (lastFocus) lastFocus.focus();
    };

    var buildLightbox = function () {
      lightbox = document.createElement('div');
      lightbox.className = 'lightbox';
      lightbox.hidden = true;
      lightbox.setAttribute('role', 'dialog');
      lightbox.setAttribute('aria-modal', 'true');
      lightbox.setAttribute('aria-label', 'Enlarged image');

      lightbox.innerHTML =
        '<button type="button" class="lb-close" aria-label="Close">&times;</button>' +
        '<figure><img alt=""><figcaption></figcaption></figure>';

      lightbox.addEventListener('click', function (e) {
        // Clicking the image itself should not dismiss it.
        if (e.target.tagName !== 'IMG') closeLightbox();
      });

      /* The close button is the only focusable thing in here, so Tab has
         nowhere legitimate to go. Without this it left the dialog entirely —
         while aria-modal claimed the rest of the page was unavailable. */
      lightbox.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') e.preventDefault();
      });

      document.body.appendChild(lightbox);
      return lightbox;
    };

    var openLightbox = function (img) {
      if (!lightbox) buildLightbox();

      var full = lightbox.querySelector('img');
      var cap = lightbox.querySelector('figcaption');
      var figcap = img.closest('figure')
        ? img.closest('figure').querySelector('figcaption')
        : null;

      full.src = img.currentSrc || img.src;
      full.alt = img.alt || '';
      cap.textContent = figcap ? figcap.textContent.trim() : '';
      cap.hidden = !cap.textContent;

      lastFocus = document.activeElement;
      lightbox.hidden = false;
      inertBackground(true);
      document.body.classList.add('lb-open');
      lightbox.querySelector('.lb-close').focus();
    };

    Array.prototype.forEach.call(body.querySelectorAll('img'), function (img) {
      // Already a link: the click belongs to the anchor.
      if (img.closest('a')) return;

      /* The two halves of a before/after comparison are not standalone
         figures — they are the inside of one slider. Zooming them turned a
         single widget into three controls: the slider handle plus two
         "click to enlarge" buttons, three tab stops, and a lightbox that
         covered the comparison with one of the two images it exists to
         compare. The aria-label was nonsense too, because compare.html
         falls the alt text back to the wipe caption ("26.2 — click to
         enlarge"). The handle is the control here; the images are its
         content. */
      if (img.closest('.img-compare')) return;

      img.classList.add('zoomable');
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', (img.alt || 'Image') + ' — click to enlarge');
      img.addEventListener('click', function () { openLightbox(img); });
      img.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(img); }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && lightbox && !lightbox.hidden) closeLightbox();
    });
  }

  /* ------------------------------------- keep wide tables off the page axis */
  if (body) {
    Array.prototype.forEach.call(body.querySelectorAll('table'), function (t) {
      if (t.parentNode.classList.contains('table-scroll')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      t.parentNode.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }


  /* ------------------------------------------------- sortable tables */
  /* ------------------------------------------- dismissing a linked row */
  /* Following a row's "#" leaves that row highlighted for as long as the
     fragment is in the URL, which is right when you have just arrived on a
     link and wrong once you have read it and moved on. A click anywhere else
     on the page puts it away.

     The highlight is CSS :target, which cannot be cancelled by script — so
     what the click actually toggles is a class on <html> that the rule is
     gated on, and the fragment is cleared alongside it so a reload agrees with
     what is on screen. replaceState rather than pushState: dismissing a
     highlight is not a place in the reader's history. */
  if (document.querySelector('.adv-table')) {
    var clearTarget = function () {
      document.documentElement.classList.add('target-cleared');
      if (location.hash) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    };
    var restoreTarget = function () {
      document.documentElement.classList.remove('target-cleared');
    };

    document.addEventListener('click', function (e) {
      var anchor = e.target.closest && e.target.closest('.row-anchor');
      /* Re-linking the same row fires no hashchange, since the fragment does
         not change — so the class has to come off here as well. */
      if (anchor) { restoreTarget(); return; }
      if (!location.hash) return;
      /* A click inside the highlighted row is not "away": it is following one
         of the advisory's links, or selecting the text of it. */
      var row = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (row && e.target.closest && e.target.closest('tr') === row) return;
      clearTarget();
    });

    /* Arriving at a different row, by link or by Back. */
    window.addEventListener('hashchange', restoreTarget);
  }

  /* Any table carrying .adv-table becomes click-to-sort. The affordance is
     drawn in CSS from the aria-sort attribute, so the header always shows
     whether a column is sortable and which way it is currently ordered. */
  Array.prototype.forEach.call(
    document.querySelectorAll('table.adv-table'),
    function (table) {
      var headers = table.tHead ? [].slice.call(table.tHead.rows[0].cells) : [];
      var tbody = table.tBodies[0];
      if (!headers.length || !tbody) return;

      // A cell may carry data-sort with a sortable form of its value — used
      // where the displayed format does not sort correctly (dates shown
      // DD-MM-YYYY sort by day otherwise).
      var textOf = function (row, i) {
        var cell = row.cells[i];
        if (!cell) return '';
        return (cell.dataset && cell.dataset.sort) || cell.textContent.trim();
      };

      /* Numeric when every populated value in the column *is* a number \u2014 not
         merely when it starts with one.

         `parseFloat` was the test, and `parseFloat("2026-02-11")` is `2026`.
         So the Disclosed column, whose whole reason for carrying ISO
         `data-sort` values is to sort chronologically, was classified as
         numeric and compared as `2026 - 2026`: it sorted by year and threw
         away the month and the day. Descending put 2026-02-11 above
         2026-09-09 while `aria-sort` announced a sort that had not happened.
         With two entries dated the same day, nothing visibly moved.

         Anchoring the pattern sends dates to the string branch below, where
         `localeCompare(..., {numeric: true})` orders ISO correctly. */
      var NUMERIC = /^-?\d+(?:\.\d+)?$/;
      var isNumericColumn = function (rows, i) {
        var seen = 0;
        for (var r = 0; r < rows.length; r++) {
          var v = textOf(rows[r], i);
          if (!v || v === '\u2014') continue;
          if (!NUMERIC.test(v)) return false;
          seen++;
        }
        return seen > 0;
      };

      headers.forEach(function (th, index) {
        /* A column can opt out. Sorting is offered on every header by default,
           which is right for data columns and wrong for one holding a single
           repeated link — see the note in advisories.html. Skipped before
           anything is attached, so the header takes no tab stop, no role, no
           aria-sort and no pointer affordance. */
        if (th.hasAttribute('data-nosort')) return;
        th.tabIndex = 0;
        th.setAttribute('role', 'columnheader');
        /* A template may declare the order the table already ships in — the
           advisories table is sorted by CVE before it is served, so it says
           aria-sort="ascending" on that header. Overwriting it with 'none'
           would both misreport the state and make the first click on that
           column re-apply the order it already has. */
        if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none');
        th.title = 'Sort by ' + th.textContent.trim();

        var sort = function () {
          var rows = [].slice.call(tbody.rows);
          var asc = th.getAttribute('aria-sort') !== 'ascending';
          var numeric = isNumericColumn(rows, index);

          rows.sort(function (a, b) {
            var x = textOf(a, index), y = textOf(b, index);
            // empty / em-dash always sinks to the bottom
            var xe = !x || x === '\u2014', ye = !y || y === '\u2014';
            if (xe !== ye) return xe ? 1 : -1;
            if (xe && ye) return 0;
            var cmp = numeric
              ? parseFloat(x) - parseFloat(y)
              : x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' });
            return asc ? cmp : -cmp;
          });

          rows.forEach(function (r) { tbody.appendChild(r); });
          /* Clear the other headers' state — but not a column that opted out of
             sorting, which must never be handed an `aria-sort`. The CSS draws
             the sort arrow from that attribute, and the extra glyph would both
             misreport the column and change its width. */
          headers.forEach(function (h) {
            if (!h.hasAttribute('data-nosort')) h.setAttribute('aria-sort', 'none');
          });
          th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        };

        th.addEventListener('click', sort);
        th.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
        });
      });
    }
  );


  /* ------------------------------------------------- whole-card post links */
  /* The title anchor stays the only real link — clicking anywhere else on the
     card (date, read time, excerpt, whitespace) follows it. Done in JS rather
     than by stretching the anchor over the card so the text stays selectable;
     without JS the title link still works on its own. */
  function wireCards(root) {
  Array.prototype.forEach.call(
    (root || document).querySelectorAll('.featured, .post-item, .tag-post'),
    function (el) {
      // The "Latest post" label straddles the featured card's top border from
      // outside it, so bind the wrapper where there is one and the label counts
      // as part of the card.
      var card = (el.closest && el.closest('.featured-wrap')) || el;
      if (card.classList.contains('card-link')) return;   // already wired
      /* Any heading level, not h3 specifically. The item titles on /blog/,
         /ctf/ and /tags/ are <h2> — they sit directly under the page's <h1>,
         and hard-coding h3 here meant those lists silently stopped getting the
         whole-card behaviour the home page has. The list a title lives in
         should not decide whether the card is clickable. */
      var link = card.querySelector('h2 a[href], h3 a[href]');
      if (!link) return;

      card.classList.add('card-link');

      var go = function (e) {
        // Anything already interactive keeps its own behaviour.
        if (e.target.closest && e.target.closest('a, button, input, select, textarea'))
          return;

        // A click that finished a text selection is not a navigation.
        var sel = window.getSelection();
        if (sel && String(sel).length) return;

        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) {
          window.open(link.href, '_blank', 'noopener');
        } else {
          window.location.href = link.href;
        }
      };

      card.addEventListener('click', go);
      card.addEventListener('auxclick', function (e) {
        if (e.button === 1) { e.preventDefault(); go(e); }
      });
    }
  );
  }
  wireCards();   // search results call this again for the cards they inject

  /* ------------------------------------------------- header search expander */
  /* The form is a plain GET to /search/, so submitting works without any of
     this. All that happens here is the collapse/expand. */
  var navSearch = document.getElementById('nav-search');
  if (navSearch) {
    var navToggle = navSearch.querySelector('.nav-search-toggle');
    var navInput = navSearch.querySelector('.nav-search-input');

    var header = document.querySelector('.site-header');
    var setOpen = function (open) {
      navSearch.classList.toggle('open', open);
      // Also on the field itself — see the note by .nav-search-input.is-open.
      navInput.classList.toggle('is-open', open);
      // The header needs to know too: on a phone there is no room for the
      // brand and an open field at the same time, and CSS cannot reach back
      // up the tree from the form to the brand.
      if (header) header.classList.toggle('search-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      if (open) navInput.focus();
      /* The other half of the bargain struck by the menu button. */
      if (open && panelMode() && nav && nav.classList.contains('open')) {
        nav.classList.remove('open');
        if (navBtn) navBtn.setAttribute('aria-expanded', 'false');
      }
    };

    /* Only while the field is a panel. Wider, it opens inside the bar and the
       two never share a pixel, so closing one to open the other would be the
       surprise the click-away rule below is written to avoid. */
    var panelMode = function () {
      return !!header && header.classList.contains('search-panel');
    };
    closeSearchPanel = function () {
      if (panelMode() && navSearch.classList.contains('open')) setOpen(false);
    };

    navToggle.addEventListener('click', function () {
      // Once open the icon becomes the submit affordance, so a filled-in query
      // is not thrown away by a second click on the thing that opened it.
      if (navSearch.classList.contains('open')) {
        if (navInput.value.trim()) navSearch.submit();
        else setOpen(false);
      } else {
        setOpen(true);
      }
    });

    navInput.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { navInput.value = ''; setOpen(false); navToggle.focus(); }
    });

    // Clicking away closes it, unless something was typed.
    document.addEventListener('click', function (e) {
      if (navSearch.contains(e.target)) return;
      /* Nothing in the header counts as "away" — same rule the mobile menu
         uses, deliberately, so the two behave alike. The theme toggle and the
         hamburger sit either side of this field in the same bar, and neither
         navigates nor moves focus anywhere the query could be lost. Closing a
         search the reader had just opened because they also wanted dark mode,
         or because they opened the menu, is a surprise with nothing to justify
         it. A click on the page below is still "away" and still closes. */
      if (e.target.closest && e.target.closest('.site-header')) return;
      if (!navInput.value.trim()) setOpen(false);
    });

    /* The header keeps its search on /search/ too: it is the one control a
       reader expects in the same place on every page.

       The two do not collide. `/` goes to the page's own field, which is the
       larger target and the one with results under it, and submitting the
       header form lands on /search/?q=… which this page reads on load. */
  }

  /* ------------------------------------------------------- "/" opens search */
  /* The one keyboard convention readers actively try. Focuses /search/'s own
     field when on that page, otherwise opens
     the header expander. Ignored while typing, so "/" in a search box or a
     comment stays a slash. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    var pageField = document.getElementById('q');
    if (pageField) { e.preventDefault(); pageField.focus(); pageField.select(); return; }

    var ns = document.getElementById('nav-search');
    if (ns && !ns.hidden) {
      e.preventDefault();
      var tog = ns.querySelector('.nav-search-toggle');
      if (!ns.classList.contains('open') && tog) tog.click();
      else { var f = ns.querySelector('.nav-search-input'); if (f) f.focus(); }
    }
  });

  /* ------------------------------------------------- archive rail scroll-spy */
  /* Marks the archive entry for whichever post is currently being read, the
     same way the table of contents tracks headings inside a post. On a list
     page the rail is otherwise a static index — it tells you what exists but
     not where you are in it, which is the one thing it is well placed to say.

     Entries are matched to list items by href, so nothing has to be kept in
     sync between the include and the page. Same mechanics as the TOC: offsets
     cached, no requestAnimationFrame, because rAF does not run in every
     browser this has to work in. */
  (function () {
    var rail = document.querySelector('.archive-rail');
    if (!rail) return;

    var railLinks = {};
    Array.prototype.forEach.call(rail.querySelectorAll('a[href]'), function (a) {
      railLinks[a.getAttribute('href')] = a;
    });

    // Every post shown in the page's own list, paired with its rail entry.
    var entries = [];
    Array.prototype.forEach.call(
      document.querySelectorAll('.post-list .post-item, .tag-posts .tag-post'),
      function (item) {
        /* Any heading level. The item titles on /blog/, /ctf/ and /tags/ are
           <h2> — they sit directly under the page's <h1> — and matching only
           h3 here found nothing on exactly the pages that have a rail, so the
           whole scroll-spy went silently dead: no entries, early return, no
           reading mark anywhere. */
        var link = item.querySelector('h2 a[href], h3 a[href]');
        if (!link) return;
        var rl = railLinks[link.getAttribute('href')];
        if (rl) entries.push({ item: item, railLink: rl, li: rl.closest('li') });
      }
    );
    /* One entry is still worth marking — /ctf/ has a single write-up, and the
       rail sat blank on it. Only bail when there is nothing at all. */
    if (!entries.length) return;

    var READING_LINE = 140;

    /* Where the "you are here" line sits, in document coordinates.
​
       Normally a fixed distance below the top of the viewport. But a page stops
       scrolling before its last items reach that line — on /blog/ the whole
       page scrolls 771px, so the final two posts could never cross it. Pinning
       the last item at the bottom of the page only moved the problem: then the
       *second to last* had no scroll position where it was marked at all.
​
       So over the final viewport of scrolling the line sweeps downward instead,
       passing each remaining item in turn and ending near the foot of the
       screen. Every entry gets a window, however short the page is. */
    function readingLine() {
      var max = document.documentElement.scrollHeight - window.innerHeight;

      /* How far the reading line has swept down the screen, 0 to 1.

         The line normally sits a fixed distance below the top of the viewport.
         But a page stops scrolling before its final items reach that line, so
         over the last viewport of travel the line sweeps downward instead and
         each remaining item gets its turn.

         The ramp has to be driven by *scroll progress*, not by distance from
         the bottom. `1 - remaining / innerHeight` is only the same thing on a
         page with more than a screen of scrolling to give. On a short page —
         /ctf/ with two write-ups scrolls a total of 8px — `remaining` starts
         at 8, so that expression evaluates to 0.99 the moment the page opens
         and the line lands past every entry: the *last* item was marked on
         arrival and never changed. Now a page shorter than the viewport ramps
         across whatever scrolling it does have, which is 0 at the top. */
      var t = 0;
      if (max <= 0) {
        t = 0;                                   // nothing to scroll at all
      } else if (max <= window.innerHeight) {
        t = window.scrollY / max;                // the whole page is the sweep
      } else {
        var remaining = max - window.scrollY;
        if (remaining < window.innerHeight) {
          t = 1 - Math.max(0, remaining) / window.innerHeight;
        }
      }
      var line = READING_LINE + t * (window.innerHeight - READING_LINE - 40);
      return window.scrollY + line;
    }

    /* Whether the pointer is inside the rail. The rail scrolls itself to keep
       the active entry in view (below), and doing that under a stationary
       pointer slides a different link beneath the cursor — so the auto-scroll
       holds off while the reader is in there. */
    var pointerInRail = false;
    rail.addEventListener('mouseenter', function () { pointerInRail = true; });
    rail.addEventListener('mouseleave', function () { pointerInRail = false; });

    var offsets = [];
    var lastHeight = 0;
    var current = null;

    function visible() {
      return entries.filter(function (e) { return !e.item.hidden; });
    }

    function measure() {
      var vis = visible();
      offsets = vis.map(function (e) {
        return { e: e, top: e.item.getBoundingClientRect().top + window.scrollY };
      });
      lastHeight = document.documentElement.scrollHeight;
    }

    /* The mark only means something beside the list.
    
       Sticky in the right-hand column, the rail answers "where am I in this?"
       as you scroll past it. Stacked at the foot of the page it cannot: it is
       below everything it would be pointing at, it does not move, and the
       entry it marks is whichever post happens to be at the reading line —
       which, once you have scrolled far enough to see the rail at all, is
       always the last one. A permanent mark on the final entry is not a
       position, it is noise. */
    function railIsBesideTheList() {
      return window.getComputedStyle(rail).position === 'sticky';
    }

    function setActive(entry) {
      if (!railIsBesideTheList()) entry = null;
      if (entry === current) return;
      current = entry;
      entries.forEach(function (e) {
        if (e.li) e.li.classList.toggle('is-reading', e === entry);
      });
      if (!entry) return;

      // An older year is collapsed by default; open it so the mark is visible.
      // Never while the pointer is in the rail: opening a <details> inserts
      // rows and slides every entry below it, which moves the one under the
      // cursor.
      if (!pointerInRail) {
        var group = entry.railLink.closest('details');
        if (group && !group.open) group.open = true;
      }

      /* The rail's own scroll position is handled by syncRailScroll(), which
         ties it to the page's. Nudging it here as well made the two fight:
         this one moved the rail to reveal the mark, that one moved it to match
         the page, and an entry slid under the pointer either way. */
    }

    /* Scroll the rail in step with the page, so its own top and bottom edges
       are reachable without touching its scrollbar.

       The rail is sticky and capped to the viewport, so on a short screen it
       cannot show everything at once: at the top of the page its footer ("10
       of 12 posts") sat below the fold, and at the bottom its "Archive"
       heading had scrolled off above it. Both edges existed and neither could
       be reached with the page scrollbar, which is the only one a reader
       expects to use.

       Mapping page progress onto rail progress fixes it by construction: page
       at the top means rail at its top, page at the bottom means rail at its
       bottom, everything between moves proportionally. It also keeps the
       reading mark roughly in view for free, since the mark and the rail now
       advance on the same clock.

       Left alone while the pointer is inside the rail — someone scrolling it
       by hand should not have it yanked back on the next page scroll. */
    function syncRailScroll() {
      if (pointerInRail) return;
      var slack = rail.scrollHeight - rail.clientHeight;
      if (slack <= 0) return;                        // nothing hidden to reveal
      var pageMax = document.documentElement.scrollHeight - window.innerHeight;
      var progress = pageMax > 0 ? window.scrollY / pageMax : 0;
      rail.scrollTop = slack * Math.max(0, Math.min(1, progress));
    }

    function onScroll() {
      syncRailScroll();
      if (document.documentElement.scrollHeight !== lastHeight) measure();
      if (!offsets.length) return;

      var y = readingLine();

      /* No "nothing is marked" state. The reading line starts 140px down the
         viewport and the first post on /blog/ starts at 275px, so on arrival
         the line was above every entry and the rail sat completely blank —
         while the post it should have been pointing at was right there on
         screen. The first entry is the correct answer at the top of the page:
         it is what the reader is looking at.

         This also matches the TOC, which has always defaulted to its first
         heading rather than to nothing. `found` already initialises to the
         first entry, so the fix is simply not to bail out before the loop. */
      var found = offsets[0].e;
      for (var i = 0; i < offsets.length; i++) {
        if (offsets[i].top <= y) found = offsets[i].e;
        else break;
      }
      setActive(found);
    }

    /* Hovering either side lights the other, so the pairing between a card and
       its archive entry is discoverable rather than something you have to
       infer from the scroll mark. Kept visually distinct from `is-reading`:
       hover is a transient answer to "which one is this?", the scroll mark is
       a persistent "where am I?", and two identical marks on screen at once
       meaning different things would be worse than no mark.

       **Nothing scrolls on hover, in either direction.** An earlier version
       brought the paired item into view, and that is what made this feature
       unusable: moving the page under a stationary pointer slid a different
       card beneath the cursor, which hovered, which scrolled again. The
       highlight was never the problem — the movement was. The rail still
       scrolls itself to follow the *reading* mark, and only while the pointer
       is outside it (see setActive), which is the one case where nothing the
       reader is pointing at can move. */
    function pair(entry, on) {
      if (entry.li) entry.li.classList.toggle('is-hover', on);
      entry.item.classList.toggle('is-hover', on);
    }

    entries.forEach(function (entry) {
      // `mouseenter`/`mouseleave` rather than over/out: they do not fire again
      // for every child element the pointer crosses inside the card.
      entry.item.addEventListener('mouseenter', function () { pair(entry, true); });
      entry.item.addEventListener('mouseleave', function () { pair(entry, false); });
      entry.railLink.addEventListener('mouseenter', function () { pair(entry, true); });
      entry.railLink.addEventListener('mouseleave', function () { pair(entry, false); });

      /* Keyboard parity: tabbing to either link lights the same pair, so the
         relationship is not mouse-only. */
      entry.railLink.addEventListener('focus', function () { pair(entry, true); });
      entry.railLink.addEventListener('blur', function () { pair(entry, false); });
    });

    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { measure(); onScroll(); }, { passive: true });
    window.addEventListener('load', function () { measure(); onScroll(); });
    onScroll();
  })();

  /* ------------------------------------------------ deep-link landing fix */
  /* Opening a URL with a #fragment lands in the wrong place on a long post.

     The browser jumps the moment the element exists, which is before webfonts
     have swapped, before images above the target have their real height, and
     before `content-visibility: auto` sections have been laid out at all. Every
     one of those settles afterwards and moves the target — measured 29px off on
     /posts/a-post/#conclusion, enough to tuck the heading under the
     sticky header.

     So the landing is re-applied once things have settled: after `load`, and
     again shortly after, correcting only if the target has actually drifted.
     Skipped entirely if the reader has scrolled in the meantime — their
     position beats ours. */
  (function () {
    if (!location.hash || location.hash.length < 2) return;

    var id = decodeURIComponent(location.hash.slice(1));
    var target = document.getElementById(id);
    if (!target) return;

    var lastApplied = -1;
    var userMoved = false;

    function onUserScroll() {
      // A correction we made ourselves is not the reader moving.
      if (Math.abs(window.scrollY - lastApplied) > 4) userMoved = true;
    }
    window.addEventListener('scroll', onUserScroll, { passive: true });

    function land() {
      if (userMoved) return;
      var offset = parseFloat(getComputedStyle(target).scrollMarginTop) || 80;
      var drift = Math.round(target.getBoundingClientRect().top - offset);
      if (Math.abs(drift) < 4) return;            // already where it should be

      var y = window.scrollY + drift;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (y > max) y = max;
      if (y < 0) y = 0;

      window.scrollTo({ top: y, behavior: 'instant' });
      lastApplied = Math.round(window.scrollY);
    }

    lastApplied = Math.round(window.scrollY);
    window.addEventListener('load', function () {
      land();
      setTimeout(land, 250);     // late images, webfont swap, lazy embeds
    });
    setTimeout(land, 100);

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(land);
  })();

  /* ------------------------------------------------------------ tag filter */
  /* Every post is rendered; selecting tags hides the ones that do not carry
     all of them. AND, not OR: each extra tag narrows, which is what "filter"
     means to anyone who has used one, and OR would only ever grow the list.

     Tags that cannot narrow further are disabled rather than left clickable.
     Without that, the interesting combinations are indistinguishable from the
     dead ends — you find out a pairing is empty by trying it. Recomputing
     against the current result set means the chips always describe what is
     actually reachable from here. */
  (function () {
    var wrap = document.getElementById('tag-filter');
    var list = document.getElementById('tag-posts');
    if (!wrap || !list) return;

    var chips = Array.prototype.slice.call(wrap.querySelectorAll('.tag[data-tag]'));
    var statusRow = document.getElementById('tag-status');
    var statusText = document.getElementById('tag-status-text');
    var clearBtn = document.getElementById('tag-clear');
    var noneMsg = document.getElementById('tag-none');

    var posts = Array.prototype.slice.call(list.querySelectorAll('.tag-post')).map(function (li) {
      return { el: li, tags: (li.dataset.tags || '').trim().split(/\s+/).filter(Boolean) };
    });
    var selected = [];

    function hasAll(p) {
      for (var i = 0; i < selected.length; i++) {
        if (p.tags.indexOf(selected[i]) === -1) return false;
      }
      return true;
    }

    function apply(pushUrl) {
      var shown = [];
      posts.forEach(function (p) {
        var on = hasAll(p);
        p.el.hidden = !on;
        if (on) shown.push(p);
      });
      // The first and last rows lose their padding and closing rule, and after
      // filtering those are not the same rows :first-child/:last-child pick.
      markEdges(list);

      chips.forEach(function (c) {
        var tag = c.dataset.tag;
        var on = selected.indexOf(tag) !== -1;
        // How many of the *currently shown* posts carry this tag — i.e. what
        // the list would become if it were added.
        var n = 0;
        shown.forEach(function (p) { if (p.tags.indexOf(tag) !== -1) n++; });

        c.setAttribute('aria-pressed', String(on));
        c.classList.toggle('is-on', on);
        var count = c.querySelector('.count');
        if (count) count.textContent = n;

        var dead = !on && n === 0;
        c.disabled = dead;
        c.classList.toggle('is-out', dead);
      });

      /* The small tags printed on each row toggle the same filter, so they
         report the same state. They are buttons with aria-pressed rather than
         spans, and an aria-pressed that never changes is worse than none. */
      list.querySelectorAll('.tag.is-mini[data-tag]').forEach(function (m) {
        m.setAttribute('aria-pressed', String(selected.indexOf(m.dataset.tag) !== -1));
      });

      if (selected.length) {
        statusRow.hidden = false;
        statusText.textContent = shown.length + ' of ' + posts.length +
          ' post' + (posts.length === 1 ? '' : 's') + ' · ' + selected.join(' + ');
      } else {
        statusRow.hidden = true;
      }
      // Only reachable by hand-editing the query string; the chips cannot
      // produce an empty result because dead ones are disabled.
      if (noneMsg) noneMsg.hidden = shown.length !== 0;

      if (pushUrl) {
        var q = selected.length ? '?tags=' + selected.join(',') : location.pathname;
        history.replaceState(null, '', selected.length ? location.pathname + q : q);
      }
    }

    function toggle(tag) {
      var i = selected.indexOf(tag);
      if (i === -1) selected.push(tag); else selected.splice(i, 1);
      apply(true);
    }

    chips.forEach(function (c) {
      c.addEventListener('click', function () { toggle(c.dataset.tag); });
    });

    // The small tags printed on each row are shortcuts into the same filter.
    list.addEventListener('click', function (e) {
      var mini = e.target.closest && e.target.closest('.tag.is-mini[data-tag]');
      if (!mini) return;
      var known = chips.some(function (c) { return c.dataset.tag === mini.dataset.tag; });
      if (known) toggle(mini.dataset.tag);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () { selected = []; apply(true); });
    }

    // ?tags=a,b makes a filtered view linkable — which is what the tag chips
    // under a post title point at.
    var q = new URLSearchParams(location.search).get('tags');
    if (q) {
      q.split(',').forEach(function (raw) {
        var tag = raw.trim();
        if (tag && selected.indexOf(tag) === -1 &&
            chips.some(function (c) { return c.dataset.tag === tag; })) selected.push(tag);
      });
    }
    apply(false);
  })();

  /* --------------------------------------------------------- command palette */
  /* Cmd-K / Ctrl-K from anywhere: one box that matches posts, pages, tags and a
     few actions, and jumps on Enter without ever loading a search page.

     Distinct from /search/ on purpose. Search is a destination that ranks full
     post text and shows snippets; this ranks *names* and is optimised for the
     case where you already know what you want and only need to get there. It
     also matches things a text search cannot, like "toggle theme".

     The index is built on first open, never on page load, so a reader who
     never presses the shortcut pays nothing for it. */
  (function () {
    var overlay = null, input = null, list = null, empty = null;
    var items = [];            // the full index, built once
    var shown = [];            // current matches
    var cursor = 0;
    var lastFocus = null;
    var built = false;

    /* ---- index ---------------------------------------------------------- */

    function pagesFromNav() {
      // Read the nav rather than hardcode: pages switch themselves on and off
      // by existing, and this list should follow without a second edit.
      var out = [];
      document.querySelectorAll('.site-nav a.nav-link').forEach(function (a) {
        out.push({ kind: 'page', title: a.textContent.trim(), url: a.getAttribute('href') });
      });

      var UNLISTED = [
        { title: 'Research', url: '/research/' },
        { title: 'Search',   url: '/search/' }
      ];
      UNLISTED.forEach(function (p) {
        if (out.some(function (o) { return o.url === p.url; })) return;
        out.push({ kind: 'page', title: p.title, url: p.url, probe: true });
      });
      return out;
    }

    function actions() {
      var list = [
        { kind: 'action', title: 'Toggle light / dark theme', run: function () {
            var b = document.querySelector('.theme-toggle'); if (b) b.click(); }, keep: true },
        { kind: 'action', title: 'Copy link to this page', run: function () {
            if (navigator.clipboard) navigator.clipboard.writeText(location.href); } },
        { kind: 'action', title: 'Subscribe via RSS', url: '/feed.xml' }
      ];
      if (document.getElementById('post-body')) {
        list.push({ kind: 'action', title: 'Jump to top', run: function () {
          window.scrollTo({ top: 0, behavior: scrollBehavior() }); } });
      }
      return list;
    }

    function build(docs) {
      items = [];
      (docs || []).forEach(function (d) {
        items.push({ kind: 'post', title: d.title, url: d.url, meta: d.date,
                     extra: ((d.tags || []).join(' ') + ' ' + (d.description || '')).toLowerCase() });
      });

      var seen = Object.create(null);
      (docs || []).forEach(function (d) {
        (d.tags || []).forEach(function (tag) {
          if (seen[tag]) return;
          seen[tag] = 1;
          /* ?tags=, not #. /tags/ is one filterable list with no per-tag ids,
             so the fragment matched nothing and choosing a tag here landed on
             an unfiltered page with a dangling hash. The query parameter is
             what the tag chips under a post title already use, and the page
             reads it on load. */
          items.push({ kind: 'tag', title: tag, url: '/tags/?tags=' + slug(tag) });
        });
      });

      items = items.concat(pagesFromNav()).concat(actions());
      built = true;

      /* Drop any entry marked `probe` whose page is not actually there. These
         are the pages with no link anywhere in the markup, so nothing else can
         tell us whether they are still published — unpublishing one otherwise
         leaves the palette offering a 404. Fires once, after the list is
         already usable, so it costs the reader nothing. */
      items.filter(function (it) { return it.probe; }).forEach(function (it) {
        fetch(it.url, { method: 'HEAD' })
          .then(function (r) {
            if (r.ok) return;
            items = items.filter(function (o) { return o !== it; });
            if (overlay && !overlay.hidden) render();
          })
          .catch(function () { /* offline or blocked: leave the entry alone */ });
      });
    }

    function slug(s) {
      return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    }

    /* ---- matching -------------------------------------------------------- */

    /* Substring first, then subsequence, so "eks" still finds "Embed Kitchen
       Sink" while an exact phrase always outranks a scattered one. */
    function subsequence(needle, hay) {
      var i = 0, run = 0, best = 0;
      for (var j = 0; j < hay.length && i < needle.length; j++) {
        if (hay[j] === needle[i]) { i++; run++; if (run > best) best = run; }
        else run = 0;
      }
      return i === needle.length ? best : -1;
    }

    function score(item, q) {
      var title = item.title.toLowerCase();
      if (!q) return item.kind === 'post' ? 1 : 0.5;

      var at = title.indexOf(q);
      if (at === 0) return 1000 - title.length;
      if (at > 0) return 600 - at;

      var seq = subsequence(q, title);
      if (seq >= 0) return 300 + seq * 10;

      if (item.extra && item.extra.indexOf(q) !== -1) return 100;
      return -1;
    }

    function match(q) {
      q = q.trim().toLowerCase();
      var out = [];
      items.forEach(function (it) {
        var s = score(it, q);
        if (s >= 0) out.push({ it: it, s: s });
      });
      out.sort(function (a, b) { return b.s - a.s; });
      var picked = out.slice(0, 12).map(function (o) { return o.it; });

      // Always offer the full-text search as a way out — the palette matches
      // names, and the thing being looked for may only exist in a post body.
      if (q) picked.push({ kind: 'action', title: 'Search all posts for “' + q + '”',
                           url: '/search/?q=' + encodeURIComponent(q) });
      return picked;
    }

    /* ---- rendering ------------------------------------------------------- */

    function esc(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function render() {
      var q = input.value.trim().toLowerCase();
      shown = match(input.value);
      cursor = 0;
      list.innerHTML = '';

      if (!shown.length) {
        empty.hidden = false;
        input.removeAttribute('aria-activedescendant');
        return;
      }
      empty.hidden = true;

      shown.forEach(function (it, i) {
        var li = document.createElement('li');
        li.className = 'cp-item';
        li.id = 'cp-item-' + i;
        li.setAttribute('role', 'option');
        /* Lets the stylesheet colour a tag row the same way it colours that
           tag's chip elsewhere — `ctf` is green wherever it appears, and the
           palette is one of the places it appears. */
        if (it.kind === 'tag') li.dataset.tag = slug(it.title);
        li.setAttribute('aria-selected', i === 0 ? 'true' : 'false');

        var title = esc(it.title);
        if (q) {
          var at = it.title.toLowerCase().indexOf(q);
          if (at !== -1) {
            title = esc(it.title.slice(0, at)) + '<mark>' +
                    esc(it.title.slice(at, at + q.length)) + '</mark>' +
                    esc(it.title.slice(at + q.length));
          }
        }

        li.innerHTML = '<span class="cp-kind cp-' + it.kind + '">' + it.kind + '</span>' +
                       '<span class="cp-title">' + title + '</span>' +
                       (it.meta ? '<span class="cp-meta">' + esc(it.meta) + '</span>' : '');
        li.addEventListener('click', function () { choose(i); });
        li.addEventListener('mousemove', function () { moveTo(i); });
        list.appendChild(li);
      });
      moveTo(0);
    }

    function moveTo(i) {
      if (!shown.length) return;
      cursor = (i + shown.length) % shown.length;
      Array.prototype.forEach.call(list.children, function (li, n) {
        li.setAttribute('aria-selected', n === cursor ? 'true' : 'false');
        li.classList.toggle('is-active', n === cursor);
      });
      var active = list.children[cursor];
      if (active) {
        input.setAttribute('aria-activedescendant', active.id);
        // Keep the highlighted row in view without moving the page.
        var lr = active.getBoundingClientRect(), pr = list.getBoundingClientRect();
        if (lr.top < pr.top) list.scrollTop -= pr.top - lr.top;
        else if (lr.bottom > pr.bottom) list.scrollTop += lr.bottom - pr.bottom;
      }
    }

    function choose(i, newTab) {
      var it = shown[i];
      if (!it) return;
      if (it.run) { it.run(); if (!it.keep) close(); return; }
      if (it.url) {
        var href = it.url;
        if (newTab) window.open(href, '_blank', 'noopener');
        else { close(); location.href = href; }
      }
    }

    /* ---- open / close ---------------------------------------------------- */

    function ensureDom() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.className = 'cp-overlay';
      overlay.hidden = true;
      overlay.innerHTML =
        '<div class="cp-panel" role="dialog" aria-modal="true" aria-label="Command palette">' +
          '<input class="cp-input" type="text" autocomplete="off" spellcheck="false"' +
                 ' role="combobox" aria-expanded="true" aria-controls="cp-list"' +
                 ' placeholder="Jump to a post, page or tag…">' +
          '<ul class="cp-list" id="cp-list" role="listbox" aria-label="Results"></ul>' +
          '<p class="cp-empty" hidden>No matches.</p>' +
          '<p class="cp-hint"><kbd>↑</kbd><kbd>↓</kbd> move · <kbd>↵</kbd> open · <kbd>esc</kbd> close</p>' +
        '</div>';
      document.body.appendChild(overlay);

      input = overlay.querySelector('.cp-input');
      list = overlay.querySelector('.cp-list');
      empty = overlay.querySelector('.cp-empty');

      overlay.addEventListener('mousedown', function (e) {
        if (e.target === overlay) { close(); return; }

        if (e.target !== input) e.preventDefault();
      });
      input.addEventListener('input', render);
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveTo(cursor + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveTo(cursor - 1); }
        else if (e.key === 'Home') { e.preventDefault(); moveTo(0); }
        else if (e.key === 'End') { e.preventDefault(); moveTo(shown.length - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(cursor, e.metaKey || e.ctrlKey); }
        else if (e.key === 'Tab') { e.preventDefault(); }   // nothing else is focusable
      });
    }

    /* Escape is bound to the document, not to the input. On the input alone it
       stopped working the moment focus left it — and `aria-modal="true"` is a
       promise that the rest of the page is unavailable, which the mousedown
       guard above and the inert marks below are what actually keep. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) {
        e.preventDefault();
        close();
      }
    });

    /* Hide the page behind the scrim from the tab order and from assistive
       tech while the palette is open. Without it, Tab walked the background
       document — first stop the skip link, which focuses underneath the
       overlay where its ring cannot be seen. `inert` is ignored by browsers
       that do not support it, so this only ever adds correctness. */

    function open() {
      ensureDom();
      lastFocus = document.activeElement;
      overlay.hidden = false;
      inertBackground(true);
      document.documentElement.classList.add('cp-open');
      input.value = '';

      if (built) { render(); }
      else {
        list.innerHTML = '<li class="cp-item cp-loading">Loading…</li>';
        fetch('/search.json')
          .then(function (r) { return r.json(); })
          .then(function (docs) { build(docs); render(); })
          .catch(function () {
            /* Pages and actions still work without the index — but clear the
               built flag so the next open tries again. Leaving it set meant a
               single failed fetch (a flaky connection, a deploy in flight)
               permanently emptied the palette of every post and tag for the
               life of the page, with no way back short of a reload. */
            build([]);
            built = false;
            render();
          });
      }
      input.focus();
    }

    function close() {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      /* Clear inert before restoring focus: focusing an element inside an
         inert subtree silently does nothing. */
      inertBackground(false);
      document.documentElement.classList.remove('cp-open');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener('keydown', function (e) {
      // Cmd-K / Ctrl-K. Safe inside text fields too: it is a modifier combo, and
      // every app that ships this binding behaves the same way.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (overlay && !overlay.hidden) close(); else open();
      }
    });

    /* Exposed for the header icon — which turned out never to call it; the
       search button opens the search field instead, and ⌘K is the only way in.
       Kept because it is the single documented hook for summoning the palette
       from anywhere, and removing it would leave no way at all. */
    window.openCommandPalette = open;
  })();

  /* ----------------------------------------------------- blog pagination */
  /* Server-rendered: every post is in the HTML, so crawlers and no-JS readers
     get the full list. This pages it client-side instead of generating page
     files, because GitHub Pages allows no pagination plugin and splitting the
     index into real pages would need one. */
  var pagedList = document.querySelector('.post-list[data-paginate]');
  if (pagedList) {
    var perPage = parseInt(pagedList.dataset.paginate, 10) || 10;
    var entries = [].slice.call(pagedList.children);

    /* Each post remembers the year and month heading in force above it, rather
       than a heading owning the posts that follow it. That distinction matters
       at a page break: when a month is split across two pages, the second page
       still needs both headings, and the old "rule belongs to the first item"
       model left that page unlabelled. Rules live earlier in the DOM, so
       un-hiding one always draws it above the posts it heads. */
    var rules = [];
    var flat = [];
    var curYear = null, curMonth = null;
    entries.forEach(function (el) {
      if (el.classList.contains('year-rule')) { curYear = el; curMonth = null; rules.push(el); }
      else if (el.classList.contains('month-rule')) { curMonth = el; rules.push(el); }
      else flat.push({ el: el, year: curYear, month: curMonth });
    });

    var pages = Math.ceil(flat.length / perPage);
    if (pages > 1) {
      /* `pager`, not `nav`. This file is one IIFE and `var` is function-scoped,
         so a second `var nav` here is not a new variable — it is the same
         binding as the mobile menu's `var nav` at the top of the file, and it
         overwrote it. The hamburger's click handler closes over the variable
         rather than the element it held, so from then on it toggled `open` on
         the pagination bar and the menu never opened. It broke on exactly the
         two pages that paginate, /blog/ and /ctf/, and nowhere else. */
      var pager = document.createElement('nav');
      pager.className = 'pagination';
      pager.setAttribute('aria-label', 'Post pages');
      /* Placed on the shell, not beside the list, so it centres across the
         whole page rather than across the text column with the archive rail
         pushed off to one side. `.page-shell` is a grid; the CSS spans this
         over every column so it sits on its own row underneath both. */
      var shell = pagedList.closest('.page-shell');
      if (shell) shell.appendChild(pager);
      else pagedList.after(pager);

      var show = function (page) {
        rules.forEach(function (r) { r.hidden = true; });
        flat.forEach(function (entry, i) {
          var on = i >= (page - 1) * perPage && i < page * perPage;
          entry.el.hidden = !on;
          // Show whichever headings the visible posts sit under.
          if (on) {
            if (entry.year) entry.year.hidden = false;
            if (entry.month) entry.month.hidden = false;
          }
        });

        markEdges(pagedList);
        syncArchiveToPage(pagedList);
        pager.innerHTML = '';
        var button = function (label, target, opts) {
          var b = document.createElement(target ? 'a' : 'span');
          b.className = 'pagination-item' + (opts && opts.current ? ' is-current' : '');
          b.textContent = label;
          if (target) {
            b.href = '?page=' + target;
            b.addEventListener('click', function (e) {
              e.preventDefault();
              show(target);
              history.replaceState(null, '', target === 1 ? location.pathname : '?page=' + target);
              window.scrollTo({ top: 0, behavior: scrollBehavior() });
            });
          }
          if (opts && opts.current) b.setAttribute('aria-current', 'page');
          pager.appendChild(b);
        };

        button('← Newer', page > 1 ? page - 1 : null);
        for (var p = 1; p <= pages; p++) button(String(p), p === page ? null : p, { current: p === page });
        button('Older →', page < pages ? page + 1 : null);
      };

      var startPage = parseInt(new URLSearchParams(location.search).get('page'), 10) || 1;
      show(Math.min(Math.max(startPage, 1), pages));
    }
  }

  /* --------------------------------------------------------------- search */
  /* Client-side, against /search.json — GitHub Pages runs no plugins, and a
     handful of posts does not justify a service. The index is fetched once, on
     first use, so nobody pays for it who does not search. */
  var qInput = document.getElementById('q');
  var results = document.getElementById('search-results');
  var status = document.getElementById('search-status');

  if (qInput && results) {
    var docs = null;
    var loading = false;

    var esc = function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };

    // Terms are ANDed: every one has to appear somewhere in the document.
    var score = function (doc, terms) {
      var title = doc.title.toLowerCase();
      var tags = (doc.tags || []).join(' ').toLowerCase();
      var lede = (doc.description || '').toLowerCase();
      var body = (doc.body || '').toLowerCase();
      var total = 0;

      /* Counting occurrences without allocating. `body.split(t).length - 1`
         built an array of every fragment between hits — on bodies capped at
         8000 characters, a one- or two-letter term produced thousands of
         substrings per document, on every keystroke. */
      var countIn = function (hay, needle) {
        var n = 0, i = hay.indexOf(needle);
        while (i !== -1) { n++; i = hay.indexOf(needle, i + needle.length); }
        return n;
      };

      for (var i = 0; i < terms.length; i++) {
        var t = terms[i], s = 0;
        if (title.indexOf(t) !== -1) s += 10;
        if (tags.indexOf(t) !== -1) s += 6;
        if (lede.indexOf(t) !== -1) s += 3;
        var n = countIn(body, t);
        if (n) s += Math.min(4, n);
        if (!s) return 0;          // a missing term disqualifies the document
        total += s;
      }
      return total;
    };

    // A window of body text around the first hit, with the term marked.
    var snippet = function (doc, terms) {
      var body = doc.body || doc.description || '';
      var low = body.toLowerCase();
      var at = -1;
      for (var i = 0; i < terms.length && at === -1; i++) at = low.indexOf(terms[i]);
      if (at === -1) return esc(doc.description || '');

      var from = Math.max(0, at - 90);
      var text = body.slice(from, from + 240);
      if (from > 0) text = '…' + text;
      if (from + 240 < body.length) text += '…';

      /* Find the hits in the RAW text, then escape each piece as it is
         assembled — never the other way round.

         Escaping first and running the highlight regex over the result meant
         the regex was searching HTML, not prose: a query of "amp" matched
         inside the `&amp;` that escaping had just produced and split the
         entity, so a post containing `&&` rendered as `&amp;amp;`. The
         mirror image was just as wrong — a query containing `>` could score
         and match the document but never highlight, because by then the text
         said `&gt;`. */
      var ranges = [];
      var lowText = text.toLowerCase();
      terms.forEach(function (t) {
        if (!t) return;
        var i = lowText.indexOf(t);
        while (i !== -1) {
          ranges.push([i, i + t.length]);
          i = lowText.indexOf(t, i + t.length);
        }
      });
      if (!ranges.length) return esc(text);

      // Merge overlaps so two terms hitting the same span mark it once.
      ranges.sort(function (a, b) { return a[0] - b[0]; });
      var merged = [ranges[0]];
      for (var r = 1; r < ranges.length; r++) {
        var last = merged[merged.length - 1];
        if (ranges[r][0] <= last[1]) last[1] = Math.max(last[1], ranges[r][1]);
        else merged.push(ranges[r]);
      }

      var out = '', cursor = 0;
      merged.forEach(function (range) {
        out += esc(text.slice(cursor, range[0]));
        out += '<mark>' + esc(text.slice(range[0], range[1])) + '</mark>';
        cursor = range[1];
      });
      out += esc(text.slice(cursor));
      return out;
    };

    var render = function (q) {
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      results.innerHTML = '';

      if (!terms.length) { status.textContent = ''; return; }
      if (!docs) { status.textContent = 'Loading…'; return; }

      var hits = docs
        .map(function (d) { return { doc: d, s: score(d, terms) }; })
        .filter(function (h) { return h.s > 0; })
        .sort(function (a, b) {
          if (b.s !== a.s) return b.s - a.s;
          /* Level on score, a write-up beats a section page. A page's body is
             mostly the list it generates, so it can match a term as strongly
             as the post it is listing — and the post is the thing being looked
             for. */
          var ap = a.doc.kind === 'page', bp = b.doc.kind === 'page';
          return ap === bp ? 0 : (ap ? 1 : -1);
        });

      status.textContent = hits.length
        ? hits.length + (hits.length === 1 ? ' result' : ' results')
        : 'No results for “' + q + '”';

      hits.forEach(function (h) {
        var d = h.doc;
        var li = document.createElement('li');
        li.className = 'post-item';
        /* A page has no date and no tags. Left to the post layout it rendered
           an empty <time> reading "undefined"; it says what it is instead, so
           a section page in a list of write-ups is recognisable as one. */
        var meta = d.date
          ? '<time datetime="' + esc(d.iso) + '">' + esc(d.date) + '</time>' +
            ((d.tags && d.tags.length)
              ? '<span aria-hidden="true">&middot;</span><span>' + esc(d.tags.slice(0, 3).join(', ')) + '</span>'
              : '')
          : '<span>Page</span>';
        li.innerHTML =
          '<div class="meta">' + meta + '</div>' +
          '<h3><a href="' + esc(d.url) + '">' + esc(d.title) + '</a></h3>' +
          '<div class="excerpt"><p>' + snippet(d, terms) + '</p></div>';
        results.appendChild(li);
      });

      // The whole-card click handler ran before these existed.
      wireCards(results);
    };

    var load = function () {
      if (docs || loading) return;
      loading = true;
      // This file is served as-is, with no Liquid pass, so the path is literal.
      // It matches `permalink: /search.json` and the site's empty baseurl.
      fetch('/search.json')
        .then(function (r) { return r.json(); })
        .then(function (json) { docs = json; loading = false; render(qInput.value); })
        .catch(function () {
          loading = false;
          status.textContent = 'Could not load the search index.';
        });
    };

    var debounce;
    qInput.addEventListener('input', function () {
      load();
      clearTimeout(debounce);
      debounce = setTimeout(function () {
        render(qInput.value);
        // Keep the query in the URL so a search can be linked or reloaded.
        var url = qInput.value
          ? location.pathname + '?q=' + encodeURIComponent(qInput.value)
          : location.pathname;
        history.replaceState(null, '', url);
      }, 120);
    });

    // Arrive with ?q= already set (a shared link, or the back button).
    var initial = new URLSearchParams(location.search).get('q');
    if (initial) { qInput.value = initial; load(); }
    else { qInput.addEventListener('focus', load, { once: true }); }
  }

  /* ------------------------------------------------------------- comments */
  /* giscus is injected here rather than written into the page, so that
     `data-theme` matches the theme the site is showing. Loading it from an
     IntersectionObserver keeps the third-party request off the page for readers
     who never scroll to the bottom. */
  var giscusMount = document.getElementById('giscus');
  if (giscusMount && giscusMount.dataset.categoryId) {
    var injectGiscus = function () {
      var d = giscusMount.dataset;
      var s = document.createElement('script');
      s.src = 'https://giscus.app/client.js';
      s.async = true;
      s.crossOrigin = 'anonymous';

      var attrs = {
        'data-repo': d.repo,
        'data-repo-id': d.repoId,
        'data-category': d.category,
        'data-category-id': d.categoryId,
        'data-mapping': d.mapping || 'pathname',
        'data-strict': '1',
        'data-reactions-enabled': d.reactions || '1',
        'data-emit-metadata': '0',
        'data-input-position': 'top',
        'data-theme': effectiveTheme(),
        'data-lang': 'en'
      };
      Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });

      giscusMount.appendChild(s);
    };

    whenNear(giscusMount, injectGiscus);
  }

  /* ============================================================== embeds ==
     Everything below drives an {% include embed/… %}. Each block is guarded by
     its own querySelector, so a page that uses none of them pays nothing. */

  /* ------------------------------------------------------- svg animations */
  /* Start when the figure is actually on screen, not on page load — otherwise
     a reader arrives after the interesting part has already happened. The
     scroll check is used rather than IntersectionObserver for the same reason
     as the comments loader: observers silently never fire in some embedded
     browsers, and a diagram that never animates looks broken. */
  if (document.querySelector('.anim')) {
    Array.prototype.forEach.call(document.querySelectorAll('.anim'), function (el) {
      // margin 0: an animation should start when it is actually on screen, not
      // 400px before, or the reader arrives after the interesting part.
      whenNear(el, function () { el.classList.add('anim-run'); }, 0);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.anim-replay'), function (btn) {
      btn.addEventListener('click', function () {
        var wrap = btn.closest('.anim');
        wrap.classList.remove('anim-run');
        // Force a reflow so removing and re-adding the class restarts the
        // keyframes rather than being coalesced into no change at all.
        void wrap.offsetWidth;
        wrap.classList.add('anim-run');
      });
    });
  }

  /* ------------------------------------------------------ annotated hexdump */
  Array.prototype.forEach.call(document.querySelectorAll('.hexdump'), function (el) {
    var bytes = (el.dataset.bytes || '').trim().split(/\s+/).filter(Boolean);
    if (!bytes.length) return;

    var base = parseInt(el.dataset.base || '0', 10);
    var perRow = parseInt(el.dataset.width || '16', 10);

    // "0-1:Magic|2:Storage" -> [{from, to, label, idx}]
    var fields = (el.dataset.fields || '').split('|').map(function (spec, i) {
      var parts = spec.split(':');
      if (parts.length < 2) return null;
      var range = parts[0].trim().split('-');
      return {
        from: parseInt(range[0], 10),
        to: parseInt(range.length > 1 ? range[1] : range[0], 10),
        label: parts.slice(1).join(':').trim(),
        idx: i
      };
    }).filter(Boolean);

    var fieldAt = function (offset) {
      for (var i = 0; i < fields.length; i++) {
        if (offset >= fields[i].from && offset <= fields[i].to) return fields[i];
      }
      return null;
    };

    var hex = function (n, width) {
      var s = n.toString(16).toUpperCase();
      while (s.length < width) s = '0' + s;
      return s;
    };

    var table = document.createElement('div');
    table.className = 'hexdump-grid';

    for (var start = 0; start < bytes.length; start += perRow) {
      var row = document.createElement('div');
      row.className = 'hexdump-row';

      var off = document.createElement('span');
      off.className = 'hexdump-offset';
      off.textContent = hex(base + start, 8);
      row.appendChild(off);

      var hexCol = document.createElement('span');
      hexCol.className = 'hexdump-bytes';
      var asciiCol = document.createElement('span');
      asciiCol.className = 'hexdump-ascii';

      for (var i = 0; i < perRow; i++) {
        var offset = start + i;
        var b = document.createElement('span');
        b.className = 'hb';
        if (offset < bytes.length) {
          var f = fieldAt(offset);
          var value = parseInt(bytes[offset], 16);
          b.textContent = bytes[offset].toUpperCase();
          if (f) {
            b.classList.add('f' + (f.idx % 6));
            b.dataset.field = String(f.idx);
            b.title = f.label + '  (offset ' + hex(base + offset, 4) + ')';
          }
          var a = document.createElement('span');
          a.className = 'ha' + (f ? ' f' + (f.idx % 6) : '');
          if (f) a.dataset.field = String(f.idx);
          // Printable ASCII only; everything else is a dot, as in xxd.
          a.textContent = (value >= 0x20 && value < 0x7f) ? String.fromCharCode(value) : '.';
          asciiCol.appendChild(a);
        } else {
          b.classList.add('pad');
          b.textContent = '  ';
        }
        hexCol.appendChild(b);
      }

      row.appendChild(hexCol);
      row.appendChild(asciiCol);
      table.appendChild(row);
    }

    var raw = el.querySelector('.hexdump-raw');
    if (raw) raw.remove();
    el.appendChild(table);

    if (fields.length) {
      var legend = document.createElement('ul');
      legend.className = 'hexdump-legend';
      fields.forEach(function (f) {
        var li = document.createElement('li');
        li.className = 'f' + (f.idx % 6);
        li.dataset.field = String(f.idx);
        li.innerHTML = '<i></i>' + f.label +
          ' <em>' + hex(base + f.from, 4) + (f.to !== f.from ? '&ndash;' + hex(base + f.to, 4) : '') + '</em>';
        legend.appendChild(li);
      });
      el.appendChild(legend);

      /* Hovering a byte or a legend entry lights the whole field.

         Grouped by field once, up front, instead of re-querying on every
         mouseover. A 256-byte dump has 512 marked nodes, and the old version
         walked all of them on each event just to clear a class from the few
         that had it — for a pointer moving across the grid that is thousands
         of nodes touched per second. Now only the outgoing and incoming
         fields are touched, and mouseover exits immediately when the pointer
         moves within one field. */
      var byField = Object.create(null);
      el.querySelectorAll('[data-field]').forEach(function (n) {
        (byField[n.dataset.field] || (byField[n.dataset.field] = [])).push(n);
      });

      var activeField = null;
      var setActive = function (idx) {
        if (idx === activeField) return;
        if (activeField !== null && byField[activeField]) {
          byField[activeField].forEach(function (n) { n.classList.remove('on'); });
        }
        if (idx !== null && byField[idx]) {
          byField[idx].forEach(function (n) { n.classList.add('on'); });
        }
        activeField = idx;
      };
      el.addEventListener('mouseover', function (e) {
        var t = e.target.closest('[data-field]');
        setActive(t ? t.dataset.field : null);
      });
      el.addEventListener('mouseleave', function () { setActive(null); });
    }
  });

  /* ------------------------------------------------- before/after comparison */
  Array.prototype.forEach.call(document.querySelectorAll('.img-compare'), function (el) {
    var after = el.querySelector('.img-compare-after');
    if (!after) return;

    el.classList.add('ready');

    var handle = document.createElement('div');
    handle.className = 'img-compare-handle';
    handle.setAttribute('role', 'slider');
    handle.setAttribute('tabindex', '0');
    handle.setAttribute('aria-label', 'Reveal ' + (el.dataset.afterLabel || 'after'));
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', '100');
    el.appendChild(handle);

    ['before', 'after'].forEach(function (side) {
      var tag = document.createElement('span');
      tag.className = 'img-compare-label is-' + side;
      tag.textContent = el.dataset[side + 'Label'] || side;
      el.appendChild(tag);
    });

    var set = function (pct) {
      pct = Math.max(0, Math.min(100, pct));
      el.style.setProperty('--split', pct + '%');
      handle.setAttribute('aria-valuenow', Math.round(pct));
    };
    set(50);

    /* The element's box, measured when a drag starts rather than on every
       move. `set` writes a custom property and `getBoundingClientRect` reads
       layout back, so measuring inside the move handler forced a synchronous
       layout for each of the ~120 events a second a trackpad produces. The
       box cannot change mid-drag except on a resize, which clears it. */
    var rect = null;
    window.addEventListener('resize', function () { rect = null; }, { passive: true });

    var fromEvent = function (e) {
      if (!rect) rect = el.getBoundingClientRect();
      var x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      set((x / rect.width) * 100);
    };

    var dragging = false;
    el.addEventListener('pointerdown', function (e) {
      dragging = true;
      rect = el.getBoundingClientRect();
      fromEvent(e);
      el.setPointerCapture(e.pointerId);
    });
    // Passive: the handler never calls preventDefault, and saying so lets the
    // browser stop waiting on it before it scrolls.
    el.addEventListener('pointermove', function (e) { if (dragging) fromEvent(e); }, { passive: true });
    el.addEventListener('pointerup', function () { dragging = false; });
    el.addEventListener('pointercancel', function () { dragging = false; });

    handle.addEventListener('keydown', function (e) {
      var now = parseFloat(el.style.getPropertyValue('--split')) || 50;
      if (e.key === 'ArrowLeft') { set(now - 4); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(now + 4); e.preventDefault(); }
      if (e.key === 'Home') { set(0); e.preventDefault(); }
      if (e.key === 'End') { set(100); e.preventDefault(); }
    });
  });

  /* ------------------------------------------------ third-party frames */
  /* These load when the reader scrolls near them, not on page load and not
     only on a click. Two consequences worth knowing:
       - a reader who never scrolls this far costs nothing, and a page full of
         embeds still loads instantly;
       - a reader who *does* scroll past makes a request to YouTube or godbolt
         without asking. Set `click="true"` on the include to keep a particular
         embed behind an explicit click instead. */

  function swapInFrame(el, src, extra) {
    var frame = document.createElement('iframe');
    frame.src = src;
    frame.loading = 'lazy';
    frame.title = el.dataset.label || 'Embedded frame';
    if (extra) Object.keys(extra).forEach(function (k) { frame[k] = extra[k]; });
    el.replaceWith(frame);
  }

  function videoFacadeSrc(el) {
    // autoplay only when the reader asked for it by clicking.
    var auto = el.dataset.clickToLoad === 'true' ? '1' : '0';
    return el.dataset.provider === 'vimeo'
      ? 'https://player.vimeo.com/video/' + el.dataset.id + '?autoplay=' + auto
      : 'https://www.youtube-nocookie.com/embed/' + el.dataset.id +
        '?autoplay=' + auto + '&rel=0' +
        (el.dataset.start ? '&start=' + el.dataset.start : '');
  }

  Array.prototype.forEach.call(document.querySelectorAll('.video-facade'), function (el) {
    var load = function () {
      swapInFrame(el, videoFacadeSrc(el), {
        allow: 'accelerometer; autoplay; encrypted-media; picture-in-picture',
        allowFullscreen: true
      });
    };
    el.addEventListener('click', function () {
      el.dataset.clickToLoad = 'true';   // an explicit click starts playback
      load();
    });
    if (el.dataset.click !== 'true') whenNear(el, load);
  });

  Array.prototype.forEach.call(document.querySelectorAll('.iframe-facade'), function (el) {
    var load = function () { swapInFrame(el, el.dataset.src); };
    var btn = el.querySelector('.iframe-facade-play');
    if (btn) btn.addEventListener('click', load);
    if (el.dataset.click !== 'true') whenNear(el, load);
  });

  /* ------------------------------------------------------------------ pdf */
  /* An <object> streams the whole file the moment it is parsed, which is the
     single heaviest thing a post can do on load. Defer it the same way. */
  Array.prototype.forEach.call(document.querySelectorAll('.embed-pdf[data-src]'), function (el) {
    whenNear(el, function () {
      var obj = document.createElement('object');
      obj.data = el.dataset.src + '#view=FitH';
      obj.type = 'application/pdf';
      obj.setAttribute('aria-label', el.dataset.label || 'PDF document');
      el.insertBefore(obj, el.firstChild);
    });
  });

  /* ---------------------------------------------------------------- gists */
  Array.prototype.forEach.call(document.querySelectorAll('.embed-gist'), function (el) {
    var id = (el.dataset.gist || '').split('/').pop();
    if (!id) return;
    fetch('https://api.github.com/gists/' + id)
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (g) {
        var names = Object.keys(g.files || {});
        var name = el.dataset.file && g.files[el.dataset.file] ? el.dataset.file : names[0];
        if (!name) return;
        var file = g.files[name];

        var head = document.createElement('div');
        head.className = 'code-head';
        head.innerHTML = '<span class="code-file"></span>';
        head.querySelector('.code-file').textContent = name;

        var pre = document.createElement('pre');
        var code = document.createElement('code');
        code.textContent = file.content;
        pre.appendChild(code);

        var box = document.createElement('div');
        box.className = 'highlighter-rouge has-head';
        box.appendChild(head);
        box.appendChild(pre);
        el.prepend(box);
      })
      .catch(function () { /* the link stays; that is the fallback */ });
  });

  /* ------------------------------------------------- side-by-side patch diff */
  /* Opt in with `| side-by-side` in the code comment above a ```diff fence. */
  Array.prototype.forEach.call(
    document.querySelectorAll('#post-body div.language-diff.side-by-side'),
    function (block) {
      var pre = block.querySelector('pre');
      if (!pre) return;

      // textContent, not innerText: innerText needs layout, and these blocks
      // carry `content-visibility: auto`, so an offscreen one yields nothing.
      var left = [], right = [];
      pre.textContent.replace(/\n$/, '').split('\n').forEach(function (line) {
        var c = line.charAt(0);
        if (c === '+') { right.push({ t: line, k: 'add' }); }
        else if (c === '-') { left.push({ t: line, k: 'del' }); }
        else if (c === '@' || c === 'd' || c === 'i' || c === '=') {
          left.push({ t: line, k: 'meta' }); right.push({ t: line, k: 'meta' });
        } else { left.push({ t: line, k: '' }); right.push({ t: line, k: '' }); }
        // Pad so both columns stay aligned row for row.
        while (left.length < right.length) left.push({ t: '', k: 'nil' });
        while (right.length < left.length) right.push({ t: '', k: 'nil' });
      });

      var col = function (rows, cls) {
        var d = document.createElement('div');
        d.className = 'diff-col ' + cls;
        rows.forEach(function (r) {
          var l = document.createElement('span');
          l.className = 'diff-line' + (r.k ? ' is-' + r.k : '');
          l.textContent = r.t || ' ';
          d.appendChild(l);
        });
        return d;
      };

      var wrap = document.createElement('div');
      wrap.className = 'diff-split';
      wrap.appendChild(col(left, 'is-old'));
      wrap.appendChild(col(right, 'is-new'));

      var head = block.querySelector('.code-head');
      block.querySelector('.highlight').replaceWith(wrap);
      if (head) block.insertBefore(head, wrap);
    }
  );

  /* --------------------------------------------- markdown task lists */
  /* kramdown renders `- [ ] item` as a disabled <input type="checkbox"> with
     no label, so a screen reader announces "checkbox, not checked" before
     every line of a checklist and never says what it refers to — the text is
     a sibling of the input, not its accessible name.

     They are decorative: `disabled` already keeps them out of the tab order,
     and the list text beside them carries the entire meaning. Hiding them
     from the accessibility tree leaves the list reading as a plain list,
     which is what it is. */
  Array.prototype.forEach.call(
    document.querySelectorAll('.task-list-item-checkbox'),
    function (box) { box.setAttribute('aria-hidden', 'true'); }
  );

  /* ------------------------------------------------- linkable code lines */
  /* Blocks that asked for line numbers get an id per line, so a post can point
     at `#poc-c-L42` and have the browser scroll to and highlight it. */
  var lineSlugs = {};

  Array.prototype.forEach.call(
    document.querySelectorAll('#post-body .has-lineno'),
    function (block, blockIndex) {
      var slug = block.dataset.slug ||
        (block.querySelector('.code-file')
          ? block.querySelector('.code-file').textContent.replace(/[^\w.-]+/g, '-').replace(/\.+/g, '-').toLowerCase()
          : 'code-' + (blockIndex + 1));

      /* Two blocks can carry the same filename — a before/after pair of the
         same file is the whole point of the side-by-side layout — and the
         slug is derived from that filename, so their line ids collided.
         #decode-c-L9 then always resolved to the first block and
         highlighted the wrong line. Later blocks get a -2, -3 suffix. */
      if (Object.prototype.hasOwnProperty.call(lineSlugs, slug)) {
        lineSlugs[slug] += 1;
        slug = slug + '-' + lineSlugs[slug];
      } else {
        lineSlugs[slug] = 1;
      }

      Array.prototype.forEach.call(block.querySelectorAll('.ln'), function (line, i) {
        var n = i + 1;
        var id = slug + '-L' + n;
        line.id = id;

        var a = document.createElement('a');
        a.className = 'ln-num';
        a.href = '#' + id;
        a.textContent = String(n);
        a.setAttribute('aria-label', 'Link to line ' + n);
        line.insertBefore(a, line.firstChild);
      });
    }
  );

  /* ---------------------------------------------------------- back to top */
  /* Posts run several thousand words and the sticky TOC is desktop-only, so on
     a phone there was no way back up short of flicking repeatedly. */
  var toTop = document.getElementById('to-top');
  if (toTop) {
    var toTopVisible = false;
    var syncToTop = function () {
      var show = window.scrollY > window.innerHeight;
      if (show === toTopVisible) return;
      toTopVisible = show;
      toTop.hidden = !show;
    };

    toTop.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: scrollBehavior() });
      // Put focus back where the page starts, or a keyboard user is left
      // stranded at the bottom of the document.
      var main = document.getElementById('main');
      if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    });

    window.addEventListener('scroll', syncToTop, { passive: true });
    window.addEventListener('resize', syncToTop, { passive: true });
    syncToTop();
  }

  /* ---------------------------------------------------- reading progress */
  var bar = document.getElementById('progress');
  if (bar && body) {
    /* The bar starts at zero width and transitions, so the very first update
       animates from 0 to wherever the reader already is. Refresh a post you
       were halfway through and the bar sweeps across the top on its own — an
       animation nobody asked for, reporting progress that had not just been
       made. Every update after it is a real change and should glide.

       Suppressed inline for one write, with a reflow between, so the value is
       committed while the transition is off. */
    var barPlaced = false;
    var setWidth = function (w) {
      if (barPlaced) { bar.style.width = w; return; }
      var prev = bar.style.transition;
      bar.style.transition = 'none';
      bar.style.width = w;
      void bar.offsetWidth;
      bar.style.transition = prev;
      barPlaced = true;
    };
    var update = function () {
      var rect = body.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      if (total <= 0) { setWidth('0'); return; }
      var pct = ((-rect.top) / total) * 100;
      setWidth(Math.min(100, Math.max(0, pct)) + '%');
    };

    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { update(); ticking = false; });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }
})();
