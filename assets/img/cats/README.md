# Cats of gkarchemsky.com

Drop cat photos in this folder and the 404 page picks one at random on every
visit. Nothing else needs editing — the page reads whatever is here at build
time.

## Naming

The filename becomes the caption, so name the file after the cat:

    mochi.jpg          -> "Mochi"
    simba.jpg          -> "Simba"
    lord-fluffington.jpg -> "Lord Fluffington"

Hyphens and underscores become spaces; the extension is dropped.

## Format and size

`.jpg`, `.png` or `.webp`. Square-ish crops look best — the page renders them
in a fixed square frame with `object-fit: cover`.

Keep them small; this is a 404 page, not a gallery:

```bash
# resize to 800px and strip EXIF (phone photos carry GPS coordinates)
sips -Z 800 -s format jpeg -s formatOptions 80 IMG_1234.heic --out mochi.jpg
```

> [!IMPORTANT]
> Strip EXIF before committing. Photos taken at home are geotagged with your
> home address, and this folder is public.

With no photos here the 404 page still works — it just renders without one.
