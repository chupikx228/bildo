import type { Attachment } from "@/shared/attachments";

export type DiffTone = "add" | "mod" | "del";
export interface Diff {
  label: string;
  tone: DiffTone;
}
export type ProposalKind = "theme" | "asset3d" | "screen" | "component";

export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  commitTitle: string;
  note: string;
  diff: Diff[];
  files: { path: string; stat: string }[];
  command?: string;
  swatches?: string[];
  assetName?: string;
}

export interface Commit {
  hash: string;
  title: string;
  files: { path: string; stat: string }[];
  diff: Diff[];
}

export type Turn =
  | { id: string; role: "user"; text: string; attachments?: Attachment[] }
  | { id: string; role: "ai"; text: string; proposal?: Proposal }
  | { id: string; role: "typing" }
  | { id: string; role: "commit"; commit: Commit }
  | { id: string; role: "note"; text: string };

let seq = 0;
export const uid = (p: string) => `${p}-${++seq}`;

export function shortHash(): string {
  return Math.random().toString(16).slice(2, 8);
}

export function typingDelayMs(): number {
  return 680 + Math.random() * 520;
}

export function assetProposal(): Proposal {
  return {
    id: uid("p"),
    kind: "asset3d",
    title: "Добавить 3D-модель в проект?",
    commitTitle: "Добавлена 3D-модель на главный экран",
    note: "Нашёл подходящий ассет для главного экрана. Подключу как <Model3D /> с ленивой загрузкой.",
    assetName: "orb_gradient_v3.glb",
    diff: [
      { label: "+1 ассет", tone: "add" },
      { label: "+1 компонент", tone: "add" },
      { label: "~1 экран", tone: "mod" },
    ],
    files: [
      { path: "assets/orb_gradient_v3.glb", stat: "+1.2 MB" },
      { path: "components/Model3D.tsx", stat: "+48" },
      { path: "screens/Home.tsx", stat: "+6 −1" },
    ],
  };
}

export function themeProposal(dark: boolean): Proposal {
  return {
    id: uid("p"),
    kind: "theme",
    title: dark ? "Применить эту тему?" : "Применить светлую тему?",
    commitTitle: dark ? "Применена тёмная тема" : "Применена светлая тема",
    note: dark
      ? "Тёмная нейтральная база с индиго-акцентом. Контраст текста — AA на всех поверхностях."
      : "Белая база, мягкие серые поверхности, индиго-акцент.",
    command: dark ? "тёмная тема, акцент" : "светлая тема, акцент",
    swatches: dark ? ["#09090B", "#18181B", "#5C6CF5", "#FAFAFA"] : ["#FFFFFF", "#F4F4F5", "#5C6CF5", "#09090B"],
    diff: [
      { label: "~5 токенов", tone: "mod" },
      { label: "~2 экрана", tone: "mod" },
    ],
    files: [
      { path: "theme/tokens.ts", stat: "+5 −5" },
      { path: "screens/*", stat: "~2" },
    ],
  };
}

export function screenProposal(): Proposal {
  return {
    id: uid("p"),
    kind: "screen",
    title: "Добавить экран «Профиль»?",
    commitTitle: "Добавлен экран «Профиль»",
    note: "Заглушка с аватаром, именем и списком настроек. Добавлю в таб-бар последним пунктом.",
    command: "добавь экран «Профиль»",
    diff: [
      { label: "+1 экран", tone: "add" },
      { label: "+4 слоя", tone: "add" },
      { label: "~1 навигация", tone: "mod" },
    ],
    files: [
      { path: "screens/Profile.tsx", stat: "+86" },
      { path: "navigation/tabs.ts", stat: "+3" },
    ],
  };
}

function rotatingProposal(): Proposal {
  const i = seq % 3;
  if (i === 0) return assetProposal();
  if (i === 1) return themeProposal(true);
  return screenProposal();
}

export function plan(text: string): { reply: string; proposal?: Proposal } {
  const t = text.toLowerCase();

  if (/3d|модел|glb|gltf|сцен/.test(t)) {
    return { reply: "Подобрал 3D-ассет под стиль приложения.", proposal: assetProposal() };
  }
  if (/тем|цвет|акцент|палитр|светл|тёмн|темн/.test(t)) {
    const dark = !/светл|light|бел/.test(t);
    return {
      reply: dark ? "Собрал тёмную палитру и проверил контраст." : "Собрал светлую палитру и проверил контраст.",
      proposal: themeProposal(dark),
    };
  }
  if (/экран|screen|страниц/.test(t)) {
    return { reply: "Опишу экран до того, как добавлю его в проект.", proposal: screenProposal() };
  }
  if (/кнопк|button|поле|input|текст|карточк/.test(t)) {
    const isBtn = /кнопк|button/.test(t);
    return {
      reply: isBtn ? "Добавлю кнопку в текущий экран." : "Добавлю элемент в текущий экран.",
      proposal: {
        id: uid("p"),
        kind: "component",
        title: isBtn ? "Добавить кнопку на экран?" : "Добавить элемент на экран?",
        commitTitle: isBtn ? "Добавлена кнопка" : "Добавлен элемент",
        note: "Возьму стиль из темы: акцентная заливка, скругление 12, вес 600.",
        command: text,
        diff: [
          { label: "+1 слой", tone: "add" },
          { label: "~1 экран", tone: "mod" },
        ],
        files: [{ path: "screens/Home.tsx", stat: "+9" }],
      },
    };
  }

  return {
    reply: "Понял. Могу собрать это в несколько шагов — начну с самого заметного и покажу изменение до применения.",
    proposal: rotatingProposal(),
  };
}
