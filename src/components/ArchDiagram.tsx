// Hand-written pipeline diagram — deliberately not mermaid, so every visual
// detail (theme colors via CSS variables, box proportions, lane grouping)
// stays under direct control. Pure presentation: no client state, no
// interactivity beyond native <title> tooltips on each box.
interface DiagramBox {
  lines: string[];
  width: number;
}

interface PositionedBox extends DiagramBox {
  x: number;
  y: number;
  height: number;
}

const VIEW_WIDTH = 1200;
const GAP = 16;
const BOX_HEIGHT = 70;

const LANE1_TITLE_Y = 26;
const LANE1_BOX_Y = 42;
const LANE2_TITLE_Y = 152;
const LANE2_BOX_Y = 168;
const LANE3_TITLE_Y = 290;
const LANE3_BOX_Y = 306;
const VIEW_HEIGHT = 396;

const LANE1_BOXES: DiagramBox[] = [
  { lines: ["corpus/*.md"], width: 145 },
  { lines: ["Чанкінг 2000/400"], width: 190 },
  { lines: ["Jina Embeddings v3", "(1024d)"], width: 210 },
  { lines: ["Supabase pgvector"], width: 200 },
];

const LANE2_BOXES: DiagramBox[] = [
  { lines: ["Питання"], width: 110 },
  { lines: ["Embedding"], width: 125 },
  { lines: ["Гібридний пошук", "(vector + BM25 → RRF)"], width: 220 },
  { lines: ["Фільтр ролей", "(RBAC)"], width: 155 },
  { lines: ["Jina Rerank", "(top-5)"], width: 145 },
  { lines: ["DeepSeek V4 Pro"], width: 180 },
  { lines: ["Стрімінг", "з цитатами"], width: 140 },
];

const LANE3_BOXES: DiagramBox[] = [
  { lines: ["Трейс: латентність,", "токени, вартість"], width: 230 },
  { lines: ["kb_traces"], width: 130 },
  { lines: ["Аналітика"], width: 130 },
];

function layoutRow(boxes: DiagramBox[], y: number): PositionedBox[] {
  const totalWidth =
    boxes.reduce((sum, b) => sum + b.width, 0) + GAP * (boxes.length - 1);
  let x = (VIEW_WIDTH - totalWidth) / 2;
  return boxes.map((box) => {
    const positioned: PositionedBox = { ...box, x, y, height: BOX_HEIGHT };
    x += box.width + GAP;
    return positioned;
  });
}

function rowCenterX(row: PositionedBox[]): number {
  const first = row[0];
  const last = row[row.length - 1];
  return (first.x + (last.x + last.width)) / 2;
}

function Box({ box }: { box: PositionedBox }) {
  const cx = box.x + box.width / 2;
  const lineHeight = 19;
  const startY =
    box.y + box.height / 2 - ((box.lines.length - 1) * lineHeight) / 2 + 5;
  return (
    <g>
      <title>{box.lines.join(" ")}</title>
      <rect
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={8}
        style={{ fill: "var(--navy-800)", stroke: "var(--navy-700)" }}
        strokeWidth={1.5}
      />
      <text
        x={cx}
        textAnchor="middle"
        className="font-body"
        style={{ fill: "var(--ivory)", fontSize: 16, fontWeight: 500 }}
      >
        {box.lines.map((line, i) => (
          <tspan key={i} x={cx} y={startY + i * lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function RowArrows({ row }: { row: PositionedBox[] }) {
  const y = row[0].y + row[0].height / 2;
  return (
    <>
      {row.slice(0, -1).map((box, i) => {
        const next = row[i + 1];
        return (
          <line
            key={i}
            x1={box.x + box.width}
            y1={y}
            x2={next.x - 4}
            y2={y}
            style={{ stroke: "var(--ivory-dim)" }}
            strokeWidth={1.5}
            markerEnd="url(#arch-arrow)"
          />
        );
      })}
    </>
  );
}

function LaneTitle({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
      y={y}
      className="font-body"
      style={{
        fill: "var(--brass)",
        fontSize: 16,
        fontWeight: 700,
        letterSpacing: "0.08em",
      }}
    >
      {children.toUpperCase()}
    </text>
  );
}

export function ArchDiagram() {
  const lane1 = layoutRow(LANE1_BOXES, LANE1_BOX_Y);
  const lane2 = layoutRow(LANE2_BOXES, LANE2_BOX_Y);
  const lane3 = layoutRow(LANE3_BOXES, LANE3_BOX_Y);

  const connectorX1 = rowCenterX(lane2);
  const connectorY1 = lane2[0].y + lane2[0].height;
  const connectorX2 = rowCenterX(lane3);
  const connectorY2 = lane3[0].y;

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      role="img"
      aria-label="Схема пайплайна: інжест документів, обробка запиту з RBAC та реранкінгом, спостережуваність через трейси"
      className="w-full"
    >
      <defs>
        <marker
          id="arch-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,5 L0,10 z" style={{ fill: "var(--ivory-dim)" }} />
        </marker>
      </defs>

      <LaneTitle x={lane1[0].x} y={LANE1_TITLE_Y}>
        Інжест
      </LaneTitle>
      {lane1.map((box, i) => (
        <Box key={i} box={box} />
      ))}
      <RowArrows row={lane1} />

      <LaneTitle x={lane2[0].x} y={LANE2_TITLE_Y}>
        Запит
      </LaneTitle>
      {lane2.map((box, i) => (
        <Box key={i} box={box} />
      ))}
      <RowArrows row={lane2} />

      <LaneTitle x={lane3[0].x} y={LANE3_TITLE_Y}>
        Спостережуваність
      </LaneTitle>
      {lane3.map((box, i) => (
        <Box key={i} box={box} />
      ))}
      <RowArrows row={lane3} />

      <line
        x1={connectorX1}
        y1={connectorY1}
        x2={connectorX2}
        y2={connectorY2 - 4}
        style={{ stroke: "var(--ivory-dim)" }}
        strokeWidth={1.5}
        strokeDasharray="4 4"
        markerEnd="url(#arch-arrow)"
      />
      <text
        x={connectorX1 + 10}
        y={(connectorY1 + connectorY2) / 2 + 4}
        className="font-body"
        style={{ fill: "var(--ivory-dim)", fontSize: 15 }}
      >
        кожен запит трейситься
      </text>
    </svg>
  );
}
