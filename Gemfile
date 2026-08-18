source "https://rubygems.org"

# Matches what GitHub Pages runs, so local previews match production.
# https://pages.github.com/versions/
gem "github-pages", group: :jekyll_plugins

group :jekyll_plugins do
  gem "jekyll-feed"
  gem "jekyll-seo-tag"
  gem "jekyll-sitemap"
end

# Ruby 3.x no longer bundles these.
gem "webrick", "~> 1.8"
gem "csv"
gem "base64"
gem "bigdecimal"

platforms :mingw, :x64_mingw, :mswin, :jruby do
  gem "tzinfo", ">= 1", "< 3"
  gem "tzinfo-data"
end
