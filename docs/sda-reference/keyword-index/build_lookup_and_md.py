import json, collections

with open("KEYWORD-INDEX.json") as f:
    data = json.load(f)

# ---- Flat lookup: keyword -> [ {level, category, description, parameters, repeatable, screenshotDir} ] ----
lookup = collections.defaultdict(list)
for lvl in data["levels"]:
    for cat in lvl["categories"]:
        for k in cat["keywords"]:
            lookup[k["keyword"]].append({
                "level": lvl["level"],
                "category": cat["category"],
                "description": k["description"],
                "parameters": k.get("parameters", ""),
                "repeatable": k.get("repeatable", False),
                "screenshotDir": cat.get("screenshotDir"),
                "sharedWith": cat.get("sharedWith", [])
            })

lookup_sorted = dict(sorted(lookup.items()))
with open("KEYWORD-LOOKUP.json", "w") as f:
    json.dump({
        "meta": {
            "purpose": "Flat keyword -> location map for quick-find/navigation. Look up a keyword name (e.g. 'COLOR') to see every level/category it appears under in iSDA's UI.",
            "uniqueKeywords": len(lookup_sorted),
            "generated": data["meta"]["generated"]
        },
        "keywords": lookup_sorted
    }, f, indent=2)

print("Unique keyword names:", len(lookup_sorted))

# ---- Markdown ----
lines = []
lines.append("# iSDA Keyword Index")
lines.append("")
lines.append(data["meta"]["purpose"])
lines.append("")
lines.append(f"Generated {data['meta']['generated']} · {data['meta']['totalKeywordEntries']} keyword entries across {data['meta']['totalCategories']} categories · {len(lookup_sorted)} unique keyword names.")
lines.append("")
lines.append("For notes on scope/methodology, see the JSON files' own `meta` block: `KEYWORD-INDEX.json` (structured by level/category, matches iSDA's own UI tabs) and `KEYWORD-LOOKUP.json` (flat keyword -> location map, for quick search).")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## Quick keyword lookup (alphabetical)")
lines.append("")
lines.append("| Keyword | Level(s) / Category(ies) |")
lines.append("|---|---|")
def esc(s):
    return str(s).replace("|", "\\|") if s else s

for name, entries in lookup_sorted.items():
    locs = "; ".join(f"{e['level']} → {esc(e['category'])}" for e in entries)
    lines.append(f"| `{name}` | {locs} |")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## By level and category")
lines.append("")
for lvl in data["levels"]:
    lines.append(f"## {lvl['level'].capitalize()}-level")
    lines.append("")
    lines.append(lvl["description"])
    lines.append("")
    for cat in lvl["categories"]:
        lines.append(f"### {cat['category']}")
        lines.append("")
        lines.append(cat["description"])
        if cat.get("sharedWith"):
            lines.append("")
            lines.append(f"*Shared with:* {', '.join(cat['sharedWith'])}")
        if cat.get("screenshotDir"):
            lines.append("")
            lines.append(f"*Reference screenshots:* `docs/sda-reference/{cat['screenshotDir']}/`")
        lines.append("")
        lines.append("| Keyword | Description | Parameters | Repeatable |")
        lines.append("|---|---|---|---|")
        for k in cat["keywords"]:
            lines.append(f"| `{esc(k['keyword'])}` | {esc(k['description'])} | {esc(k.get('parameters',''))} | {'yes' if k.get('repeatable') else ''} |")
        lines.append("")

with open("KEYWORD-INDEX.md", "w") as f:
    f.write("\n".join(lines))

print("Wrote KEYWORD-INDEX.md")
