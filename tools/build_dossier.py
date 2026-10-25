"""analyses/<target>/source.json + ui/index.json → dossier.json (AI용 단일 파일)

사용: python -I tools/build_dossier.py habitica
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load(p):
    if not os.path.exists(p):
        return {}
    with open(p, encoding='utf-8') as f:
        return json.load(f)


def main(target):
    base = os.path.join(ROOT, 'analyses', target)
    src = load(os.path.join(base, 'source.json'))
    ui = load(os.path.join(base, 'ui', 'index.json'))
    extra = load(os.path.join(base, 'synthesis.json'))
    images = ui.get('images', [])
    evidence = list(src.get('evidence', []))
    for im in images:
        evidence.append({'id': im['id'], 'kind': 'image', 'path': 'ui/' + im['file'].split('ui/', 1)[-1] if 'file' in im else '',
                         'note': im.get('screen', ''), 'sha256': im.get('sha256')})
    dossier = {
        'format_version': 1,
        'built_at': datetime.date.today().isoformat(),
        'target': src.get('target', {}),
        'listing': ui.get('listing', {}),
        'evidence': evidence,
        'findings': src.get('findings', []) + ui.get('findings', []) + extra.get('findings', []),
        'screens': src.get('screens', []),
        'ui_images': images,
        'design_tokens': src.get('design_tokens', {}),
        'api': src.get('api', {}),
        'synthesis': extra.get('synthesis', {}),
        'unknowns': src.get('unknowns', []) + ui.get('unknowns', []) + extra.get('unknowns', []),
    }
    ids = [e['id'] for e in evidence]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        print('중복 증거 id:', sorted(dup), file=sys.stderr)
    missing = sorted({r for f in dossier['findings'] for r in f.get('evidence', []) if r not in ids})
    if missing:
        print('없는 증거를 가리키는 결론:', missing, file=sys.stderr)
    out = os.path.join(base, 'dossier.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(dossier, f, ensure_ascii=False, indent=1)
    print('wrote', out, {k: len(v) for k, v in dossier.items() if isinstance(v, list)})


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'habitica')
