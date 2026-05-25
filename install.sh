#!/bin/bash

##############################################################################
# Nova AI Assistant - Consolidated Installation & Setup Script (Web Target Only)
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
}

# Install system dependencies based on distro
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
            pkgs=(build-essential pkg-config git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            ;;
            
        fedora)
            install_cmd="sudo dnf install -y"
            pkgs=(gcc gcc-c++ make pkgconfig git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            ;;
            
        arch)
            install_cmd="sudo pacman -S --noconfirm --needed"
            pkgs=(base-devel pkgconf git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            ;;
            
        rhel)
            install_cmd="sudo dnf install -y"
            pkgs=(gcc gcc-c++ make pkgconfig git curl)
            
            if ! command -v node &> /dev/null; then
                pkgs+=(nodejs npm)
            fi
            ;;
            
        *)
            # Check distro-like fallback
            if [[ "$DISTRO_LIKE" =~ "debian" ]] || [[ "$DISTRO_LIKE" =~ "ubuntu" ]]; then
                install_cmd="sudo apt-get update && sudo apt-get install -y"
                pkgs=(build-essential pkg-config git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
            elif [[ "$DISTRO_LIKE" =~ "fedora" ]] || [[ "$DISTRO_LIKE" =~ "rhel" ]]; then
                install_cmd="sudo dnf install -y"
                pkgs=(gcc gcc-c++ make pkgconfig git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
            elif [[ "$DISTRO_LIKE" =~ "arch" ]]; then
                install_cmd="sudo pacman -S --noconfirm --needed"
                pkgs=(base-devel pkgconf git curl)
                if ! command -v node &> /dev/null; then pkgs+=(nodejs npm); fi
            else
                print_warning "Unable to auto-detect a supported package manager for distribution: $DISTRO_ID"
                print_warning "Please manually install build tools, pkg-config, git, and curl."
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
            echo "PORT=22222" >> .env
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

    # Force port to 22222 in .env since we only run web now
    if grep -q "^PORT=" .env; then
        sed -i "s|^PORT=.*|PORT=22222|" .env
    else
        echo "PORT=22222" >> .env
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
    
    # 1. Passwordless sudo for voice commands
    print_info "Configuring passwordless sudo for voice assistant command execution..."
    SUDOERS_FILE="/etc/sudoers.d/nova-voice-assistant"
    sudo bash -c "cat << 'EOF' > $SUDOERS_FILE
# Nova AI Assistant command execution rule
$USER_NAME ALL=(ALL) NOPASSWD: ALL
EOF"
    sudo chmod 0440 "$SUDOERS_FILE"
    
    # 2. Session lingering
    print_info "Enabling user session lingering..."
    sudo loginctl enable-linger "$USER_NAME"
    
    # 3. Systemd user service
    print_info "Configuring systemd user service..."
    SYSTEMD_USER_DIR="/home/$USER_NAME/.config/systemd/user"
    
    if [ -d "/home/$USER_NAME/.config/systemd" ]; then
        sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    fi
    
    mkdir -p "$SYSTEMD_USER_DIR"
    
    # Remove deprecated single service files to avoid conflicts
    rm -f "$SYSTEMD_USER_DIR/nova-assistant.service" "$SYSTEMD_USER_DIR/nova-audio.service"
    rm -f "$SYSTEMD_USER_DIR/nova-assistant-desktop.service" "$SYSTEMD_USER_DIR/nova-audio-desktop.service"
    
    # Web Services (Port 22222)
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

    sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    
    print_info "Enabling and starting systemd services..."
    export XDG_RUNTIME_DIR="/run/user/$(id -u $USER_NAME)"
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u $USER_NAME)/bus"
    
    systemctl --user daemon-reexec
    systemctl --user daemon-reload
    
    systemctl --user enable nova-assistant-web.service
    systemctl --user restart nova-assistant-web.service
    
    print_success "System permissions and background service configured successfully!"
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

# Optional Developer CLI Integrations
setup_cli_integrations() {
    print_header "Optional Developer CLI Integrations"
    
    # 1. OpenCode CLI
    read -p "Would you like to install the OpenCode Developer Agent CLI (opencode-ai) globally? (y/n): " opencode_choice
    if [[ "$opencode_choice" =~ ^[Yy]$ ]]; then
        print_info "Installing opencode-ai globally via npm (requires sudo)..."
        if sudo npm install -g opencode-ai; then
            print_success "OpenCode CLI installed successfully!"
        else
            print_error "Failed to install opencode-ai. You can install it manually using: sudo npm install -g opencode-ai"
        fi
    fi

    # 2. Claude Code CLI
    read -p "Would you like to install Anthropic's Claude Code CLI (@anthropic-ai/claude-code) globally? (y/n): " claude_choice
    if [[ "$claude_choice" =~ ^[Yy]$ ]]; then
        print_info "Installing @anthropic-ai/claude-code globally via npm (requires sudo)..."
        if sudo npm install -g @anthropic-ai/claude-code; then
            print_success "Claude Code CLI installed successfully!"
        else
            print_error "Failed to install Claude Code CLI. You can install it manually using: sudo npm install -g @anthropic-ai/claude-code"
        fi
    fi

    # 3. GitHub Copilot CLI
    read -p "Would you like to install GitHub Copilot CLI (@github/copilot-cli) globally? (y/n): " copilot_choice
    if [[ "$copilot_choice" =~ ^[Yy]$ ]]; then
        print_info "Installing @github/copilot-cli globally via npm (requires sudo)..."
        if sudo npm install -g @github/copilot-cli; then
            print_success "GitHub Copilot CLI installed successfully!"
        else
            print_error "Failed to install GitHub Copilot CLI. You can install it manually using: sudo npm install -g @github/copilot-cli"
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

# Run the app interactively (if requested)
run_app() {
    print_header "Running Application"
    echo -e "How would you like to run the assistant now?"
    echo "1) Restart and ensure service runs in background (Recommended)"
    echo "2) Run in terminal foreground (Development mode on port 22222)"
    echo "3) Exit setup (Keep service running in background)"
    read -p "Select option (1-3): " choice
    
    case $choice in
        1)
            print_info "Ensuring systemd user services are running..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            
            systemctl --user daemon-reexec
            systemctl --user daemon-reload
            systemctl --user restart nova-assistant-web.service
            print_success "Background daemon is active!"
            print_info "RECOMMENDED WAY TO OPEN:"
            echo -e "Browser App: Go to ${GREEN}http://localhost:22222${NC}"
            ;;
        2)
            print_info "Stopping background service to release ports..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            systemctl --user stop nova-assistant-web.service || true
            print_info "Starting dev server on port 22222..."
            PORT=22222 npm run dev
            ;;
        3)
            print_success "Setup complete! Assistant service is running in the background."
            print_info "RECOMMENDED WAY TO OPEN:"
            echo -e "Browser App: Go to ${GREEN}http://localhost:22222${NC}"
            ;;
        *)
            print_warning "Invalid option, exiting setup."
            ;;
    esac
}

# Show help
show_help() {
    echo -e "${BLUE}Nova AI Assistant Installer (Web Target Only)${NC}"
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
            install_system_dependencies
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            setup_cli_integrations
            build_project
            
            print_header "Installation Finished"
            print_success "Browser App target configuration completed successfully!"
            print_info "RECOMMENDED WAY TO OPEN:"
            echo -e "Open your favorite web browser (Chrome, Firefox, Brave, etc.) and go to:"
            echo -e "   ${GREEN}http://localhost:22222${NC}"
            echo -e "Browser usage is highly recommended for best performance, stability, and compatibility."
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
            print_header "Nova OS Assistant Installer (Web Target Only)"
            install_system_dependencies
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            setup_cli_integrations
            build_project
            
            print_success "Browser App target configuration completed successfully!"
            print_info "RECOMMENDED WAY TO OPEN:"
            echo -e "Open your favorite web browser (Chrome, Firefox, Brave, etc.) and go to:"
            echo -e "   ${GREEN}http://localhost:22222${NC}"
            echo -e "Browser usage is highly recommended for best performance, stability, and compatibility."
            run_app
            ;;
    esac
}

main "$@"
