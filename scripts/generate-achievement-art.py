#!/usr/bin/env python3
"""Original Acquire achievement compositions; Pillow 11.3.0, CairoSVG 2.8.2."""
from pathlib import Path
import hashlib
import io
import json
import math
import cairosvg
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/admin/achievement-art'
OUT.mkdir(exist_ok=True)
SOURCE = ROOT / 'docs/admin/pictogram.svg'
PICTOGRAM = SOURCE.read_text()
BOARD = PICTOGRAM[PICTOGRAM.index('<rect'):PICTOGRAM.rindex('</svg>')]
NAVY, CREAM, GOLD, ORANGE, CYAN, GREEN = '#142e3b', '#fff2d5', '#efbd57', '#b44906', '#21c5e2', '#8ec99b'


def rect(x, y, w, h, fill, r=3):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{NAVY}" stroke-width="3"/>'


def path(d, color=GOLD, width=5):
    return f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round" stroke-linejoin="round"/>'


def board(x=78, y=47, size=100):
    return rect(x-5, y-5, size+10, size+10, CREAM, 6) + f'<g data-pictogram="actual" transform="translate({x} {y}) scale({size/100})">{BOARD}</g>'


def person(x, y, color=CREAM):
    return f'<g data-investor="true"><circle cx="{x}" cy="{y-8}" r="7" fill="{color}"/>' + rect(x-11, y+1, 22, 15, color, 7) + '</g>'


def crown(x=104, y=24):
    return f'<path d="M{x} {y} l10 9 14 -15 14 15 10 -9 -5 24 h-38Z" fill="{GOLD}" stroke="{NAVY}" stroke-width="3"/>'


def cert(x, y, color=CYAN, w=28, h=36):
    return rect(x, y, w, h, CREAM) + rect(x+4, y+4, w-8, 9, color, 1) + path(f'M{x+6} {y+22} h{w-12} M{x+6} {y+28} h{w-12}', NAVY, 2)


def arrow(x, y, length=30):
    return path(f'M{x} {y} h{length} m-9 -7 9 7 -9 7', GOLD, 5)


def label(text, x, y, size=24):
    return f'<text x="{x}" y="{y}" text-anchor="middle" fill="{CREAM}" font-family="DejaVu Sans" font-size="{size}" font-weight="bold">{text}</text>'


def tray(x=84, y=197, w=90):
    return path(f'M{x} {y-14} v19 h{w} v-19', CREAM, 6) + path(f'M{x+w-19} {y-9} l6 6 12 -15', GREEN, 5)


ART = {}
ART['win'] = crown() + board(70, 66, 116) + path('M89 202 Q37 166 47 106 M167 202 Q219 166 209 106')
for y in [122, 143, 164, 184]:
    ART['win'] += path(f'M{49+(y-122)*.35} {y} l-12 -10 M{207-(y-122)*.35} {y} l12 -10', GOLD, 7)
for n in range(2, 7):
    if n == 2:
        table = rect(54, 73, 148, 116, '#355363', 24)
        points = [(32, 127), (224, 127)]
    elif n == 6:
        table = rect(62, 57, 132, 145, '#355363', 18)
        points = [(x, y) for x in [38, 218] for y in [76, 128, 180]]
    else:
        angles = [-math.pi/2+i*2*math.pi/n for i in range(n)]
        coords = [(128+78*math.cos(a), 131+78*math.sin(a)) for a in angles]
        table = '<polygon points="'+' '.join(f'{x},{y}' for x,y in coords)+f'" fill="#355363" stroke="{GOLD}" stroke-width="3"/>'
        points = [(128+100*math.cos(a), 129+100*math.sin(a)) for a in angles]
    ART[f'win-{n}-players'] = table + board(86, 87, 84) + ''.join(person(x,y) for x,y in points) + crown(104, 191)
ART['team-win'] = board(78, 46, 100) + person(76, 180) + person(180, 180) + path('M88 190 Q128 210 168 190 M85 168 L99 150 M171 168 L157 150', CREAM, 8) + crown(104, 199)
ART['four-hands-win'] = board(91, 34, 74) + person(128, 130) + path('M128 149 V158 H78 V169 M128 158 H178 V169', CREAM, 5) + cert(56, 171, ORANGE, 44, 42) + cert(156, 171, CYAN, 44, 42) + crown(104, 202)
ART['found-three-chains'] = board(82, 30, 92)
for x, c, h in [(52, ORANGE, 44), (109, CYAN, 62), (166, GREEN, 52)]:
    ART['found-three-chains'] += rect(x-5, 204, 48, 12, CREAM) + rect(x, 204-h, 38, h, c) + path(f'M{x+9} {214-h} v{h-20} M{x+28} {214-h} v{h-20}', CREAM, 4)
for name, third in [('make-merger', False), ('three-chain-merger', True)]:
    ART[name] = board(68, 100, 120) + path('M128 80 V143 m-8 -9 8 9 8 -9', GOLD, 5) + rect(112, 46, 32, 32, '#1e1e1e') + path('M104 53 V29 Q104 20 113 24 L130 37 H150 Q163 39 154 51 L145 57', CREAM, 7)
    if third:
        ART[name] += rect(42, 64, 40, 31, GREEN) + path('M48 72 l20 16 M60 69 l16 12', NAVY, 3) + path('M61 102 L115 151', GOLD, 5)
ART['trade-six-shares'] = board(91, 29, 74)
for i in range(6):
    ART['trade-six-shares'] += cert(46+(i%3)*26, 119+(i//3)*40, ORANGE, 23, 35)
for i in range(3):
    ART['trade-six-shares'] += cert(169, 116+i*29, CYAN, 34, 27)
ART['trade-six-shares'] += arrow(126, 146, 29) + path('M156 179 H127 m8 -7 -8 7 8 7', GOLD, 4)
ART['ten-share-investor'] = board(89, 28, 78)
for i in range(3):
    ART['ten-share-investor'] += cert(49+i*8, 139-i*8, ORANGE, 43, 55)
ART['ten-share-investor'] += label('10', 86, 217, 23) + arrow(113, 160, 30) + rect(155, 147, 46, 27, GREEN) + tray(150, 193, 59)
ART['three-chain-portfolio'] = board(90, 27, 76)
for x,c in [(48,ORANGE),(109,CYAN),(170,GREEN)]:
    ART['three-chain-portfolio'] += cert(x, 122, c, 36, 42) + path(f'M{x+18} 170 L128 190', GOLD, 3)
ART['three-chain-portfolio'] += rect(89, 190, 78, 29, CREAM) + path('M128 194 V216 M97 201 H119 M137 201 H159', NAVY, 3)
ART['luxury-investor'] = board(89, 28, 78)
for i in range(3):
    ART['luxury-investor'] += cert(48+i*7, 141-i*7, CYAN, 48, 62)
ART['luxury-investor'] += path('M69 167 V146 L79 138 89 146 V167 M76 151 V161 M83 151 V161', NAVY, 3) + label('10', 88, 219) + arrow(117, 163, 28) + rect(157, 149, 44, 25, GREEN) + tray(150, 196, 59)
ART['thirty-thousand'] = board(79, 30, 98) + rect(48, 155, 49, 57, CREAM) + path('M60 163 V205 M68 169 H87 M68 180 H87', NAVY, 3)
for i in range(3):
    ART['thirty-thousand'] += rect(112+i*9, 160-i*8, 60, 26, GREEN)
ART['thirty-thousand'] += tray(107, 199, 88) + label('30k', 145, 229, 22)
ART['fifty-thousand'] = rect(62, 37, 142, 176, '#587381', 12) + rect(77, 49, 112, 146, NAVY, 6) + board(91, 57, 84) + path('M60 60 L31 80 V183 L60 206Z', CREAM, 7)
for x in [85, 139]:
    ART['fifty-thousand'] += rect(x, 159, 43, 24, GREEN) + path(f'M{x+21} 161 V181', CREAM, 5)
ART['fifty-thousand'] += path('M177 203 l7 7 15 -18', GREEN, 6) + label('50k', 125, 232, 22)

manifest = {'game': 'acquire', 'engineVersion': '0.0.10', 'revision': 2,
            'pictogram': {'path': 'docs/admin/pictogram.svg', 'sha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest()},
            'license': 'AGPL-3.0-only', 'assets': []}
images = []
for id, composition in ART.items():
    key = 'achievement-'+id
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="512" height="512"><title>Acquire: {id}</title><circle cx="128" cy="128" r="125" fill="{NAVY}" stroke="{GOLD}" stroke-width="4"/>{composition}</svg>\n'
    (OUT / (key+'.svg')).write_text(svg)
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=512, output_height=512)
    (OUT / (key+'.png')).write_bytes(png)
    images.append(Image.open(io.BytesIO(png)).convert('RGBA'))
    manifest['assets'].append({'id': id, 'key': key, 'svg': key+'.svg', 'png': key+'.png', 'width': 512, 'height': 512, 'svgSha256': hashlib.sha256(svg.encode()).hexdigest(), 'pngSha256': hashlib.sha256(png).hexdigest()})
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent='\t')+'\n')
for size in [32, 48, 64, 160]:
    sheet = Image.new('RGB', (1000, 17*(size+18)), '#ffffff')
    draw = ImageDraw.Draw(sheet)
    for row, ((id,_), im) in enumerate(zip(ART.items(), images)):
        y = row*(size+18)
        draw.text((8,y+size//2), id, fill='#142e3b')
        for x,bg in [(280,'#ffffff'),(440,'#142e3b'),(600,'#ffffff'),(780,'#142e3b')]:
            draw.rectangle((x,y,x+size+12,y+size+12), fill=bg)
            small = im.resize((size,size), Image.Resampling.LANCZOS)
            if x >= 600:
                mask = Image.new('L',(size,size)); ImageDraw.Draw(mask).ellipse((0,0,size-1,size-1),fill=255)
                small.putalpha(mask)
            sheet.paste(small,(x+6,y+6),small)
    sheet.save(OUT / f'contact-{size}.png')
print(f'Generated {len(ART)} original compositions in {OUT}')
