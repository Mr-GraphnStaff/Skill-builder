# INFOSEC Collaborator Directory

> **Verified:** 2026-04-07
> **Usage:** Account IDs for @mentions in ADF comments and assignee fields.
> Look up here first - no API call needed.
> **Security:** Use these identifiers only in authorized HUB Jira contexts. Do not expose this directory in external outputs.

---

## Security Architecture Team

| Name | Role | Account ID | Email |
|------|------|-----------|-------|
| David Farris | Security Architecture Engineer | `6398a3df3c9bcd36397725a4` | david.farris@hubinternational.com |
| Jeff Jaynes | Director, Security Architecture | `712020:176fc4a2-44a7-483b-8cb7-c843a8a536a2` | jeff.jaynes@hubinternational.com |
| Christopher Abramson | Information Security Architect | `712020:62aa3873-bc76-4fac-a472-596ef2f6f7f2` | chris.abramson@hubinternational.com |
| Tyler Gladu | Information Security Architect | `612d099b63f7bb006969aba4` | tyler.gladu@hubinternational.com |
| Roman Potapov | Security Architecture Engineer | `712020:471c073d-47e6-40a3-a700-49500260bc10` | roman.potapov@hubinternational.com |
| Dan Zachwieja | Security Architecture | `620e8566f4d8af0070fec268` | dan.zachwieja@hubinternational.com |
| Mary-Beth Hartoon | Security Architecture | `610ac1deeb7aef0069fbf4f8` | marybeth.hartoon@hubinternational.com |

## InfoSec Leadership

| Name | Role | Account ID | Email |
|------|------|-----------|-------|
| Jeremy Embalabala | CISO | `557058:9e127905-6083-41fc-89c6-523babeea959` | jeremy.embalabala@hubinternational.com |

## Cross-Team Collaborators

| Name | Role | Account ID | Email |
|------|------|-----------|-------|
| Kevin Keyfauver | Network Engineering | `5e1c98384092800cb1e7bdfe` | kevin.keyfauver@hubinternational.com |
| Chris Carrillo | TPM | `712020:8115a6af-12fd-4273-b769-60ad9d2551be` | chris.carrillo@hubinternational.com |

---

## ADF @mention Format

```json
{
  "type": "mention",
  "attrs": {
    "id": "<accountId>",
    "text": "@Display Name",
    "accessLevel": ""
  }
}
```

When a comment needs to @mention someone, look up their accountId from the tables above. No API call needed.
