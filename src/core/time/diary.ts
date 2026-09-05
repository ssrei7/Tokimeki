import type { DailySettlement, WorldState } from '../../data/schema/save';

export function buildLocalDiary(settlement: Omit<DailySettlement, 'diary'>): string {
  const places = settlement.footprint.length ? `足迹停留在 ${settlement.footprint.join('、')}` : '没有留下新的地点足迹';
  const people = settlement.met.length ? `遇见了 ${settlement.met.join('、')}` : '没有记录到新的相遇';
  const items = settlement.itemsGained.length
    ? `获得了 ${settlement.itemsGained.map((entry) => `${entry.itemId} ×${entry.count}`).join('、')}`
    : '没有获得新物品';
  const balance = settlement.income - settlement.expense;
  return `第 ${settlement.day} 天结束。${places}，${people}，${items}。今日收支净额为 ${balance}。`;
}

export function updateDiaryEntry(world: WorldState, day: number, text: string, editedAt: string): boolean {
  const entry = world.diary.find((item) => item.day === day);
  if (!entry) return false;
  entry.text = text;
  entry.editedAt = editedAt;
  const settlement = world.settlements.find((item) => item.day === day);
  if (settlement) settlement.diary = text;
  return true;
}
