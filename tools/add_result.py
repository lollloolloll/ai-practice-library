"""실제 생성 결과를 사전에 등록해요.

사용 예:
  python -I tools/add_result.py image rim-light 결과.png --model "Midjourney V7" --prompt "Portrait of ..., rim light"
  python -I tools/add_result.py video dolly-zoom clip.mp4 --model "Veo 3.1"
  python -I tools/add_result.py --list            # 등록된 결과 보기
  python -I tools/add_result.py --remove image rim-light

파일은 assets/results/<분야>/<용어id>.<확장자>로 복사되고,
data/results-media.js에 기록돼요. 같은 용어에 다시 올리면 덮어써요.
"""
import argparse, datetime, json, os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'results-media.js')
DB = os.path.join(ROOT, 'data', 'results-media.json')
FIELDS = {'image', 'video', 'editing', 'audio', '3d', 'design'}
TYPES = {'.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image', '.gif': 'image',
         '.mp4': 'video', '.webm': 'video', '.mp3': 'audio', '.wav': 'audio', '.ogg': 'audio', '.m4a': 'audio'}


def load():
    if os.path.exists(DB):
        with open(DB, encoding='utf-8') as f:
            return json.load(f)
    return {}


def save(db):
    with open(DB, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=1)
    lines = ['window.PD_RESULTS = window.PD_RESULTS || {};']
    for field, terms in sorted(db.items()):
        js = json.dumps(terms, ensure_ascii=False).replace('</', '<\\/')
        lines.append('(function(R){R.terms=Object.assign(R.terms||{},%s);})(window.PD_RESULTS[%s]=window.PD_RESULTS[%s]||{});'
                     % (js, json.dumps(field), json.dumps(field)))
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')


def term_exists(field, tid):
    with open(os.path.join(ROOT, 'research', field + '.json'), encoding='utf-8') as f:
        return any(t['id'] == tid for t in json.load(f)['terms'])


def main():
    ap = argparse.ArgumentParser(description='실제 생성 결과 등록')
    ap.add_argument('field', nargs='?')
    ap.add_argument('term', nargs='?')
    ap.add_argument('file', nargs='?')
    ap.add_argument('--model', default='')
    ap.add_argument('--prompt', default='')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--remove', action='store_true')
    a = ap.parse_args()
    db = load()

    if a.list:
        for field, terms in db.items():
            for tid, arr in terms.items():
                print(field, tid, arr[0]['src'], arr[0].get('model', ''))
        return
    if a.field not in FIELDS or not a.term:
        sys.exit('분야(image|video|editing|audio|3d|design)와 용어 id를 적어 주세요')
    if not term_exists(a.field, a.term):
        sys.exit('이 분야에 없는 용어 id예요: ' + a.term)
    if a.remove:
        entry = db.get(a.field, {}).pop(a.term, None)
        if entry:
            p = os.path.join(ROOT, entry[0]['src'])
            if os.path.exists(p):
                os.remove(p)
        save(db)
        print('지웠어요' if entry else '등록된 결과가 없어요')
        return
    if not a.file or not os.path.exists(a.file):
        sys.exit('결과 파일을 찾지 못했어요')
    ext = os.path.splitext(a.file)[1].lower()
    if ext not in TYPES:
        sys.exit('지원하는 형식: ' + ', '.join(sorted(TYPES)))
    rel = 'assets/results/%s/%s%s' % (a.field, a.term, ext)
    os.makedirs(os.path.dirname(os.path.join(ROOT, rel)), exist_ok=True)
    shutil.copyfile(a.file, os.path.join(ROOT, rel))
    db.setdefault(a.field, {})[a.term] = [{
        'src': rel, 'type': TYPES[ext], 'model': a.model, 'prompt': a.prompt,
        'date': datetime.date.today().isoformat(),
    }]
    save(db)
    print('등록했어요:', rel)


if __name__ == '__main__':
    main()
