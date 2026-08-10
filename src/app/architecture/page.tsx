import type { Metadata } from "next";
import { ArchDiagram } from "@/components/ArchDiagram";

export const metadata: Metadata = {
  title: "Архітектура — Прасолов та Партнери",
};

const WHY_CARDS = [
  {
    title: "Гібридний пошук",
    body: "Векторний пошук (семантика) і повнотекстовий пошук (лексика) працюють паралельно, а їхні результати об'єднує Reciprocal Rank Fusion — жоден релевантний документ не губиться через дослівний збіг чи, навпаки, перефразування.",
  },
  {
    title: "RBAC у retrieval",
    body: "Фільтр ролей застосовується на етапі пошуку, до генерації відповіді: документ, недоступний ролі користувача, не потрапляє навіть у контекст LLM — модель фізично не може його процитувати.",
  },
  {
    title: "Чесна відмова",
    body: "Якщо релевантність найкращого знайденого фрагмента нижча за поріг, асистент прямо каже «немає відповіді» — замість того, щоб вигадати правдоподібну, але неправдиву.",
  },
  {
    title: "Спостережуваність",
    body: "Кожен запит трейситься: час виконання по стадіях, кількість токенів, вартість і релевантність джерел зберігаються в kb_traces — це і є дані сторінки «Аналітика».",
  },
];

export default function ArchitecturePage() {
  return (
    <div className="mx-auto max-w-5xl py-8">
      <h1>Архітектура</h1>
      <p className="mt-2 font-body text-[15px] text-ivory-dim">
        Як влаштований пайплайн: від сирих документів до відповіді з
        посиланнями на джерела.
      </p>

      <div className="mt-8 rounded-xl border border-navy-700 bg-navy-900 p-6">
        <ArchDiagram />
      </div>

      <h2 className="mt-10">Чому так</h2>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {WHY_CARDS.map((card) => (
          <div
            key={card.title}
            className="rounded-xl border border-navy-700 bg-navy-900 p-5"
          >
            <h3 className="font-display text-[17px] font-semibold text-ivory">
              {card.title}
            </h3>
            <p className="mt-2 font-body text-[14px] leading-6 text-ivory-dim">
              {card.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
