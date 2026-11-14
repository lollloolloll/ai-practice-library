"""자동 실제 결과: PC가 켜져 있을 때 하루 몇 개씩 GPT(Codex CLI, ChatGPT 구독)로 실제 결과를 만들어 올려요.

무엇을 만들지는 이 스크립트가 정하고, GPT는 이미지 한 장을 만드는 일만 해요.
지금 쓰는 작업 폴더가 아니라 ~/lexicon-auto/repo 복사본에서 돌아서 작업 중인 파일과 부딪히지 않아요.

사용:
  python tools/auto/run.py            하루 몫(기본 10개) 실행
  python tools/auto/run.py --dry      할 일 목록만 보기
  python tools/auto/run.py --limit 1  하나만 해 보기
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys, time

# AppData 아래는 앱(MSIX)에서 실행하면 경로가 가상화돼 Codex 샌드박스가 못 찾아요. 사용자 폴더에 둬요
HOME = os.path.join(os.path.expanduser('~'), 'lexicon-auto')
REPO = os.path.join(HOME, 'repo')
HERE = os.path.dirname(os.path.abspath(__file__))
DAILY = 10
FIELD = 'image'
SKIP_CATS = {'model-syntax'}  # Midjourney 파라미터처럼 GPT 이미지에 의미 없는 것
# 차이가 눈에 잘 보이는 분류부터
ORDER = ['lighting', 'lens-optics', 'shot-size', 'camera-angle', 'composition', 'time-weather', 'color', 'mood',
         'camera-film', 'photo-genre', 'medium', 'art-movement', 'texture-detail', 'quality']
MODEL = 'GPT 이미지 (ChatGPT 구독 · Codex CLI 자동)'
NOWIN = 0x08000000 if os.name == 'nt' else 0
LOG = None
# 이 PC의 PATH에는 항목 앞에 줄바꿈이 섞여 있어 codex·node를 못 찾아요. 앞뒤 공백을 걷어 내요
os.environ['PATH'] = os.pathsep.join(p.strip() for p in os.environ.get('PATH', '').split(os.pathsep) if p.strip())


def log(*a):
    line = datetime.datetime.now().strftime('%H:%M:%S ') + ' '.join(str(x) for x in a)
    print(line, flush=True)
    if LOG:
        with open(LOG, 'a', encoding='utf-8') as f:
            f.write(line + '\n')


def sh(args, cwd=REPO, check=True, **kw):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', creationflags=NOWIN, **kw)
    if check and r.returncode:
        raise RuntimeError('%s 실패: %s' % (' '.join(args[:3]), (r.stderr or r.stdout)[-800:]))
    return r


def jload(p, default):
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def jsave(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=1)
        f.write('\n')


# ---------- 저장소 복사본 ----------
def sync_repo():
    if not os.path.isdir(os.path.join(REPO, '.git')):
        url = sh(['git', 'config', '--get', 'remote.origin.url'], cwd=os.path.dirname(os.path.dirname(HERE))).stdout.strip()
        os.makedirs(HOME, exist_ok=True)
        sh(['git', 'clone', '-q', url, REPO], cwd=HOME)
    sh(['git', 'fetch', '-q', 'origin'])
    ahead = int(sh(['git', 'rev-list', '--count', 'origin/main..HEAD']).stdout.strip() or 0)
    if ahead:  # 지난번에 못 올린 결과가 있으면 먼저 올려요
        sh(['git', 'pull', '-q', '--rebase', 'origin', 'main'], check=False)
        if sh(['git', 'push', '-q', 'origin', 'HEAD:main'], check=False).returncode:
            raise RuntimeError('지난 결과를 아직 올리지 못했어요. 네트워크나 로그인을 확인해 주세요')
        sh(['git', 'fetch', '-q', 'origin'])
    sh(['git', 'reset', '-q', '--hard', 'origin/main'])  # 복사본은 자동 전용이라 늘 원격과 같게 맞춰요


# ---------- 할 일 고르기 ----------
def load_dict():
    s = open(os.path.join(REPO, 'data', 'dict.js'), encoding='utf-8').read()
    return json.loads(s[s.index('{'):s.rstrip().rstrip(';').rindex('}') + 1])


def load_primaries():
    """js/r-image.js의 원본(PRIM)과 용어별 원본(T[id].p)을 그대로 따라요. 이론 결과와 같은 원본을 써야 비교가 공정해요."""
    js = open(os.path.join(REPO, 'js', 'r-image.js'), encoding='utf-8').read()
    prim = {k: {'src': s, 'prompt': p} for k, s, p in
            re.findall(r"(\w+): \{ key: '\w+', label: '[^']*', src: '([^']+)',\s*prompt: '([^']+)' \}", js)}
    per = {(a or b): p for a, b, p in re.findall(r"(?:'([\w-]+)'|\b([A-Za-z_]\w*))\s*:\s*\{\s*p:\s*'(\w+)'", js)}
    cat = dict(re.findall(r"'?([\w-]+)'?: '(\w+)'", re.search(r'CAT_PRIMARY = \{([^}]*)\}', js).group(1)))
    return prim, per, cat


def queue(skipped):
    d = load_dict()
    done = jload(os.path.join(REPO, 'data', 'results-media.json'), {}).get(FIELD, {})
    prim, per, cat = load_primaries()
    rank = {c: i for i, c in enumerate(ORDER)}
    jobs = []
    for i, t in enumerate(d['terms']):
        if t['field'] != FIELD or t['category'] in SKIP_CATS or t['id'] in done or t['id'] in skipped:
            continue
        key = per.get(t['id']) or cat.get(t['category']) or 'portrait'
        if key not in prim:
            continue
        jobs.append((rank.get(t['category'], 99), i, t, key))
    jobs.sort(key=lambda j: j[:2])
    return [(t, key, prim[key]) for _, _, t, key in jobs]


# ---------- 생성 ----------
def codex_cmd():
    for name in ('codex.cmd', 'codex'):
        p = shutil.which(name)
        if p:
            return p
    p = os.path.join(os.environ.get('APPDATA', ''), 'npm', 'codex.cmd')  # 예약 작업은 PATH가 짧을 수 있어요
    if os.path.exists(p):
        return p
    raise RuntimeError('codex를 찾지 못했어요. npm i -g @openai/codex 후 codex login')


LIMIT_WORDS = ('usage limit', 'rate limit', 'quota', 'too many requests', '429')


def make(t, key, p):
    jd = os.path.join(HOME, 'jobs', datetime.date.today().isoformat(), t['id'])
    shutil.rmtree(jd, ignore_errors=True)
    os.makedirs(jd)
    shutil.copy(os.path.join(HERE, 'AGENTS.md'), jd)
    shutil.copy(os.path.join(HERE, 'schema.json'), jd)
    ref = os.path.join(jd, 'primary' + os.path.splitext(p['src'])[1])
    shutil.copy(os.path.join(REPO, p['src']), ref)
    prompt = '%s, %s' % (p['prompt'], t['term'])
    task = (
        'Follow AGENTS.md.\n'
        'The attached image is the primary (원본). Its own prompt was: "%s".\n'
        'Apply exactly ONE prompt term and nothing else: "%s"\n'
        'Meaning of the term: %s\n'
        'Edit/regenerate the attached image with that term, keeping the same subject and scene.\n'
        'Save the result in the current directory as out.png.\n'
        'Answer only with JSON: {"status":"ok","file":"out.png","note":"<what changed, Korean, one sentence>"} '
        'or {"status":"skip","file":"","note":"<why, Korean, one sentence>"}.'
    ) % (p['prompt'], t['term'], t.get('effect_ko', ''))
    args = [codex_cmd(), 'exec', '--skip-git-repo-check', '--ephemeral', '-s', 'workspace-write',
            '-C', jd, '-i', ref, '--output-schema', os.path.join(jd, 'schema.json'),
            '-o', os.path.join(jd, 'last.json'), '-']
    try:
        r = subprocess.run(args, cwd=jd, input=task, capture_output=True, text=True, encoding='utf-8',
                           errors='replace', timeout=900, creationflags=NOWIN)
        out = (r.stdout or '') + (r.stderr or '')
    except subprocess.TimeoutExpired:
        return 'fail', '15분 안에 끝나지 않았어요', None, prompt
    with open(os.path.join(jd, 'codex.log'), 'w', encoding='utf-8') as f:
        f.write(out)
    if r.returncode and any(w in out.lower() for w in LIMIT_WORDS):
        return 'limit', out[-300:], None, prompt
    ans = jload(os.path.join(jd, 'last.json'), None)
    if not ans:
        return 'fail', 'JSON 답이 없어요 (종료 코드 %s)' % r.returncode, None, prompt
    if ans.get('status') == 'skip':
        return 'skip', ans.get('note', ''), None, prompt
    img = os.path.join(jd, os.path.basename(ans.get('file') or 'out.png'))
    return check(img, ref), ans.get('note', ''), img, prompt


def check(img, ref):
    from PIL import Image, ImageChops, ImageStat
    if not os.path.exists(img):
        return 'fail'
    try:
        a = Image.open(img).convert('RGB')
    except OSError:
        return 'fail'
    if min(a.size) < 512:
        return 'fail'
    b = Image.open(ref).convert('RGB')
    diff = ImageStat.Stat(ImageChops.difference(a.resize((64, 64)).convert('L'), b.resize((64, 64)).convert('L'))).mean[0]
    return 'ok' if diff > 3 else 'same'  # 원본을 그대로 복사한 경우 걸러요


def register(t, img, prompt, note):
    from PIL import Image
    sys.path.insert(0, os.path.join(REPO, 'tools'))
    import add_result
    add_result.ROOT = REPO
    add_result.OUT = os.path.join(REPO, 'data', 'results-media.js')
    add_result.DB = os.path.join(REPO, 'data', 'results-media.json')
    rel = 'assets/results/%s/%s.jpg' % (FIELD, t['id'])
    im = Image.open(img).convert('RGB')
    im.thumbnail((1280, 1280))
    os.makedirs(os.path.dirname(os.path.join(REPO, rel)), exist_ok=True)
    im.save(os.path.join(REPO, rel), quality=85, optimize=True)
    db = add_result.load()
    db.setdefault(FIELD, {})[t['id']] = [{
        'src': rel, 'type': 'image', 'model': MODEL, 'prompt': prompt, 'note': note, 'auto': True,
        'date': datetime.date.today().isoformat(),
    }]
    add_result.save(db)


def publish(made):
    idx = os.path.join(REPO, 'lexicon.html')
    s = open(idx, encoding='utf-8').read()
    s = re.sub(r'(data/results-media\.js\?v=)[\w-]+', r'\g<1>auto' + datetime.datetime.now().strftime('%Y%m%d%H%M'), s)
    open(idx, 'w', encoding='utf-8').write(s)
    sh(['git', 'add', '-A', 'assets/results', 'data/results-media.js', 'data/results-media.json', 'lexicon.html', 'tools/auto/skipped.json', 'tools/auto/log.md'])
    msg = '자동 실제 결과: 이미지 %d개 (%s)\n\nGPT 이미지(ChatGPT 구독, Codex CLI)로 생성, tools/auto/run.py가 검사 후 등록' % (
        len(made), ', '.join(made))
    sh(['git', '-c', 'user.name=lexicon-auto', '-c', 'user.email=lexicon-auto@users.noreply.github.com', 'commit', '-q', '-m', msg])
    for _ in range(3):
        if not sh(['git', 'push', '-q', 'origin', 'HEAD:main'], check=False).returncode:
            return True
        sh(['git', 'pull', '-q', '--rebase', 'origin', 'main'], check=False)
        time.sleep(5)
    return False


def main():
    global LOG
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int)
    ap.add_argument('--dry', action='store_true')
    a = ap.parse_args()
    os.makedirs(os.path.join(HOME, 'logs'), exist_ok=True)
    LOG = os.path.join(HOME, 'logs', datetime.date.today().isoformat() + '.log')

    lock = os.path.join(HOME, 'run.lock')
    if os.path.exists(lock) and time.time() - os.path.getmtime(lock) < 3 * 3600:
        log('다른 실행이 돌고 있어요. 이번엔 건너뛰어요')
        return
    open(lock, 'w').write(str(os.getpid()))
    try:
        run(a)
    except Exception as e:  # 예약 실행이라 화면이 없어요. 원인을 로그에 남겨요
        log('오류:', repr(e))
    finally:
        os.remove(lock)


def run(a):
    sync_repo()
    stp = os.path.join(HOME, 'state.json')
    state = jload(stp, {})
    today = datetime.date.today().isoformat()
    used = state.get(today, 0)
    room = (a.limit if a.limit is not None else DAILY) - (0 if a.limit is not None else used)
    skp = os.path.join(REPO, 'tools', 'auto', 'skipped.json')
    skipped = jload(skp, {})
    jobs = queue({k for k, v in skipped.items() if v.get('final')})
    log('남은 이미지 용어 %d개, 오늘 몫 %d개' % (len(jobs), max(room, 0)))
    if a.dry:
        for t, key, _ in jobs[:max(room, 0)]:
            log(' ', t['category'], t['id'], '←', key)
        return
    made, lines = [], []
    for t, key, p in jobs[:max(room, 0)]:
        log('만드는 중:', t['id'], '(%s, 원본 %s)' % (t['category'], key))
        res, note, img, prompt = make(t, key, p)
        state[today] = state.get(today, 0) + 1  # 실패도 구독 사용량을 쓰니 시도 횟수로 세요
        jsave(stp, state)
        if res == 'limit':
            log('구독 사용량 제한에 걸렸어요. 오늘은 여기까지 해요:', note)
            break
        if res == 'ok':
            register(t, img, prompt, note)
            made.append(t['id'])
            log('  등록:', note)
        else:
            e = skipped.setdefault(t['id'], {'tries': 0})
            e['tries'] += 1
            e['last'] = '%s: %s' % (res, note)
            e['final'] = res == 'skip' or e['tries'] >= 2
            log('  실패(%s):' % res, note)
        lines.append('| %s | %s | %s | %s |' % (today, t['id'], res, (note or '').replace('|', '/')))
    jsave(skp, skipped)
    if lines:
        lp = os.path.join(REPO, 'tools', 'auto', 'log.md')
        if not os.path.exists(lp):
            open(lp, 'w', encoding='utf-8').write('# 자동 실행 기록\n\n| 날짜 | 용어 | 결과 | 메모 |\n|---|---|---|---|\n')
        with open(lp, 'a', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
    if made or lines:
        if not made:
            sh(['git', 'add', 'tools/auto/skipped.json', 'tools/auto/log.md'])
            sh(['git', '-c', 'user.name=lexicon-auto', '-c', 'user.email=lexicon-auto@users.noreply.github.com', 'commit', '-q', '-m', '자동 실행 기록'])
            sh(['git', 'push', '-q', 'origin', 'HEAD:main'], check=False)
        else:
            log('올렸어요' if publish(made) else '푸시하지 못했어요. 다음 실행 때 다시 올려요')
    # 오래된 작업 폴더 정리(7일)
    jobs_root = os.path.join(HOME, 'jobs')
    for dname in os.listdir(jobs_root) if os.path.isdir(jobs_root) else []:
        try:
            if (datetime.date.today() - datetime.date.fromisoformat(dname)).days > 7:
                shutil.rmtree(os.path.join(jobs_root, dname), ignore_errors=True)
        except ValueError:
            pass


if __name__ == '__main__':
    main()
