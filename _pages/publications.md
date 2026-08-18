---
# The nav link switches itself on whenever this page exists — set
# `published: false` to take the page and the link back out together.
layout: default
title: Publications
permalink: /publications/
description: Papers, talks and advisories by George Karchemsky.
---

<div class="wrap">
  <header class="page-head">
    <h1>Publications</h1>
    <p class="lede">Papers, talks, and articles.</p>
  </header>

  {%- comment -%}
    Entries live in _data/publications.yml so this page stays a template.
    Add one like this:

      - title:   "A Talk Title"
        kind:    talk            # see the list below
        venue:   "OFFENSIVECON"  # conference, journal or publisher
        date:    2026-05-14      # yyyy-mm-dd, used for sorting
        authors: ["George Karchemsky"]
        url:     https://…       # optional — the canonical link
        slides:  /assets/docs/…  # optional
        video:   https://…       # optional
        code:    /research/…     # optional
        note:    "One sentence on what it covered."   # optional

    `kind` is free text and renders as the small label on the left. The ones
    worth having, for this field specifically:

      talk        a conference presentation
      keynote     distinguished from a talk on purpose — it is a different credit
      training    a paid course or workshop. Common in this field and worth
                  listing separately from a talk; Black Hat trainings and
      workshop    a shorter, usually free session
      paper       academic: USENIX Security, WOOT, NDSS, IEEE S&P, ACM CCS
      article     Phrack, PoC||GTFO, tmp.0ut, a vendor's research blog. This is
                  the one people forget, and in this field a Phrack article
                  carries more weight than most conference slots.
      guest post  writing published on someone else's blog — ZDI's, a vendor's
      book        or a chapter in one
      thesis      degree work, if it is public
      podcast     an appearance, where the episode is the artifact
      panel       distinct from a talk: shared billing, no slides of your own

    Deliberately not here: tools. Those get their own page — a tool is
    maintained software with a repository and a README, not a dated entry in a
    list, and mixing the two makes both harder to scan.

    Nothing renders until the file has at least one entry, so the page is safe
    to publish empty — it shows the note below instead.
  {%- endcomment -%}

  {%- comment -%}
    No `| default: empty`. `empty` is a Liquid literal, and assigning it stores
    the empty *string* — so `pubs` came out truthy, the first half of the test
    below passed, and only the `.size > 0` clause stopped the page looping over
    a string. It is the same `default:`-with-an-empty-collection trap that
    archive-rail.html documents and sidesteps. A missing data file already
    yields nil, which is falsy, so the default was never needed.

    (Written without Liquid braces on purpose: a tag inside a comment block is
    still parsed for block structure, so an `if` written here opens a real one
    and the endcomment then closes the wrong thing. That broke the build.)
  {%- endcomment -%}
  {%- assign pubs = site.data.publications -%}

  {%- if pubs and pubs.size > 0 -%}
    {%- assign sorted = pubs | sort: "date" | reverse -%}
    <ul class="pub-list">
      {%- for p in sorted %}
      <li class="pub-item">
        <div class="meta">
          <span class="pub-kind">{{ p.kind | default: "paper" }}</span>
          {%- if p.date %}
          <span aria-hidden="true">&middot;</span>
          <time datetime="{{ p.date | date_to_xmlschema }}">{{ p.date | date: site.date_format }}</time>
          {%- endif %}
          {%- if p.venue %}
          <span aria-hidden="true">&middot;</span><span class="pub-venue">{{ p.venue }}</span>
          {%- endif %}
        </div>

        <h2>
          {%- if p.url -%}
            <a href="{{ p.url }}" rel="noopener">{{ p.title }}</a>
          {%- else -%}
            {{ p.title }}
          {%- endif -%}
        </h2>

        {%- if p.authors and p.authors.size > 0 %}
        <p class="pub-authors">
          {%- for a in p.authors -%}
            {{ a }}{%- unless forloop.last %}, {% endunless -%}
          {%- endfor -%}
        </p>
        {%- endif %}

        {%- if p.note %}<p class="pub-note">{{ p.note }}</p>{% endif %}

        {%- assign has_links = false -%}
        {%- if p.slides or p.video or p.code %}{% assign has_links = true %}{% endif -%}
        {%- if has_links %}
        <p class="pub-links">
          {%- if p.slides %}<a href="{{ p.slides | relative_url }}">slides</a>{% endif -%}
          {%- if p.video %}<a href="{{ p.video }}" rel="noopener">video</a>{% endif -%}
          {%- if p.code %}<a href="{{ p.code | relative_url }}">code</a>{% endif -%}
        </p>
        {%- endif %}
      </li>
      {%- endfor %}
    </ul>
  {%- else -%}
    <p class="empty">Nothing here yet &mdash; the first one is in progress.</p>
  {%- endif -%}
</div>
