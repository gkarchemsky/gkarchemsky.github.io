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
 * 2. It must not fingerprint readers. No IP address, no raw User-Agent, no
 *    full referrer URL. What is kept is deliberately coarse: which country,
 *    which *class* of client, and which host linked here. That is enough to
 *    answer "is anyone reading this" without building a profile of who.
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

/* What was asked for, rather than which URL. Lets a query separate "someone
   read a post" from "something pulled the feed" without string-matching paths
   at query time. */
function requestKind(path) {
  if (path === '/feed.xml') return 'feed';
  if (path === '/search.json') return 'search-index';
  if (path === '/sitemap.xml' || path === '/robots.txt') return 'crawl-meta';
  if (path.startsWith('/assets/')) return 'asset';
  if (path === '/opensearch.xml') return 'opensearch';
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

      /* Referrer host only. The full URL can carry search terms and private
         paths from whatever site linked here, and none of that is ours to
         keep. An unparseable Referer is simply dropped. */
      let refHost = '';
      const ref = request.headers.get('referer');
      if (ref) {
        try { refHost = new URL(ref).host; } catch (e) { refHost = 'unparseable'; }
      }

      const ua = request.headers.get('user-agent') || '';
      const agent = agentClass(ua);

      env.BLOG_ANALYTICS.writeDataPoint({
        blobs: [
          path.slice(0, 200),                            /* blob1  what was requested */
          requestKind(path),                             /* blob2  page | feed | asset | ... */
          agent,                                         /* blob3  browser | feed-reader | bot | ai | none */
          request.cf && request.cf.country || 'XX',      /* blob4  country, coarse by design */
          refHost.slice(0, 120),                         /* blob5  who linked here */
          request.method,                                /* blob6 */
          url.hostname,                                  /* blob7  apex vs www */
          (response.headers.get('content-type') || '').split(';')[0], /* blob8 */
        ],
        doubles: [
          response.status,                               /* double1 */
          Date.now() - started,                          /* double2  edge service time, ms */
        ],
        /* One index is allowed, and it is what Analytics Engine samples by
           at high volume. Client class is the low-cardinality field whose
           proportions must stay honest — losing the true browser-to-bot
           ratio would make every other number misleading. */
        indexes: [agent],
      });
    }
  } catch (e) {
    /* Deliberately silent. See rule 1 at the top of this file. */
  }

  return response;
};
