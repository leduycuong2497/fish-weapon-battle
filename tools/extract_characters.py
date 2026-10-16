"""
Cắt nhân vật & vũ khí từ ảnh concept (bảng 8 loài cá) và tách nền bằng rembg.

Dùng:  python tools/extract_characters.py <đường-dẫn-ảnh-concept>
Kết quả: public/art/fish/<loài>.png   (giữ nguyên vũ khí cầm tay — dùng cho thẻ/cut-in)
         public/art/fish/<loài>_battle.png (đã xóa vũ khí cầm tay — dùng trong trận, vũ khí xoay riêng)
         public/art/weapons/<loại>.png (đã xoay nằm ngang, mũi hướng sang phải)
Cần: pip install "rembg[cpu]" pillow numpy
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

os.environ.setdefault('NUMBA_CACHE_DIR', os.path.join(os.path.dirname(__file__), '..', '.cache', 'numba'))
os.environ.setdefault('U2NET_HOME', os.path.join(os.path.dirname(__file__), '..', '.cache', 'u2net'))
from rembg import new_session, remove  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT_FISH = os.path.join(ROOT, 'public', 'art', 'fish')
OUT_WEAPON = os.path.join(ROOT, 'public', 'art', 'weapons')

# vùng ảnh lớn của từng loài trên bảng concept 1312×1199
FISH = {
    'swordfish': (0, 42, 328, 262),
    'pufferfish': (330, 40, 655, 268),
    'piranha': (658, 40, 985, 268),
    'stingray': (988, 40, 1312, 262),
    'shark': (0, 628, 328, 860),
    'tilapia': (330, 640, 655, 862),
    'arowana': (658, 640, 985, 855),
    'seahorse': (988, 640, 1312, 875),
}

# vùng đuôi/vây tối màu mà rembg hay bỏ sót (tọa độ trên bảng concept) → khôi phục bằng GrabCut
TAILS = {
    # ('grab', hình chữ nhật): GrabCut tự tách; ('poly', đa giác): đường viền vẽ tay theo ảnh gốc
    'swordfish': [('poly', [(3, 57), (14, 62), (26, 74), (36, 90), (42, 104), (50, 116), (58, 124), (60, 150), (50, 158),
                            (46, 180), (40, 200), (30, 210), (33, 195), (36, 175), (37, 150), (35, 130), (28, 110), (20, 92), (12, 76)])],
    'pufferfish': [('grab', (358, 96, 412, 170))],
    'piranha': [
        ('poly', [(699, 78), (704, 82), (712, 92), (718, 104), (724, 118), (730, 126), (734, 140), (730, 158), (726, 162),
                  (720, 170), (710, 182), (700, 192), (688, 191), (692, 180), (700, 165), (708, 150), (712, 135), (708, 118),
                  (702, 100), (698, 88)]),
        ('poly', [(724, 166), (735, 165), (746, 178), (752, 195), (748, 210), (740, 213), (724, 215), (726, 200), (722, 185)]),
        ('poly', [(754, 178), (790, 180), (790, 206), (770, 205), (760, 195)]),
    ],
    # đuôi roi của cá đuối không có trong ảnh → vẽ thêm (nằm dưới thân): gốc, điểm uốn, ngọn, độ dày gốc
    'stingray': [('paint', ((1158, 142), (1222, 116), (1292, 58), 8))],
    'shark': [('poly', [(16, 688), (22, 692), (30, 705), (38, 722), (44, 738), (52, 750), (56, 762), (50, 772), (42, 790),
                        (38, 810), (34, 830), (31, 833), (30, 825), (32, 800), (34, 780), (36, 765), (32, 745), (26, 725), (20, 705)])],
}

# vùng vũ khí cầm tay cần xóa ở bản dùng trong trận (tọa độ trong ảnh đã cắt, đa giác)
ERASE = {
    'tilapia': [[(150, 150), (325, 95), (325, 222), (150, 222)]],
    'arowana': [[(60, 185), (327, 105), (327, 140), (85, 215), (60, 215)]],
    'seahorse': [
        [(159, 171), (204, 145), (212, 160), (165, 188)],  # cán móc
        [(200, 120), (280, 120), (280, 205), (200, 205)],  # lưỡi móc cong
        [(64, 122), (92, 122), (92, 152), (64, 152)],  # bọt nước dính vây lưng
        [(48, 86), (82, 86), (82, 122), (48, 122)],
        [(152, 176), (163, 168), (168, 186), (156, 193)],  # đầu cán móc chạm đuôi
    ],
}

# ô vũ khí: (vùng cắt, các hình chữ nhật cần bỏ — chữ tiêu đề/viền ô, cách tách)
WEAPONS = {
    'sword': ((20, 396, 310, 480), [(0, 0, 95, 22)], 'color'),
    'blades': ((686, 402, 828, 480), [], 'color'),
    'electric': ((4, 0, 0, 0), [], 'color'),  # thay bên dưới
    'jaws': ((20, 987, 312, 1068), [], 'ai-solid'),
    'mace': ((347, 990, 643, 1066), [(0, 0, 90, 14)], 'color-dark'),
    'spear': ((678, 989, 963, 1058), [(0, 0, 76, 14)], 'color'),
    'hook': ((1063, 975, 1291, 1071), [], 'color-keep'),  # giữ hướng gốc (cán nằm ngang, móc cong lên)
}
WEAPONS['electric'] = ((1004, 402, 1298, 480), [(0, 0, 100, 18)], 'color')


def seg_by_color(crop, drop, thresh=58):
    """Tách vật thể sáng khỏi nền tối gần đồng màu: khoảng cách màu tới màu nền (trung vị viền ô)."""
    from scipy import ndimage

    a = np.array(crop).astype(np.float32)
    h, w = a.shape[:2]
    border = np.concatenate([a[3, :], a[-4, :], a[:, 3], a[:, -4]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    alpha = np.clip((dist - thresh * 0.6) / (thresh * 0.8), 0, 1) * 255
    for x0, y0, x1, y1 in drop:
        alpha[int(y0 * h / crop.height * 1):, :] = alpha[int(y0 * h / crop.height * 1):, :]
    m = alpha > 40
    lab, n = ndimage.label(ndimage.binary_dilation(m, iterations=2))
    if n > 1:
        sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
        big = sizes.max()
        for i, sz in enumerate(sizes, start=1):
            if sz < big * 0.08:
                alpha[lab == i] = 0
    out = crop.convert('RGBA')
    out.putalpha(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)))
    return out


def trim(img, pad=4):
    a = np.array(img.split()[-1])
    ys, xs = np.where(a > 24)
    if not len(xs):
        return img
    return img.crop((max(0, xs.min() - pad), max(0, ys.min() - pad), min(img.width, xs.max() + pad), min(img.height, ys.max() + pad)))


def clean_alpha(img, cut=70, keep=0.04, solid=True):
    """Bỏ vùng bán trong suốt (bóng mờ, vệt sáng), bỏ đốm lẻ (bọt nước) — chỉ giữ các khối lớn."""
    from scipy import ndimage

    a = np.array(img.split()[-1]).astype(np.float32)
    a[a < cut] = 0
    lab, n = ndimage.label(a > 0)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        big = sizes.max()
        for i, sz in enumerate(sizes, start=1):
            if sz < big * keep:
                a[lab == i] = 0
    if solid:
        # thân cá phải đặc: lấp lỗ và làm đục phần bên trong (rembg hay để bụng/vây bán trong suốt)
        inner = ndimage.binary_erosion(ndimage.binary_fill_holes(a > 50), iterations=3)
        a = np.maximum(a, inner * 255.0)
    out = img.copy()
    out.putalpha(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)))
    return out


def recover_tails(crop, cut, name, box, S=2):
    """Thêm lại đuôi/vây mà rembg bỏ sót: đa giác vẽ tay, hoặc GrabCut trong một vùng."""
    import cv2

    if name not in TAILS:
        return cut
    a = np.array(cut.split()[-1]).astype(np.float32)
    add = np.zeros(a.shape, np.float32)
    img = None
    paints = []
    for kind, shape in TAILS[name]:
        if kind == 'paint':
            paints.append(shape)
            continue
        if kind == 'poly':
            m = Image.new('L', (a.shape[1], a.shape[0]), 0)
            ImageDraw.Draw(m).polygon([((x - box[0]) * S, (y - box[1]) * S) for x, y in shape], fill=255)
            add = np.maximum(add, np.array(m.filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32))
            continue
        if img is None:
            img = cv2.cvtColor(np.array(crop), cv2.COLOR_RGB2BGR)
        x0, y0, x1, y1 = shape
        region = np.zeros(a.shape, bool)
        region[max(0, (y0 - box[1]) * S):(y1 - box[1]) * S, max(0, (x0 - box[0]) * S):(x1 - box[0]) * S] = True
        mask = np.full(a.shape, cv2.GC_BGD, np.uint8)
        mask[cv2.dilate(region.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)] = cv2.GC_PR_BGD
        mask[region] = cv2.GC_PR_FGD
        mask[a > 128] = cv2.GC_FGD
        bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
        cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
        fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)) & region
        fg = cv2.morphologyEx(fg.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        add = np.maximum(add, cv2.GaussianBlur(fg.astype(np.float32) * 255, (5, 5), 0))
    out = crop.convert('RGBA')  # rembg xóa màu ở vùng nền → lấy lại màu gốc
    out.putalpha(Image.fromarray(np.maximum(a, add).astype(np.uint8)))
    for p0, pc, p1, w0 in paints:
        out = Image.alpha_composite(paint_tail(out.size, box, S, p0, pc, p1, w0), out)
    return clean_alpha(out, cut=60, keep=0.04)


def paint_tail(size, box, S, p0, pc, p1, w0):
    """Đuôi roi thon dần (đường cong bậc hai), màu xám xanh, sống đuôi phát sáng điện."""
    layer = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    pt = lambda q: ((q[0] - box[0]) * S, (q[1] - box[1]) * S)
    P0, PC, P1 = pt(p0), pt(pc), pt(p1)
    n = 60
    pts = []
    for i in range(n + 1):
        t = i / n
        x = (1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * PC[0] + t * t * P1[0]
        y = (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * PC[1] + t * t * P1[1]
        pts.append((x, y, max(1.0, w0 * S * (1 - t) ** 1.3)))
    for x, y, r in pts:
        d.ellipse((x - r - 1.5, y - r - 1.5, x + r + 1.5, y + r + 1.5), fill=(225, 235, 245, 255))
    for x, y, r in pts:
        d.ellipse((x - r, y - r, x + r, y + r), fill=(52, 64, 92, 255))
    for i in range(len(pts) - 1):
        (x, y, r), (x2, y2, _) = pts[i], pts[i + 1]
        d.line((x, y - r * 0.35, x2, y2 - r * 0.35), fill=(120, 205, 255, 255), width=max(1, int(r * 0.35)))
    glow = layer.filter(ImageFilter.GaussianBlur(5))
    g = np.array(glow).astype(np.float32)
    g[..., :3] = (80, 180, 255)
    g[..., 3] *= 0.6
    return Image.alpha_composite(Image.fromarray(g.astype(np.uint8)), layer.filter(ImageFilter.GaussianBlur(0.6)))


def principal_angle(img):
    a = np.array(img.split()[-1])
    ys, xs = np.where(a > 60)
    pts = np.stack([xs - xs.mean(), ys - ys.mean()])
    cov = pts @ pts.T / pts.shape[1]
    w, v = np.linalg.eigh(cov)
    d = v[:, np.argmax(w)]
    return np.degrees(np.arctan2(d[1], d[0]))


def main(path):
    os.makedirs(OUT_FISH, exist_ok=True)
    os.makedirs(OUT_WEAPON, exist_ok=True)
    sheet = Image.open(path).convert('RGB')
    session = new_session('isnet-general-use')
    only = sys.argv[2].split(',') if len(sys.argv) > 2 else None
    for name, box in FISH.items():
        if only and name not in only:
            continue
        crop = sheet.crop(box).resize(((box[2] - box[0]) * 2, (box[3] - box[1]) * 2), Image.LANCZOS)
        cut = clean_alpha(remove(crop, session=session))
        cut = recover_tails(crop, cut, name, box)
        trim(cut).save(os.path.join(OUT_FISH, f'{name}.png'))
        battle = cut.copy()
        if name in ERASE:
            mask = Image.new('L', battle.size, 255)
            d = ImageDraw.Draw(mask)
            for poly in ERASE[name]:
                d.polygon([(x * 2, y * 2) for x, y in poly], fill=0)
            a = Image.fromarray(np.minimum(np.array(battle.split()[-1]), np.array(mask)))
            battle.putalpha(a)
            battle = clean_alpha(battle, cut=40, keep=0.12)
        trim(battle).save(os.path.join(OUT_FISH, f'{name}_battle.png'))
        print('fish', name)
    for name, (box, drop, mode) in WEAPONS.items():
        if only:
            break
        S = 3
        crop = sheet.crop(box)
        # che chữ tiêu đề / viền ô bằng màu nền trước khi tách
        if drop:
            arr = np.array(crop)
            bgc = np.median(np.concatenate([arr[-3, :], arr[:, -3]]), axis=0).astype(np.uint8)
            for x0, y0, x1, y1 in drop:
                arr[y0:y1, x0:x1] = bgc
            crop = Image.fromarray(arr)
        crop = crop.resize((crop.width * S, crop.height * S), Image.LANCZOS)
        if mode == 'ai-solid':
            cut = clean_alpha(remove(crop, session=session), cut=60)
            a = np.array(cut.split()[-1]).astype(np.float32)
            cut.putalpha(Image.fromarray(np.clip(a * 2.2, 0, 255).astype(np.uint8)))
        elif mode == 'color-dark':
            cut = seg_by_color(crop, [], thresh=30)
        else:
            cut = seg_by_color(crop, [])
        cut = trim(cut, 2)
        ang = 0.0 if mode == 'color-keep' else principal_angle(cut)
        if abs(ang) > 90:
            ang -= 180 * np.sign(ang)
        cut = cut.rotate(ang, resample=Image.BICUBIC, expand=True)
        trim(cut, 2).save(os.path.join(OUT_WEAPON, f'{name}.png'))
        print('weapon', name, f'xoay {ang:.1f}')


if __name__ == '__main__':
    main(sys.argv[1])
