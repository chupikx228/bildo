import { useParams } from "react-router";
import { EditorPage } from "./lazyPages";

export function EditorRoute() {
  const { id } = useParams<{ id: string }>();
  return <EditorPage key={id} />;
}
