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
  /** Empty means every timed source in the notebook. */
  sourceIds: string[] = [],
): Promise<{ status: string }> {
  return apiFetch(`/notebooks/${notebookId}/roadmap`, {
    method: "POST",
    body: JSON.stringify({ level, goal, sourceIds }),
  });
}

export function fetchPodcasts(notebookId: string): Promise<PodcastDto[]> {
  return apiFetch<PodcastDto[]>(`/notebooks/${notebookId}/podcasts`);
}

export type VoicePairOption = { id: string; label: string };

/** The pairings the server accepts, so the picker cannot offer an invalid one. */
export function fetchVoicePairs(
  notebookId: string,
): Promise<VoicePairOption[]> {
  return apiFetch<VoicePairOption[]>(
    `/notebooks/${notebookId}/podcasts/voice-pairs`,
  );
}

export function createPodcast(
  notebookId: string,
  sourceIds: string[],
  lengthMinutes: 3 | 6 | 10,
  voicePair: string,
): Promise<PodcastDto> {
  return apiFetch<PodcastDto>(`/notebooks/${notebookId}/podcasts`, {
    method: "POST",
    body: JSON.stringify({ sourceIds, lengthMinutes, voicePair }),
  });
}

export function podcastAudioUrl(notebookId: string, podcastId: string): string {
  return `${API_URL}/api/notebooks/${notebookId}/podcasts/${podcastId}/audio`;
}
