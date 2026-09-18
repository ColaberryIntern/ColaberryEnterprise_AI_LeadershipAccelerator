"""finalize.py: turn a picked 1536x1024 concept into the 16:9 file the sites serve.

Step 4 of README.md. Local, deterministic, no network.

    # crop only (the offset keeps the words on screen; check the sheet)
    python finalize.py crop <picked.png> <out.jpg> --top 20

    # draw an edit mask: TRANSPARENT inside the polygon (what edit.js may repaint)
    python finalize.py mask <picked.png> <mask.png> --poly "1118,560 1462,548 1414,812 1110,812"

    # paste ONLY the polygon from an edit back onto the untouched original
    python finalize.py composite <picked.png> <edited.png> <out.png> --poly "..."

    # one sheet of several finals at 768 px, to check every crop in one look
    python finalize.py sheet <out.jpg> a.jpg b.jpg ...

WHY 16:9 AT 1536x864. Every walkthrough video is 1920x1080 and the player's poster box is
16/9; index cards crop to 16/10 and the social preview to about 1.91/1, so one 16:9 file
serves the cover, the poster and the card. 1536 wide is the source width: cropping never
upscales. The top offset is chosen per picture because the hook words sit at the top.

WHY THE COMPOSITE EXISTS. The image model treats a mask as a hint (see edit.js), so an
edit is only ever used inside its polygon, feathered 6 px, on top of the original.
"""
import argparse
import sys

from PIL import Image, ImageDraw, ImageFilter

W, H = 1536, 1024
OUT_H = 864


def poly(text):
    pts = []
    for pair in text.split():
        x, y = pair.split(',')
        pts.append((int(x), int(y)))
    if len(pts) < 3:
        raise SystemExit('ContractViolation: a polygon needs at least 3 points')
    return pts


def load(path):
    im = Image.open(path).convert('RGB')
    if im.size != (W, H):
        raise SystemExit(f'ContractViolation: {path} is {im.size}, expected {(W, H)}')
    return im


def crop(args):
    top = args.top
    if top < 0 or top + OUT_H > H:
        raise SystemExit(f'ContractViolation: --top must be 0..{H - OUT_H}')
    load(args.src).crop((0, top, W, top + OUT_H)).save(args.out, quality=86, optimize=True, progressive=True)
    print(f'wrote {args.out} 1536x864 from top {top}')


def mask(args):
    load(args.src)
    m = Image.new('RGBA', (W, H), (0, 0, 0, 255))
    ImageDraw.Draw(m).polygon(poly(args.poly), fill=(0, 0, 0, 0))
    m.save(args.out)
    print(f'wrote {args.out}')


def composite(args):
    orig, edited = load(args.src), load(args.edited)
    m = Image.new('L', (W, H), 0)
    ImageDraw.Draw(m).polygon(poly(args.poly), fill=255)
    Image.composite(edited, orig, m.filter(ImageFilter.GaussianBlur(6))).save(args.out)
    print(f'wrote {args.out}')


def sheet(args):
    tiles = [Image.open(p).convert('RGB').resize((768, 432), Image.LANCZOS) for p in args.files]
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    out = Image.new('RGB', (cols * 778 + 10, rows * 442 + 10), (18, 18, 18))
    for i, t in enumerate(tiles):
        out.paste(t, (10 + (i % cols) * 778, 10 + (i // cols) * 442))
    out.save(args.out, quality=80)
    print(f'wrote {args.out} ({len(tiles)} tiles)')


def main(argv):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('crop'); c.add_argument('src'); c.add_argument('out'); c.add_argument('--top', type=int, required=True); c.set_defaults(fn=crop)
    m = sub.add_parser('mask'); m.add_argument('src'); m.add_argument('out'); m.add_argument('--poly', required=True); m.set_defaults(fn=mask)
    k = sub.add_parser('composite'); k.add_argument('src'); k.add_argument('edited'); k.add_argument('out'); k.add_argument('--poly', required=True); k.set_defaults(fn=composite)
    s = sub.add_parser('sheet'); s.add_argument('out'); s.add_argument('files', nargs='+'); s.set_defaults(fn=sheet)
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == '__main__':
    main(sys.argv[1:])
