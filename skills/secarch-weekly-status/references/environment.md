# Environment

Read this file before any write or export workflow.

## Non-Negotiable Rules

- All WSR weekly pages must live in SA space `19169738778`.
- Parent container for weekly pages: `21710110734`.
- Index page: `21710176271`.
- Template page: `21712240641`.
- Never create, patch, or update a WSR weekly page in the personal space `18886000657`.
- If an existing week page is found outside SA space, stop and offer to create a fresh page in SA instead.
- Only update the caller's own rows. All other rows are passthrough.

## HUB Environment

| Parameter | Value |
|---|---|
| Cloud ID | `015bce03-3867-49e4-a819-c1b2e3ceb4f5` |
| Space ID (POC) | `18886000657` |
| Space Key (POC) | `~6398a3df3c9bcd36397725a4` |
| Space ID (SA - production) | `19169738778` |
| Space Key (SA - production) | `SA` |
| Weekly page parent ID | `21710110734` |
| Index page ID | `21710176271` |
| Template page ID | `21712240641` |
| Workflow guide page ID | `21630025837` |
| SharePoint archive | `sites/HUBSecurity32/Shared Documents/General/Weekly Status Reports/Jeff Jaynes/` |

## Caller Ownership Model

Each caller owns only their own rows.

- Do not generate content for another teammate.
- Do not carry forward another teammate's prior-week content.
- Do not replace another teammate's placeholders.
- Template-owned structure such as fixed rows, section headers, and pre-populated mentions is allowed.

## Team Roster

Current as of `2026-03-22`.

| Name | Account ID | Type | Responsibilities | Status | Employment |
|---|---|---|---|---|---|
| Mary-Beth Hartoon | `610ac1deeb7aef0069fbf4f8` | FT | Vulnerability Management and MAI Security Engineering | active | FT |
| Aastik Ranabhat | `712020:ad157fc3-5f52-4b14-9365-3d163ca7d012` | FT | ISAR: Intake, Management and Delivery; VM - Pen Test Efforts | active | FT |
| Christopher Abramson | `712020:62aa3873-bc76-4fac-a472-596ef2f6f7f2` | FT | ISARs, POCs, General Security Architecture, standards, patterns | active | FT |
| Tyler Gladu | `612d099b63f7bb006969aba4` | FT | Cloud security, Netwrix implementation/support, Cloudflare WAF, ISARs | active | FT |
| David Farris | `6398a3df3c9bcd36397725a4` | FT | Network, Zscaler, office fw, net seg, ISARs | active | FT |
| Roman Potapov | `712020:471c073d-47e6-40a3-a700-49500260bc10` | FT | Application Security | active | FT |
| Dan Zachwieja | `620e8566f4d8af0070fec268` | FT | Cloud Security, Rapid7, Orchid | active | FT |
| Tyler Wood | `712020:d5d5a77a-4f8b-43e5-9c0c-a237d616d410` | FT | Vulnerability Management | active | FT |
| Kristian Richardson | `712020:435bfc95-c5f1-4bb9-b2ff-709fa001b644` | FT | Vulnerability Management | active | FT |
| Victor Solorzano | `712020:5afe909a-8d31-4414-9a38-c66d377f54e8` | FT | M&A Deals | active | FT |

## Authorized Editors

| Name | Account ID | Role |
|---|---|---|
| David Farris | `6398a3df3c9bcd36397725a4` | Security Architecture Engineer |
| Jeff Jaynes | TBD - resolve before INFOSEC migration | Director, Security Architecture |

## Restrictions Reminder

Confluence API cannot write page restrictions. After every page creation, remind the caller to:

1. Open the page menu.
2. Set page restrictions to only specific editors.
3. Add the authorized editors.
4. Save the restrictions.
