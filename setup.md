# Nova Setup Guide

Use this guide to configure Nova from a fresh clone.

## 1. Install prerequisites

Install:
- Node.js 18+
- npm
- Chromium
- Go (optional, for GoDo integration)

Example on Debian/Ubuntu:

```bash
sudo apt update
sudo apt install -y nodejs npm golang chromium
```

## 2. Prepare the project

```bash
git clone https://github.com/0xStr1k3r/Nova-AI-Assistant.git
cd Nova-AI-Assistant
mv .env.example .env
```

## 3. Configure API keys

Edit `.env` and add the keys you need:
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`
- `GROQ_API_KEY`
- any channel webhook or bot tokens you plan to use

If you only want the built-in voice assistant, Gemini is the minimum requirement.

## 4. Install and start

```bash
npm install
npm run dev
```

Open the app in your browser at the local address shown by the server.

## 5. Configure Nova in the GUI

Open **Settings** and configure:
- **Profile**: name, wake word, greeting
- **Voice**: assistant voice
- **Modes**: assistant behavior profile
- **Integrations**: GoDo, Obsidian, and coding provider keys
- **Channels**: Telegram, Discord, Slack, WhatsApp, and webhook bridges

## 6. Set up messaging channels

In **Settings → Channels**, enable the platforms you want:
- Telegram
- Discord
- Slack
- WhatsApp
- Teams, iMessage, Matrix, Signal, Viber, SMS, Email, and Web via webhook bridges

For each channel, add the token or webhook URL and save the config.

## 7. Restart if needed

Restart Nova after changing environment variables so the runtime picks up the new keys.

## 8. Verify the setup

Check that:
- the assistant loads normally
- the selected mode is active
- channels show as enabled in the GUI
- messages can be routed through the configured integrations

