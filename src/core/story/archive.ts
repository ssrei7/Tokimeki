import type { SaveFile } from '../../data/schema/save';

/** Render experienced event history as a standalone, human-readable Markdown archive. */
export function formatEventHistoryArchive(save: SaveFile): string {
  const history = save.world.eventHistory ?? [];
  const slotNames = new Map(save.config.calendar.slots.map((slot) => [slot.id, slot.name]));
  const lines = [
    `# ${save.meta.title} · 事件档案`,
    '',
    `共 ${history.length} 篇亲历事件。`,
  ];

  history.forEach((entry, index) => {
    const nodeName = save.world.map.nodes[entry.nodeId]?.name ?? entry.nodeId;
    const slotName = slotNames.get(entry.slotId) ?? entry.slotId;
    const participants = entry.charIds.map((id) => save.world.characters[id]?.name ?? save.world.npcs[id]?.name ?? id);
    lines.push(
      '',
      '---',
      '',
      `## ${index + 1}. ${entry.title}`,
      '',
      `第 ${entry.day} 天 · ${slotName} · ${nodeName} · ${entry.scope === 'formal' ? '正式进入' : '附近外围'}`,
    );
    if (participants.length) lines.push('', `人物：${participants.join('、')}`);
    const narrative = entry.narrative?.trim() || entry.content?.trim();
    if (narrative) lines.push('', narrative);
    if (entry.choice?.trim()) lines.push('', `选择：${entry.choice.trim()}`);
    if (entry.resultSummary?.trim()) lines.push('', `结果：${entry.resultSummary.trim()}`);
  });

  return `${lines.join('\n')}\n`;
}
