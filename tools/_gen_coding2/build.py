import json, os, re, sys, glob
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'data', 'results-coding-2.js')

REACT_TPL = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>할 일 목록</title>
%TW%<style>
%CSS%
</style>
</head>
<body>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.24.7/babel.min.js"></script>
<script type="text/babel">
%CODE%
</script>
</body>
</html>"""

DEFAULT_CSS = """body { font-family: system-ui, sans-serif; background: #f4f4f5; display: flex; justify-content: center; padding: 40px 16px; margin: 0; }
.app { background: #fff; padding: 24px; border-radius: 10px; width: 100%; max-width: 380px; box-shadow: 0 2px 10px rgba(0,0,0,.08); }
h1 { margin: 0 0 16px; font-size: 22px; }
form { display: flex; gap: 8px; }
form input { flex: 1; padding: 8px 10px; border: 1px solid #d4d4d8; border-radius: 6px; }
button { padding: 8px 12px; border: 1px solid #d4d4d8; background: #fff; border-radius: 6px; cursor: pointer; }
button[type=submit] { background: #2563eb; color: #fff; border-color: #2563eb; }
.filters { display: flex; gap: 6px; margin: 14px 0 4px; }
.filters button.active { background: #18181b; color: #fff; border-color: #18181b; }
ul { list-style: none; padding: 0; margin: 8px 0; }
li { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
li span { flex: 1; word-break: break-all; }
li.done span { text-decoration: line-through; color: #a1a1aa; }
.count, .empty { color: #71717a; font-size: 13px; }
.error { color: #dc2626; font-size: 13px; margin: 6px 0 0; }"""

def parse(path):
    text = open(path, encoding='utf-8').read().replace('\r\n', '\n')
    entries = []
    cur = None; sect = None; buf = []
    def flush():
        nonlocal buf, sect
        if cur is None or sect is None:
            buf = []; return
        body = '\n'.join(buf).strip('\n')
        kind = sect[0]
        if kind == 'prompt': cur['prompt'] = body.strip()
        elif kind == 'code': cur['code'] = body
        elif kind == 'html': cur['html'] = body
        elif kind == 'css': cur['_css'] = body
        elif kind == 'reactsrc': cur['_reactsrc'] = body
        elif kind == 'transcript': cur['transcript'] = body
        elif kind == 'file': cur.setdefault('files', []).append({'path': sect[1], 'code': body})
        buf = []
    for line in text.split('\n'):
        if line.startswith('@@'):
            flush()
            parts = line[2:].split()
            tag = parts[0]
            if tag == 'term':
                cur = {'_id': parts[1], 'base': parts[2]}
                if len(parts) > 3: cur['lang'] = parts[3]
                entries.append(cur); sect = None
            elif tag in ('html=code', 'html=react', 'html=react-tw'):
                cur['_wrap'] = tag; sect = None
            elif tag == 'file':
                sect = ('file', line[len('@@file '):].strip())
            else:
                sect = (tag,)
            continue
        buf.append(line)
    flush()
    return entries

def finalize(e):
    w = e.pop('_wrap', None)
    css = e.pop('_css', None)
    if w == 'html=code':
        e['html'] = e['code']
    elif w in ('html=react', 'html=react-tw'):
        tw = '<script src="https://cdn.tailwindcss.com/3.4.17"></script>\n' if w == 'html=react-tw' else ''
        src = e.get('_reactsrc') or e['code']
        e['html'] = REACT_TPL.replace('%TW%', tw).replace('%CSS%', css if css is not None else DEFAULT_CSS).replace('%CODE%', src)
    e.pop('_reactsrc', None)
    for f in e.get('files', []):
        if f['code'].strip() == '(위 코드)': f['code'] = e['code']
    if e.get('lang') == 'tsx': e['lang'] = 'ts'
    if e.get('lang') not in (None, 'html', 'jsx', 'ts', 'js', 'css', 'md'): e.pop('lang')
    tid = e.pop('_id')
    order = ['base', 'prompt', 'lang', 'transcript', 'code', 'files', 'html']
    return tid, {k: e[k] for k in order if k in e}

def main():
    d = json.load(open(os.path.join(ROOT, 'research', 'coding.json'), encoding='utf-8'))
    ids = {t['id']: t['category'] for t in d['terms']}
    terms = {}
    for p in sorted(glob.glob(os.path.join(HERE, 'src_*.txt'))):
        for e in parse(p):
            tid, obj = finalize(e)
            assert tid in ids, tid
            assert obj.get('prompt'), tid
            terms.setdefault(tid, []).append(obj)
    base_code = open(os.path.join(HERE, 'base_todo.html'), encoding='utf-8').read().replace('\r\n', '\n').strip('\n')
    bases = {'todo-app-code': {'prompt': '할 일 목록 앱을 만들어줘.', 'code': base_code, 'lang': 'html'}}
    def dump(o):
        s = json.dumps(o, ensure_ascii=False, indent=None)
        return s.replace('</script', '<\\/script')
    js = ("window.PD_RESULTS = window.PD_RESULTS || {};\n"
          "window.PD_RESULTS.coding = window.PD_RESULTS.coding || {};\n"
          "(function(R){ R.base = Object.assign(R.base||{}, " + dump(bases) + "); R.terms = Object.assign(R.terms||{}, " + dump(terms) + "); })(window.PD_RESULTS.coding);\n")
    open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
    # validate
    s = open(OUT, encoding='utf-8').read()
    m = re.search(r'Object\.assign\(R\.base\|\|\{\}, (.*?)\); R\.terms = Object\.assign\(R\.terms\|\|\{\}, (.*)\); \}\)\(window', s, re.S)
    b2 = json.loads(m.group(1)); t2 = json.loads(m.group(2))
    assert '</script' not in s
    cats = {}
    for k in t2: cats.setdefault(ids[k], []).append(k)
    for c, v in cats.items(): print(c, len(v), ' '.join(v))
    print('total terms', len(t2), 'KB', round(os.path.getsize(OUT) / 1024, 1))
    for k, v in t2.items():
        for o in v:
            if 'code' in o and o['code'].count('\n') > 125: print('LONG code', k, o['code'].count('\n'))
            for f in o.get('files', []):
                if not f['code'].strip(): print('EMPTY file', k, f['path'])

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main()
