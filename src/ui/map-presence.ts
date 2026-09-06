import type { PresentCharacter } from '../core/encounter';
import type { AssetRef, WorldState } from '../data/schema/save';

export interface MapPresenceVisual {
  id: string;
  name: string;
  initial: string;
  accentColor: string;
  avatar?: AssetRef;
}

export function mapPresenceVisual(world: WorldState, person: PresentCharacter): MapPresenceVisual {
  const formal = person.tier === 'formal' ? world.characters[person.id] : undefined;
  const semi = person.tier === 'semi' ? world.npcs[person.id] : undefined;
  return {
    id: person.id,
    name: person.name,
    initial: Array.from(person.name.trim())[0] ?? '?',
    accentColor: formal?.visuals.accentColor ?? '#667085',
    avatar: formal?.visuals.avatar ?? semi?.visuals?.avatar,
  };
}
