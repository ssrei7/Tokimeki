import type { StoryScene, StorySceneStage } from '../../data/schema/save';

export interface StorySceneReaderProps {
  scene: StoryScene;
  onReadStage: (stageId: string) => void;
  onSelectStage?: (stageId: string) => void;
}

/** Stages beyond the deterministic plot frontier are never exposed to the reader. */
export function getReadableStorySceneStages(scene: StoryScene): StorySceneStage[] {
  const frontier = scene.stages.findIndex((stage) => stage.id === scene.currentStageId);
  return scene.stages.slice(0, frontier < 0 ? 1 : frontier + 1);
}

export function StorySceneReader({ scene, onReadStage, onSelectStage }: StorySceneReaderProps) {
  const readableStages = getReadableStorySceneStages(scene);
  const nextUnread = readableStages.find((stage) => !scene.readStageIds.includes(stage.id));
  const resumeStage = readableStages.find((stage) => stage.id === scene.readingStageId) ?? readableStages[0];

  return (
    <article className="story-reader" aria-label={`剧情阅读：${scene.title}`}>
      <header className="story-reader-header">
        <div>
          <span className="eyebrow">StoryScene · 电子小说</span>
          <h2>{scene.title}</h2>
          <p>{scene.intent}</p>
        </div>
        <span className="story-reader-status">{scene.status === 'completed' ? '已完成' : '进行中'}</span>
      </header>
      <div className="story-reader-progress" aria-label="阅读进度">
        <span>{scene.readStageIds.length}/{readableStages.length} 阶段已读</span>
        <span>恢复位置：{resumeStage?.title ?? '开场'}</span>
      </div>
      <div className="story-reader-body">
        {readableStages.map((stage) => {
          const read = scene.readStageIds.includes(stage.id);
          const current = stage.id === scene.readingStageId;
          const canRead = read || stage.id === nextUnread?.id;
          return (
            <section className={`story-reader-stage${current ? ' is-current' : ''}${read ? ' is-read' : ''}`} key={stage.id}>
              <div className="story-reader-stage-heading">
                <span className="eyebrow">阶段 {readableStages.indexOf(stage) + 1}</span>
                <h3>{stage.title}</h3>
                {read && <span className="story-reader-read-mark">已读</span>}
              </div>
              <p>{stage.content}</p>
              <div className="story-reader-stage-actions">
                {!read && canRead && <button type="button" onClick={() => onReadStage(stage.id)}>读完这一阶段</button>}
                {read && onSelectStage && <button type="button" className="secondary" onClick={() => onSelectStage(stage.id)}>回看</button>}
              </div>
            </section>
          );
        })}
      </div>
      {nextUnread ? <p className="story-reader-hint">下一阶段：{nextUnread.title}。剧情推进后才会解锁更远内容。</p> : <p className="story-reader-hint">当前已解锁内容均已读完。</p>}
    </article>
  );
}
