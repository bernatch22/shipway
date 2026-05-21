import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { atomicWrite } from '../utils/atomic-write.js';
import { getRegistryPath } from '../utils/paths.js';
import type { Project, ProjectRepository } from './types.js';

/**
 * File-based project repository.
 * Stores registered projects in ~/.shipway/projects.yml.
 * Concurrent-safe via atomic write-then-rename.
 */
export class FileProjectRepository implements ProjectRepository {
  private readonly filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? getRegistryPath();
  }

  async list(): Promise<Project[]> {
    const data = await this.load();
    return data.projects ?? [];
  }

  async get(alias: string): Promise<Project | null> {
    const projects = await this.list();
    return projects.find((p) => p.alias === alias) ?? null;
  }

  async add(project: Project): Promise<void> {
    const data = await this.load();
    const projects = data.projects ?? [];

    // Replace existing with same alias
    const idx = projects.findIndex((p) => p.alias === project.alias);
    if (idx >= 0) {
      projects[idx] = project;
    } else {
      projects.push(project);
    }

    data.projects = projects;
    await this.save(data);
  }

  async remove(alias: string): Promise<void> {
    const data = await this.load();
    data.projects = (data.projects ?? []).filter((p) => p.alias !== alias);
    await this.save(data);
  }

  async updateLastDeploy(alias: string): Promise<void> {
    const data = await this.load();
    const projects = data.projects ?? [];
    const project = projects.find((p) => p.alias === alias);
    if (project) {
      project.lastDeployAt = new Date().toISOString();
      await this.save(data);
    }
  }

  private async load(): Promise<{ projects: Project[] }> {
    if (!existsSync(this.filePath)) {
      return { projects: [] };
    }
    const content = await readFile(this.filePath, 'utf-8');
    const parsed = parseYaml(content);
    return parsed && typeof parsed === 'object' ? parsed : { projects: [] };
  }

  private async save(data: { projects: Project[] }): Promise<void> {
    const content = stringifyYaml(data, { lineWidth: 0 });
    await atomicWrite(this.filePath, content);
  }
}
