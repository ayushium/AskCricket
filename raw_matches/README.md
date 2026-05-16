# Raw Match Data

Download IPL match JSONs from Cricsheet and place them here before running the flattener.

## Download (one command)

```bash
# Download the full IPL JSON pack (~30MB zip, all matches)
curl -L https://cricsheet.org/downloads/ipl_json.zip -o ipl_json.zip
unzip ipl_json.zip -d ipl_json_all/

# Copy only the 5 matches we need into raw_matches/
cp ipl_json_all/1415699.json .   # IPL 2024 Final — KKR vs SRH
cp ipl_json_all/1312200.json .   # IPL 2024 — RCB vs CSK (Kohli)
cp ipl_json_all/1312201.json .   # IPL 2024 — MI vs DC (Bumrah death overs)
cp ipl_json_all/1312208.json .   # IPL 2024 — SRH vs GT (Rashid Khan)
cp ipl_json_all/1312197.json .   # IPL 2024 — CSK vs MI (captain pick demo)
```

## Verify the files exist

```bash
ls *.json
# Should list 5 files
```

## Then run the flattener

```bash
node scripts/flatten.js
```

## Match IDs reference

If the above IDs don't exist in your zip, look up the correct IDs:
1. Open `ipl_json_all/` and search filenames, OR
2. Visit https://cricsheet.org/matches/ and filter by IPL 2024

The flattener works with **any** IPL JSON from Cricsheet — the 5 above are chosen to
cover all 3 demo prompts. More matches = richer answers; fewer = faster bundle.

> **Do not commit raw_matches/*.json** — add `raw_matches/*.json` to .gitignore.
