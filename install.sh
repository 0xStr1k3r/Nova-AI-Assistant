#!/bin/bash

##############################################################################
# Nova AI Assistant - Consolidated Installation & Setup Script
# This script handles dependencies, permissions, and background daemon setup.
##############################################################################

set -e  # Exit on error

PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Installation target (browser or desktop)
INSTALL_TARGET=""

# Helper Functions
print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}   $1${NC}"
    echo -e "${BLUE}================================================${NC}"
}

print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}"; }
print_warning() { echo -e "${YELLOW}⚠ $1${NC}"; }
print_info() { echo -e "${BLUE}ℹ $1${NC}"; }

# Prevent running as root directly
check_not_root() {
    if [ "$EUID" -eq 0 ]; then
        print_error "Please do NOT run this script with 'sudo' or as root directly."
        echo "Run it as your regular user: ./install.sh"
        echo "The script will prompt for sudo access internally when necessary."
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed."
        echo "Please install Node.js (v18+) from https://nodejs.org/"
        exit 1
    fi
    print_success "Node.js: $(node -v)"
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed."
        exit 1
    fi
    print_success "npm: $(npm -v)"
    
    if ! command -v cargo &> /dev/null; then
        print_error "Rust/Cargo is not installed."
        echo "Please install Rust (v1.70+) from https://rustup.rs/ or via your package manager."
        exit 1
    fi
    print_success "Cargo: $(cargo --version)"
}

# Select installation target
select_installation_target() {
    print_header "Choose Installation Target"
    echo -e "How would you like to install the Nova Assistant?"
    echo -e "1) Browser App (Runs on port 22222)"
    echo -e "2) Desktop App (Development Stage - Runs on port 22233)"
    read -p "Select option (1-2) [default: 1]: " target_choice
    target_choice=${target_choice:-1}
    
    if [ "$target_choice" -eq 2 ]; then
        INSTALL_TARGET="desktop"
        print_info "Selected Installation Target: Desktop App (Development Stage)"
    else
        INSTALL_TARGET="browser"
        print_info "Selected Installation Target: Browser App"
    fi
}

# Install system dependencies based on distro and installation target
install_system_dependencies() {
    print_header "System Package Detection & Installation"
    
    # Detect Distro
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO_ID=$ID
        DISTRO_LIKE=$ID_LIKE
    else
        DISTRO_ID="unknown"
        DISTRO_LIKE="unknown"
    fi
    
    # Normalize variants
    case "$DISTRO_ID" in
        pop|linuxmint|elementary)
            DISTRO_ID="ubuntu"
            ;;
        manjaro|blackarch)
            DISTRO_ID="arch"
            ;;
        rocky|almalinux|centos)
            DISTRO_ID="rhel"
            ;;
    esac
    
    print_info "Detected OS/Distribution: $DISTRO_ID"
    
    local pkgs=()
    local install_cmd=""
    
    case "$DISTRO_ID" in
        ubuntu|debian)
            install_cmd="sudo apt-get update && sudo apt-get install -y"
            pkgs=(build-essential pkg-config libasound2-dev git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            if ! command -v cargo &> /dev/null; then
                pkgs+=(cargo rustc)
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                pkgs+=(libgtk-3-dev libwebkit2gtk-4.1-dev gstreamer1.0-plugins-good gstreamer1.0-plugins-base gstreamer1.0-alsa gstreamer1.0-pulseaudio)
            fi
            ;;
            
        fedora)
            install_cmd="sudo dnf install -y"
            pkgs=(gcc gcc-c++ make pkgconfig alsa-lib-devel git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            if ! command -v cargo &> /dev/null; then
                pkgs+=(cargo rust)
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                pkgs+=(gtk3-devel webkit2gtk4.1-devel gstreamer1-plugins-good gstreamer1-plugins-base)
            fi
            ;;
            
        arch)
            install_cmd="sudo pacman -S --noconfirm --needed"
            pkgs=(base-devel pkgconf alsa-lib git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            if ! command -v cargo &> /dev/null; then
                pkgs+=(rust)
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                pkgs+=(gtk3 webkit2gtk-4.1 gst-plugins-good gst-plugins-base gst-plugin-pipewire pulseaudio-alsa)
            fi
            ;;
            
        rhel)
            install_cmd="sudo dnf install -y"
            pkgs=(gcc gcc-c++ make pkgconfig alsa-lib-devel git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            if ! command -v cargo &> /dev/null; then
                pkgs+=(cargo rust)
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                pkgs+=(gtk3-devel webkit2gtk4.1-devel gstreamer1-plugins-good gstreamer1-plugins-base)
            fi
            ;;
            
        *)
            # Check distro-like fallback
            if [[ "$DISTRO_LIKE" =~ "debian" ]] || [[ "$DISTRO_LIKE" =~ "ubuntu" ]]; then
                install_cmd="sudo apt-get update && sudo apt-get install -y"
                pkgs=(build-essential pkg-config libasound2-dev git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
                if ! command -v cargo &> /dev/null; then pkgs+=(cargo rustc); fi
                if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then pkgs+=(libgtk-3-dev libwebkit2gtk-4.1-dev gstreamer1.0-plugins-good gstreamer1.0-plugins-base gstreamer1.0-alsa gstreamer1.0-pulseaudio); fi
            elif [[ "$DISTRO_LIKE" =~ "fedora" ]] || [[ "$DISTRO_LIKE" =~ "rhel" ]]; then
                install_cmd="sudo dnf install -y"
                pkgs=(gcc gcc-c++ make pkgconfig alsa-lib-devel git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
                if ! command -v cargo &> /dev/null; then pkgs+=(cargo rust); fi
                if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then pkgs+=(gtk3-devel webkit2gtk4.1-devel gstreamer1-plugins-good gstreamer1-plugins-base); fi
            elif [[ "$DISTRO_LIKE" =~ "arch" ]]; then
                install_cmd="sudo pacman -S --noconfirm --needed"
                pkgs=(base-devel pkgconf alsa-lib git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
                if ! command -v cargo &> /dev/null; then pkgs+=(rust); fi
                if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then pkgs+=(gtk3 webkit2gtk-4.1 gst-plugins-good gst-plugins-base gst-plugin-pipewire pulseaudio-alsa); fi
            else
                print_warning "Unable to auto-detect a supported package manager for distribution: $DISTRO_ID"
                print_warning "Please manually install build tools, pkg-config, and ALSA development headers."
                if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                    print_warning "Please also install GTK3, WebKitGTK, and GStreamer plugins manually."
                fi
                return
            fi
            ;;
    esac
    
    if [ -n "$install_cmd" ] && [ ${#pkgs[@]} -gt 0 ]; then
        print_info "Using detected distro settings to install packages: ${pkgs[*]}"
        if eval "$install_cmd ${pkgs[*]}"; then
            print_success "System dependencies installed successfully."
        else
            print_error "Failed to install some system packages. You might need to install them manually."
            print_warning "Required packages: ${pkgs[*]}"
        fi
    fi
}

# Setup environment variables (.env)
setup_env() {
    print_header "Setting Up Environment Variables"
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_info "Creating .env from .env.example..."
            cp .env.example .env
        else
            echo "GEMINI_API_KEY=YOUR_API_KEY" > .env
            echo "PORT=3000" >> .env
        fi
    fi

    # Read current GEMINI_API_KEY
    API_KEY=$(grep -E "^GEMINI_API_KEY=" .env | cut -d'=' -f2- | tr -d '"' | tr -d "'")

    if [ -z "$API_KEY" ] || [ "$API_KEY" == "YOUR_API_KEY" ] || [ "$API_KEY" == "MY_GEMINI_API_KEY" ]; then
        print_warning "Gemini API Key is not set or is using the placeholder."
        echo -e "You can get a free API key from ${BLUE}https://aistudio.google.com${NC}"
        read -p "Enter your Gemini API Key (or press Enter to set it later): " user_key
        if [ ! -z "$user_key" ]; then
            # Replace key in .env
            sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=$user_key|" .env
            print_success "API Key updated in .env"
        else
            print_warning "API Key was not set. The app will run, but Gemini connections will fail."
        fi
    else
        print_success "Gemini API Key is set in .env"
    fi
}

# Install npm packages
install_dependencies() {
    print_header "Installing Dependencies"
    
    if [ -d "node_modules" ]; then
        print_warning "node_modules already exists."
        read -p "Do you want to reinstall dependencies? (y/n): " choice
        if [[ "$choice" =~ ^[Yy]$ ]]; then
            print_info "Removing existing node_modules..."
            rm -rf node_modules
            print_info "Installing npm packages..."
            npm install
            print_success "Dependencies reinstalled successfully."
        else
            print_info "Skipping npm installation"
        fi
    else
        print_info "Installing npm packages..."
        npm install
        print_success "Dependencies installed successfully."
    fi
}

# Setup System Permissions & background Daemon
setup_permissions_and_service() {
    print_header "Setting Up System Permissions & Service"
    
    USER_NAME=$(id -un)
    PROJECT_DIR=$(pwd)
    
    print_info "Configuring settings for user '$USER_NAME' at '$PROJECT_DIR'"
    
    # 1. Microphone access
    print_info "Adding '$USER_NAME' to audio groups..."
    sudo usermod -aG audio "$USER_NAME"
    if getent group pulse-access > /dev/null 2>&1; then
        sudo usermod -aG pulse-access "$USER_NAME"
    fi
    
    # 2. Passwordless sudo for voice commands
    print_info "Configuring passwordless sudo for voice assistant command execution..."
    SUDOERS_FILE="/etc/sudoers.d/nova-voice-assistant"
    sudo bash -c "cat << 'EOF' > $SUDOERS_FILE
# Nova AI Assistant command execution rule
$USER_NAME ALL=(ALL) NOPASSWD: ALL
EOF"
    sudo chmod 0440 "$SUDOERS_FILE"
    
    # 3. Session lingering
    print_info "Enabling user session lingering..."
    sudo loginctl enable-linger "$USER_NAME"
    
    print_info "Building native Rust audio engine (nova-core)..."
    (cd "$PROJECT_DIR/nova-core" && cargo build --release)
    
    # 4. Systemd user service
    print_info "Configuring systemd user services..."
    SYSTEMD_USER_DIR="/home/$USER_NAME/.config/systemd/user"
    
    if [ -d "/home/$USER_NAME/.config/systemd" ]; then
        sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    fi
    
    mkdir -p "$SYSTEMD_USER_DIR"
    
    # Remove deprecated single service files to avoid conflicts
    rm -f "$SYSTEMD_USER_DIR/nova-assistant.service" "$SYSTEMD_USER_DIR/nova-audio.service"
    
    # 4a. Web Services (Port 22222)
    cat << EOF > "$SYSTEMD_USER_DIR/nova-assistant-web.service"
[Unit]
Description=Nova AI Assistant Web Daemon (Backend & UI)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment="PORT=22222"

[Install]
WantedBy=default.target
EOF

    # 4b. Desktop Services (Port 22233)
    cat << EOF > "$SYSTEMD_USER_DIR/nova-assistant-desktop.service"
[Unit]
Description=Nova AI Assistant Desktop Daemon (Backend & UI)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/npm run dev
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment="PORT=22233"

[Install]
WantedBy=default.target
EOF

    cat << EOF > "$SYSTEMD_USER_DIR/nova-audio-desktop.service"
[Unit]
Description=Nova Native Audio Engine Desktop (Rust)
After=network.target sound.target nova-assistant-desktop.service

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR/nova-core
ExecStart=$PROJECT_DIR/nova-core/target/release/nova-core
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment="LD_LIBRARY_PATH=/usr/lib" "PORT=22233"

[Install]
WantedBy=default.target
EOF

    sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    
    print_info "Enabling and starting systemd services..."
    export XDG_RUNTIME_DIR="/run/user/$(id -u $USER_NAME)"
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u $USER_NAME)/bus"
    
    systemctl --user daemon-reexec
    systemctl --user daemon-reload
    
    # Stop all to prevent conflicts, then start correct ones
    systemctl --user disable nova-assistant.service nova-audio.service nova-assistant-web.service nova-audio-web.service nova-assistant-desktop.service nova-audio-desktop.service &> /dev/null || true
    systemctl --user stop nova-assistant.service nova-audio.service nova-assistant-web.service nova-audio-web.service nova-assistant-desktop.service nova-audio-desktop.service &> /dev/null || true
    
    local services_to_start=()
    if [ "$INSTALL_TARGET" = "browser" ]; then
        services_to_start=(nova-assistant-web.service)
    elif [ "$INSTALL_TARGET" = "desktop" ]; then
        services_to_start=(nova-assistant-desktop.service nova-audio-desktop.service)
    else # both
        services_to_start=(nova-assistant-web.service nova-assistant-desktop.service nova-audio-desktop.service)
    fi
    
    systemctl --user enable "${services_to_start[@]}"
    systemctl --user restart "${services_to_start[@]}"
    
    print_success "System permissions and background services configured successfully!"
}

# Optional GoDo integration
setup_godo_integration() {
    print_header "Optional Integrations"
    read -p "Do you use the GoDo CLI task manager (https://github.com/0xStr1k3r/GoDo)? Integrate it? (y/n): " godo_choice
    if [[ "$godo_choice" =~ ^[Yy]$ ]]; then
        print_info "Integrating GoDo CLI task manager..."
        node -e "
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const DB_DIR = path.join(os.homedir(), '.config', 'nova-voice-assistant');
        if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
        const DB_PATH = path.join(DB_DIR, 'nova-data.json');
        let db = { wakeWord: 'nova', userName: 'Chiru', activeModeId: 'assistant', modes: [], memory: [], voiceName: 'Aoede' };
        if (fs.existsSync(DB_PATH)) {
          try { db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); } catch(e) {}
        }
        if (!db.memory) db.memory = [];
        // Clear any older GoDo memory entries to update it
        db.memory = db.memory.filter(m => !m.content.toLowerCase().includes('godo'));
        db.memory.push({
          id: 'mem_godo_' + Date.now(),
          content: 'The user manages tasks locally using the GoDo CLI task manager. You can execute local task commands using runLinuxCommand. The GoDo commands are: \"godo list\" to view all tasks with IDs, \"godo add -t \\\"task description\\\"\" to create a new task, and \"godo complete <id>\" to mark a task as finished. Proactively suggest or run these commands when the user mentions tasks, items, or lists.',
          category: 'preference',
          importance: 3,
          timestamp: new Date().toISOString()
        });
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
        console.log('✓ GoDo task manager integration added to assistant memory.');
        "

        # Try to install GoDo CLI
        if command -v godo &> /dev/null; then
            print_success "GoDo CLI is already installed on your system."
        else
            print_info "Attempting to install GoDo CLI automatically..."
            if ! command -v go &> /dev/null; then
                print_warning "Go compiler is not installed."
                print_error "Failed to install GoDo automatically. Please install Go (golang) first, or install GoDo manually from: https://github.com/0xStr1k3r/GoDo"
            else
                # Setup temp directory
                TEMP_DIR=$(mktemp -d)
                print_info "Cloning GoDo repository..."
                if git clone --depth 1 https://github.com/0xStr1k3r/GoDo.git "$TEMP_DIR/GoDo" &> /dev/null; then
                    cd "$TEMP_DIR/GoDo"
                    print_info "Building GoDo executable..."
                    if go build -buildvcs=false -o godo . &> /dev/null; then
                        print_info "Installing GoDo globally (requires sudo)..."
                        if sudo install -m 0755 godo /usr/local/bin/godo; then
                            print_success "GoDo CLI installed successfully to /usr/local/bin/godo!"
                        else
                            print_error "Failed to install GoDo executable globally. Please manually install the binary from: https://github.com/0xStr1k3r/GoDo"
                        fi
                    else
                        print_error "Failed to compile GoDo. Please build it manually from: https://github.com/0xStr1k3r/GoDo"
                    fi
                else
                    print_error "Failed to clone GoDo repository. Please install it manually from: https://github.com/0xStr1k3r/GoDo"
                fi
                # Clean up temp dir and return back
                rm -rf "$TEMP_DIR"
                cd "$PROJECT_DIR"
            fi
        fi
    fi
}

# Build production bundle
build_project() {
    print_header "Building Client & Server"
    print_info "Compiling production assets..."
    npm run build
    print_success "Build completed."
}

# Build native Desktop App (C++ WebKitGTK Native)
build_desktop_app() {
    print_header "Creating Native Desktop App (Development Stage)"
    
    print_info "Compiling native C++ desktop wrapper..."
    local compiled=false
    if command -v pkg-config &> /dev/null; then
        if pkg-config --exists webkit2gtk-4.1; then
            print_info "Compiling with webkit2gtk-4.1..."
            g++ "$PROJECT_DIR/desktop_app.cpp" -o "$PROJECT_DIR/desktop_app" $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1) && compiled=true
        elif pkg-config --exists webkit2gtk-4.0; then
            print_info "Compiling with webkit2gtk-4.0..."
            g++ "$PROJECT_DIR/desktop_app.cpp" -o "$PROJECT_DIR/desktop_app" $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.0) && compiled=true
        fi
    fi

    if [ "$compiled" = false ]; then
        print_warning "Failed to compile C++ native webview wrapper. Falling back to Python PyQt6..."
        # Fallback to copy PyQt6 app if C++ compile fails (unlikely, but safe)
        cp "$PROJECT_DIR/desktop_app.py" "$PROJECT_DIR/desktop_app"
        chmod +x "$PROJECT_DIR/desktop_app"
    else
        print_success "C++ native desktop app compiled successfully!"
    fi

    print_info "Creating desktop shortcut..."
    DESKTOP_FILE="$HOME/.local/share/applications/nova.desktop"
    mkdir -p "$HOME/.local/share/applications"
    
    ICON_PATH="$PROJECT_DIR/nova_icon.png"

    cat << EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Nova AI Assistant (Development Stage)
Comment=High-tech personal AI voice assistant
Exec=$PROJECT_DIR/desktop_app
Icon=$ICON_PATH
Terminal=false
Type=Application
Categories=Utility;AI;
EOF
    
    chmod +x "$PROJECT_DIR/desktop_app"
    chmod +x "$DESKTOP_FILE"
    update-desktop-database "$HOME/.local/share/applications" &> /dev/null || true
    
    print_success "Native Desktop App (Development Stage) configured and shortcut created at $DESKTOP_FILE"
}

# Run the app interactively (if requested)
run_app() {
    print_header "Running Application"
    echo -e "How would you like to run the assistant now?"
    echo "1) Restart and ensure services run in background (Recommended)"
    echo "2) Run in terminal foreground (Development mode on port 22222)"
    echo "3) Exit setup (Keep services running in background)"
    read -p "Select option (1-3): " choice
    
    case $choice in
        1)
            print_info "Ensuring systemd user services are running..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            
            local services_to_start=()
            if [ "$INSTALL_TARGET" = "browser" ]; then
                services_to_start=(nova-assistant-web.service)
            elif [ "$INSTALL_TARGET" = "desktop" ]; then
                services_to_start=(nova-assistant-desktop.service nova-audio-desktop.service)
            else
                services_to_start=(nova-assistant-web.service nova-assistant-desktop.service nova-audio-desktop.service)
            fi
            
            systemctl --user daemon-reexec
            systemctl --user daemon-reload
            systemctl --user restart "${services_to_start[@]}"
            print_success "Background daemons are active!"
            print_info "RECOMMENDED WAY TO OPEN:"
            if [ "$INSTALL_TARGET" = "browser" ] || [ "$INSTALL_TARGET" = "both" ]; then
                echo -e "Browser App: Go to ${GREEN}http://localhost:22222${NC}"
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                echo -e "Desktop App: Launch from system menu or go to ${GREEN}http://localhost:22233${NC}"
            fi
            ;;
        2)
            print_info "Stopping background services to release ports..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            systemctl --user stop nova-assistant-web.service nova-assistant-desktop.service || true
            print_info "Starting dev server on port 22222..."
            PORT=22222 npm run dev
            ;;
        3)
            print_success "Setup complete! Assistant services are running in the background."
            print_info "RECOMMENDED WAY TO OPEN:"
            if [ "$INSTALL_TARGET" = "browser" ] || [ "$INSTALL_TARGET" = "both" ]; then
                echo -e "Browser App: Go to ${GREEN}http://localhost:22222${NC}"
            fi
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                echo -e "Desktop App: Launch from system menu or go to ${GREEN}http://localhost:22233${NC}"
            fi
            ;;
        *)
            print_warning "Invalid option, exiting setup."
            ;;
    esac
}

# Show help
show_help() {
    echo -e "${BLUE}Nova AI Assistant Installer${NC}"
    echo ""
    echo "USAGE:"
    echo "    ./install.sh [OPTION]"
    echo ""
    echo "OPTIONS:"
    echo "    install      Run dependency and permissions installer"
    echo "    dev          Run local development server directly"
    echo "    build        Install and compile code bundle"
    echo "    service      Configure and start the background systemd service"
    echo "    clean        Clean build files"
    echo "    help         Show this help message"
    echo ""
}

# Main Execution Flow
main() {
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cd "$SCRIPT_DIR"
    
    check_not_root
    
    case "${1:-interactive}" in
        install)
            select_installation_target
            install_system_dependencies
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            build_project
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                build_desktop_app
            else
                # Clean up desktop shortcut if installing as browser
                DESKTOP_FILE="$HOME/.local/share/applications/nova.desktop"
                if [ -f "$DESKTOP_FILE" ]; then
                    print_info "Removing old desktop shortcut..."
                    rm -f "$DESKTOP_FILE"
                    update-desktop-database "$HOME/.local/share/applications" &> /dev/null || true
                fi
            fi
            
            print_header "Installation Finished"
            if [ "$INSTALL_TARGET" = "browser" ]; then
                print_success "Browser App target configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "Open your favorite web browser (Chrome, Firefox, Brave, etc.) and go to:"
                echo -e "   ${GREEN}http://localhost:22222${NC}"
                echo -e "Browser usage is highly recommended for best performance, stability, and compatibility."
            elif [ "$INSTALL_TARGET" = "desktop" ]; then
                print_success "Desktop App (Development Stage) configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "1. Open in browser (Recommended for best performance and compatibility):"
                echo -e "   Go to ${GREEN}http://localhost:22233${NC} in Chrome/Firefox."
                echo -e "2. Run standalone Desktop App (Development Stage):"
                echo -e "   - Find and double click 'Nova AI Assistant (Development Stage)' in your desktop launcher."
                echo -e "   - Or execute in terminal: ${BLUE}./desktop_app${NC}"
            else
                print_success "Both Web and Desktop Apps configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "1. Access the Browser App:"
                echo -e "   Go to ${GREEN}http://localhost:22222${NC} in your favorite browser."
                echo -e "2. Access the Desktop App (Development Stage):"
                echo -e "   - Launch 'Nova AI Assistant (Development Stage)' from your applications menu (loads on port 22233)."
                echo -e "   - Or open in browser directly at: ${GREEN}http://localhost:22233${NC}"
            fi
            ;;
        dev)
            check_prerequisites
            install_dependencies
            setup_env
            npm run dev
            ;;
        build)
            check_prerequisites
            install_dependencies
            setup_env
            build_project
            ;;
        service)
            setup_permissions_and_service
            ;;
        clean)
            npm run clean 2>/dev/null || true
            print_success "Clean complete."
            ;;
        help|-h|--help)
            show_help
            ;;
        *)
            # Interactive Mode
            print_header "Nova OS Assistant Installer"
            select_installation_target
            install_system_dependencies
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            build_project
            if [ "$INSTALL_TARGET" = "desktop" ] || [ "$INSTALL_TARGET" = "both" ]; then
                build_desktop_app
            else
                # Clean up desktop shortcut if installing as browser
                DESKTOP_FILE="$HOME/.local/share/applications/nova.desktop"
                if [ -f "$DESKTOP_FILE" ]; then
                    print_info "Removing old desktop shortcut..."
                    rm -f "$DESKTOP_FILE"
                    update-desktop-database "$HOME/.local/share/applications" &> /dev/null || true
                fi
            fi
            
            if [ "$INSTALL_TARGET" = "browser" ]; then
                print_success "Browser App target configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "Open your favorite web browser (Chrome, Firefox, Brave, etc.) and go to:"
                echo -e "   ${GREEN}http://localhost:22222${NC}"
                echo -e "Browser usage is highly recommended for best performance, stability, and compatibility."
            elif [ "$INSTALL_TARGET" = "desktop" ]; then
                print_success "Desktop App (Development Stage) configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "1. Open in browser (Recommended for best performance and compatibility):"
                echo -e "   Go to ${GREEN}http://localhost:22233${NC} in Chrome/Firefox."
                echo -e "2. Run standalone Desktop App (Development Stage):"
                echo -e "   - Find and double click 'Nova AI Assistant (Development Stage)' in your desktop launcher."
                echo -e "   - Or execute in terminal: ${BLUE}./desktop_app${NC}"
            else
                print_success "Both Web and Desktop Apps configuration completed successfully!"
                print_info "RECOMMENDED WAY TO OPEN:"
                echo -e "1. Access the Browser App:"
                echo -e "   Go to ${GREEN}http://localhost:22222${NC} in your favorite browser."
                echo -e "2. Access the Desktop App (Development Stage):"
                echo -e "   - Launch 'Nova AI Assistant (Development Stage)' from your applications menu (loads on port 22233)."
                echo -e "   - Or open in browser directly at: ${GREEN}http://localhost:22233${NC}"
            fi
            run_app
            ;;
    esac
}

main "$@"
