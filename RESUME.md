# Open work (26 Sep 2026)

Done: hatchery breeds + aliases, chick care by age, DAD-IS (2,588 records).

Left: US city chicken laws. 44 of 150 cities are in data/city-chicken-laws.json.
The run stopped at the 200 web searches per session cap, and Municode blocks
non-US visitors. To continue: raise CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION,
then follow research/city-laws/BRIEF.md. Each city is one file in
research/city-laws/cities/ (done cities are skipped); `node research/city-laws/merge.mjs`
rebuilds data/city-chicken-laws.json. Only 8 states are researched in
data/state-chicken-laws.json.

Thin sources: most of the 33 hatchery breeds have one source; hatchery sites
returned 403 to scripts. Showgirl, Sapphire Gem, Starlight Green Egger most of all.
