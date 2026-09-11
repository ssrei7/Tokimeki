export { createFriendRequest, isAcceptedFriend, listContactCandidates, resolveFriendRequest, simulateFriendAcceptance } from './contacts';
export { buildTerminalReplyPrompt, listTerminalMessages, sendTerminalReplyMessage, sendTerminalStickerMessage, sendTerminalTextMessage, terminalThreadId, TERMINAL_PLAYER_ID } from './messages';
export type { TerminalPromptMessage } from './messages';
export type { ContactCandidate, ContactDirection, ContactOperationResult, FriendRequestAction } from './contacts';
