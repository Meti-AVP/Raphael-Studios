"""The legal switch of src/content/policy.ts, read for the scenes: which of the studio's photos may be shown."""
import re
from pathlib import Path

_TS = (Path(__file__).resolve().parents[3] / 'src' / 'content' / 'policy.ts').read_text(encoding='utf-8')
HIDE = re.findall(r"'(\w+)'", re.search(r'export const hide[^=]*=\s*\[([^\]]*)\]', _TS).group(1))
RESTRICTED = dict(re.findall(r"'([\w-]+)':\s*'(\w+)'", _TS.split('export const restricted')[1].split('};')[0]))


def visible(media_id: str) -> bool:
    return RESTRICTED.get(media_id) not in HIDE
