# Keelan Engine - AI Coding Agent Instructions

## Project Overview
Keelan Engine is a minimalist container engine built from scratch without Docker dependencies. It uses OverlayFS and `chroot` to create isolated environments called "crates" (images) and "ships" (running containers). The project is TypeScript-based with ES modules, SQLite database via Drizzle ORM, and requires Linux with root privileges.

## Core Architecture

### Key Concepts
- **Crates**: Container images stored in `/var/lib/keelan/crates/` with overlay filesystems
- **Ships**: Running container instances tracked in database with process monitoring
- **Keelanfile.yml**: YAML configuration defining build context, steps, and runtime settings
- **Daemon**: Background monitoring service for ship health and status updates

### Directory Structure
```
src/
├── core/           # Low-level container operations (mount/unmount, chroot)
├── handlers/       # CLI command implementations
├── daemon/         # Background monitoring service
├── database/       # Drizzle ORM schema and migrations
├── utils/          # Helper functions and performance optimizations
└── types/          # TypeScript type definitions
```

## Essential Development Patterns

### Command Handler Pattern
All CLI commands follow this structure in `src/handlers/`:
```typescript
export const handlerName = async (options: HandlerOptions) => {
  // Validation and setup
  // Core operations using src/core/ functions
  // Database updates
  // Cleanup and logging
};
```

### Database Operations
- Use Drizzle ORM with SQLite backend
- Schema: `keelanFiles` → `keelanCrate` → `keelanShips` (one-to-many relationships)
- All operations require explicit database connection via `db` from `src/database/db.js`
- Migrations handled via `npm run migrate` or `npm run reset`

### Container Lifecycle
1. **Build**: Parse `Keelanfile.yml` → Mount overlay → Execute build steps → Save crate
2. **Deploy**: Create ship record → Mount filesystem → Start process → Monitor via daemon
3. **Monitor**: Daemon checks process status and updates database every 30s

### System Integration
- **OverlayFS**: Core filesystem isolation mechanism
- **Chroot**: Process isolation (requires root privileges)
- **Mount points**: System directories (`/proc`, `/dev`) bound into containers
- **Process management**: Ships tracked by PID with status monitoring

## Critical Development Workflows

### Build and Test Commands
```bash
npm run build          # TypeScript compilation to dist/
npm run dev           # Development mode with tsx
npm run migrate       # Database schema updates
npm run reset         # Reset database (development only)
npm run optimize      # Bundle analysis and performance check
```

### CLI Usage Patterns
```bash
keelan build -w <directory> -n <name>    # Build crate from Keelanfile.yml
keelan ship deploy <crate-name>          # Deploy ship from crate
keelan list                              # List all crates and ships
keelan daemon start                      # Start background monitoring
```

### Debugging Approaches
- Use `TailLog` utility for real-time command output during builds
- Check daemon logs in `/var/lib/keelan/logs/`
- Database inspection via `npm run migrate` debug mode
- Mount point verification using `mountpoint` commands

## Project-Specific Conventions

### Error Handling
- Use chalk for colored console output (red for errors, green for success)
- Graceful degradation with sudo privilege checks
- Database transaction rollbacks on critical failures

### File Organization
- Import with `.js` extensions for ES modules compatibility
- Lazy load handlers in `src/index.ts` for startup performance
- Use absolute paths from `PATHS` constant for system directories
- Performance utilities in `src/utils/performance.ts` for expensive operations

### Configuration Management
- Environment variables loaded via dotenv (`.env` support)
- Base directory configurable via `BASE_DIRECTORY` environment variable
- Platform-specific paths (Windows vs Linux) handled in `src/constants.ts`

### Testing Considerations
- Requires Linux environment with OverlayFS support
- Root privileges mandatory for all container operations
- Cannot run inside Docker/chroot environments (bare metal only)
- Node.js 22+ required (avoid Node.js 24 due to better-sqlite3 issues)

## Integration Points

### External Dependencies
- **better-sqlite3**: Database operations (version-sensitive)
- **drizzle-orm**: ORM layer with migration support
- **fs-extra**: Enhanced filesystem operations
- **yargs**: CLI argument parsing with nested commands
- **tar**: Archive creation for crate distribution

### Cross-Component Communication
- Database as central state store for all component coordination
- Unix socket server in daemon for real-time status updates
- Signal handling for graceful daemon shutdown and restart
- Process monitoring via PID tracking and health checks

## Common Implementation Patterns

When implementing new features:
1. Add handler in `src/handlers/` following existing pattern
2. Register command in `src/index.ts` with lazy loading
3. Use `src/core/` functions for low-level operations
4. Update database schema if needed (`src/database/schema.ts`)
5. Add appropriate error handling with chalk logging
6. Consider daemon integration for background operations

Focus on minimalism and performance - avoid heavy dependencies and maintain the "zero overhead" philosophy.
