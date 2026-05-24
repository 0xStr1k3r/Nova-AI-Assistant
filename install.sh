#!/bin/bash

##############################################################################
# Nexus OS Voice Assistant - Installation and Setup Script
# This script handles dependency installation and running the application
##############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if Node.js is installed
check_nodejs() {
    print_header "Checking Prerequisites"
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js from https://nodejs.org/"
        exit 1
    fi
    
    NODE_VERSION=$(node -v)
    print_success "Node.js is installed: $NODE_VERSION"
    
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    NPM_VERSION=$(npm -v)
    print_success "npm is installed: $NPM_VERSION"
}

# Install dependencies
install_dependencies() {
    print_header "Installing Dependencies"
    
    if [ -d "node_modules" ]; then
        print_warning "node_modules already exists"
        read -p "Do you want to reinstall dependencies? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Removing existing node_modules..."
            rm -rf node_modules
            npm install
        else
            print_info "Skipping dependency installation"
        fi
    else
        print_info "Installing npm packages..."
        npm install
    fi
    
    print_success "Dependencies installed successfully"
}

# Setup environment variables
setup_env() {
    print_header "Setting Up Environment Variables"
    
    if [ ! -f ".env" ]; then
        if [ -f ".env.example" ]; then
            print_info "Creating .env from .env.example..."
            cp .env.example .env
            print_warning "Please update .env with your actual values:"
            print_warning "  - GEMINI_API_KEY: Your Gemini API key from https://aistudio.google.com"
            print_warning "  - APP_URL: The URL where your app is hosted (e.g., http://localhost:5173)"
            read -p "Press Enter once you've updated .env..."
        fi
    else
        print_success ".env already exists"
    fi
    
    # Check for GEMINI_API_KEY
    if grep -q "GEMINI_API_KEY=" .env && grep -q "MY_GEMINI_API_KEY" .env; then
        print_warning "GEMINI_API_KEY is not set in .env!"
        print_info "You can set it now or run the app without it"
    fi
}

# Build the project
build_project() {
    print_header "Building Project"
    
    print_info "Running build script..."
    npm run build
    
    if [ -d "dist" ]; then
        print_success "Build completed successfully"
    else
        print_error "Build failed - dist directory not created"
        exit 1
    fi
}

# Run the application
run_app() {
    print_header "Running Application"
    
    read -p "Select mode to run:
    1) Development mode (npm run dev)
    2) Production mode (npm run build && npm start)
    3) Skip running (just install)
    
    Enter choice (1-3): " choice
    
    case $choice in
        1)
            print_info "Starting development server..."
            print_info "The app will be available at http://localhost:5173"
            npm run dev
            ;;
        2)
            print_info "Building for production..."
            npm run build
            print_success "Build completed"
            print_info "Starting production server..."
            npm start
            ;;
        3)
            print_success "Installation complete! To run the app:"
            echo ""
            echo "  Development mode:"
            echo "    npm run dev"
            echo ""
            echo "  Production mode:"
            echo "    npm run build"
            echo "    npm start"
            echo ""
            ;;
        *)
            print_error "Invalid choice"
            exit 1
            ;;
    esac
}

# Cleanup
cleanup_build() {
    print_header "Cleaning Build Artifacts"
    npm run clean 2>/dev/null || true
    print_success "Build artifacts cleaned"
}

# Help text
show_help() {
    cat << EOF
${BLUE}Nexus OS Voice Assistant - Installation Script${NC}

USAGE:
    ./install.sh [OPTION]

OPTIONS:
    install     Install dependencies only
    dev         Install and run in development mode
    build       Install and build for production
    clean       Clean build artifacts
    help        Show this help message

EXAMPLES:
    ./install.sh install    # Install dependencies
    ./install.sh dev        # Install and run development server
    ./install.sh build      # Install and build for production
    ./install.sh           # Interactive mode (asks for each step)

ENVIRONMENT VARIABLES:
    You need to set the following in .env:
    - GEMINI_API_KEY: Your Google Gemini API key
    - APP_URL: Your application URL (for development, typically http://localhost:5173)

GETTING STARTED:
    1. Clone the repository
    2. Run: ./install.sh
    3. Follow the interactive prompts
    4. Update .env with your API keys
    5. Start developing!

For more information, see README.md
EOF
}

##############################################################################
# Main Script
##############################################################################

main() {
    # Get the directory where the script is located
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
    cd "$SCRIPT_DIR"
    
    print_header "Nexus OS Voice Assistant - Setup"
    
    case "${1:-interactive}" in
        install)
            check_nodejs
            install_dependencies
            setup_env
            print_success "Installation complete!"
            ;;
        dev)
            check_nodejs
            install_dependencies
            setup_env
            print_success "Starting development server..."
            npm run dev
            ;;
        build)
            check_nodejs
            install_dependencies
            setup_env
            build_project
            print_success "Build complete! To run in production:"
            echo "  npm start"
            ;;
        clean)
            cleanup_build
            ;;
        help|-h|--help)
            show_help
            ;;
        *)
            check_nodejs
            install_dependencies
            setup_env
            run_app
            ;;
    esac
}

# Run main function
main "$@"
