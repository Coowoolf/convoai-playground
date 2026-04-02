import { NextResponse } from 'next/server';

const INSTALL_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# convoai installer — one-liner install for Agora ConvoAI CLI
# curl -fsSL https://convobench.org/install.sh | bash
# ─────────────────────────────────────────────────────────────

BOLD="\\033[1m"
CYAN="\\033[1;36m"
BLUE="\\033[1;34m"
GREEN="\\033[1;32m"
RED="\\033[1;31m"
DIM="\\033[2m"
RESET="\\033[0m"

SYM_INFO="▸"
SYM_OK="✔"
SYM_ERR="✖"

info()    { printf "\${CYAN}\${SYM_INFO} %s\${RESET}\\n" "$*"; }
success() { printf "\${GREEN}\${SYM_OK} %s\${RESET}\\n" "$*"; }
error()   { printf "\${RED}\${SYM_ERR} %s\${RESET}\\n" "$*" >&2; }
fatal()   { error "$@"; exit 1; }

banner() {
  printf "\\n"
  printf "\${BLUE}        ___         \${CYAN}/\\\\\\\\\\${RESET}\\n"
  printf "\${BLUE}       / _ \\\\\\\\      \${CYAN}/ \${BOLD}⚡\${RESET}\${CYAN} \\\\\\\\\\${RESET}\\n"
  printf "\${BLUE}      / /\${CYAN}\\\\\\\\\${BLUE} \\\\\\\\    \${CYAN}/    \\\\\\\\ \\\\\\\\\\${RESET}\\n"
  printf "\${BLUE}     / /  \${CYAN}\\\\\\\\_\\\\\\\\__/\${BLUE}  ____\${CYAN}\\\\\\\\>\\${RESET}\\n"
  printf "\${BLUE}    /_/   \${CYAN}\\\\\\\\______\${BLUE}/ \${CYAN}/\\${RESET}\\n"
  printf "\${BLUE}           \${CYAN}\\\\\\\\      /\\${RESET}\\n"
  printf "\${BLUE}            \${CYAN}\\\\\\\\____/\\${RESET}\\n"
  printf "\\n"
  printf "\${BOLD}\${BLUE}    c o n v o a i\${RESET}\\n"
  printf "\${DIM}    Works everywhere. Installs everything. ⚡🐦\${RESET}\\n"
  printf "\\n"
}

detect_os() {
  case "$(uname -s)" in
    Darwin) OS="macos" ;;
    Linux)  OS="linux" ;;
    *)      OS="unknown" ;;
  esac
}

detect_linux_pkg() {
  if command -v apt-get &>/dev/null; then
    LINUX_PKG="apt"
  elif command -v yum &>/dev/null; then
    LINUX_PKG="yum"
  else
    LINUX_PKG="unknown"
  fi
}

NODE_MIN=18

check_node() {
  if command -v node &>/dev/null; then
    NODE_VER="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "$NODE_VER" -ge "$NODE_MIN" ] 2>/dev/null; then
      success "Node.js v$(node -v | sed 's/^v//') detected"
      return 0
    else
      info "Node.js $(node -v) found but >= v\${NODE_MIN} is required"
      return 1
    fi
  else
    info "Node.js not found"
    return 1
  fi
}

install_node_macos() {
  info "Installing Node.js via Homebrew (macOS)..."
  if ! command -v brew &>/dev/null; then
    info "Homebrew not found — installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    if [ -f /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -f /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
    success "Homebrew installed"
  fi
  brew install node
  success "Node.js $(node -v | sed 's/^v//') installed via Homebrew"
}

install_node_linux_apt() {
  info "Installing Node.js 22.x via NodeSource (apt)..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  success "Node.js $(node -v | sed 's/^v//') installed via apt"
}

install_node_linux_yum() {
  info "Installing Node.js 22.x via NodeSource (yum)..."
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo yum install -y nodejs
  success "Node.js $(node -v | sed 's/^v//') installed via yum"
}

install_node() {
  detect_os
  case "$OS" in
    macos) install_node_macos ;;
    linux)
      detect_linux_pkg
      case "$LINUX_PKG" in
        apt) install_node_linux_apt ;;
        yum) install_node_linux_yum ;;
        *) fatal "Unsupported Linux package manager. Please install Node.js >= \${NODE_MIN} manually: https://nodejs.org/en/download" ;;
      esac ;;
    *) fatal "Unsupported OS. Please install Node.js >= \${NODE_MIN} manually: https://nodejs.org/en/download" ;;
  esac
}

ensure_node() {
  if ! check_node; then
    install_node
    if ! command -v node &>/dev/null; then
      fatal "Node.js installation failed. Please install manually: https://nodejs.org/en/download"
    fi
    success "Node.js is ready"
  fi
}

install_convoai() {
  info "Installing convoai CLI..."
  if npm install -g convoai@latest 2>/dev/null; then
    success "convoai CLI installed"
  elif sudo npm install -g convoai@latest; then
    success "convoai CLI installed (with sudo)"
  else
    fatal "Failed to install convoai. Please try: sudo npm install -g convoai@latest"
  fi
}

main() {
  banner
  ensure_node
  install_convoai
  printf "\\n"
  success "All set! Launching quickstart...\\n"
  printf "\\n"
  exec convoai quickstart
}

main
`;

export async function GET() {
  return new NextResponse(INSTALL_SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
