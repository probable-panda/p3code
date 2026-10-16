import { useAtomValue } from "@effect/atom-react";
import {
  createWaitingQuestionThreadsAtom,
  type WaitingQuestionThread,
} from "@t3tools/client-runtime/state/thread-inbox";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { environmentCatalog } from "../../connection/catalog";
import { useProjects } from "../../state/entities";
import { environmentShell } from "../../state/shell";
import { environmentThreadShells } from "../../state/threads";

const waitingQuestionsAtom = createWaitingQuestionThreadsAtom({
  threadsAtom: environmentThreadShells.threadShellsAtom,
  shellStateAtom: environmentShell.stateValueAtom,
});

export function NeedsYou({
  onSelectThread,
}: {
  readonly onSelectThread: (thread: WaitingQuestionThread) => void;
}) {
  const threads = useAtomValue(waitingQuestionsAtom);
  const projects = useProjects();
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (threads.length === 0) {
    if (open) setOpen(false);
    return null;
  }

  return (
    <View
      className="border-t border-border bg-screen px-4 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      <Button label={`Needs you · ${threads.length}`} onPress={() => setOpen(true)} fullWidth />
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <View
          className="flex-1 bg-screen px-4"
          style={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }}
        >
          <View className="mb-4 flex-row items-center justify-between">
            <AppText accessibilityRole="header" className="text-lg font-t3-semibold">
              Waiting for your answer
            </AppText>
            <Button label="Close" tone="text" onPress={() => setOpen(false)} />
          </View>
          <ScrollView>
            {threads.map((thread) => {
              const project = projects.find(
                (project) =>
                  project.environmentId === thread.environmentId && project.id === thread.projectId,
              );
              return (
                <Pressable
                  key={`${thread.environmentId}:${thread.id}`}
                  accessibilityRole="button"
                  className="gap-1 border-b border-border py-4"
                  onPress={() => {
                    setOpen(false);
                    onSelectThread(thread);
                  }}
                >
                  <AppText numberOfLines={2}>{thread.title || "Untitled thread"}</AppText>
                  <AppText className="text-xs text-foreground-muted">
                    {project?.title ?? "Project"} ·{" "}
                    {catalog.entries.get(thread.environmentId)?.target.label ?? "Environment"}
                  </AppText>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
