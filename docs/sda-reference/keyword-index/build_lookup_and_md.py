import json, collections

with open("KEYWORD-INDEX.json") as f:
    data = json.load(f)

# ---- Flat lookup: keyword -> [ {level, category, description, parameters, repeatable, screenshotDir} ] ----
lookup = collections.defaultdict(list)
for lvl in data["levels"]:
    for cat in lvl["categories"]:
        for k in cat["keywords"]:
            entry = {
                "level": lvl["level"],
                "category": cat["category"],
                "description": k["description"],
                "parameters": k.get("parameters", ""),
                "repeatable": k.get("repeatable", False),
                "screenshotDir": cat.get("screenshotDir"),
                "sharedWith": cat.get("sharedWith", [])
            }
            if k.get("s36e"):
                entry["s36e"] = k["s36e"]
            lookup[k["keyword"]].append(entry)

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
    marker = " ⚠️" if any(e.get("s36e") for e in entries) else ""
    lines.append(f"| `{name}`{marker} | {locs} |")
lines.append("")
lines.append("---")
lines.append("")
lines.append("## S36E-conditional keywords (S36-6)")
lines.append("")
lines.append("The 7 keywords `USRDSPMGT` restricts, plus `USRDSPMGT` itself (marked ⚠️ above and in the tables below). Full rule detail/citations live in Task S36-3's own rule table (`src/dspfWriter.js`'s `S36E_KEYWORD_RESTRICTIONS`) and its LIMITATIONS-PLAN.md row - this table is a pointer, not a restatement. 3 of the 7 restricted keywords (`CHANGE` record-level, `HELP`/`HLPRTN`, `PRINT`) are verified and wired as hard UI blocks (S36-3/S36-4); the other 4 (`ALTNAME`, `MSGID`, `RETKEY`, `RETCMDKEY`) are documented S36E-conditional per IBM's DDS reference but the exact constraint could not be verified against IBM's own System/36 environment appendix text, and remain an open item.")
lines.append("")
lines.append("| Keyword | Status | Note |")
lines.append("|---|---|---|")
s36e_status = {
    "USRDSPMGT": "gate",
    "CHANGE": "verified",
    "HELP": "verified",
    "HLPRTN": "verified",
    "PRINT": "verified",
    "ALTNAME": "open item",
    "MSGID": "open item",
    "RETKEY": "open item",
    "RETCMDKEY": "open item",
}
s36e_seen = set()
for name, entries in lookup_sorted.items():
    for e in entries:
        note = e.get("s36e")
        if note and name not in s36e_seen:
            s36e_seen.add(name)
            status = s36e_status.get(name, "verified" if "open item" not in note.lower() else "open item")
            lines.append(f"| `{name}` | {status} | {esc(note)} |")
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
        lines.append("| Keyword | Description | Parameters | Repeatable | S36E |")
        lines.append("|---|---|---|---|---|")
        for k in cat["keywords"]:
            s36e_mark = "⚠️" if k.get("s36e") else ""
            lines.append(f"| `{esc(k['keyword'])}` | {esc(k['description'])} | {esc(k.get('parameters',''))} | {'yes' if k.get('repeatable') else ''} | {s36e_mark} |")
        lines.append("")

with open("KEYWORD-INDEX.md", "w") as f:
    f.write("\n".join(lines))

print("Wrote KEYWORD-INDEX.md")
