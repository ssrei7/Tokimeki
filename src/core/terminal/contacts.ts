import { whoIsWhere } from '../encounter/schedule';
import type { AssetRef, TerminalFriendRequest, WorldState } from '../../data/schema/save';

export type ContactDirection = 'outgoing' | 'incoming';
export type FriendRequestAction = 'accept' | 'reject' | 'revoke';

export interface ContactCandidate {
  id: string;
  name: string;
  tier: 'formal' | 'semi';
  avatar?: AssetRef;
  fallbackInitial: string;
  location?: {
    nodeId: string;
    nodeName: string;
    activity: string;
    source: 'schedule' | 'home';
  };
  request?: TerminalFriendRequest;
}

export interface ContactOperationResult {
  ok: boolean;
  changed: boolean;
  warning?: string;
  request?: TerminalFriendRequest;
}

function latestRequest(world: WorldState, characterId: string, direction?: ContactDirection): TerminalFriendRequest | undefined {
  return [...world.terminal.friendRequests]
    .reverse()
    .find((request) => request.characterId === characterId && (!direction || request.direction === direction));
}

function characterRecord(world: WorldState, characterId: string) {
  const formal = world.characters[characterId];
  if (formal) return { id: formal.id, name: formal.name, tier: formal.tier, avatar: formal.visuals.avatar };
  const npc = world.npcs[characterId];
  if (npc) return { id: npc.id, name: npc.name, tier: npc.tier, avatar: npc.visuals?.avatar };
  return undefined;
}

export function listContactCandidates(
  world: WorldState,
  day = world.clock.day,
  slotId = world.clock.slotId,
  daysPerWeek = 7,
): ContactCandidate[] {
  const locations = new Map(whoIsWhere(world, day, slotId, daysPerWeek).map((person) => [person.id, person]));
  const candidates = [
    ...Object.values(world.characters).map((character) => ({ id: character.id, name: character.name, tier: character.tier as 'formal' | 'semi', avatar: character.visuals.avatar })),
    ...Object.values(world.npcs).map((npc) => ({ id: npc.id, name: npc.name, tier: npc.tier as 'formal' | 'semi', avatar: npc.visuals?.avatar })),
  ];
  return candidates
    .map((candidate) => {
      const presence = locations.get(candidate.id);
      return {
        ...candidate,
        fallbackInitial: Array.from(candidate.name.trim())[0] ?? '?',
        location: presence ? {
          nodeId: presence.nodeId,
          nodeName: world.map.nodes[presence.nodeId]?.name ?? presence.nodeId,
          activity: presence.activity,
          source: presence.source,
        } : undefined,
        request: latestRequest(world, candidate.id),
      } satisfies ContactCandidate;
    })
    .sort((a, b) => (a.tier === b.tier ? a.id.localeCompare(b.id) : a.tier === 'formal' ? -1 : 1));
}

export function createFriendRequest(world: WorldState, characterId: string, direction: ContactDirection, day = world.clock.day): ContactOperationResult {
  if (!characterRecord(world, characterId)) return { ok: false, changed: false, warning: '联系人不存在。' };
  const existing = latestRequest(world, characterId, direction);
  if (existing && (existing.status === 'pending' || existing.status === 'accepted')) return { ok: true, changed: false, request: existing };
  const request: TerminalFriendRequest = {
    id: `friend-request-${characterId}-${direction}-${world.terminal.friendRequests.length + 1}`,
    characterId,
    direction,
    status: 'pending',
    createdDay: Math.max(1, Math.floor(day)),
    updatedDay: Math.max(1, Math.floor(day)),
  };
  world.terminal.friendRequests.push(request);
  return { ok: true, changed: true, request };
}

export function resolveFriendRequest(world: WorldState, requestId: string, action: FriendRequestAction, day = world.clock.day): ContactOperationResult {
  const request = world.terminal.friendRequests.find((item) => item.id === requestId);
  if (!request) return { ok: false, changed: false, warning: '好友申请不存在。' };
  const targetStatus = action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'revoked';
  if (request.status === targetStatus) return { ok: true, changed: false, request };
  if (request.status !== 'pending') return { ok: true, changed: false, request };
  if (action === 'accept' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能接受对方发来的申请。', request };
  if (action === 'reject' && request.direction !== 'incoming') return { ok: false, changed: false, warning: '只能拒绝对方发来的申请。', request };
  if (action === 'revoke' && request.direction !== 'outgoing') return { ok: false, changed: false, warning: '只能撤回自己发出的申请。', request };
  request.status = targetStatus;
  request.updatedDay = Math.max(1, Math.floor(day));
  return { ok: true, changed: true, request };
}

export function isAcceptedFriend(world: WorldState, characterId: string): boolean {
  return world.terminal.friendRequests.some((request) => request.characterId === characterId && request.status === 'accepted');
}
