# Keelan Engine API Reference

## Table of Contents

1. [Core API](#core-api)
2. [Database API](#database-api)
3. [Parser API](#parser-api)
4. [Handler APIs](#handler-apis)
5. [Utility APIs](#utility-apis)
6. [Type Definitions](#type-definitions)
7. [Error Handling](#error-handling)
8. [Examples](#examples)

---

## Core API

### `src/core/core.ts`

Core container management operations.

#### Directory Management

```typescript
export function createDirectory(path: string): void
```

Creates a directory with parent directories using sudo.

**Parameters:**
- `path` (string): Directory path to create

**Throws:** Error if directory creation fails

**Example:**
```typescript
createDirectory('/var/lib/keelan/crates/myapp');
```

---

#### Filesystem Operations

```typescript
export function mountOverlayDirectory(
  lowerdir: string,
  upperdir: string, 
  workdir: string,
  merge_path: string
): void
```

Mounts an OverlayFS filesystem.

**Parameters:**
- `lowerdir` (string): Read-only base layer path
- `upperdir` (string): Writable layer path  
- `workdir` (string): OverlayFS work directory
- `merge_path` (string): Mount point for overlay

**Requires:** Root privileges

**Example:**
```typescript
mountOverlayDirectory(
  '/var/lib/keelan/crates/debian',
  '/var/lib/keelan/ships/myapp/upper',
  '/var/lib/keelan/ships/myapp/work',
  '/var/lib/keelan/ships/myapp/merged'
);
```

---

```typescript
export function mountBindDrive(path: string, mountpoint: string): void
```

Binds a directory to another mount point.

**Parameters:**
- `path` (string): Source directory
- `mountpoint` (string): Target mount point

**Example:**
```typescript
mountBindDrive('/proc', '/var/lib/keelan/ships/myapp/merged/proc');
```

---

```typescript
export function checkMountpoint(mountpoint: string): boolean
```

Checks if a directory is currently mounted.

**Parameters:**
- `mountpoint` (string): Path to check

**Returns:** `true` if mounted, `false` otherwise

---

```typescript
export function mountCrate(
  lowerdir: string,
  upperdir: string,
  workdir: string, 
  merge_path: string
): void
```

Mounts a container crate with proper overlay setup and system directories.

**Parameters:**
- `lowerdir` (string): Base crate filesystem
- `upperdir` (string): Writable layer
- `workdir` (string): Work directory
- `merge_path` (string): Final mount point

---

```typescript
export function unmountCrate(merge_path: string): void
```

Unmounts a crate and cleans up mount points.

**Parameters:**
- `merge_path` (string): Mounted crate path

---

#### Database Operations

```typescript
export async function writeCrateFile(name: string, content: string): Promise<void>
```

Writes a Keelanfile to the database.

**Parameters:**
- `name` (string): File identifier
- `content` (string): File content

---

```typescript
export async function writeCrate(
  name: string,
  image: string,
  layer: string,
  sizeBytes: number,
  digest: string,
  keelanFileId: number
): Promise<any>
```

Writes crate metadata to database.

**Parameters:**
- `name` (string): Crate name
- `image` (string): Base image name
- `layer` (string): Layer path
- `sizeBytes` (number): Size in bytes
- `digest` (string): Content digest
- `keelanFileId` (number): Associated Keelanfile ID

**Returns:** Database record

---

```typescript
export async function checkName(name: string): Promise<boolean>
```

Checks if a crate name already exists.

**Parameters:**
- `name` (string): Crate name to check

**Returns:** `true` if exists, `false` otherwise

---

#### Cleanup Operations

```typescript
export async function removeCrate(
  name: string, 
  options: { force?: boolean } = {}
): Promise<void>
```

Removes a crate and associated data.

**Parameters:**
- `name` (string): Crate name
- `options.force` (boolean): Force removal

---

```typescript
export async function removeGzipCrate(
  name: string,
  options: { force?: boolean } = {}
): Promise<void>
```

Removes compressed crate archives.

---

```typescript
export async function removeShip(
  shipID: string,
  options: { force?: boolean; recursive?: boolean } = {}
): Promise<void>
```

Removes a ship and associated resources.

**Parameters:**
- `shipID` (string): Ship identifier
- `options.force` (boolean): Force removal
- `options.recursive` (boolean): Recursive cleanup

---

## Database API

### `src/database/schema.ts`

Database table definitions using Drizzle ORM.

#### Tables

```typescript
export const keelanFiles = sqliteTable('keelan_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
  updatedAt: text('updated_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
  checksum: text('checksum').unique()
});
```

```typescript
export const keelanCrate = sqliteTable('keelan_crate', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  tag: text('tag').notNull(),
  keelanFileId: integer('keelan_file_id').references(() => keelanFiles.id),
  baseImage: text('base_image').notNull(),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
  sizeBytes: integer('size_bytes'),
  digest: text('digest').unique(),
  layer: text('layer').notNull()
});
```

```typescript
export const keelanShips = sqliteTable('keelan_ships', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  imageId: integer('image_id').notNull().references(() => keelanCrate.id),
  status: text('status').notNull(),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`).notNull(),
  startedAt: text('started_at'),
  stoppedAt: text('stopped_at'),
  exitCode: integer('exit_code'),
  processId: integer('process_id')
});
```

### `src/database/db.ts`

Database connection and configuration.

```typescript
export const db: BetterSQLite3Database<typeof schema>
```

Main database instance for all operations.

---

## Parser API

### `src/keelan-parser.ts`

Keelanfile configuration parser.

#### Classes

```typescript
export class KeelanParserError extends Error {
  constructor(
    message: string, 
    public readonly line?: number, 
    public readonly column?: number
  )
}
```

Custom error class for parsing errors.

---

```typescript
export class KeelanParser {
  static parseFromFile(filePath: string): KeelanConfig
  static parseFromString(content: string): KeelanConfig
  static getDefaultPath(baseDir: string = process.cwd()): string
}
```

#### Methods

**parseFromFile(filePath: string): KeelanConfig**

Parses a Keelanfile from file path.

**Parameters:**
- `filePath` (string): Path to Keelanfile.yml

**Returns:** Parsed configuration object

**Throws:** `KeelanParserError` on parsing errors

---

**parseFromString(content: string): KeelanConfig**

Parses Keelanfile from string content.

**Parameters:**
- `content` (string): YAML content

**Returns:** Parsed configuration object

---

**getDefaultPath(baseDir?: string): string**

Returns default Keelanfile path.

**Parameters:**
- `baseDir` (string): Base directory (default: cwd)

**Returns:** Path to Keelanfile.yml

---

## Handler APIs

### Build Handler (`src/handlers/build.ts`)

```typescript
export async function buildHandler(options: BuildOptions): Promise<void>
```

Handles crate building from Keelanfile.

**Parameters:**
- `options.workingDirectory` (string): Build context directory
- `options.name` (string): Crate name
- `options.production` (boolean): Production build flag
- `options.watch` (boolean): Watch mode

---

### Deploy Handler (`src/handlers/deploy.ts`)

```typescript
export async function deployHandler(options: DeployOptions): Promise<void>
```

Deploys a ship from a crate.

**Parameters:**
- `options.name` (string): Ship name
- `options.env` (string): Environment (dev/staging/production)

---

### Ship Handler (`src/handlers/ship.ts`)

```typescript
export async function startShipHandler(options: ShipOptions): Promise<void>
export async function stopShipHandler(options: ShipOptions): Promise<void>
export async function restartShipHandler(options: ShipOptions): Promise<void>
export async function listShipsHandler(): Promise<void>
```

**Ship Management Functions:**
- `startShipHandler`: Start a stopped ship
- `stopShipHandler`: Stop a running ship  
- `restartShipHandler`: Restart a ship
- `listShipsHandler`: List all ships with status

---

### Crate Handler (`src/handlers/crate.ts`)

```typescript
export async function listCratesHandler(): Promise<void>
```

Lists all available crates.

---

### Remove Handler (`src/handlers/remove.ts`)

```typescript
export async function removeCrateHandler(options: RemoveOptions): Promise<void>
export async function removeShipHandler(options: RemoveOptions): Promise<void>
```

**Cleanup Functions:**
- `removeCrateHandler`: Remove crate and data
- `removeShipHandler`: Remove ship and resources

---

### Daemon Handler (`src/handlers/daemon.ts`)

```typescript
export async function daemonHandler(options: DaemonOptions): Promise<void>
```

Manages the monitoring daemon.

**Parameters:**
- `options.action` (string): start|stop|status|restart
- `options.interval` (number): Monitoring interval
- `options.logFile` (string): Custom log file
- `options.pidFile` (string): Custom PID file
- `options.detach` (boolean): Run detached

---

### Config Handler (`src/handlers/config.ts`)

```typescript
export async function configHandler(options: ConfigOptions): Promise<void>
```

Manages system configuration.

**Parameters:**
- `options.key` (string): Configuration key
- `options.value` (string): Configuration value
- `options.list` (boolean): List all config
- `options.reset` (boolean): Reset to defaults

---

## Utility APIs

### Logging (`src/utils/logging.ts`)

```typescript
export function logInfo(message: string): void
export function logError(message: string): void
export function logWarning(message: string): void
export function logSuccess(message: string): void
```

Colored console logging utilities.

---

### Compression (`src/utils/compress.ts`)

```typescript
export async function compressDirectory(source: string, target: string): Promise<void>
export async function extractArchive(source: string, target: string): Promise<void>
```

Directory compression and extraction.

---

### Layer Management (`src/utils/layer.ts`)

```typescript
export function createLayer(basePath: string, layerName: string): string
export function removeLayer(layerPath: string): void
export function getLayerSize(layerPath: string): number
```

Filesystem layer operations.

---

## Type Definitions

### Configuration Types

```typescript
export interface BuildContext {
  base_image: string;
  work_directory: string;
}

export interface BuildStep {
  action: string;
  source?: string;
  destination?: string;
  description?: string;
  command?: string[];
  shell?: boolean;
  fail_on_error?: boolean;
}

export interface CrateConfig {
  expose_ports: number[];
  environment_variables: Record<string, string>;
}

export interface KeelanConfig {
  build_context: BuildContext;
  build_steps: BuildStep[];
  crate_config: CrateConfig;
  runtime_entrypoint?: string[];
  runtime_command?: string[];
}
```

### Command Option Types

```typescript
interface BuildOptions {
  workingDirectory: string;
  name: string;
  production?: boolean;
  watch?: boolean;
}

interface DeployOptions {
  name: string;
  env: 'dev' | 'staging' | 'production';
}

interface ShipOptions {
  name: string;
  env?: string;
  force?: boolean;
}

interface RemoveOptions {
  name: string;
  force?: boolean;
  recursive?: boolean;
}

interface DaemonOptions {
  action: 'start' | 'stop' | 'status' | 'restart';
  interval?: number;
  logFile?: string;
  pidFile?: string;
  detach?: boolean;
}

interface ConfigOptions {
  key?: string;
  value?: string;
  list?: boolean;
  reset?: boolean;
}
```

### Database Types

```typescript
type KeelanFile = typeof keelanFiles.$inferSelect;
type KeelanCrate = typeof keelanCrate.$inferSelect;
type KeelanShip = typeof keelanShips.$inferSelect;

type NewKeelanFile = typeof keelanFiles.$inferInsert;
type NewKeelanCrate = typeof keelanCrate.$inferInsert;
type NewKeelanShip = typeof keelanShips.$inferInsert;
```

---

## Error Handling

### Error Types

```typescript
// Parser errors
class KeelanParserError extends Error {
  line?: number;
  column?: number;
}

// System errors
class SystemError extends Error {
  code?: string;
  errno?: number;
}

// Database errors
class DatabaseError extends Error {
  constraint?: string;
}
```

### Error Handling Patterns

```typescript
// Async operations
try {
  await buildHandler(options);
} catch (error) {
  if (error instanceof KeelanParserError) {
    console.error(`Parse error at line ${error.line}: ${error.message}`);
  } else {
    console.error(`Build failed: ${error.message}`);
  }
  process.exit(1);
}

// Sync operations
try {
  createDirectory('/path/to/dir');
} catch (error) {
  console.error(`Failed to create directory: ${error.message}`);
  throw error;
}
```

---

## Examples

### Building a Crate

```typescript
import { buildHandler } from './handlers/build.js';
import { KeelanParser } from './keelan-parser.js';

// Parse configuration
const config = KeelanParser.parseFromFile('./Keelanfile.yml');

// Build crate
await buildHandler({
  workingDirectory: './my-app',
  name: 'my-app',
  production: true
});
```

### Deploying a Ship

```typescript
import { deployHandler } from './handlers/deploy.js';

// Deploy ship
await deployHandler({
  name: 'my-app',
  env: 'production'
});
```

### Managing Ships

```typescript
import { 
  startShipHandler, 
  stopShipHandler, 
  listShipsHandler 
} from './handlers/ship.js';

// Start ship
await startShipHandler({ name: 'my-app' });

// List all ships
await listShipsHandler();

// Stop ship
await stopShipHandler({ name: 'my-app', force: true });
```

### Database Operations

```typescript
import { db } from './database/db.js';
import { keelanCrate, keelanShips } from './database/schema.js';
import { eq } from 'drizzle-orm';

// Query crates
const crates = await db.select().from(keelanCrate);

// Query specific ship
const ship = await db.select()
  .from(keelanShips)
  .where(eq(keelanShips.name, 'my-app'))
  .limit(1);

// Update ship status
await db.update(keelanShips)
  .set({ status: 'stopped', stoppedAt: new Date().toISOString() })
  .where(eq(keelanShips.name, 'my-app'));
```

### Custom Build Steps

```typescript
// Keelanfile.yml with custom build steps
const config: KeelanConfig = {
  build_context: {
    base_image: 'debian',
    work_directory: '/app'
  },
  build_steps: [
    {
      action: 'execute_command',
      description: 'Update package lists',
      command: ['apt-get', 'update', '-y'],
      fail_on_error: true
    },
    {
      action: 'copy_files',
      source: './src',
      destination: '/app/src'
    },
    {
      action: 'execute_command',
      description: 'Install dependencies',
      command: ['npm', 'install'],
      shell: true
    }
  ],
  crate_config: {
    expose_ports: [3000, 8080],
    environment_variables: {
      NODE_ENV: 'production',
      PORT: '3000'
    }
  },
  runtime_command: ['node', 'src/index.js']
};
```

### Daemon Integration

```typescript
import { daemonHandler } from './handlers/daemon.js';
import { monitorAllShips } from './daemon/monitor-daemon.js';

// Start daemon
await daemonHandler({
  action: 'start',
  interval: 30,
  detach: true
});

// Manual monitoring
await monitorAllShips();

// Check daemon status
await daemonHandler({ action: 'status' });
```

---

*This API reference covers all public interfaces and functions in the Keelan Engine. For implementation details, refer to the source code and inline documentation.*