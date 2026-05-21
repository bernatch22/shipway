/**
 * A registered project in the global registry.
 */
export interface Project {
  alias: string;
  path: string;
  addedAt: string;
  lastDeployAt?: string;
}

/**
 * Repository interface for the project registry.
 */
export interface ProjectRepository {
  list(): Promise<Project[]>;
  get(alias: string): Promise<Project | null>;
  add(project: Project): Promise<void>;
  remove(alias: string): Promise<void>;
  updateLastDeploy(alias: string): Promise<void>;
}
