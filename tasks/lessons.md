# Lessons

## 2026-03-28

- Correction: Keep backend modules composition-friendly for integration by `main`.
- Rule: Export pure factories and registration helpers (`createOpenAIClient`, `registerProxyRoutes`) and keep translator logic in pure helper functions.
- Rule: Never start listeners or execute side effects in module top-level code for backend route/client modules.
- Correction: Do not change a public OAuth client's redirect URI unless I have proof that the provider has registered and accepts the replacement.
- Rule: Preserve the provider-registered loopback callback for public OAuth clients and run a dedicated local callback listener if the main app lives on a different port.
- Correction: Do not conflate OpenAI Platform OAuth/API access with ChatGPT consumer-subscription access when the user's requirement is "no API pricing".
- Rule: Before implementing OpenAI auth or billing-sensitive flows, verify whether the chosen endpoint and OAuth client produce Platform API billing or ChatGPT-subscription billing, and say explicitly if the requirement is not actually satisfied.
- Correction: When the user points to an existing project like OpenClaw as the expected behavior, verify that project's documented auth and transport model before designing a replacement architecture.
- Rule: Before proposing a new auth/session architecture for parity with an external project, inspect that project's current public docs or code for the actual login persistence model, transport defaults, and stored credential shape.
