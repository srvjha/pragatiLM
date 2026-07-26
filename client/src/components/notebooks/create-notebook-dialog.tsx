"use client";

import { useState, type ReactElement } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  trigger: ReactElement;
  onCreate: (name: string) => void;
};

export function CreateNotebookDialog({ trigger, onCreate }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  function submit() {
    // An empty name is valid: the server defaults it to "Untitled notebook".
    onCreate(name.trim());
    setName("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New notebook</DialogTitle>
          <DialogDescription>
            A notebook holds its own sources and chats. Nothing is shared
            between notebooks.
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={name}
          maxLength={80}
          placeholder="Untitled notebook"
          aria-label="Notebook name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
