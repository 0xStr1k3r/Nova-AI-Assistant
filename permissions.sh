#!/bin/bash

# Exit on error
set -e

echo "======================================================"
echo "      Nexus OS Voice Assistant Permissions Setup"
echo "======================================================"

# Prevent running as root directly
if [ "$EUID" -eq 0 ]; then
  echo "[-] ERROR: Please do NOT run this script with 'sudo' or as root."
  echo "    Run it as your regular user: ./permissions.sh"
  echo "    The script will prompt for sudo internally when necessary."
  exit 1
fi

USER_NAME="chiru"
PROJECT_DIR="/home/chiru/antigravity/Nexus-OS-Voice-Assistant"

# 1. Ensure user is in the audio group to access the microphone system-wide
echo "[+] Adding user '$USER_NAME' to audio groups..."
sudo usermod -aG audio "$USER_NAME"
if getent group pulse-access > /dev/null 2>&1; then
    sudo usermod -aG pulse-access "$USER_NAME"
fi

# 2. Configure passwordless sudo for running Linux commands system-wide
echo "[+] Configuring passwordless sudo rules for voice assistant command execution..."
SUDOERS_FILE="/etc/sudoers.d/nexus-voice-assistant"
sudo bash -c "cat << 'EOF' > $SUDOERS_FILE
# Nexus OS Voice Assistant command execution rule
$USER_NAME ALL=(ALL) NOPASSWD: ALL
EOF"
sudo chmod 0440 "$SUDOERS_FILE"

# 3. Enable user lingering so background services can run when not logged in
echo "[+] Enabling user session lingering..."
sudo loginctl enable-linger "$USER_NAME"

# 4. Set up Systemd User Service for background execution
echo "[+] Configuring background systemd user service..."
SYSTEMD_USER_DIR="/home/$USER_NAME/.config/systemd/user"

# Fix ownership first in case directory/files were previously created by root
if [ -d "/home/$USER_NAME/.config/systemd" ]; then
    sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
fi

mkdir -p "$SYSTEMD_USER_DIR"

cat << EOF > "$SYSTEMD_USER_DIR/nexus-assistant.service"
[Unit]
Description=Nexus OS Voice Assistant Daemon
After=network.target sound.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
EOF

# Make sure ownership is fully correct
sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"

# Reload user daemon and enable service
echo "[+] Enabling and starting the background service..."
export XDG_RUNTIME_DIR="/run/user/$(id -u $USER_NAME)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u $USER_NAME)/bus"

systemctl --user daemon-reload
systemctl --user enable nexus-assistant.service
systemctl --user restart nexus-assistant.service

echo "======================================================"
echo " SUCCESS: Permissions setup and service activation complete!"
echo "======================================================"
echo "• Passwordless sudo is enabled for voice commands."
echo "• Systemd background daemon 'nexus-assistant' is running."
echo "• Microphone permissions are set system-wide."
echo "• The web app is served at http://localhost:3000"
echo ""
echo "Note: The browser remembers microphone permissions"
echo "permanently once you click 'Allow' on http://localhost:3000."
echo "======================================================"
