export interface Document {
  file: string;
  filename: string;
  size: string;
  text?: string;
  tags?: string[];
  category: string;
  subject: string;
  course: string;
  exists: boolean;
  title?: string;
  catalogTitle?: string;
  description?: string;
  catalogDescription?: string;
  docType?: string;
  oldFilename?: string;
  newFilename?: string;
}

export interface DocStats {
  views: number;
  downloads: number;
  likes: number;
  dislikes: number;
  reaction: number; // -1, 0, 1
}

export interface OrderRequest {
  workType: string;
  topic: string;
  subject: string;
  deadline: string;
  contact: string;
  comment: string;
}
