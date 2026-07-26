import { apiFetch, ApiError } from "@/lib/api-client";
import type { SourceDto } from "@/types/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export function fetchSources(notebookId: string): Promise<SourceDto[]> {
  return apiFetch<SourceDto[]>(`/notebooks/${notebookId}/sources`);
}

export function addTextSource(
  notebookId: string,
  body: { title?: string; content: string },
): Promise<SourceDto> {
  return apiFetch<SourceDto>(`/notebooks/${notebookId}/sources/text`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function addWebSource(
  notebookId: string,
  url: string,
): Promise<SourceDto> {
  return apiFetch<SourceDto>(`/notebooks/${notebookId}/sources/web`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function addYoutubeSource(
  notebookId: string,
  url: string,
): Promise<SourceDto> {
  return apiFetch<SourceDto>(`/notebooks/${notebookId}/sources/youtube`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/**
 * Multipart uploads bypass apiFetch, which sets a JSON content type. XHR rather
 * than fetch, because per file upload progress has no fetch equivalent and the
 * dropzone shows a bar per file.
 */
function uploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${API_URL}/api${path}`);
    // The session cookie belongs to the API's origin, so the upload has to be
    // told to send it. XHR's equivalent of fetch's credentials: "include".
    request.withCredentials = true;

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener("load", () => {
      let body: unknown;
      try {
        body = JSON.parse(request.responseText);
      } catch {
        reject(
          new ApiError(request.status, {
            code: "INVALID_RESPONSE",
            message: `The API returned a non JSON response (HTTP ${request.status}).`,
          }),
        );
        return;
      }

      if (body && typeof body === "object" && "error" in body) {
        reject(new ApiError(request.status, (body as { error: never }).error));
        return;
      }

      resolve((body as { data: T }).data);
    });

    request.addEventListener("error", () => {
      reject(
        new ApiError(0, {
          code: "NETWORK",
          message: `Could not reach the API at ${API_URL}. Is the server running?`,
        }),
      );
    });

    request.send(form);
  });
}

export function addPdfSources(
  notebookId: string,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<SourceDto[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);

  return uploadForm<SourceDto[]>(
    `/notebooks/${notebookId}/sources/pdf`,
    form,
    onProgress,
  );
}

export function addVttSource(
  notebookId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<SourceDto> {
  const form = new FormData();
  form.append("file", file);

  return uploadForm<SourceDto>(
    `/notebooks/${notebookId}/sources/vtt`,
    form,
    onProgress,
  );
}

export function renameSource(
  notebookId: string,
  sourceId: string,
  title: string,
): Promise<SourceDto> {
  return apiFetch<SourceDto>(`/notebooks/${notebookId}/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function setSourceSelected(
  notebookId: string,
  sourceId: string,
  selected: boolean,
): Promise<SourceDto> {
  return apiFetch<SourceDto>(`/notebooks/${notebookId}/sources/${sourceId}`, {
    method: "PATCH",
    body: JSON.stringify({ selected }),
  });
}

export function reindexSource(
  notebookId: string,
  sourceId: string,
): Promise<SourceDto> {
  return apiFetch<SourceDto>(
    `/notebooks/${notebookId}/sources/${sourceId}/reindex`,
    {
      method: "POST",
    },
  );
}

export function deleteSource(
  notebookId: string,
  sourceId: string,
): Promise<void> {
  return apiFetch<void>(`/notebooks/${notebookId}/sources/${sourceId}`, {
    method: "DELETE",
  });
}
