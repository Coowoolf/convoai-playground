#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# convoai installer — one-liner install for Agora ConvoAI CLI
# curl -fsSL https://convobench.org/install.sh | bash
# ─────────────────────────────────────────────────────────────

# ── Colors & symbols ─────────────────────────────────────────

BOLD="\033[1m"
CYAN="\033[1;36m"
BLUE="\033[1;34m"
GREEN="\033[1;32m"
RED="\033[1;31m"
DIM="\033[2m"
RESET="\033[0m"

SYM_INFO="▸"
SYM_OK="✔"
SYM_ERR="✖"

info()    { printf "${CYAN}${SYM_INFO} %s${RESET}\n" "$*"; }
success() { printf "${GREEN}${SYM_OK} %s${RESET}\n" "$*"; }
error()   { printf "${RED}${SYM_ERR} %s${RESET}\n" "$*" >&2; }
fatal()   { error "$@"; exit 1; }

# ── Banner ───────────────────────────────────────────────────

banner() {
  local P="\033[38;2;120;106;244m"
  local B="\033[38;2;91;142;255m"
  local W="\033[38;2;200;200;255m"
  printf "\n"
  printf "  ${P}   ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▖${RESET}\n"
  printf "  ${P}   ▐${B}              ${P}▌${RESET}\n"
  printf "  ${P}   ▐${B}  ${W}██${B}    ${W}██${B}   ${P}▌${RESET}    ${BOLD}${P}ConvoAI Installer${RESET}\n"
  printf "  ${P}   ▐${B}    ${W}▀▀▀▀${B}    ${P}▌${RESET}    Works everywhere. Installs everything.\n"
  printf "  ${P}   ▐${B}              ${P}▌${RESET}    ${DIM}Powered by Agora ⚡🐦${RESET}\n"
  printf "  ${P}   ▝▀▀▀▀▀▀▀█▀▀▀▀▘${RESET}\n"
  printf "  ${P}            ▀▚${RESET}\n"
  printf "\n"
}

# ── OS detection ─────────────────────────────────────────────

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

# ── Node.js ──────────────────────────────────────────────────

NODE_MIN=18

check_node() {
  if command -v node &>/dev/null; then
    NODE_VER="$(node -v | sed 's/^v//' | cut -d. -f1)"
    if [ "$NODE_VER" -ge "$NODE_MIN" ] 2>/dev/null; then
      success "Node.js v$(node -v | sed 's/^v//') detected"
      return 0
    else
      info "Node.js $(node -v) found but >= v${NODE_MIN} is required"
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

    # Ensure brew is on PATH for Apple Silicon and Intel Macs
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
    macos)
      install_node_macos
      ;;
    linux)
      detect_linux_pkg
      case "$LINUX_PKG" in
        apt) install_node_linux_apt ;;
        yum) install_node_linux_yum ;;
        *)
          fatal "Unsupported Linux package manager. Please install Node.js >= ${NODE_MIN} manually: https://nodejs.org/en/download"
          ;;
      esac
      ;;
    *)
      fatal "Unsupported OS. Please install Node.js >= ${NODE_MIN} manually: https://nodejs.org/en/download"
      ;;
  esac
}

ensure_node() {
  if ! check_node; then
    install_node
    # Verify installation succeeded
    if ! command -v node &>/dev/null; then
      fatal "Node.js installation failed. Please install manually: https://nodejs.org/en/download"
    fi
    success "Node.js is ready"
  fi
}

# ── Install convoai CLI ──────────────────────────────────────

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

# ── Main ─────────────────────────────────────────────────────

main() {
  banner

  # Anonymous install tracking
  curl -sS -X POST https://convobench.org/api/t \
    -H 'Content-Type: application/json' \
    -d '{"event":"install"}' \
    --max-time 2 &>/dev/null &

  ensure_node
  install_convoai

  printf "\n"
  success "All set! Launching quickstart...\n"
  printf "\n"

  exec convoai quickstart </dev/tty
}

main
