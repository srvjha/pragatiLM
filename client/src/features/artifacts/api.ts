import { apiFetch } from "@/lib/api-client";
import type { PodcastDto, RoadmapDto, RoadmapLevel } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function fetchRoadmap(
  notebookId: string,
): Promise<{ roadmap: RoadmapDto | null; canGenerate: boolean }> {
  return apiFetch(`/notebooks/${notebookId}/roadmap`);
}

export function generateRoadmap(
  notebookId: string,
  level: RoadmapLevel,
  goal?: string,
): Promise<{ status: string }> {
  return apiFetch(`/notebooks/${notebookId}/roadmap`, {
    method: "POST",
    body: JSON.stringify({ level, goal }),
  });
}

export function fetchPodcasts(notebookId: string): Promise<PodcastDto[]> {
  return apiFetch<PodcastDto[]>(`/notebooks/${notebookId}/podcasts`);
}

export function createPodcast(
  notebookId: string,
  sourceIds: string[],
  lengthMinutes: 3 | 6 | 10,
): Promise<PodcastDto> {
  return apiFetch<PodcastDto>(`/notebooks/${notebookId}/podcasts`, {
    method: "POST",
    body: JSON.stringify({ sourceIds, lengthMinutes }),
  });
}

export function podcastAudioUrl(notebookId: string, podcastId: string): string {
  return `${API_URL}/api/notebooks/${notebookId}/podcasts/${podcastId}/audio`;
}
