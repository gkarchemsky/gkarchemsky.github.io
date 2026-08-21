/* Receiver for the client-side signals.
 *
 * A second dataset rather than more columns on the first: blog_requests is
 * full at 20 blobs, and these rows are a different shape anyway — one per
 * eligible page view, not one per request.
 *
 * Everything arriving here was read off the reader's device by collect.js.
 * The eligibility decision was taken at the edge before that script was ever
 * served; this endpoint re-checks it rather than trusting the caller, because
 * a POST is a POST and anyone can send one.
 */

const MAX_BODY = 8 * 1024;

function eligible(cf, headers) {
  if (cf && cf.isEUCountry === '1') return false;
  if (headers.get('dnt') === '1' || headers.get('sec-gpc') === '1') return false;
  return true;
}

export const onRequestPost = async (context) => {
  const { request, env } = context;

  /* Nothing this endpoint does is worth an error page. Every path returns 204
     so a probe learns nothing from the difference between accepted, rejected
     and ignored. */
  const no = () => new Response(null, { status: 204 });

  try {
    const cf = request.cf || {};
    if (!eligible(cf, request.headers)) return no();

    const len = Number(request.headers.get('content-length') || 0);
    if (len > MAX_BODY) return no();

    const text = await request.text();
    if (text.length > MAX_BODY) return no();

    let d;
    try { d = JSON.parse(text); } catch (e) { return no(); }
    if (!d || typeof d !== 'object') return no();

    const s = (v, n) => String(v === undefined || v === null ? '' : v).slice(0, n || 120);
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };

    if (env && env.BLOG_CLIENTS) {
      env.BLOG_CLIENTS.writeDataPoint({
        blobs: [
          s(d.fp, 32),                       /* blob1  composite id */
          s(d.sid, 40),                      /* blob2  stored id, the one they can erase */
          s(d.p, 160),                       /* blob3  path */
          s(d.canvas, 32),                   /* blob4 */
          s(d.glVendor, 60),                 /* blob5 */
          s(d.glRenderer, 90),               /* blob6 */
          s(d.glExt, 32),                    /* blob7 */
          s(d.glParams, 32),                 /* blob8 */
          s(d.audio, 32),                    /* blob9 */
          s(d.fontHash, 32),                 /* blob10 */
          /* Server-side context, so a row here can be joined to blog_requests
             without shipping the reader's network back from the browser. */
          s(cf.country, 4) + '|' + s(cf.asn, 12),          /* blob11 */
          s(d.screen, 40),                   /* blob12 */
          s(d.tz, 48),                       /* blob13 */
          s(d.locale, 20) + '|' + s(d.langs, 60),          /* blob14 */
          s(d.plat, 40),                     /* blob15 */
          s(d.plugins, 120),                 /* blob16 */
          s(d.mq, 20),                       /* blob17  media-query answers */
          s(d.voices, 48),                   /* blob18 */
          s(d.net, 40) + '|' + s(d.devices, 16),           /* blob19 */
          s(d.uaHigh, 300),                  /* blob20  full Client Hints */
        ],
        doubles: [
          n(d.dpr),                          /* double1 */
          n(d.cores),                        /* double2 */
          n(d.mem),                          /* double3 */
          n(d.touch),                        /* double4 */
          n(d.fontN),                        /* double5 */
          n(d.tzOff),                        /* double6 */
          n(d.cookieEnabled),                /* double7 */
          n(d.webdriver),                    /* double8  automation self-report */
          n(d.pdf),                          /* double9 */
        ],
        /* The composite id: high cardinality on purpose, because it is the
           thing every query here groups by. */
        indexes: [s(d.fp, 32)],
      });
    }
  } catch (e) { /* see the comment on `no` above */ }

  return no();
};

/* Anything other than POST gets the same silent 204. */
export const onRequest = async () => new Response(null, { status: 204 });
