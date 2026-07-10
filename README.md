# TransportOS Demo App

This repository contains a dependency-free localhost demo for the TransportOS Phase 0 workflows.

## If you are using Codex Cloud

Use the terminal that belongs to the Codex Cloud workspace/session where this repository is open. Do **not** use your personal laptop terminal unless you have downloaded/cloned the project there.

1. Open the Codex Cloud workspace for this project.
2. Open the built-in terminal or shell panel in Codex Cloud.
3. Confirm you are in the project folder:

   ```bash
   pwd
   ```

   The folder should be:

   ```text
   /workspace/Century-App
   ```

4. Start the demo app:

   ```bash
   npm run dev
   ```

5. Codex Cloud should expose or preview port `3000`. Open the forwarded/preview URL for port `3000` if the UI provides one.

## If you are running on your own computer

Only use these steps if you have downloaded or cloned this repository onto your own computer.

1. Open Terminal on Mac/Linux, or PowerShell/Command Prompt on Windows.
2. Go to the project folder.
3. Start the app:

   ```bash
   npm run dev
   ```

4. Open this browser URL:

   ```text
   http://localhost:3000
   ```

## What the app includes

- Control Tower dashboard
- Trip lifecycle board
- Fleet Masters screen
- Driver mobile web demo
- Finance demo screen
- Maintenance ticket board

## Important note

`localhost` means "the computer/server where the command is running." If `npm run dev` runs inside Codex Cloud, then `localhost:3000` is inside Codex Cloud, not automatically on your laptop. Use the Codex Cloud port preview/forwarding link to view it from your browser.
