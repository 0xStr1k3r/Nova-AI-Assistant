# Nova Desktop — Go + Fyne + PortAudio

A **lightweight native desktop client** for the Nova AI Voice Assistant, written in Go.

## Architecture

```
Nova Desktop (Go)                Nova Server (Node.js)
┌──────────────────────┐        ┌────────────────────────┐
│  Fyne UI             │◄──────►│  WebSocket /live        │
│  PortAudio (16kHz)   │  WS    │  Gemini Live API        │
│  VAD Wake Detection  │        │  REST /api/config       │
└──────────────────────┘        └────────────────────────┘
```

## Requirements

- Go 1.21+
- PortAudio (`portaudio-2.0`)
- PulseAudio or PipeWire (Linux)
- X11 or Wayland (for Fyne window)
- The Nova server running on port `22222` (run `./install.sh` in the parent directory)

### Install system dependencies

```bash
# Arch Linux / Manjaro
sudo pacman -S portaudio

# Ubuntu / Debian
sudo apt install libportaudio2 libportaudio-dev
```

## Build & Run

```bash
# From the desktop/ directory:

# Run directly (development)
go run .

# Build a standalone binary
go build -o nova-desktop .

# Run the binary
./nova-desktop
```

## Configuration

The desktop client reads the server port from the parent project's `.env` file automatically:

```
PORT=22222   # (default)
```

You can override with environment variables:
```bash
NOVA_SERVER_URL=ws://192.168.1.10:22222/live ./nova-desktop
NOVA_API_URL=http://192.168.1.10:22222 ./nova-desktop
```

## How It Works

1. **Start the Nova server** (`cd ../ && npm start` or via `install.sh`)
2. **Launch Nova Desktop** (`./nova-desktop`)
3. **Click "Connect to Nova Server"** — the app connects via WebSocket
4. **Speak** — energy-based Voice Activity Detection (VAD) automatically detects when you start talking
5. Your audio is streamed to the Nova server as 16kHz PCM
6. Nova responds with 24kHz PCM audio, which plays back through your speakers
7. Click "Disconnect" to end the session

## Resource Usage

| Metric | Value |
|--------|-------|
| RAM (idle) | ~15–20 MB |
| RAM (active) | ~25–35 MB |
| Binary size | ~12 MB |
| Startup time | < 100ms |
| CPU (idle) | < 1% |
