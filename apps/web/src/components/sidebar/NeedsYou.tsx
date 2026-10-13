import { useAtomValue } from "@effect/atom-react";
import { createWaitingQuestionThreadsAtom } from "@t3tools/client-runtime/state/thread-inbox";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircleQuestionIcon } from "lucide-react";
import { useState } from "react";
import { environmentCatalog } from "../../connection/catalog";
import { useProjects } from "../../state/entities";
import { environmentShell } from "../../state/shell";
import { environmentThreadShells } from "../../state/threads";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

const waitingQuestionsAtom = createWaitingQuestionThreadsAtom({
  threadsAtom: environmentThreadShells.threadShellsAtom,
  shellStateAtom: environmentShell.stateValueAtom,
});

export function NeedsYou({ compact = false }: { compact?: boolean }) {
  const threads = useAtomValue(waitingQuestionsAtom);
  const projects = useProjects();
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  if (threads.length === 0) {
    if (open) setOpen(false);
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size={compact ? "icon-tiny" : "sm"} />}
        aria-label={`Needs you: ${threads.length} threads waiting for an answer`}
      >
        {!compact && <MessageCircleQuestionIcon />}
        <span aria-live="polite">{compact ? threads.length : `Needs you · ${threads.length}`}</span>
      </PopoverTrigger>
      <PopoverPopup width="md" padding="compact" align="start">
        <p className="mb-2 text-sm font-medium">Waiting for your answer</p>
        <div className="max-h-80 overflow-y-auto">
          {threads.map((thread) => {
            const project = projects.find(
              (project) =>
                project.environmentId === thread.environmentId && project.id === thread.projectId,
            );
            return (
              <button
                key={`${thread.environmentId}:${thread.id}`}
                type="button"
                className="flex w-full flex-col gap-1 rounded-md px-2 py-2 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => {
                  setOpen(false);
                  if (isMobile) setOpenMobile(false);
                  void navigate({
                    to: "/$environmentId/$threadId",
                    params: { environmentId: thread.environmentId, threadId: thread.id },
                  });
                }}
              >
                <span className="w-full truncate text-sm">{thread.title || "Untitled thread"}</span>
                <span className="w-full truncate text-xs text-muted-foreground">
                  {project?.title ?? "Project"} ·{" "}
                  {catalog.entries.get(thread.environmentId)?.target.label ?? "Environment"}
                </span>
              </button>
            );
          })}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
