# Keelan Engine - Complete Project Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Core Components](#core-components)
4. [Installation & Setup](#installation--setup)
5. [Configuration](#configuration)
6. [CLI Commands](#cli-commands)
7. [Database Schema](#database-schema)
8. [Development Guide](#development-guide)
9. [Daemon System](#daemon-system)
10. [Security & Requirements](#security--requirements)
11. [Troubleshooting](#troubleshooting)
12. [Contributing](#contributing)

---

## Project Overview

**Keelan Engine** is a lightweight, minimalist container engine built from scratch as an alternative to Docker. It focuses on simplicity, performance, and understanding - allowing developers to run isolated applications without the overhead of traditional containerization solutions.

### Key Features

- ⚡ **Ultra-fast startup** (<100ms)
- 📦 **Zero dependency conflicts** with isolated root filesystems
- 🧱 **Custom YAML configuration** via `Keelanfile.yml`
- 🧊 **No daemon overhead** in core operations
- 🛠️ **VPS-optimized** for low-resource environments
- 🔧 **OverlayFS-based** filesystem isolation
- 🎯 **chroot-based** process isolation

### Core Concepts

- **Crates**: Container images (similar to Docker images)
- **Ships**: Running containers (similar to Docker containers)
- **Keelanfile.yml**: Build and runtime configuration
- **Layers**: Filesystem layers using OverlayFS

---

## Architecture

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Interface │    │  Core Engine    │    │   File System   │
│                 │    │                 │    │                 │
│ • Commands      │───▶│ • Crate Mgmt    │───▶│ • OverlayFS     │
│ • Validation    │    │ • Ship Mgmt     │    │ • chroot        │
│ • User I/O      │    │ • Process Mgmt  │    │ • Bind Mounts   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│    Database     │    │  Monitor Daemon │    │  Build System   │
│                 │    │                 │    │                 │
│ • SQLite        │    │ • Health Checks │    │ • Keelanfile    │
│ • Metadata      │    │ • Status Updates│    │ • Layer Build   │
│ • State Mgmt    │    │ • Process Track │    │ • Dependency    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Directory Structure

```
/var/lib/keelan/
├── crates/                 # Container images storage
│   ├── debian/             # Base Debian rootfs
│   └── {crate-name}/       # Individual crate filesystems
├── ships/                  # Running container data
│   └── {ship-name}/        # Ship-specific directories
│       ├── upper/          # Writable layer
│       ├── work/           # OverlayFS work directory
│       └── merged/         # Mounted filesystem
└── database/               # SQLite database files
```

---

## Core Components

### 1. CLI Interface (`src/index.ts`)

The main entry point providing a comprehensive command-line interface:

- **Command parsing** with yargs
- **Subcommand routing** to appropriate handlers
- **Global options** (verbose, quiet)
- **Error handling** and user feedback

### 2. Core Engine (`src/core/core.ts`)

Low-level operations for container management:

```typescript
// Key functions:
export function createDirectory(path: string): void
export function mountOverlayDirectory(lowerdir, upperdir, workdir, merge_path): void
export function mountBindDrive(path: string, mountpoint: string): void
export function checkMountpoint(mountpoint: string): boolean
export function mountCrate(lowerdir, upperdir, workdir, merge_path): void
export function unmountCrate(merge_path: string): void
export async function writeCrate(name, image, layer, sizeBytes, digest, keelanFileId): Promise<any>
export async function removeCrate(name: string, options): Promise<void>
export async function removeShip(shipID: string, options): Promise<void>
```

### 3. Configuration Parser (`src/keelan-parser.ts`)

Parses and validates `Keelanfile.yml` configurations:

```typescript
export interface KeelanConfig {
  build_context: BuildContext;
  build_steps: BuildStep[];
  crate_config: CrateConfig;
  runtime_entrypoint?: string[];
  runtime_command?: string[];
}

export class KeelanParser {
  static parseFromFile(filePath: string): KeelanConfig
  static parseFromString(content: string): KeelanConfig
}
```

### 4. Database Layer (`src/database/`)

SQLite-based persistence with Drizzle ORM:

- **schema.ts**: Database table definitions
- **db.ts**: Database connection and configuration
- **migrate.ts**: Database migration scripts

### 5. Command Handlers (`src/handlers/`)

Specialized handlers for each CLI command:

- **build.ts**: Crate building logic
- **deploy.ts**: Ship deployment
- **ship.ts**: Ship lifecycle management
- **crate.ts**: Crate management
- **daemon.ts**: Daemon control
- **config.ts**: Configuration management
- **remove.ts**: Resource cleanup

---

## Installation & Setup

### Prerequisites

- **Linux system** with OverlayFS support
- **Node.js 22+** (Node.js 24 has known issues with better-sqlite3)
- **Root privileges** for all operations
- **debootstrap** for base image creation

### Installation Steps

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd shipper
   ```

2. **Run the installation script**:
   ```bash
   chmod +x install.sh
   sudo ./install.sh
   ```

3. **Verify installation**:
   ```bash
   keelan --help
   ```

### What the installer does:

1. Updates system packages
2. Installs `debootstrap`
3. Creates base Debian rootfs in `/var/lib/keelan/crates/debian`
4. Installs build dependencies
5. Runs `npm install`, database migration, and build
6. Installs CLI globally
7. Creates and enables systemd service

---

## Configuration

### Keelanfile.yml Structure

```yaml
# Build configuration
build_context:
  base_image: "debian"          # Base image to use
  work_directory: "/app"         # Working directory in container

# Build steps (executed in order)
build_steps:
  - action: copy_files           # Copy files from host
    source: "./src"
    destination: "/app"
    
  - action: execute_command      # Run commands in container
    description: "Update apt"
    command: ["apt-get", "update", "-y"]
    fail_on_error: true          # Optional: fail build on error
    shell: false                 # Optional: use shell execution

# Runtime configuration
crate_config:
  expose_ports: [8000, 8080]     # Ports to expose
  environment_variables:         # Environment variables
    APP_DEBUG: "true"
    PORT: "8000"

# Runtime execution
runtime_entrypoint: ["python3"]  # Optional: entrypoint command
runtime_command: ["python3", "-m", "http.server", "8000"]
```

### Build Actions

1. **copy_files**: Copy files/directories from host to container
2. **execute_command**: Execute shell commands during build

### Environment Variables

- `BASE_DIRECTORY`: Base directory for logs and PID files
- Standard environment variables available in containers

---

## CLI Commands

### Ship Management

```bash
# Deploy a ship from a crate
keelan ship deploy <name> [--env dev|staging|production]

# Start a stopped ship
keelan ship start <name> [--env dev]

# Stop a running ship
keelan ship stop <name> [--force]

# Restart a ship
keelan ship restart <name> [--env dev]

# Remove a ship
keelan ship remove <name> [--force] [--recursive]

# List all ships
keelan ship list
```

### Crate Management

```bash
# Build a crate from Keelanfile.yml
keelan build --workingDirectory <dir> --name <name> [--production]

# List all crates
keelan crate list

# Remove a crate
keelan crate remove <name> [--force]
```

### Configuration

```bash
# Set configuration value
keelan config <key> <value>

# List all configuration
keelan config --list

# Reset to defaults
keelan config --reset
```

### Daemon Management

```bash
# Start monitoring daemon
keelan daemon start [--interval 30] [--foreground]

# Stop daemon
keelan daemon stop

# Check daemon status
keelan daemon status

# Restart daemon
keelan daemon restart
```

### Monitoring

```bash
# One-time ship status check
keelan monitor

# Continuous monitoring
keelan monitor --watch [--interval 30]
```

### Project Initialization

```bash
# Create a new Keelanfile.yml
keelan init
```

---

## Database Schema

### Tables

#### keelan_files
Stores Keelanfile configurations:
```sql
CREATE TABLE keelan_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  checksum TEXT UNIQUE
);
```

#### keelan_crate
Stores crate (image) metadata:
```sql
CREATE TABLE keelan_crate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  keelan_file_id INTEGER REFERENCES keelan_files(id),
  base_image TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  size_bytes INTEGER,
  digest TEXT UNIQUE,
  layer TEXT NOT NULL,
  UNIQUE(name, tag)
);
```

#### keelan_ships
Stores ship (container) runtime data:
```sql
CREATE TABLE keelan_ships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  image_id INTEGER NOT NULL REFERENCES keelan_crate(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  stopped_at TEXT,
  exit_code INTEGER,
  process_id INTEGER
);
```

---

## Development Guide

### Project Structure

```
src/
├── index.ts              # CLI entry point
├── constants.ts          # System constants
├── keelan-parser.ts      # Configuration parser
├── core/
│   ├── core.ts          # Core container operations
│   └── layer.ts         # Layer management
├── database/
│   ├── db.ts           # Database connection
│   ├── schema.ts       # Table definitions
│   └── migrate.ts      # Migration scripts
├── handlers/           # Command handlers
├── daemon/            # Background monitoring
├── utils/             # Utility functions
└── types/             # Type definitions
```

### Development Commands

```bash
# Development mode with hot reload
npm run dev

# Build TypeScript
npm run build

# Run migrations
npm run migrate

# Reset database
npm run reset
```

### Adding New Commands

1. **Create handler** in `src/handlers/`
2. **Add command definition** in `src/index.ts`
3. **Import and wire** the handler
4. **Update documentation**

### Code Style

- **TypeScript** with strict type checking
- **ES modules** (`"type": "module"`)
- **Async/await** for asynchronous operations
- **Error handling** with try/catch blocks
- **Chalk** for colored console output

---

## Daemon System

The monitoring daemon provides continuous health checking for running ships.

### Features

- **Background monitoring** of ship processes
- **Automatic status updates** in database
- **Graceful shutdown** handling
- **Configurable intervals**
- **Comprehensive logging**
- **PID file management**

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Ship Deploy   │───▶│  Detached Proc  │───▶│  Process Track  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   DB Record     │◄───│  Monitor Daemon │───▶│  Health Check   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Configuration

- **Default interval**: 30 seconds
- **Log file**: `${BASE_DIRECTORY}/logs/monitor-daemon.log`
- **PID file**: `${BASE_DIRECTORY}/run/monitor-daemon.pid`

---

## Security & Requirements

### System Requirements

- **Linux** with OverlayFS support
- **Root privileges** required for:
  - Mount operations
  - chroot execution
  - System directory access
- **Cannot run inside**:
  - Docker containers
  - chroot environments
  - proot environments

### Security Considerations

- **Root execution**: All operations require root privileges
- **Process isolation**: Uses chroot for process containment
- **Filesystem isolation**: OverlayFS provides layer separation
- **No network isolation**: Ships share host network
- **No resource limits**: No cgroups or resource constraints

### Limitations

- **No networking isolation**
- **No resource limiting**
- **Linux-only**
- **Root-only execution**
- **No security sandboxing**

---

## Troubleshooting

### Common Issues

#### 1. Permission Denied
```bash
# Ensure running as root
sudo keelan <command>
```

#### 2. Mount Point Busy
```bash
# Check active mounts
mount | grep keelan

# Force unmount
sudo umount -f /path/to/mount
```

#### 3. Database Locked
```bash
# Reset database
npm run reset
```

#### 4. Daemon Not Starting
```bash
# Check daemon status
keelan daemon status

# Run in foreground for debugging
keelan daemon start --foreground

# Check logs
tail -f logs/monitor-daemon.log
```

#### 5. Build Failures
```bash
# Check Keelanfile.yml syntax
keelan build --workingDirectory . --name test

# Verify base image exists
ls -la /var/lib/keelan/crates/debian
```

### Debug Mode

```bash
# Enable verbose logging
keelan --verbose <command>

# Run daemon in foreground
keelan daemon start --foreground
```

### Log Locations

- **Daemon logs**: `logs/monitor-daemon.log`
- **Build logs**: Console output
- **System logs**: `/var/log/syslog` (for systemd service)

---

## Contributing

### Philosophy

Keelan Engine follows a **minimalist philosophy**:

- **Simplicity over features**
- **Understanding over abstraction**
- **Performance over convenience**
- **Transparency over magic**

### Contribution Guidelines

1. **Align with philosophy**: Features should maintain simplicity
2. **No external dependencies**: Minimize new dependencies
3. **Performance first**: Optimize for speed and resource usage
4. **Documentation**: Update docs for any changes
5. **Testing**: Ensure changes don't break existing functionality

### Development Setup

```bash
# Clone and setup
git clone <repository-url>
cd shipper
npm install
npm run migrate
npm run build

# Development workflow
npm run dev        # Development mode
npm run build      # Build for production
npm test          # Run tests (if available)
```

### Pull Request Process

1. **Fork** the repository
2. **Create feature branch**
3. **Make changes** following guidelines
4. **Test thoroughly**
5. **Update documentation**
6. **Submit pull request**

---

## License

Licensed under the [Apache 2.0 License](LICENSE)

---

> "When you build it yourself, you control everything."  
> — Keelan Engine

---

*This documentation covers the complete Keelan Engine project. For specific implementation details, refer to the source code and inline comments.*