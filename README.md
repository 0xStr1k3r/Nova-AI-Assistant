# Nova — AI Voice Assistant

Nova is a high-tech personal AI voice assistant powered by the **Gemini Live API**. It features real-time voice conversation, browser-native wake-word and microphone access, dynamic operating modes, a smart memory database, and automatic web-search/page-extraction capabilities.

---

## Key Features

- 🎙️ **Gemini Live API**: High-speed, real-time voice pipeline (PCM 16kHz audio input/output) for natural, conversational dialogue.
- 🌐 **Dynamic Web Search**: Automatic web access for news, current affairs, or celebrity queries using SearXNG nodes (with Wikipedia + DuckDuckGo fallback).
- 🧠 **Persistent Memory**: A token-efficient fact extraction system that identifies your preferences and habits, storing them dynamically across sessions.
- 🎭 **8 Operating Modes**: Select custom restriction levels (Assistant, Focus, Deep Dive, Sysadmin, Dev, Unrestricted, Creative, Tutor) in the settings.
- 🌐 **Browser-Native Pipeline**: Voice pipeline and wake word detection run entirely in-browser using standard HTML5 Speech APIs. Access via any web browser at `http://localhost:22222`.
- 🌐 **Advanced Browser Automation Suite (`openBrowser`)**: A fully modular, ultra-lightweight Puppeteer-Core engine that hooks natively into your **existing system Chromium** (`/usr/bin/chromium`) for zero-overhead browser control (clicking, typing, scrolling, multi-tab switching, cookie administration, PDF generation, visual screenshot description analysis via Gemini 2.0 Flash, pagination clicking, and browser/system master sound adjustments).

## Prerequisites

Before running the setup, ensure you have **Node.js** (v18+), **Go** (for the optional GoDo integration), and **Chromium** (for browser automation) installed. Use the command matching your Linux distribution:

### Debian / Ubuntu Family
```bash
sudo apt update
sudo apt install -y nodejs npm golang chromium
```

### Arch Linux Family
```bash
sudo pacman -Syu nodejs npm go chromium
```

### Red Hat / Fedora Family
```bash
sudo dnf install -y nodejs npm golang chromium
```

> [!NOTE]
> **Manual Installation Fallback**: If the automatic installer fails to set up some of these dependencies, please install Node, npm, and especially **chromium** manually using your distribution's standard package manager (e.g. `sudo pacman -S chromium` or `sudo apt install chromium`).

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

Once setup finishes, open your browser and navigate to **[http://localhost:22222](http://localhost:22222)**.

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

## GoDo Task Manager Integration

Nova features optional out-of-the-box integration with the **[GoDo CLI Task Manager](https://github.com/0xStr1k3r/GoDo)**.

### Setup and Integration
During installation (`./install.sh`), you will be prompted to integrate GoDo:
1. **Interactive Integration Prompt**: The script will ask if you would like to integrate GoDo.
2. **Auto-Installation**: If you select `y`, the installer will check if Go is installed. If so, it will clone the GoDo repository, build it locally, and install it globally as `godo` (in `/usr/local/bin/godo`).
3. **Smart Memory Injector**: The installer automatically inserts GoDo CLI task management instructions into Nova's memory database.

### How to Use
When Nova is in a mode that permits system command execution (such as **Assistant**, **Sysadmin**, **Dev**, or **Unrestricted**), you can manage your tasks hands-free using natural language voice commands:
* **"Nova, show my task list"** -> Runs `godo list` to retrieve your active task list.
* **"Add a task to buy groceries"** -> Runs `godo add -t "buy groceries"` to add a task.
* **"Mark task number 3 as completed"** -> Runs `godo complete 3` to mark task 3 as finished.

---

## Obsidian Notes Vault Integration

Nova supports integration with your local **Obsidian Notes Vault**. Since Obsidian vaults are directories of standard Markdown files, Nova can manage your notes hands-free.

### Setting Up Obsidian
1. Click the **Gear icon** in the UI to open the Settings panel.
2. Navigate to the **Integrations** tab.
3. Toggle the **Obsidian Notes Vault** integration to **ON**.
4. Enter the absolute path to your Obsidian vault directory (e.g. `/home/username/Documents/ObsidianVault`).
5. Click **Save**.

### How to Use
When the integration is enabled, Nova will be aware of your vault directory. If in a mode that permits system command execution, you can voice-command note operations:
* **"Nova, list my recent notes"** -> Lists note files inside your vault directory.
* **"Search my vault for ideas about artificial intelligence"** -> Uses `grep` or search tools inside your vault path to find matches.
* **"Create a new note named Shopping List and add buy bread"** -> Creates a Markdown file with specified content in your vault.
* **"Read my note about project specs"** -> Locates and prints the contents of the note.

---

## Advanced Browser Automation Suite (openBrowser)

Nova is equipped with a fully decoupled, highly modular **Browser Automation Engine** inside `browser_automations/` powered by `puppeteer-core`. Instead of downloading heavy, resource-intensive third-party browsers (which take 500MB+ in size), it hooks natively into your **existing system Chromium browser** (`/usr/bin/chromium`), ensuring a virtually non-existent CPU and storage footprint.

### Browser Actions & Voice Commands

When Nova is in a mode that permits system command execution, you can command browser tasks hands-free using natural language:

* **Multimodal Visual Analysis (`"analyze"`)**
  * *"Nova, look at my screen and tell me what you see"* -> Captures a high-definition viewport screenshot, passes it directly to `gemini-2.0-flash` on the backend, and describes or answers visual questions about the active webpage layout.
* **Autoplay Music & Video (`"youtubePlay"`)**
  * *"Play Shape of You by Ed Sheeran"* -> Opens YouTube, searches your query, clicks the first result, and starts playing music automatically with ad-skip systems active.
* **Tab & Browser Sound Control (`"controlMedia"` & `"systemVolume"`)**
  * *"Mute the browser"*, *"Pause playback"*, *"Unmute system audio"*, *"Set system volume to 80%"* -> Seamlessly adjusts browser element volume levels or host desktop Master audio volume using system `wpctl` bindings.
* **Progressive Navigation & Pagination (`"click"`, `"type"`, `"clickNext"`)**
  * *"Type hello into the search bar"*, *"Click the login button"*, *"Go to the next page"* -> Programmatically scrolls, fills forms, clicks links, and intelligently locates and clicks pagination next buttons/arrows (`→`, `>`, `Next`).
* **Session & Layout Extraction (`"details"`, `"pdf"`, `"cookies"`, `"html"`)**
  * *"Print this page as a PDF"*, *"Show me active session cookies"*, *"Extract page source code"* -> Automatically saves page PDFs, extracts tab metadata, displays cookie tokens, or harvests raw DOM code.

---

## System Privileges & Security

### Background Service Execution
Nova runs as a background service daemon. Since the service runs with **root privileges**, it has full administrative access to your local machine's filesystem, directories, and executing processes. This allows it to read, write, and manage any files or folders, and run system-level commands as root.

### Gated Command Execution by Mode
Although the background service holds administrative/root privileges, command execution is strictly gated by the **Operating Mode** you select in settings:
* 🛡️ **Assistant / Sysadmin / Dev / Unrestricted**: Grant active access to system commands via `runLinuxCommand`. Destructive or dangerous commands are blocked or validated in Assistant mode, but allowed in Unrestricted and Sysadmin modes.
* 🔒 **Focus / Deep Dive / Creative / Tutor**: Do **not** allow any system command or file execution, ensuring sandboxed interaction when you are just asking questions or learning.

---

## Daemon & Service Management

The installer configures the **Systemd User Service** so Nova runs in the background.

### Service Name:
* **Web Service (Port 22222)**: `nova-assistant-web.service`

| Action | Command |
| :--- | :--- |
| **Check Status** | `systemctl --user status nova-assistant-web.service` |
| **Start Service** | `systemctl --user start nova-assistant-web.service` |
| **Stop Service** | `systemctl --user stop nova-assistant-web.service` |
| **Restart Service** | `systemctl --user restart nova-assistant-web.service` |
| **View Live Logs** | `journalctl --user -u nova-assistant-web.service -f` |