# Century CCPL Journal Voucher Automation

Unattended date reconciliation for Journal Voucher entries.

## Safety rules

- Only usernames RAJP and MAHBUB.
- Only the voucher Date may be edited.
- Save only when a visible Save control exists.
- Missing Save means skip and log.
- Dry-run is enabled by default.
- Never commit credentials or browser session files.

## Required GitHub Secrets

- CENTURY_USERNAME
- CENTURY_PASSWORD

The workflow is scheduled at 23:59 Asia/Calcutta (18:29 UTC). The first deployment must be tested in dry-run mode before writes are enabled.