# Cuts the captures (test/site-capture/cap-*.mjs) into the homepage's pictures: AVIF + WebP at the widths index.html
# asks for, into site-img/home/. Run the capture first, then: python3 test/site-capture/mkimg.py [desk phone thread
# brand week clients import] (all by default). CAP as for the captures; OUT defaults to <repo>/site-img/home/.
# After a desk re-take, desk-values.json says where index.html's live numbers, rings and pins go (mkimg prints them).
import json, os, sys
from PIL import Image
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAP = (os.environ.get('CAP') or os.path.join(ROOT, 'scratchpad-shots', 'site-capture')).rstrip('/') + '/'
OUT = (os.environ.get('OUT') or os.path.join(ROOT, 'site-img', 'home')).rstrip('/') + '/'
os.makedirs(OUT, exist_ok=True)

def save(im, name, widths, q_webp=84, q_avif=58):
    im = im.convert('RGB'); out = []
    for w in widths:
        h = round(im.height * w / im.width)
        r = im if w == im.width else im.resize((w, h), Image.LANCZOS)
        r.save(OUT + f'{name}-{w}.avif', 'AVIF', quality=q_avif, speed=4)
        r.save(OUT + f'{name}-{w}.webp', 'WEBP', quality=q_webp, method=6)
        out.append((w, h, os.path.getsize(OUT + f'{name}-{w}.avif') // 1024, os.path.getsize(OUT + f'{name}-{w}.webp') // 1024))
    print(name, out)
def one(im, name, q=88):   # a small layer: WebP only, at the capture's own 2x or 3x
    im = im.convert('RGB'); im.save(OUT + name + '.webp', 'WEBP', quality=q, method=6); print(name, im.size, os.path.getsize(OUT + name + '.webp') // 1024, 'KB')
def crop2(im, x, y, w, h):   # desk px (1440 x 900) to the 2x capture
    return im.crop((round(x * 2), round(y * 2), round((x + w) * 2), round((y + h) * 2)))

what = sys.argv[1:] or ['desk', 'phone', 'thread', 'brand', 'week', 'clients', 'import']

# --- Sam's laptop (cap-desk.mjs): the opening's screen, the camera's window, the list, what the window showed before.
if 'desk' in what:
    before = Image.open(CAP + 'desk-arjun-before.png'); after = Image.open(CAP + 'desk-arjun-after.png'); blank = Image.open(CAP + 'desk-arjun-blank.png')
    d = json.load(open(CAP + 'desk-values.json'))
    # The opening's laptop: Lifters, worst first, and Arjun's page before his set lands.
    save(before, 'desk-before', [960, 1440, 1920])
    # The camera's window (laptops): the same screen with the numbers that change left out (the page draws them live).
    save(blank, 'desk-live', [1440, 2880], q_avif=60)
    # What the window showed a moment ago, under the new marks: the total's chart, the squat line, the training bars, Arjun's row's marks.
    for key, nm in (('heroViz', 'was-hero2'), ('sqViz', 'was-sq2'), ('trViz', 'was-tr2'), ('rowPips', 'was-pips2')):
        x, y, w, h = d['before']['regions'][key]['rect']; pad = 2
        one(crop2(before, x - pad, y - pad, w + 2 * pad, h + 2 * pad), nm, q=90)
        print('   index.html #win .was:', 'left:%gpx;top:%gpx;width:%gpx;height:%gpx' % (round(x - pad, 1), round(y - pad, 1), round(w + 2 * pad, 1), round(h + 2 * pad, 1)))
    # Small screens: a true-size window onto Arjun's page (desk 668..1424 x 16..592), after and live, and the list.
    X0, Y0, W, H = 668, 16, 756, 576
    save(crop2(after, X0, Y0, W, H), 'win-after', [756, 1512], q_webp=86, q_avif=62)
    save(crop2(blank, X0, Y0, W, H), 'win-live', [756, 1512], q_webp=86, q_avif=62)
    for key, nm in (('heroViz', 'was-hero'), ('sqViz', 'was-sq')):
        x, y, w, h = d['before']['regions'][key]['rect']
        one(crop2(before, x, y, w, h), nm)
        print('   index.html #fwLive .was:', 'left:%gpx;top:%gpx;width:%gpx;height:%gpx' % (round(x - X0, 1), round(y - Y0, 1), round(w, 1), round(h, 1)))
    LX, LY = 248, 186
    save(crop2(after, LX, LY, 386, 700), 'win-list', [386, 772, 1158], q_avif=60)
    # Where the list's rows are: index.html's .grp / .mk (desk px) and .fpin (--y, list-crop px) follow them.
    for i, row in enumerate(d['after']['list'][:10]):
        x, y, w, h = row['rect']
        print('   row %2d  desk top %g  centre %g  crop centre %g  %s' % (i + 1, y, y + h / 2, y + h / 2 - LY, row['text'][:60]))
    k = d['after']['nodes']['rowKg']['rect']
    print('   index.html .ov-row (Arjun\'s row number): left:%gpx;top:%gpx' % (round(k[0], 1), round(k[1], 1)))

# --- Arjun's phone (cap-phone.mjs, iPhone app layout, 3x): Train with his top set, and a moment after Log set.
if 'phone' in what:
    save(Image.open(CAP + 'phone-train.png'), 'lifter-train', [590, 786, 1179])
    save(Image.open(CAP + 'phone-logged.png'), 'lifter-logged', [590, 786, 1179])

# --- Arjun's thread (cap-thread.mjs, 3x): the screen after the reply with the reply and the receipt painted out, then
# the reply, "Seen" and the earlier "Sent" as their own layers.
if 'thread' in what:
    k = 3
    aft = Image.open(CAP + 'thread-after.png').convert('RGB'); bef = Image.open(CAP + 'thread-before.png').convert('RGB')
    bg = aft.getpixel((int(380 * k), int(640 * k)))
    rep = (0, 494, 393, 610); seen = (280, 466, 380, 492); sent = (280, 583, 380, 609)
    base = aft.copy()
    base.paste(bg, (rep[0] * k, rep[1] * k, rep[2] * k, rep[3] * k)); base.paste(bg, (seen[0] * k, seen[1] * k, seen[2] * k, seen[3] * k))
    save(base, 'thread', [786, 1179])
    one(aft.crop(tuple(v * k for v in rep)), 'thread-reply')
    one(aft.crop(tuple(v * k for v in seen)), 'thread-seen')
    one(bef.crop(tuple(v * k for v in sent)), 'thread-sent')

# --- The lifter app wearing the coach's branding (cap-brand.mjs, 3x): its top 520 pt.
if 'brand' in what:
    save(Image.open(CAP + 'brand-train.png').crop((0, 0, 393 * 3, 520 * 3)), 'brand', [640, 960])

# --- Marcus's week as lifted, before and after Sam's rule is taken (cap-more.mjs).
if 'week' in what:
    save(crop2(Image.open(CAP + 'week-before.png'), 256, 325, 1160, 387), 'week-before', [1160, 2320], q_avif=60)
    save(crop2(Image.open(CAP + 'week-after.png'), 256, 325, 1160, 387), 'week-after', [1160, 2320], q_avif=60)

# --- Clients (cap-clients.mjs): the laptop's summary, and for phones its two cards that prove "who has paid", stacked.
if 'clients' in what:
    cl = crop2(Image.open(CAP + 'cl-before.png'), 256, 100, 992, 358).convert('RGB')
    save(cl, 'clients', [992, 1984], q_webp=86, q_avif=62)
    bg = cl.getpixel((990, 340))
    c1 = cl.crop((0, 14, 478, 318)); c2 = cl.crop((502, 14, 980, 318))
    m, gap = 12, 24
    ph = Image.new('RGB', (478 + 2 * m, c1.height + gap + c2.height + 2 * m), bg)
    ph.paste(c1, (m, m)); ph.paste(c2, (m + 4, m + c1.height + gap))
    save(ph, 'clients-ph', [251, 502], q_webp=86, q_avif=62)

# --- The history import's preview (cap-import.mjs, Nina's old log pasted in).
if 'import' in what:
    save(crop2(Image.open(CAP + 'import.png'), 472, 506, 496, 270), 'import', [496, 992], q_webp=86, q_avif=62)
