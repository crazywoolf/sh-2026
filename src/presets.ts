export type Preset = { title: string; question: string; alert?: boolean };

export const PRESETS: Preset[] = [
  { title: "Выручка и динамика", question: "Какая чистая выручка по годам и как она менялась год-к-году?", alert: true },
  { title: "Структура GMV", question: "Как распределён GMV по продуктовым линиям?" },
  { title: "Отток и причины", question: "Каковы топ-причины оттока клиентов?", alert: true },
  { title: "Угроза AI-конкурентов", question: "Сколько клиентов ушло из-за AI-альтернатив?", alert: true },
  { title: "Юнит-экономика", question: "Какое отношение LTV/CAC по сегментам? Где привлечение убыточно?", alert: true },
  { title: "NPS по линиям", question: "Какой NPS по продуктовым линиям? Где он самый низкий?" },
  { title: "Вовлечённость", question: "Как выглядит вовлечённость клиентов по статусам активности?" },
];
