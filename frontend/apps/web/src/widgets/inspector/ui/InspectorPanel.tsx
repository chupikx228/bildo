import type { AppNode, AppScreen } from "@bildo/api";
import { useAppDocumentStore } from "@/entities/app-document";
import { NodeInspector } from "./NodeInspector";
import { ScreenInspector } from "./ScreenInspector";
import { PANEL, PANEL_TITLE } from "./classes";

export function InspectorPanel({ screen, node }: { screen: AppScreen; node: AppNode | null }) {
  const document = useAppDocumentStore((s) => s.document);
  const updateNode = useAppDocumentStore((s) => s.updateNode);
  const setNodeText = useAppDocumentStore((s) => s.setNodeText);
  const setNodeLayout = useAppDocumentStore((s) => s.setNodeLayout);
  const setNodeActions = useAppDocumentStore((s) => s.setNodeActions);
  const renameScreen = useAppDocumentStore((s) => s.renameScreen);
  const updateTheme = useAppDocumentStore((s) => s.updateTheme);

  if (!document) return null;

  return (
    <div className={PANEL}>
      <div className={PANEL_TITLE}>Инспектор</div>

      {!node ? (
        <ScreenInspector
          screen={screen}
          theme={document.theme}
          onRename={(name) => renameScreen(screen.id, name)}
          onTheme={updateTheme}
        />
      ) : (
        <NodeInspector
          screen={screen}
          node={node}
          screens={document.screens}
          onText={(text) => setNodeText(screen.id, node.id, text)}
          onPatch={(patch) => updateNode(screen.id, node.id, patch)}
          onLayout={(layout) => setNodeLayout(screen.id, node.id, layout, true)}
          onActions={(actions) => setNodeActions(screen.id, node.id, "onPress", actions)}
        />
      )}
    </div>
  );
}
