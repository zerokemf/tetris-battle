# Shared friends leaderboard

Frontend: GitHub Pages. Backend: NAS Apache/PHP at `/web-arcade/tetris-leaderboard/api.php`.

- GET `?mode=solo|battle`: top10 ordered score descending, oldest first for ties.
- POST JSON `{id,name,mode,score,lines}`; English leading letter, then ASCII letters/digits/spaces/underscore/hyphen, total1–16. No account/authentication or claim of anti-cheat.
- Scores are shared, not browser-local. Browser best score remains a separate local personal record.
- NAS runtime: `/share/Web/web-arcade/tetris-leaderboard/api.php`; private JSON under `private/scores.json`. `private/.htaccess` denies HTTP access (must verify403 on deployment). No leaderboard data in GitHub or Pages artifacts.
- Storage lock serializes reading and submission to prevent lost updates; duplicate round IDs are ignored. Maximum1000 entries per mode retained. No ongoing subscription or separate daemon.
- Deploy only API source; **never overwrite scores.json on updates**. Ensure existing file writable by PHP; do not grant permissions outside this app's data file.
- No admin delete endpoint. For maintenance, take a locked snapshot and alter only explicitly requested entries.
- NAS availability is required for reading/submitting scores; UI reports a failure and allows retry instead of claiming success. Gameplay remains independent.
- Defeat practice removed; scoring, sound and controls retained. SOLO/CPU defeat eligible, online results not submitted.

Validation: `python3 test/leaderboard-api-test.py`. Public browser tests must submit a unique test name from one browser, verify from a second isolated browser, then remove only that fixture under the same storage lock. Verify no horizontal overflow and no old practice UI, plus canonical gameplay/P2P regression.
