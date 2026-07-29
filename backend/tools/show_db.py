"""Print the SQLite schema and contents — for showing the database in a demo or interview.

Opens the file READ-ONLY (`mode=ro`), so it can never modify or lock anything.

    cd backend
    python tools/show_db.py             # schema + row counts + sample rows
    python tools/show_db.py --full      # every row, not just the first 5
    python tools/show_db.py --sql "SELECT type, COUNT(*) FROM dns_records GROUP BY type"

Point it at a different file with --db path/to/other.db.
"""
import argparse
import os
import sqlite3
import sys

DEFAULT_DB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "route53.db")


def table(rows, headers):
    """Render rows as an aligned text table."""
    if not rows:
        return "    (no rows)"
    cols = [str(h) for h in headers]
    data = [[("NULL" if v is None else str(v).replace("\n", "\\n")) for v in r] for r in rows]
    widths = [max(len(cols[i]), *(len(r[i]) for r in data)) for i in range(len(cols))]
    widths = [min(w, 42) for w in widths]

    def line(cells):
        return "    " + "  ".join(c[: widths[i]].ljust(widths[i]) for i, c in enumerate(cells))

    out = [line(cols), "    " + "  ".join("-" * w for w in widths)]
    out += [line(r) for r in data]
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description="Show the SQLite database, read-only.")
    ap.add_argument("--db", default=DEFAULT_DB, help="path to the .db file")
    ap.add_argument("--full", action="store_true", help="print every row, not just the first 5")
    ap.add_argument("--sql", help="run one read-only query instead of the full dump")
    args = ap.parse_args()

    if not os.path.exists(args.db):
        sys.exit(f"No database at {args.db}\nStart the API once to create it: uvicorn app.main:app")

    conn = sqlite3.connect(f"file:{args.db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    if args.sql:
        cur.execute(args.sql)
        rows = cur.fetchall()
        print(table([tuple(r) for r in rows], rows[0].keys() if rows else ["(no columns)"]))
        return

    size = os.path.getsize(args.db)
    print(f"\n{'=' * 78}\n  {args.db}\n  {size:,} bytes on disk"
          f"   |   SQLite {sqlite3.sqlite_version}"
          f"   |   foreign_keys = {cur.execute('PRAGMA foreign_keys').fetchone()[0]}"
          f"\n{'=' * 78}")
    # ASCII only from here on: Windows consoles default to cp1252 and turn en/em dashes
    # into mojibake, which is not what you want on a shared screen.

    names = [r[0] for r in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )]

    for name in names:
        count = cur.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
        print(f"\n\n### TABLE {name}  -  {count} row{'' if count == 1 else 's'}\n")

        print("  columns")
        cols = cur.execute(f"PRAGMA table_info({name})").fetchall()
        print(table(
            [(c["name"], c["type"], "NOT NULL" if c["notnull"] else "nullable",
              c["dflt_value"], "PK" if c["pk"] else "") for c in cols],
            ["column", "type", "null?", "default", "key"],
        ))

        fks = cur.execute(f"PRAGMA foreign_key_list({name})").fetchall()
        print("\n  foreign keys")
        print(table([(f["from"], f"-> {f['table']}.{f['to']}", f["on_delete"]) for f in fks],
                    ["column", "references", "on delete"]) if fks
              else "    (none declared in this file)")

        idx = [r for r in cur.execute(f"PRAGMA index_list({name})")]
        print("\n  indexes")
        print(table([(i["name"], "UNIQUE" if i["unique"] else "",
                      ", ".join(c["name"] for c in cur.execute(f"PRAGMA index_info({i['name']})")))
                     for i in idx], ["index", "unique", "columns"]) if idx else "    (none)")

        if count:
            limit = "" if args.full else " LIMIT 5"
            rows = cur.execute(f"SELECT * FROM {name} ORDER BY rowid{limit}").fetchall()
            shown = f"all {count}" if args.full or count <= 5 else f"first 5 of {count}"
            print(f"\n  rows ({shown})")
            # hide password hashes when showing the screen to someone
            keys = list(rows[0].keys())
            safe = [tuple("<bcrypt hash>" if k == "hashed_password" else r[k] for k in keys)
                    for r in rows]
            print(table(safe, keys))

    conn.close()
    print()


if __name__ == "__main__":
    main()
