# LINE Seed Sans fonts (self-hosted)

These LINE Seed Sans TH web fonts are bundled and loaded by the app. The CSS in
`src/app/globals.css` references them by these filenames:

- `LINESeedSansTH_W_Rg.woff2` (weight 400) - included
- `LINESeedSansTH_W_Bd.woff2` (weight 700) - included
- `LINESeedSansTH_W_XBd.woff2` (weight 800) - included

TTF copies (same family) are used by `src/app/opengraph-image.tsx` / `next/og`
(Satori requires TTF/OTF, not WOFF2):

- `LINESeedSansTH-Regular.ttf`
- `LINESeedSansTH-Bold.ttf`
- `LINESeedSansTH-ExtraBold.ttf`

Source: the LINE Seed typeface (https://seed.line.me), distributed under the
SIL Open Font License 1.1. The `.woff2` builds here were fetched from the
`lazywasabi/thai-web-fonts` mirror (LINESeedSansTH), which also carries the
OFL license. They cover Thai + Latin.

To update or re-download:

```sh
BASE="https://cdn.jsdelivr.net/gh/lazywasabi/thai-web-fonts@7/fonts/LINESeedSansTH"
curl -fsSL "$BASE/LINESeedSansTH-Regular.woff2"   -o LINESeedSansTH_W_Rg.woff2
curl -fsSL "$BASE/LINESeedSansTH-Bold.woff2"      -o LINESeedSansTH_W_Bd.woff2
curl -fsSL "$BASE/LINESeedSansTH-ExtraBold.woff2" -o LINESeedSansTH_W_XBd.woff2
```

Regenerate TTF from WOFF2 (requires fonttools + brotli):

```sh
python3 -m venv /tmp/ogfont && source /tmp/ogfont/bin/activate
pip install fonttools brotli
python3 <<'PY'
from fontTools.ttLib import TTFont
from pathlib import Path
src = Path(".")
mapping = {
  "LINESeedSansTH_W_Rg.woff2": "LINESeedSansTH-Regular.ttf",
  "LINESeedSansTH_W_Bd.woff2": "LINESeedSansTH-Bold.ttf",
  "LINESeedSansTH_W_XBd.woff2": "LINESeedSansTH-ExtraBold.ttf",
}
for src_name, dest_name in mapping.items():
  font = TTFont(src / src_name)
  font.flavor = None
  font.save(src / dest_name)
PY
```
