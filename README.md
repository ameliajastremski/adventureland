# Adventure Land (starter)

This is a minimal starter for a Node.js-based text adventure.

Quick start (PowerShell):

```powershell
cd C:\LocalDev\adventureland
npm install   # optional, no dependencies for the starter
npm start
```

To verify the module export without launching the interactive prompt:

```powershell
npm run verify
# prints: function
```

Files added:
- `main.js` — interactive CLI and exported `startAdventure` function
- `package.json` — start/verify scripts
- `.gitignore` — ignores node_modules

Next steps: implement scenes, commands, and persistent saves.
