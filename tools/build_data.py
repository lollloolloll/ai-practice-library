"""research/*.json (+ research/ko/*.json 문체 수정본) → data/dict.js

사용: python -I tools/build_data.py
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'research')
KO = os.path.join(RES, 'ko')
OUT = os.path.join(ROOT, 'data', 'dict.js')

FIELDS = [
    # id, 한국어 이름, 결과 방식
    ('image', '이미지', 'render'),
    ('video', '동영상', 'render'),
    ('editing', '영상 편집', 'render'),
    ('audio', '음악·사운드', 'render'),
    ('3d', '3D', 'render'),
    ('design', '디자인', 'render'),
    ('writing', '글쓰기', 'results'),
    ('coding', '코딩', 'results'),
]

TERM_KEYS = ['id', 'term', 'ko', 'category', 'tags', 'effect_ko', 'snippet',
             'compare_with', 'tools', 'level', 'sources']


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def overrides(field):
    p = os.path.join(KO, field + '.json')
    return load(p) if os.path.exists(p) else {}


def apply(item, ov):
    if not ov:
        return item
    for k, v in ov.items():
        if isinstance(v, (str, list)) and v:
            item[k] = v
    return item


def main():
    data = {'fields': [], 'categories': {}, 'bases': {}, 'terms': [],
            'combos': [], 'techniques': [], 'techCategories': [], 'briefs': []}

    for fid, ko, kind in FIELDS:
        src = load(os.path.join(RES, fid + '.json'))
        ov = overrides(fid)
        cats = [apply(dict(c), ov.get('categories', {}).get(c['id'])) for c in src['categories']]
        data['categories'][fid] = cats
        data['bases'][fid] = [apply(dict(b), ov.get('base_prompts', {}).get(b['id'])) for b in src.get('base_prompts', [])]
        ids = set()
        for t in src['terms']:
            if t['id'] in ids:
                print('dup term', fid, t['id'], file=sys.stderr)
                continue
            ids.add(t['id'])
            item = {k: t.get(k) for k in TERM_KEYS}
            item['field'] = fid
            apply(item, ov.get('terms', {}).get(t['id']))
            item['compare_with'] = [c for c in (item.get('compare_with') or []) if c in {x['id'] for x in src['terms']}]
            data['terms'].append(item)
        for c in src.get('combos', []):
            item = dict(c)
            item['field'] = fid
            item['term_ids'] = [i for i in c.get('term_ids', []) if i in ids]
            apply(item, ov.get('combos', {}).get(c['id']))
            data['combos'].append(item)
        for t in src.get('techniques', []):
            item = dict(t)
            item['field'] = fid
            item.setdefault('tags', [fid])
            item['category'] = item.get('category') or 'field'
            apply(item, ov.get('techniques', {}).get(t['id']))
            data['techniques'].append(item)
        data['fields'].append({'id': fid, 'ko': ko, 'kind': kind,
                               'terms': len(ids), 'combos': len(src.get('combos', [])),
                               'techniques': len(src.get('techniques', []))})

    inter = load(os.path.join(RES, 'interaction.json'))
    ov = overrides('interaction')
    data['techCategories'] = [apply(dict(c), ov.get('categories', {}).get(c['id'])) for c in inter['categories']]
    for t in inter['techniques']:
        item = dict(t)
        item['field'] = 'interaction'
        apply(item, ov.get('techniques', {}).get(t['id']))
        data['techniques'].append(item)
    for b in inter['brief_templates']:
        item = dict(b)
        o = ov.get('brief_templates', {}).get(b['id'], {})
        for k in ('name_ko', 'workflow_ko', 'filled_example_ko'):
            if o.get(k):
                item[k] = o[k]
        fo = o.get('fields', {})
        item['fields'] = [apply(dict(f), fo.get(f['key'])) for f in b['fields']]
        data['briefs'].append(item)

    data['meta'] = {'built': datetime.date.today().isoformat(),
                    'terms': len(data['terms']), 'combos': len(data['combos']),
                    'techniques': len(data['techniques']), 'briefs': len(data['briefs'])}

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    js = json.dumps(data, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('window.PD_DATA=' + js + ';\n')
    print('wrote', OUT, round(os.path.getsize(OUT) / 1024), 'KB', data['meta'])


if __name__ == '__main__':
    main()
