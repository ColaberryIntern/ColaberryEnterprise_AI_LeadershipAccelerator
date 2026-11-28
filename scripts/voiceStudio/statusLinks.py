# Voice AI Studio (VS0.3): read each ticket of the Basecamp list and the comment that carries its PDFs.
# READ ONLY (GET requests). Runs ON the production host, which holds the live Basecamp token:
#
#   scp scripts/voiceStudio/statusLinks.py root@<host>:/tmp/ && ssh root@<host> 'python3 /tmp/statusLinks.py; rm -f /tmp/statusLinks.py' > links.json
#
# Prints JSON: { "<code>": { "completed": bool, "todo": url, "evidence": url|null } } for VS* tickets and M* milestones.
# The evidence comment is the latest comment on the ticket that names a PDF. Refuses unless the token is Ali's.
import json, re, urllib.request

TOKEN_FILE = '/opt/colaberry-accelerator/tmp/ops-engine/bc-token.cache'
B = 'https://3.basecampapi.com/3945211'
BUCKET = 7463955
LIST = 10542482938
OWNER = 17454835

H = {'Authorization': 'Bearer ' + open(TOKEN_FILE).read().strip(), 'User-Agent': 'Colaberry AI Ops'}


def req(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30)
    return json.loads(r.read()), r.headers


def get(u):
    out = []
    while u:
        d, h = req(u)
        if isinstance(d, dict):
            return d
        out += d
        m = re.search(r'<([^>]+)>; rel="next"', h.get('Link') or '')
        u = m.group(1) if m else None
    return out


if get(B + '/my/profile.json')['id'] != OWNER:
    raise SystemExit('refused: the token is not the owner')

rows = {}
for g in get(f'{B}/buckets/{BUCKET}/todolists/{LIST}/groups.json'):
    for t in get(g['todos_url']) + get(g['todos_url'] + '?completed=true'):
        code = t['title'].split(' ')[0]
        if not re.match(r'^(VS\d+\.\d+|M\d)$', code):
            continue
        link = None
        for c in get(f"{B}/buckets/{BUCKET}/recordings/{t['id']}/comments.json"):
            if re.search(r'\.pdf', c.get('content', ''), re.I):
                link = c['app_url']
        rows[code] = {'completed': t['completed'], 'todo': t['app_url'], 'evidence': link}
print(json.dumps(rows))
