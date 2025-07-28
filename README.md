# Keelan Engine - The Lightweight Container Engine

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

**Keelan Engine** is a minimalist container engine built from scratch.  
No daemons. No virtualization modules. No overhead.

Run multiple isolated apps on a single VPS with zero conflict and near-zero cost.

---

## ✨ Philosophy

> Build your own tools. Run them your way.

Keelan Engine isn't here to replace Docker.  
It's for devs who want to understand everything they run — down to the filesystem.

Every **crate** is a portable, isolated root filesystem.  
Every **ship** is a live process.  
No cgroups. No kernel modules. Just you and the system.

---

## 🚀 Features

- ⚡ **Ultra-fast** builds and execution (<100ms startup)
- 📦 **No dependency conflicts** – each app has its own rootfs
- 🧱 **Custom syntax** via `Keelanfile.yml`
- 🧊 **Zero overhead** – no daemons, no idle RAM usage
- 🛠️ **Designed for VPS & low-resource systems**

---

## 📦 Keelanfile.yml Example

```yaml
# Keelanfile.yml
build_context:
  base_image: "debian"
  work_directory: "/app"

build_steps:
  - action: execute_command
    description: "Update apt"
    command: ["apt-get", "update", "-y"]

  - action: execute_command
    description: "Install Python pip"
    command: ["apt-get", "install", "-y", "python3-pip"]

crate_config:
  expose_ports: [8000]
  environment_variables:
    PORT: "8000"

runtime_command: ["python3", "-m", "http.server", "8000"]
```

---

## ⚙️ Usage

```bash
# Build a crate from a directory with Keelanfile.yml
keelan build -w <directory> -n <name>

# Deploy the container (a.k.a. ship)
keelan ship deploy <name>

# List all crates and ships
keelan list

# Remove a crate
```

Each ship runs in its own environment using OverlayFS and `chroot`.  
It feels like Docker, but runs like native.

---

## 🚀 Get Started

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd shipper
   ```

2. Make install.sh executable:
   ```bash
   chmod +x install.sh
   ```

3. Run install.sh:
   ```bash
   ./install.sh
   ```

---

## 💡 Ideal For

- Personal VPS hosting
- CI sandboxing
- Local experiments
- Embedded systems

---

## 🧠 Requirements

- Linux with OverlayFS support
- Node.js 22+ and npm (recommended: Node.js 22, Node.js 24 has known issues with better-mysql3)
- **Must run on bare metal** (not inside Docker, chroot, or proot environments)
- **Root privileges required** for all commands
- No Docker required. No kernel modules.

---

## 📖 Documentation

### 📚 Complete Guides
- **[🚀 Quick Start Guide](QUICK_START.md)** - Get running in 5 minutes
- **[📋 Complete Documentation](DOCUMENTATION.md)** - Comprehensive project guide
- **[🔧 API Reference](API_REFERENCE.md)** - Technical API documentation
- **[⚙️ Daemon System](DAEMON.md)** - Background monitoring guide

### 📁 Additional Resources
- [examples/](examples/) - Example applications and configurations
- [docs/](docs/) - Additional documentation files

---

## 🤝 Contributing

This project is mostly built for personal use — but PRs are welcome if they align with the minimalist philosophy.

---

## 📄 License

Licensed under the [Apache 2.0 License](LICENSE)

---

> "When you build it yourself, you control everything."  
> — Keelan Engine
