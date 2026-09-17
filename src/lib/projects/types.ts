export type ScanPathSettings = { roots: string[] };

export type ProjectSource = "discovered" | "manual";

export type ProjectRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  image_path: string | null;
  root_path: string;
  compose_file: string | null;
  compose_project: string | null;
  source: ProjectSource;
  enabled: number;
  created_at: string;
  updated_at: string;
};

export type ParsedComposeService = {
  name: string;
  hostPort: number | null;
  containerPort: number | null;
  containerName: string | null;
};

export type ProjectServiceRow = {
  id: number;
  project_id: number;
  name: string;
  container_name: string | null;
  host_port: number | null;
  health_kind: "http" | "tcp" | "docker" | "none";
  health_path: string | null;
  is_primary: number;
  is_ui: number;
};
