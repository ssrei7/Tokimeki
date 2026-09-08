import type { PromptBlock, PromptFacts } from './assembler';

export interface TopicTreePromptFacts extends PromptFacts {
  topicTreeRequest?: unknown;
}

const factsOf = (facts: PromptFacts) => facts as TopicTreePromptFacts;

export const TOPIC_TREE_PROMPT_BLOCKS: PromptBlock[] = [
  {
    id: 'topic_tree_contract',
    role: 'system',
    priority: 120,
    order: -1,
    tasks: ['topic_tree'],
    build: () => '你为开放世界叙事游戏生成一次面对面话题树。只输出 JSON，不要 Markdown、解释或正文。返回 4–8 个话题；每个话题包含 id、label、kind(daily/story)、terminal、response、可选 usedResponse、require、unlocks、ops、generatedDay。response 是已经确定的叙述文字，不要把状态变化当作已经发生。',
  },
  {
    id: 'topic_tree_request',
    role: 'user',
    priority: 15,
    order: 16,
    tasks: ['topic_tree'],
    build: (facts) => {
      const request = factsOf(facts).topicTreeRequest;
      return request === undefined ? null : JSON.stringify(request);
    },
  },
];
