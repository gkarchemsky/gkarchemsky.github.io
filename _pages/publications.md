---
# The nav link switches itself on whenever this page exists — set
# `published: false` to take the page and the link back out together.
layout: default
title: Publications
permalink: /publications/
description: Papers, talks and articles by George Karchemsky.
---

<div class="wrap">
  <header class="page-head">
    <h1>Publications</h1>
    <p class="lede">Papers, talks, and articles.</p>
  </header>

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
    <p class="empty">No publications yet &mdash; the first one is in progress.</p>
  {%- endif -%}
</div>
