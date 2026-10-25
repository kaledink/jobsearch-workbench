"""Shared priority-company numbering supplied by the user; not a recruitment listing."""
import json
from pathlib import Path
import re
from urllib.parse import urlparse

REGISTRY = json.loads((Path(__file__).parent / 'priority_companies.json').read_text())
assert [r['number'] for r in REGISTRY] == list(range(1, 101))


def normalize_name(value):
    value = re.sub(r'[\s（）()\[\]【】·，,、]', '', str(value or ''))
    return re.sub(r'(?:有限责任公司|股份有限公司|有限公司)$', '', value)


def aliases(group):
    values = [group['name'], *group['aliases']]
    return {normalize_name(v) for v in values} | {normalize_name(group['name']).removesuffix('集团')}


def find_group(name, parent='', parent_verified=False):
    name = normalize_name(name)
    exact = [g for g in REGISTRY if name and name in aliases(g)]
    if len(exact) == 1:
        return {'number': exact[0]['number'], 'name': exact[0]['name'], 'relationship': '集团名称匹配'}
    if parent_verified:
        key = normalize_name(parent)
        parents = [g for g in REGISTRY if key and key in aliases(g)]
        if len(parents) == 1:
            return {'number': parents[0]['number'], 'name': parents[0]['name'], 'relationship': '公告确认的成员单位'}
    if re.search(r'大学|学会|协会', name):
        return None
    possible = []
    for group in REGISTRY:
        lengths = [len(a) for a in aliases(group) if (len(a) >= 3 or a == '华润') and name.startswith(a)]
        if lengths: possible.append((max(lengths), group))
    possible.sort(key=lambda item: -item[0])
    if possible and (len(possible) == 1 or possible[0][0] > possible[1][0]):
        group = possible[0][1]
        return {'number': group['number'], 'name': group['name'], 'relationship': '疑似成员单位，待核实'}
    return None


def annotate_priority(row, source_text=''):
    row = {key: value for key, value in row.items() if key not in ('priorityGroup', 'priorityNumber')}
    parent_quote = row.get('parentGroupQuote', '')
    verified = isinstance(parent_quote, str) and len(parent_quote.strip()) >= 3 and re.sub(r'\s+', '', parent_quote) in re.sub(r'\s+', '', source_text)
    # The quote must mention the named parent, not merely be an unrelated sentence.
    verified = verified and normalize_name(row.get('parentGroup', '')) in normalize_name(parent_quote)
    verified = verified and bool(re.search('旗下|下属|所属|成员企业|成员单位|隶属|全资|控股(?:子公司|企业|单位|的)', parent_quote))
    result = find_group(row.get('name', ''), row.get('parentGroup', ''), bool(verified))
    if result:
        row = dict(row, priorityGroup=result, priorityNumber=result['number'])
    return row


def official_domains():
    return sorted({urlparse(g['website']).hostname.removeprefix('www.') for g in REGISTRY if g['website']})


def daily_batch(cursor=0, size=20, extra_numbers=()):
    batch = [REGISTRY[(cursor + i) % len(REGISTRY)] for i in range(size)]
    for number in extra_numbers:
        if 1 <= number <= len(REGISTRY) and REGISTRY[number - 1] not in batch: batch.insert(0, REGISTRY[number - 1])
    return batch
