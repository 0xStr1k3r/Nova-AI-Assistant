# Nova — AI Voice Assistant

Nova is a high-tech personal AI voice assistant powered by the **Gemini Live API**. It features real-time voice conversation, dynamic operating modes, a smart memory database, and automatic web-search/page-extraction capabilities.

---

## Key Features

- 🎙️ **Gemini Live API**: High-speed, real-time voice pipeline (PCM 16kHz audio input/output) for natural, conversational dialogue.
- 🌐 **Dynamic Web Search**: Automatic web access for news, current affairs, or celebrity queries using SearXNG nodes (with Wikipedia + DuckDuckGo fallback).
- 🧠 **Persistent Memory**: A token-efficient fact extraction system that identifies your preferences and habits, storing them dynamically across sessions.
- 🎭 **8 Operating Modes**: Select custom restriction levels (Assistant, Focus, Deep Dive, Sysadmin, Dev, Unrestricted, Creative, Tutor) in the settings.

## Prerequisites

Before running the setup, ensure you have **Node.js** (v18+) and **Go** (for the optional GoDo integration) installed. Use the command matching your Linux distribution:

### Debian / Ubuntu Family
```bash
sudo apt update
sudo apt install -y nodejs npm golang
```

### Arch Linux Family
```bash
sudo pacman -Syu nodejs npm go
```

### Red Hat / Fedora Family
```bash
sudo dnf install -y nodejs npm golang
```

---

## Quick Start Installation

Run the unified installer to handle Node dependencies, environment variables, system permissions, and the systemd background daemon.

```bash
# 1. Clone the repository
git clone https://github.com/0xStr1k3r/Nova-AI-Assistant.git
cd Nova-AI-Assistant

# 2. Setup environment variables
mv .env.example .env

# 3. Grant execution permissions
chmod +x install.sh

# 4. Run the installer
./install.sh
```

During installation, you will be prompted to paste your **Gemini API Key**. 
To get a free key, visit the **[Google AI Studio API Keys Page](https://aistudio.google.com)**.
*If you skip this step, you can manually add the key later inside the `.env` file in the project root: `GEMINI_API_KEY=your_key_here`.*

Once setup finishes, open your browser and navigate to: **[http://localhost:3000](http://localhost:3000)**.

---

## User Guide & Interaction

### 1. Waking the Assistant
- Permitting microphone access in the browser allows Nova to listen.
- Simply say the wake word (default: **`"nova"`**) aloud to activate the assistant.

### 2. Background System-Wide Listening
- You do **not** need to keep the browser window focused. 
- As long as the browser tab remains open in the background (even minimized or behind other windows), Nova will detect the wake word, activate, and speak to you system-wide.

### 3. Ending a Session
- To disconnect the active voice session, say **`"goodbye"`**, **`"bye"`**, or **`"stop listening"`**.
- Nova will say goodbye and return to standby listening mode.

### 4. Customizing Memory & Settings
- Click the **Gear icon** in the UI to open the Settings panel.
- Update your username, choose a custom wake word, select prebuilt voices, or manage the persistent memory records (view, delete, or clear extracted user preferences).

---

## Daemon & Service Management

The installer configures a **Systemd User Service** so Nova can run in the background.

| Action | Command |
| :--- | :--- |
| **Check Status** | `systemctl --user status nova-assistant.service` |
| **Start Service** | `systemctl --user start nova-assistant.service` |
| **Stop Service** | `systemctl --user stop nova-assistant.service` |
| **Restart Service** | `systemctl --user restart nova-assistant.service` |
| **View Live Logs** | `journalctl --user -u nova-assistant.service -f` |