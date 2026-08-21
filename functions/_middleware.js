/* Edge request log.
 *
 * Runs on every request the site serves, records one Analytics Engine data
 * point describing it, and gets out of the way. This is the half of the
 * analytics story the browser beacon cannot tell: feed fetches, crawlers,
 * `curl`, and every reader running a content blocker are invisible to
 * client-side JavaScript and are counted here instead.
 *
 * Two rules govern everything below.
 *
 * 1. It must never break the site. Logging is wrapped so that a malformed
 *    header, a missing binding or a change in the Analytics Engine API
 *    cannot turn a page into a 500. If the log fails, the reader still gets
 *    their page and the failure is simply lost — that is the correct trade.
 *
 * 2. Everything here is volunteered by the browser in the request, or is a
 *    property of the connection. Nothing is read out of the reader's device
 *    and nothing is stored on it.
 *
 *    That line is not about how revealing a field is — it is where ePrivacy
 *    Art. 5(3) draws it. Storing information on, or gaining access to
 *    information stored in, terminal equipment needs consent: cookies,
 *    localStorage, canvas, WebGL, AudioContext, font enumeration, screen
 *    metrics, Intl timezone. Headers the browser sends unprompted and facts
 *    about the TCP/TLS connection do not, which is why this file has no
 *    client-side half and the site still needs no consent banner.
 *
 *    Two things stay out regardless: the IP address, and the full referrer
 *    URL. The ASN below carries the useful part of an IP — which network —
 *    without the part that names a person, and a referrer path can carry
 *    someone else's private URL or search terms.
 */

/* Client classes, tested in this order because the patterns overlap:
   almost every AI crawler's User-Agent contains the word "bot", so a plain
   bot test would swallow them all and the distinction would be lost. */
const AI_CRAWLER = /gptbot|oai-searchbot|chatgpt-user|claudebot|claude-web|anthropic-ai|ccbot|perplexitybot|bytespider|google-extended|applebot-extended|meta-externalagent|amazonbot|cohere-ai|diffbot|omgili|timpibot|imagesiftbot/i;
const FEED_READER = /feedly|inoreader|newsblur|feedbin|miniflux|netnewswire|reeder|tt-rss|tiny tiny rss|feedparser|akregator|liferea|bazqux|rssowl|newsboat|feedvalidator|rss/i;
const BOT = /bot|crawler|spider|slurp|curl|wget|python-requests|go-http-client|scrapy|headless|libwww|okhttp|java\/|axios|node-fetch|monitoring|uptime|checkly|pingdom/i;

function agentClass(ua) {
  if (!ua) return 'none';                 /* no UA at all is itself a signal */
  if (AI_CRAWLER.test(ua)) return 'ai';
  if (FEED_READER.test(ua)) return 'feed-reader';
  if (BOT.test(ua)) return 'bot';
  return 'browser';
}

/* Paths that only an attacker asks for.
 *
 * Classifying by *what was requested* rather than by who claims to be asking
 * is the point: within three minutes of this log going live, a scanner walked
 * .env, .env.local, .env.production, api/config, config.json and friends —
 * and because it sent a browser User-Agent, agentClass() above called it a
 * browser. It was a fifth of all traffic that hour. Left unclassified it
 * inflates exactly the two numbers worth trusting, page views and browsers.
 *
 * Anchored at the start of the path so a legitimate asset is never caught:
 * /assets/vendor/... is ours, /vendor/... is somebody looking for a PHP
 * autoloader. Nothing this site serves matches, which is the test to re-run
 * before adding a pattern here. */
const PROBE = new RegExp('^/(?:' + [
  '\\.env', '\\.git', '\\.aws', '\\.ssh', '\\.svn', '\\.htaccess', '\\.DS_Store',
  'wp-', 'wordpress', 'xmlrpc\\.php', 'phpmyadmin', 'phpinfo',
  'admin', 'administrator', 'cgi-bin', 'vendor/',
  'api/(?:env|config|v[0-9]+/config)',
  'config(?:\\.js|\\.json|\\.php|\\.yml|\\.yaml)?$',
  'settings\\.(?:js|json|php)$',
  'js/(?:env|config)\\.js$',
  'credentials', 'secrets?(?:\\.|$|/)', 'backup', 'dump\\.sql',
  'server-status', 'actuator', 'telescope', 'debug(?:\\.|$|/)',
  'owa/', 'autodiscover', 'boaform', 'shell', 'eval-stdin\\.php',
].join('|') + ')', 'i');

/* What was asked for, rather than which URL. Lets a query separate "someone
   read a post" from "something pulled the feed" from "something went looking
   for credentials", without string-matching paths at query time. */
function requestKind(path) {
  /* Our own endpoints first — these are definitively the site's, so no probe
     pattern can ever shadow one. */
  if (path === '/feed.xml') return 'feed';
  if (path === '/search.json') return 'search-index';
  if (path === '/sitemap.xml' || path === '/robots.txt') return 'crawl-meta';
  if (path === '/opensearch.xml') return 'opensearch';
  if (path.startsWith('/assets/')) return 'asset';
  if (PROBE.test(path)) return 'probe';
  return 'page';
}

export const onRequest = async (context) => {
  const { request, next, env } = context;
  const started = Date.now();

  /* The response is produced first and unconditionally. Nothing about
     logging is allowed to sit between the reader and their page. */
  const response = await next();

  try {
    if (env && env.BLOG_ANALYTICS) {
      const url = new URL(request.url);
      const path = url.pathname;
      const cf = request.cf || {};

      /* Referrer host only. The full URL can carry search terms and private
         paths from whatever site linked here, and none of that is ours to
         keep. An unparseable Referer is simply dropped. */
      let refHost = '';
      const ref = request.headers.get('referer');
      if (ref) {
        try { refHost = new URL(ref).host; } catch (e) { refHost = 'unparseable'; }
      }

      env.BLOG_ANALYTICS.writeDataPoint({
        blobs: [
          path.slice(0, 200),                            /* blob1  what was requested */
          requestKind(path),                             /* blob2  page | feed | asset | probe | ... */
          agentClass(request.headers.get('user-agent') || ''),
                                                         /* blob3  browser | feed-reader | bot | ai | none */
          cf.country || 'XX',                            /* blob4  country, coarse by design */
          refHost.slice(0, 120),                         /* blob5  who linked here */
          request.method,                                /* blob6 */
          url.hostname,                                  /* blob7  apex vs www */
          (response.headers.get('content-type') || '').split(';')[0], /* blob8 */

          /* Which network, not which machine. A request from a hosting
             provider is a bot however its User-Agent is dressed; a request
             from a consumer or mobile ISP is a person. That distinction is
             most of the forensic value of an IP address, and this carries it
             without ever storing one. */
          String(cf.asn || ''),                          /* blob9  e.g. "14061" */
          String(cf.asOrganization || '').slice(0, 120), /* blob10 e.g. "DigitalOcean" */

          String(cf.httpProtocol || ''),                 /* blob11 HTTP/1.1 | HTTP/2 | HTTP/3 */
          String(cf.tlsVersion || ''),                   /* blob12 TLSv1.2 | TLSv1.3 */
          String(cf.colo || ''),                         /* blob13 which edge served it */

          /* Only the site's own search box, and only its query. Other query
             strings are left alone: campaign tags and tracking parameters are
             somebody else's data, and this is meant to answer "what do readers
             look for here" rather than "where have they been". */
          path === '/search/' ? (url.searchParams.get('q') || '').slice(0, 120) : '',
                                                         /* blob14 */

          /* Primary tag only. "en-GB,en;q=0.9,he;q=0.8" becomes "en-GB" —
             the full list is a meaningful fingerprinting signal and the first
             entry answers the question on its own. */
          (request.headers.get('accept-language') || '').split(',')[0].trim().slice(0, 20),
                                                         /* blob15 */

          String(cf.tlsCipher || ''),                    /* blob16 client stack signature */

          /* Why the browser asked, not just what for.
             Sec-Purpose is the one that matters: default.html ships
             speculation rules at eagerness "moderate", so browsers PRERENDER
             pages on hover. Those arrive as ordinary document requests and
             have been counted as page views ever since — pages nobody ever
             looked at. `purpose=prefetch` is how a real read is told apart
             from a speculative one. */
          [request.headers.get('sec-fetch-dest') || '',
           request.headers.get('sec-fetch-mode') || '',
           request.headers.get('sec-fetch-site') || '',
           request.headers.get('sec-purpose') || ''].join('|').slice(0, 120),
                                                         /* blob17 */

          /* Client Hints. Chromium sends these unprompted, so they cost the
             reader nothing and name the browser far more honestly than the
             frozen User-Agent string does. */
          [request.headers.get('sec-ch-ua-platform') || '',
           request.headers.get('sec-ch-ua-mobile') || '',
           request.headers.get('sec-ch-ua') || ''].join('|').slice(0, 160),
                                                         /* blob18 */

          /* Two unrelated things that both fit in one field.
             dnt / sec-gpc are the reader asking not to be tracked — recorded
             so the request can be honoured rather than merely received.
             if-none-match means the browser already holds a cached copy of
             this URL, which is a returning-reader signal that needs no cookie,
             no storage and no consent. */
          [request.headers.get('dnt') || '',
           request.headers.get('sec-gpc') || '',
           request.headers.get('if-none-match') ? 'cached' : ''].join('|'),
                                                         /* blob19 */

          (request.headers.get('user-agent') || '').slice(0, 180),
                                                         /* blob20 raw UA */
        ],
        doubles: [
          response.status,                               /* double1 */
          Date.now() - started,                          /* double2  edge service time, ms */
          Number(cf.clientTcpRtt) || 0,                  /* double3  real latency, ms */
          cf.isEUCountry === '1' ? 1 : 0,                /* double4  when GDPR applies */
          Number(response.headers.get('content-length')) || 0,  /* double5  bytes */
        ],
        /* One index is allowed, and it is what Analytics Engine samples by
           at high volume. Client class is the low-cardinality field whose
           proportions must stay honest — losing the true browser-to-bot
           ratio would make every other number misleading. */
        indexes: [agentClass(request.headers.get('user-agent') || '')],
      });
    }
  } catch (e) {
    /* Deliberately silent. See rule 1 at the top of this file. */
  }

  /* ------------------------------------------------- client-side collection */

  /* collect.js reads signals out of the reader's device, which is what
     ePrivacy Art. 5(3) requires consent for. So the decision is taken here,
     at the edge, and the script is *not served at all* to a reader who is not
     eligible — rather than served to everyone and asked to keep quiet. Only
     the server knows the country, and a gate in the page could be edited by
     the person it is meant to gate.
   
     cf.isEUCountry is IP geolocation and nothing more. A VPN, a mobile
     carrier or a corporate proxy puts an EU reader outside the EU; GDPR
     follows the person, not the address; and the UK, the EEA and Switzerland
     have their own regimes and do not appear here at all. This is a filter,
     not a safe harbour.
   
     DNT and Sec-GPC are honoured. The site already records both, and a reader
     who has set one has stated the preference in the only channel the web
     offers them. */
  try {
    var ct = (response.headers.get('content-type') || '');
    var isHtml = ct.indexOf('text/html') === 0;
    var euro = (request.cf || {}).isEUCountry === '1';
    var optedOut = request.headers.get('dnt') === '1'
                || request.headers.get('sec-gpc') === '1';

    if (isHtml && !euro && !optedOut && typeof HTMLRewriter !== 'undefined') {
      return new HTMLRewriter()
        .on('html', {
          element: function (el) { el.setAttribute('data-collect', 'on'); },
        })
        .on('body', {
          element: function (el) {
            el.append('<script src="/assets/js/collect.js" defer><\/script>', { html: true });
          },
        })
        .transform(response);
    }
  } catch (e) {
    /* Rule 1 again: a reader gets their page even if none of this works. */
  }

  return response;
};
