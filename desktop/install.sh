#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# Nova Desktop — Install Script
# Builds the Go binary and registers it as a desktop application
# ──────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY_NAME="nova-desktop"
INSTALL_BIN="/usr/local/bin/${BINARY_NAME}"
ICON_DIR="${HOME}/.local/share/icons/hicolor"
APP_DIR="${HOME}/.local/share/applications"
DESKTOP_FILE="${APP_DIR}/nova-assistant.desktop"

# ── Colours ──
RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Nova Desktop Installer             ║${NC}"
echo -e "${CYAN}║   Go + Fyne + PortAudio                  ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── Prerequisite checks ──────────────────────────────────────────────────────

info "Checking prerequisites..."

command -v go >/dev/null 2>&1 || error "Go not found. Install from https://go.dev/dl/"
GO_VERSION=$(go version | awk '{print $3}' | sed 's/go//')
success "Go ${GO_VERSION}"

pkg-config --exists portaudio-2.0 2>/dev/null || {
    warn "PortAudio not found via pkg-config."
    warn "Install it with:"
    warn "  Arch/Manjaro: sudo pacman -S portaudio"
    warn "  Ubuntu/Debian: sudo apt install libportaudio-dev"
    error "PortAudio is required."
}
success "PortAudio found"

# ── Build ────────────────────────────────────────────────────────────────────

info "Building ${BINARY_NAME}..."
cd "${SCRIPT_DIR}"
go build -ldflags="-s -w" -o "${BINARY_NAME}" . 2>&1 || error "Build failed!"
success "Build complete — binary: ${SCRIPT_DIR}/${BINARY_NAME} ($(du -sh ${BINARY_NAME} | cut -f1))"

# ── Install binary ───────────────────────────────────────────────────────────

info "Installing binary to ${INSTALL_BIN}..."
if [ -w "$(dirname ${INSTALL_BIN})" ]; then
    cp "${SCRIPT_DIR}/${BINARY_NAME}" "${INSTALL_BIN}"
    chmod +x "${INSTALL_BIN}"
    success "Binary installed to ${INSTALL_BIN}"
else
    info "Need sudo to install to ${INSTALL_BIN}..."
    sudo cp "${SCRIPT_DIR}/${BINARY_NAME}" "${INSTALL_BIN}"
    sudo chmod +x "${INSTALL_BIN}"
    success "Binary installed to ${INSTALL_BIN} (sudo)"
fi

# ── Install icon ─────────────────────────────────────────────────────────────

info "Installing icon..."
ICON_SRC="${SCRIPT_DIR}/../nova_icon.png"

for SIZE in 16 32 48 64 128 256; do
    ICON_TARGET_DIR="${ICON_DIR}/${SIZE}x${SIZE}/apps"
    mkdir -p "${ICON_TARGET_DIR}"
    if [ -f "${ICON_SRC}" ] && command -v convert >/dev/null 2>&1; then
        convert "${ICON_SRC}" -resize "${SIZE}x${SIZE}" "${ICON_TARGET_DIR}/nova-assistant.png" 2>/dev/null \
            && success "Icon ${SIZE}x${SIZE} installed" \
            || warn "Icon resize failed for ${SIZE}x${SIZE}"
    elif [ -f "${ICON_SRC}" ]; then
        cp "${ICON_SRC}" "${ICON_TARGET_DIR}/nova-assistant.png"
        warn "Installed original icon at ${SIZE}x${SIZE} (install 'imagemagick' for proper resizing)"
    fi
done

# Fallback: also install directly in pixmaps
mkdir -p "/usr/local/share/pixmaps" 2>/dev/null || true
if [ -f "${ICON_SRC}" ]; then
    cp "${ICON_SRC}" "${HOME}/.local/share/icons/nova-assistant.png" 2>/dev/null || true
fi

# ── Install desktop entry ─────────────────────────────────────────────────────

info "Installing desktop entry to ${DESKTOP_FILE}..."
mkdir -p "${APP_DIR}"

cat > "${DESKTOP_FILE}" << DESKTOP_EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Nova Assistant
GenericName=AI Voice Assistant
Comment=Lightweight AI voice assistant powered by Gemini Live API
Exec=${INSTALL_BIN}
Icon=nova-assistant
Terminal=false
StartupNotify=true
Categories=Utility;AudioVideo;Office;
Keywords=nova;voice;assistant;AI;gemini;speech;microphone;
StartupWMClass=nova-desktop
DESKTOP_EOF

chmod 644 "${DESKTOP_FILE}"
success "Desktop entry installed: ${DESKTOP_FILE}"

# ── Update desktop database ────────────────────────────────────────────────────

info "Updating desktop database..."
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${APP_DIR}" 2>/dev/null && success "Desktop database updated"
else
    warn "update-desktop-database not found — shortcut may appear after relogin"
fi

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "${ICON_DIR}" 2>/dev/null && success "Icon cache updated"
fi

# ── Final summary ─────────────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  Nova Desktop installed successfully!                    ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Binary:  ${INSTALL_BIN}                   ║${NC}"
echo -e "${GREEN}║  Shortcut: ${DESKTOP_FILE}  ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Run: nova-desktop                                       ║${NC}"
echo -e "${GREEN}║  Or search \"Nova\" in your application launcher           ║${NC}"
echo -e "${GREEN}║                                                          ║${NC}"
echo -e "${GREEN}║  Make sure the Nova server is running first:             ║${NC}"
echo -e "${GREEN}║    cd .. && ./install.sh   (or npm start)                ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""
