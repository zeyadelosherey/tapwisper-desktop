# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in TapWisper, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please send an email to the project maintainers with:

1. A description of the vulnerability
2. Steps to reproduce the issue
3. The potential impact
4. Any suggested fixes (if applicable)

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |

## Security Considerations

TapWisper handles sensitive data including:

- **API keys**: Stored locally using electron-store with encryption. Never transmitted except to the configured AI provider endpoints.
- **Audio recordings**: Processed in memory and as temporary files. Temp files are cleaned up after transcription.
- **Clipboard data**: Accessed only when explicitly triggered by user actions. Original clipboard state is preserved and restored.
- **Database**: SQLite database stored locally. Contains usage statistics and activity records.

## Best Practices for Users

- Keep your API keys private and do not share your configuration files
- Keep the application updated to the latest version
- Review the permissions requested by the application on your operating system
