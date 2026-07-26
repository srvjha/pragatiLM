"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft,
  FileText,
  Globe,
  Type,
  Upload,
  FileVideo,
  Captions,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  useAddPdfSources,
  useAddTextSource,
  useAddVttSource,
  useAddWebSource,
  useAddYoutubeSource,
} from "@/features/sources/hooks";
import type { ReactElement } from "react";

type Tile = "pdf" | "youtube" | "web" | "text" | "vtt";

const tiles: {
  id: Tile;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  {
    id: "pdf",
    label: "PDF",
    hint: "Up to 50 MB, several at once",
    icon: FileText,
  },
  {
    id: "youtube",
    label: "YT Link",
    hint: "Video or playlist",
    icon: FileVideo,
  },
  { id: "web", label: "Web Link", hint: "Any article page", icon: Globe },
  { id: "text", label: "Text", hint: "Paste or upload", icon: Type },
  { id: "vtt", label: "VTT", hint: ".vtt or .srt", icon: Captions },
];

export function AddSourceDialog({
  notebookId,
  trigger,
}: {
  notebookId: string;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [tile, setTile] = useState<Tile | null>(null);

  const close = () => {
    setOpen(false);
    // Reset after the close animation so the body does not flicker back to the
    // tile grid on the way out.
    setTimeout(() => setTile(null), 200);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTimeout(() => setTile(null), 200);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tile && (
              <button
                type="button"
                onClick={() => setTile(null)}
                aria-label="Back to source types"
                className="hover:bg-accent -ml-1 rounded p-1"
              >
                <ArrowLeft className="size-4" />
              </button>
            )}
            Add a source
          </DialogTitle>
          <DialogDescription>
            Answers come only from what is in this notebook, so add the material
            you want to ask about.
          </DialogDescription>
        </DialogHeader>

        {tile === null && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {tiles.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setTile(option.id)}
                className="hover:bg-accent hover:border-foreground/20 flex flex-col items-center gap-1.5 rounded-lg border p-4 text-center transition-colors"
              >
                <option.icon className="size-5" strokeWidth={1.5} />
                <span className="text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground text-[11px] leading-tight">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
        )}

        {tile === "pdf" && <PdfPane notebookId={notebookId} onDone={close} />}
        {tile === "vtt" && <VttPane notebookId={notebookId} onDone={close} />}
        {tile === "text" && <TextPane notebookId={notebookId} onDone={close} />}
        {tile === "web" && (
          <UrlPane notebookId={notebookId} kind="web" onDone={close} />
        )}
        {tile === "youtube" && (
          <UrlPane notebookId={notebookId} kind="youtube" onDone={close} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dropzone({
  accept,
  multiple,
  label,
  onFiles,
}: {
  accept: Record<string, string[]>;
  multiple: boolean;
  label: string;
  onFiles: (files: File[]) => void;
}) {
  const onDrop = useCallback(
    (accepted: File[]) => onFiles(accepted),
    [onFiles],
  );
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept,
    multiple,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center transition-colors",
        isDragActive ? "border-foreground/40 bg-accent" : "hover:bg-accent/50",
      )}
    >
      <input {...getInputProps()} aria-label={label} />
      <Upload className="text-muted-foreground size-5" strokeWidth={1.5} />
      <p className="text-sm">{label}</p>
      <p className="text-muted-foreground text-xs">
        Drop files here, or click to choose
      </p>
    </div>
  );
}

/** Per file progress, so a large upload does not look like a hang. */
function UploadProgress({
  files,
}: {
  files: { name: string; percent: number }[];
}) {
  if (files.length === 0) return null;

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.name} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="truncate">{file.name}</span>
            <span className="text-muted-foreground">{file.percent}%</span>
          </div>
          <div className="bg-muted h-1 overflow-hidden rounded">
            <div
              className="bg-foreground h-full transition-all"
              style={{ width: `${file.percent}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function PdfPane({
  notebookId,
  onDone,
}: {
  notebookId: string;
  onDone: () => void;
}) {
  const add = useAddPdfSources(notebookId);
  const [progress, setProgress] = useState<{ name: string; percent: number }[]>(
    [],
  );

  function upload(files: File[]) {
    if (files.length === 0) return;
    setProgress(files.map((file) => ({ name: file.name, percent: 0 })));

    add.mutate(
      {
        files,
        onProgress: (percent) =>
          setProgress((rows) => rows.map((row) => ({ ...row, percent }))),
      },
      {
        onSuccess: (created) => {
          const count = Array.isArray(created) ? created.length : 1;
          toast.success(
            `${count} ${count === 1 ? "source" : "sources"} queued for indexing`,
          );
          onDone();
        },
        onError: () => setProgress([]),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Dropzone
        accept={{ "application/pdf": [".pdf"] }}
        multiple
        label="Add PDFs"
        onFiles={upload}
      />
      <UploadProgress files={progress} />
    </div>
  );
}

function VttPane({
  notebookId,
  onDone,
}: {
  notebookId: string;
  onDone: () => void;
}) {
  const add = useAddVttSource(notebookId);
  const [progress, setProgress] = useState<{ name: string; percent: number }[]>(
    [],
  );

  function upload(files: File[]) {
    const file = files[0];
    if (!file) return;
    setProgress([{ name: file.name, percent: 0 }]);

    add.mutate(
      {
        file,
        onProgress: (percent) => setProgress([{ name: file.name, percent }]),
      },
      {
        onSuccess: () => {
          toast.success("Transcript queued for indexing");
          onDone();
        },
        onError: () => setProgress([]),
      },
    );
  }

  return (
    <div className="space-y-3">
      <Dropzone
        accept={{ "text/vtt": [".vtt"], "application/x-subrip": [".srt"] }}
        multiple={false}
        label="Add a transcript"
        onFiles={upload}
      />
      <UploadProgress files={progress} />
    </div>
  );
}

function TextPane({
  notebookId,
  onDone,
}: {
  notebookId: string;
  onDone: () => void;
}) {
  const add = useAddTextSource(notebookId);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  function submit() {
    if (content.trim().length === 0) return;

    add.mutate(
      { ...(title.trim() ? { title: title.trim() } : {}), content },
      {
        onSuccess: () => {
          toast.success("Text queued for indexing");
          onDone();
        },
      },
    );
  }

  return (
    <div className="space-y-3">
      <Input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title (optional)"
        aria-label="Source title"
        maxLength={200}
      />
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Paste your notes, an article, or anything else you want to ask about."
        aria-label="Text content"
        rows={8}
        autoFocus
      />
      <Button
        onClick={submit}
        disabled={content.trim().length === 0 || add.isPending}
        className="w-full"
      >
        {add.isPending ? "Adding..." : "Add text"}
      </Button>
    </div>
  );
}

function UrlPane({
  notebookId,
  kind,
  onDone,
}: {
  notebookId: string;
  kind: "web" | "youtube";
  onDone: () => void;
}) {
  const web = useAddWebSource(notebookId);
  const youtube = useAddYoutubeSource(notebookId);
  const mutation = kind === "web" ? web : youtube;

  const [url, setUrl] = useState("");

  function submit() {
    if (url.trim().length === 0) return;

    mutation.mutate(url.trim(), {
      onSuccess: () => {
        toast.success(
          kind === "web"
            ? "Page queued for indexing"
            : "Video queued for indexing",
        );
        onDone();
      },
    });
  }

  return (
    <div className="space-y-3">
      <Input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") submit();
        }}
        placeholder={
          kind === "web"
            ? "https://example.com/article"
            : "https://youtube.com/watch?v=..."
        }
        aria-label={kind === "web" ? "Page URL" : "YouTube URL"}
        autoFocus
      />
      <p className="text-muted-foreground text-xs">
        {kind === "web"
          ? "The page is captured at import, so the viewer still works if the site changes."
          : "The caption track is used. A video with captions disabled cannot be indexed."}
      </p>
      <Button
        onClick={submit}
        disabled={url.trim().length === 0 || mutation.isPending}
        className="w-full"
      >
        {mutation.isPending ? "Adding..." : "Add source"}
      </Button>
    </div>
  );
}
