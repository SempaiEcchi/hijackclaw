export function printUsage(): void {
  console.info(`
hijackclaw — Route Claude Code through your ChatGPT subscription

COMMANDS
  login        Sign in to ChatGPT via browser OAuth
  serve        Run the translation proxy (foreground, for launchd)
  install      Install launchd agent + shell hook
  uninstall    Remove launchd agent + shell hook (--purge to remove all data)
  status       Show proxy, auth, and install status

QUICK START
  1. hijackclaw login       # authenticate with ChatGPT
  2. hijackclaw install     # install daemon + shell integration
  3. Open a new terminal and run claude as usual

SAFETY
  - Shell hook only sets env vars when the proxy is alive
  - If the proxy is down, Claude Code uses its default backend
  - \`hijackclaw uninstall\` cleanly reverses all changes
  - All state lives in ~/.hijackclaw/
`.trimStart());
}
