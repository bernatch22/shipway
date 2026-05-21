import { buildSshCommand } from '../ssh/args.js';

/**
 * Builder pattern for constructing rsync arguments.
 * Fluent API for composing the complex rsync command line.
 */
export class RsyncArgsBuilder {
  private readonly baseArgs: string[] = ['-avz', '--stats'];
  private readonly excludePatterns: string[] = [];
  private sshCmd: string | null = null;
  private useChecksum = false;
  private useDelete = false;
  private isDryRun = false;
  private srcPath: string | null = null;
  private destPath: string | null = null;

  /** Set the SSH command for the -e flag. */
  ssh(keyPath?: string): this {
    this.sshCmd = buildSshCommand(keyPath);
    return this;
  }

  /** Enable --checksum mode. */
  checksum(enabled: boolean): this {
    this.useChecksum = enabled;
    return this;
  }

  /** Enable --delete mode (removes files on remote not present locally). */
  delete(enabled: boolean): this {
    this.useDelete = enabled;
    return this;
  }

  /** Enable dry-run mode (-n). */
  dryRun(enabled: boolean): this {
    this.isDryRun = enabled;
    return this;
  }

  /** Add an exclude pattern. */
  exclude(pattern: string): this {
    this.excludePatterns.push(pattern);
    return this;
  }

  /** Add multiple exclude patterns. */
  excludeMany(patterns: string[]): this {
    this.excludePatterns.push(...patterns);
    return this;
  }

  /** Set the source path. Appends trailing / for directories. */
  source(path: string, isDir: boolean): this {
    this.srcPath = isDir ? `${path.replace(/\/+$/, '')}/` : path;
    return this;
  }

  /** Set the destination as remote:path. */
  destination(host: string, remotePath: string): this {
    this.destPath = `${host}:${remotePath}/`;
    return this;
  }

  /** Build the final args array. */
  build(): string[] {
    const args = [...this.baseArgs];

    if (this.sshCmd) {
      args.push('-e', this.sshCmd);
    }
    if (this.useChecksum) {
      args.push('--checksum');
    }
    if (this.useDelete) {
      args.push('--delete');
    }
    if (this.isDryRun) {
      args.push('-n');
    }
    for (const pattern of this.excludePatterns) {
      args.push('--exclude', pattern);
    }
    if (this.srcPath) {
      args.push(this.srcPath);
    }
    if (this.destPath) {
      args.push(this.destPath);
    }

    return args;
  }
}
