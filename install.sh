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
    
    # 4. Systemd user service
    print_info "Configuring systemd user service..."
    SYSTEMD_USER_DIR="/home/$USER_NAME/.config/systemd/user"
    
    if [ -d "/home/$USER_NAME/.config/systemd" ]; then
        sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    fi
    
    mkdir -p "$SYSTEMD_USER_DIR"
    
    cat << EOF > "$SYSTEMD_USER_DIR/nova-assistant.service"
[Unit]
Description=Nova AI Assistant Daemon
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

    sudo chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.config/systemd"
    
    print_info "Enabling and starting systemd service..."
    export XDG_RUNTIME_DIR="/run/user/$(id -u $USER_NAME)"
    export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u $USER_NAME)/bus"
    
    systemctl --user daemon-reload
    systemctl --user enable nova-assistant.service
    systemctl --user restart nova-assistant.service
    
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
    echo "1) Start in background via Systemd daemon (Recommended)"
    echo "2) Run in terminal foreground (Development mode)"
    echo "3) Exit setup (Keep running in background)"
    read -p "Select option (1-3): " choice
    
    case $choice in
        1)
            print_info "Ensuring systemd user service is running..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            systemctl --user restart nova-assistant.service
            print_success "Background daemon is active!"
            echo "Access the assistant web UI at: http://localhost:3000"
            ;;
        2)
            print_info "Stopping background service to release ports..."
            export XDG_RUNTIME_DIR="/run/user/$(id -u)"
            export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
            systemctl --user stop nova-assistant.service || true
            print_info "Starting dev server..."
            npm run dev
            ;;
        3)
            print_success "Setup complete! Assistant is running in the background."
            echo "Access the assistant web UI at: http://localhost:3000"
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
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            build_project
            print_success "Installation successfully completed!"
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
            check_prerequisites
            install_dependencies
            setup_env
            setup_permissions_and_service
            setup_godo_integration
            build_project
            run_app
            ;;
    esac
}

main "$@"
