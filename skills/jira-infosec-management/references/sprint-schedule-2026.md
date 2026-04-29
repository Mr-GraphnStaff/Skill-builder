# INFOSEC Sprint Schedule - 2026

3-week cadence (21 days), Monday start, Sunday end, 15 work days per sprint.

| Sprint | Start (Mon) | End (Sun) | Quarter |
|--------|-------------|-----------|---------|
| 1 | 2026-01-05 | 2026-01-25 | Q1 |
| 2 | 2026-01-26 | 2026-02-15 | Q1 |
| 3 | 2026-02-16 | 2026-03-08 | Q1 |
| 4 | 2026-03-09 | 2026-03-29 | Q1 |
| 5 | 2026-03-30 | 2026-04-19 | Q2 |
| 6 | 2026-04-20 | 2026-05-10 | Q2 |
| 7 | 2026-05-11 | 2026-05-31 | Q2 |
| 8 | 2026-06-01 | 2026-06-21 | Q2 |
| 9 | 2026-06-22 | 2026-07-12 | Q3 |
| 10 | 2026-07-13 | 2026-08-02 | Q3 |
| 11 | 2026-08-03 | 2026-08-23 | Q3 |
| 12 | 2026-08-24 | 2026-09-13 | Q3 |
| 13 | 2026-09-14 | 2026-10-04 | Q4 |
| 14 | 2026-10-05 | 2026-10-25 | Q4 |
| 15 | 2026-10-26 | 2026-11-15 | Q4 |
| 16 | 2026-11-16 | 2026-12-06 | Q4 |
| 17 | 2026-12-07 | 2026-12-27 | Q4 |

## Rules

- **Quarter label:** Use sprint START date to determine quarter. A sprint is always tagged to one quarter.
- **Sprint day calculation:** `today - sprint_start + 1` (1-indexed)
- **Days remaining:** `sprint_end - today`
- **Sprint week:** Day 1-7 = Week 1, Day 8-14 = Week 2, Day 15-21 = Week 3
- **Dynamic override:** Always prefer reading sprint data from Jira `customfield_10006` when available. Use this table as fallback or for planning.

## Holiday-Impacted Sprints

| Sprint | Holiday | Impact |
|--------|---------|--------|
| 1 | New Year's (Jan 1), MLK Day (Jan 19) | -2 work days |
| 8 | Juneteenth (Jun 19) | -1 work day |
| 10 | Independence Day (Jul 4 observed) | -1 work day |
| 12 | Labor Day (Sep 7) | -1 work day |
| 15 | Thanksgiving (Nov 26-27) | -2 work days |
| 17 | Christmas (Dec 25), holiday week | -3+ work days |
