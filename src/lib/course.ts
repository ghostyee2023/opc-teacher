// 课程库:种子数据、localStorage 读写、数据规范化
import type { CourseInteraction, CourseRecord, GroupDefinition, LessonContent, PointRules } from "../types";

export const defaultPointRules: PointRules = { taskComplete: 10, interactionCorrect: 5, questionAsk: 1, teacherBonus: 5 };

export const defaultGroups: GroupDefinition[] = [
  { id: 1, name: "变量实验室" },
  { id: 2, name: "先问为什么" },
  { id: 3, name: "提示词车间" },
  { id: 4, name: "不止一步" },
  { id: 5, name: "共创引擎" },
  { id: 6, name: "答案在路上" },
  { id: 7, name: "上下文小队" },
  { id: 8, name: "涌现计划" },
];

const interactionQuestion: CourseInteraction = {
  question: "下面哪一项最能让提示词变得可执行?",
  answers: ["写清目标、受众和输出格式", "只写一句“帮我优化”", "把所有资料一次性粘贴", "让 AI 自己决定交付方式"],
  correct: 0,
};

const chapterContent: Record<number, LessonContent> = {
  1: {
    title: "从一个具体问题开始",
    description: "认识生成式 AI 在真实工作中的能力边界,并找出一个值得改造的重复任务。",
    task: "选出你们组最想交给 AI 的重复工作,并描述它现在的完成方式。",
    prompts: ["请分析以下工作任务,找出其中重复、耗时且适合由 AI 协助的环节。"],
  },
  2: {
    title: "把需求写成可执行指令",
    description: "好提示词不是咒语。它让目标、受众、材料、限制和输出标准在同一个上下文里工作。",
    task: "用五要素框架改写你们的小组需求,提交一版可直接执行的提示词。",
    prompts: ["你是一名企业培训课程设计师。请面向没有技术背景的业务同事,用三个具体例子解释 AI 工作流,并给出一项 10 分钟内能完成的练习。"],
  },
  3: {
    title: "把散落经验变成团队资产",
    description: "先定义知识边界,再设计稳定的检索与引用方式,让答案可以复核。",
    task: "整理一份部门知识清单,标记来源、更新频率和适用范围。",
    prompts: ["请将以下资料按主题、可信度和更新时间整理,并为每条结论标记引用来源。"],
  },
  4: {
    title: "让复盘产生下一次行动",
    description: "把过程记录交给 AI 归纳,但把判断和取舍留给团队。",
    task: "使用课堂记录生成一份复盘初稿,并补充团队自己的判断。",
    prompts: ["根据以下过程记录,总结有效做法、失败原因和下次可执行的改进动作。"],
  },
  5: {
    title: "用成果讲清业务价值",
    description: "以问题、方案、验证和下一步为主线,完成一场三分钟小组路演。",
    task: "提交一页成果说明,并准备三分钟现场展示。",
    prompts: ["请把以下项目记录整理为三分钟路演提纲,突出业务问题、验证结果和下一步。"],
  },
};

export const courseCatalogSeed: CourseRecord[] = [
  {
    id: "ai-workflow",
    title: "AI 工作流实战",
    className: "企业内训班",
    description: "用一场可视化的协作练习,把 AI 方法带回真实工作。",
    status: "active",
    chapters: chapterContent,
    interaction: interactionQuestion,
  },
  {
    id: "team-copilot",
    title: "团队共创加速营",
    className: "产品共创班",
    description: "从问题拆解到团队共创,练习把想法变成可执行方案。",
    status: "draft",
    chapters: {
      1: { title: "找到团队共识", description: "把分散的观察整理成一个值得共同解决的问题。", task: "为你们的项目写下一句共同认可的问题定义。", prompts: ["请把以下零散观察整理成一个清晰的问题定义,并标记待验证假设。"] },
      2: { title: "让方案快速成形", description: "用结构化提示让团队在有限时间内形成多个可比较方案。", task: "围绕问题生成三套方案,并选出最值得验证的一套。", prompts: ["请基于问题、用户和约束,生成三套可验证方案,并比较优缺点。"] },
      3: { title: "用反馈迭代方案", description: "把真实反馈带回方案,形成下一轮可执行的迭代。", task: "整理一次用户反馈,写出下一轮迭代的三个动作。", prompts: ["请从以下反馈中归纳关键问题,并给出三个下一步迭代动作。"] },
    },
    interaction: { question: "团队共创时,哪一步最适合先交给 AI?", answers: ["整理信息并生成候选方案", "替团队直接做最终决策", "跳过讨论直接输出结论", "只记录会议时间"], correct: 0 },
  },
];

/** 规范化章节内容:统一 prompts 为数组(至少一个空位,保证编辑器/学生端一致),兼容旧的单一 prompt 字段 */
export function normalizeLesson(lesson: LessonContent): LessonContent {
  const prompts = lesson.prompts?.length ? lesson.prompts : lesson.prompt ? [lesson.prompt] : [""];
  return { ...lesson, prompts };
}

export function lessonPrompts(lesson: LessonContent | undefined): string[] {
  if (!lesson) return [""];
  return lesson.prompts?.length ? lesson.prompts : lesson.prompt ? [lesson.prompt] : [""];
}

export function normalizeCourse(course: CourseRecord): CourseRecord {
  const chapters: Record<number, LessonContent> = {};
  Object.entries(course.chapters ?? {}).forEach(([id, lesson]) => {
    chapters[Number(id)] = normalizeLesson(lesson);
  });
  return { ...course, chapters };
}

const COURSE_KEY = "coground-course-content";
const DEFAULTS_KEY = "coground-manage-defaults";

export function getStoredCourses(): CourseRecord[] {
  try {
    const stored = window.localStorage.getItem(COURSE_KEY);
    if (stored) return (JSON.parse(stored) as CourseRecord[]).map(normalizeCourse);
  } catch { /* 忽略损坏的本地数据 */ }
  return courseCatalogSeed.map(normalizeCourse);
}

export function storeCourses(courses: CourseRecord[]) {
  try { window.localStorage.setItem(COURSE_KEY, JSON.stringify(courses)); } catch { /* 本地存储不可用 */ }
}

/** 课堂默认配置(管理页维护:分组模板 + 积分规则默认值) */
export type ManageDefaults = { groups: GroupDefinition[]; rules: PointRules };

export function getManageDefaults(): ManageDefaults {
  try {
    const stored = window.localStorage.getItem(DEFAULTS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<ManageDefaults>;
      return {
        groups: parsed.groups?.length ? parsed.groups : defaultGroups,
        rules: { ...defaultPointRules, ...(parsed.rules ?? {}) },
      };
    }
  } catch { /* 忽略损坏的本地数据 */ }
  return { groups: defaultGroups, rules: defaultPointRules };
}

export function storeManageDefaults(defaults: ManageDefaults) {
  try { window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults)); } catch { /* 本地存储不可用 */ }
}
