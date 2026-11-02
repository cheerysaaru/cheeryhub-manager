import { Database } from "../db/client";
import { POINTS_SKILL_LEVEL_UP } from "../../../shared/points";

export const SKILL_PROGRESS_PER_COMPLETION = 10;

export interface SkillProgressResult {
  skillId: string;
  skillName: string;
  progress: number;
  currentLevel: number;
  leveledUp: boolean;
}

/**
 * Adds progress to a skill when the user finishes linked work (roadmap day,
 * task, ...). Every +progress units rolled past 100 levels the skill up and
 * carries the remaining progress over. Awards +50 points per level gained.
 */
export async function bumpSkillProgress(
  db: Database,
  userId: string,
  skillId: string,
  delta = SKILL_PROGRESS_PER_COMPLETION,
): Promise<SkillProgressResult | null> {
  const skill = await db.first<{
    id: string;
    name: string;
    currentLevel: number;
    targetLevel: number;
    progress: number;
  }>(
    'SELECT id, name, currentLevel, targetLevel, progress FROM "Skill" WHERE id = ?1 AND userId = ?2',
    [skillId, userId],
  );
  if (!skill) return null;
  if (skill.currentLevel >= skill.targetLevel) {
    return {
      skillId: skill.id,
      skillName: skill.name,
      progress: skill.progress,
      currentLevel: skill.currentLevel,
      leveledUp: false,
    };
  }

  const now = new Date().toISOString();
  let progress = Math.max(0, skill.progress + delta);
  let level = skill.currentLevel;
  let leveledUp = false;
  while (progress >= 100 && level < skill.targetLevel) {
    level += 1;
    progress -= 100;
    leveledUp = true;

    await db.run(
      `INSERT OR IGNORE INTO "PointEvent" (id, userId, type, amount, reason, sourceId, dayKey, createdAt)
       VALUES (?1, ?2, 'EARN', ?3, ?4, ?5, ?6, ?7)`,
      [
        crypto.randomUUID(),
        userId,
        POINTS_SKILL_LEVEL_UP,
        "SKILL_LEVEL_UP",
        `${skill.id}:level:${level}`,
        now.slice(0, 10),
        now,
      ],
    );
  }

  if (level >= skill.targetLevel) progress = Math.min(progress, 100);

  await db.run(
    'UPDATE "Skill" SET currentLevel = ?1, progress = ?2, updatedAt = ?3 WHERE id = ?4',
    [level, progress, now, skill.id],
  );

  return {
    skillId: skill.id,
    skillName: skill.name,
    progress,
    currentLevel: level,
    leveledUp,
  };
}
