# Keelan Engine - Quick Start Guide

## 🚀 Get Running in 5 Minutes

This guide will get you from zero to running your first containerized application with Keelan Engine.

---

## Prerequisites Check

Before starting, ensure you have:

- ✅ **Linux system** (Ubuntu, Debian, CentOS, etc.)
- ✅ **Root access** (`sudo` privileges)
- ✅ **Node.js 22+** installed
- ✅ **Git** for cloning the repository

```bash
# Quick system check
node --version    # Should be 22.x or higher
sudo whoami      # Should return 'root'
uname -a         # Should show Linux
```

---

## Step 1: Install Keelan Engine

```bash
# Clone the repository
git clone <repository-url>
cd shipper

# Make installer executable and run
chmod +x install.sh
sudo ./install.sh
```

**What this does:**
- Installs system dependencies
- Creates base Debian filesystem
- Builds and installs Keelan CLI
- Sets up systemd service

**Verify installation:**
```bash
keelan --help
```

---

## Step 2: Create Your First Project

```bash
# Create a new directory for your project
mkdir my-first-app
cd my-first-app

# Initialize Keelan project
keelan init
```

This creates a `Keelanfile.yml` with basic configuration.

---

## Step 3: Customize Your Application

### Option A: Simple Python Web Server

Edit `Keelanfile.yml`:

```yaml
build_context:
  base_image: "debian"
  work_directory: "/app"

build_steps:
  - action: execute_command
    description: "Update package lists"
    command: ["apt-get", "update", "-y"]
    
  - action: execute_command
    description: "Install Python3"
    command: ["apt-get", "install", "-y", "python3"]
    
  - action: copy_files
    source: "./app"
    destination: "/app"

crate_config:
  expose_ports: [8000]
  environment_variables:
    PORT: "8000"
    PYTHONPATH: "/app"

runtime_command: ["python3", "-m", "http.server", "8000"]
```

Create your app directory and files:

```bash
# Create app directory
mkdir app

# Create a simple HTML file
cat > app/index.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>My First Keelan App</title>
</head>
<body>
    <h1>🎉 Hello from Keelan Engine!</h1>
    <p>Your containerized app is running successfully.</p>
</body>
</html>
EOF
```

### Option B: Node.js Application

Edit `Keelanfile.yml`:

```yaml
build_context:
  base_image: "debian"
  work_directory: "/app"

build_steps:
  - action: execute_command
    description: "Update apt"
    command: ["apt-get", "update", "-y"]
    
  - action: execute_command
    description: "Install curl"
    command: ["apt-get", "install", "-y", "curl"]
    
  - action: execute_command
    description: "Install Node.js"
    command: ["curl", "-sL", "https://deb.nodesource.com/setup_18.x", "|", "bash", "-"]
    shell: true
    
  - action: execute_command
    description: "Install Node.js package"
    command: ["apt-get", "install", "-y", "nodejs"]
    
  - action: copy_files
    source: "./app"
    destination: "/app"
    
  - action: execute_command
    description: "Install dependencies"
    command: ["npm", "install"]

crate_config:
  expose_ports: [3000]
  environment_variables:
    NODE_ENV: "production"
    PORT: "3000"

runtime_command: ["node", "index.js"]
```

Create Node.js app:

```bash
# Create app directory
mkdir app
cd app

# Create package.json
cat > package.json << EOF
{
  "name": "my-keelan-app",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "express": "^4.18.0"
  }
}
EOF

# Create simple Express server
cat > index.js << EOF
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 Hello from Keelan Engine!</h1>
    <p>Your Node.js app is running in a container.</p>
    <p>Environment: ${process.env.NODE_ENV}</p>
  `);
});

app.listen(port, () => {
  console.log(\`Server running on port ${port}\`);
});
EOF

cd ..
```

---

## Step 4: Build Your Crate

```bash
# Build the container image (crate)
sudo keelan build --workingDirectory . --name my-first-app
```

**What happens:**
- Keelan reads your `Keelanfile.yml`
- Creates isolated filesystem
- Executes build steps in order
- Stores the crate for deployment

**Verify the build:**
```bash
sudo keelan crate list
```

---

## Step 5: Deploy Your Ship

```bash
# Deploy the container (ship)
sudo keelan ship deploy my-first-app
```

**What happens:**
- Creates isolated runtime environment
- Mounts filesystem layers
- Starts your application process
- Tracks the running container

**Check your running ships:**
```bash
sudo keelan ship list
```

---

## Step 6: Access Your Application

Your application is now running! Access it at:

- **Python server**: `http://localhost:8000`
- **Node.js server**: `http://localhost:3000`

```bash
# Test with curl
curl http://localhost:8000  # For Python app
curl http://localhost:3000  # For Node.js app

# Or open in browser
# Navigate to the appropriate URL
```

---

## Step 7: Manage Your Application

### View Application Status
```bash
# List all ships with status
sudo keelan ship list

# Monitor continuously
sudo keelan monitor --watch
```

### Stop Your Application
```bash
sudo keelan ship stop my-first-app
```

### Start Again
```bash
sudo keelan ship start my-first-app
```

### Restart
```bash
sudo keelan ship restart my-first-app
```

### Remove When Done
```bash
# Remove the running ship
sudo keelan ship remove my-first-app

# Remove the crate (optional)
sudo keelan crate remove my-first-app
```

---

## Next Steps

### 🔧 Advanced Configuration

Explore more build actions in your `Keelanfile.yml`:

```yaml
build_steps:
  # Install packages
  - action: execute_command
    description: "Install git"
    command: ["apt-get", "install", "-y", "git"]
    
  # Copy specific files
  - action: copy_files
    source: "./config"
    destination: "/etc/myapp"
    
  # Run with shell
  - action: execute_command
    description: "Download dependencies"
    command: ["wget", "https://example.com/file.tar.gz", "&&", "tar", "-xzf", "file.tar.gz"]
    shell: true
    
  # Set working directory
  - action: execute_command
    description: "Build application"
    command: ["make", "build"]
```

### 🔍 Monitoring & Debugging

```bash
# Start monitoring daemon
sudo keelan daemon start

# Check daemon status
sudo keelan daemon status

# View logs
sudo tail -f logs/monitor-daemon.log

# Debug mode
sudo keelan --verbose ship deploy my-app
```

### 🌍 Multiple Environments

```bash
# Deploy to different environments
sudo keelan ship deploy my-app --env dev
sudo keelan ship deploy my-app --env staging
sudo keelan ship deploy my-app --env production
```

### 📦 Multiple Applications

```bash
# Build multiple crates
sudo keelan build -w ./frontend -n frontend-app
sudo keelan build -w ./backend -n backend-app
sudo keelan build -w ./database -n db-app

# Deploy them all
sudo keelan ship deploy frontend-app
sudo keelan ship deploy backend-app
sudo keelan ship deploy db-app

# List everything
sudo keelan ship list
sudo keelan crate list
```

---

## Common Issues & Solutions

### ❌ "Permission denied"
```bash
# Always use sudo for Keelan commands
sudo keelan <command>
```

### ❌ "Mount point busy"
```bash
# Check what's mounted
mount | grep keelan

# Force unmount if needed
sudo umount -f /var/lib/keelan/ships/*/merged
```

### ❌ "Crate not found"
```bash
# List available crates
sudo keelan crate list

# Rebuild if missing
sudo keelan build -w . -n my-app
```

### ❌ "Port already in use"
```bash
# Check what's using the port
sudo netstat -tlnp | grep :8000

# Stop conflicting service or change port in Keelanfile.yml
```

### ❌ Build fails
```bash
# Check Keelanfile.yml syntax
# Ensure all paths exist
# Verify commands work in regular shell

# Debug with verbose output
sudo keelan --verbose build -w . -n my-app
```

---

## 🎯 You're Ready!

Congratulations! You've successfully:

- ✅ Installed Keelan Engine
- ✅ Created your first containerized application
- ✅ Built and deployed a crate/ship
- ✅ Learned basic management commands

### What's Different from Docker?

| Feature | Docker | Keelan Engine |
|---------|--------|---------------|
| **Startup Time** | ~2-5 seconds | <100ms |
| **Daemon** | Required | Optional |
| **Resource Usage** | Higher | Minimal |
| **Complexity** | High | Simple |
| **Root Required** | No | Yes |
| **Networking** | Isolated | Host |
| **Learning Curve** | Steep | Gentle |

### When to Use Keelan Engine

- ✅ **Personal VPS hosting**
- ✅ **Development environments**
- ✅ **CI/CD sandboxing**
- ✅ **Learning containerization**
- ✅ **Resource-constrained systems**
- ✅ **Simple deployment needs**

### When to Use Docker Instead

- ❌ **Production clusters**
- ❌ **Complex networking needs**
- ❌ **Team collaboration**
- ❌ **Enterprise security requirements**
- ❌ **Orchestration needs**

---

## 📚 Further Reading

- [Complete Documentation](DOCUMENTATION.md) - Comprehensive project guide
- [API Reference](API_REFERENCE.md) - Technical API documentation
- [Daemon Guide](DAEMON.md) - Background monitoring system
- [Examples](examples/) - More example applications

---

> **"When you build it yourself, you control everything."**  
> — Keelan Engine

Happy containerizing! 🚀