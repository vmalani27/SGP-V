export interface ContentLab {
  id: string;
  title: string;
  duration: string;
  contentPath: string;
}

export interface ContentModule {
  id: string;
  title: string;
  description: string;
  labs: ContentLab[];
}

export interface ContentCourse {
  id: string;
  title: string;
  description: string;
  level: string;
  totalLabs: number;
  estimatedHours: number;
  modules: ContentModule[];
}

export interface CourseCatalogEntry {
  id: string;
  title: string;
  description: string;
  level: string;
  totalLabs: number;
  estimatedHours: number;
}
