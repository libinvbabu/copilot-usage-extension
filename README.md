# GitHub Copilot Premium Request Pace

This is a lightweight Chrome extension that injects a pacing dashboard into the GitHub Copilot settings page to help users track and manage their monthly premium request quota.

## Privacy Policy

**Copilot Request Pace** respects your privacy. This policy outlines how the extension handles data.

1. **No Data Collection**: This extension does not collect, transmit, or store any personal data, usage data, or telemetry.
2. **Local Storage Only**: The extension uses Chrome's `storage` API (specifically sync storage, if enabled by your browser) solely to save your local preferences, such as which days of the week you consider working days.
3. **No External Servers**: There are no external servers, APIs, or third-party services involved. All calculations are performed locally on your machine.
4. **No Tracking or Ads**: There are no tracking scripts, analytics, or advertisements included in this extension.
5. **Permissions**:
   - `storage`: Used only to remember your working day settings across sessions.
   - Host permission for `https://github.com/settings/copilot/features*`: Used only so the extension can inject the pace dashboard UI into that specific page. It only reads the publicly displayed usage percentage on that page to perform its calculations.

If you have any questions or concerns, please open an issue in this repository.

## Installation
Install from Chrome Web Store:

## Contributing
Pull requests are welcome! Feel free to open an issue or submit a PR.
