// 共场 AI 课堂互动系统 - 共享类型定义

export type GroupStatus = "done" | "review" | "working" | "help";
export type FollowMode = "strong" | "soft" | "free";

export type CourseInteraction = { question: string; answers: string[]; correct: number };

export type LessonContent = {
  title: string;
  description: string;
  task: string;
  /** 兼容旧数据:旧课程包用单个 prompt 字符串 */
  prompt?: string;
  prompts?: string[];
  interaction?: CourseInteraction;
};

export type CourseRecord = {
  id: string;
  title: string;
  className: string;
  description: string;
  status: "draft" | "active" | "ended";
  chapters: Record<number, LessonContent>;
  interaction: CourseInteraction;
};

export type PointRules = {
  taskComplete: number;
  interactionCorrect: number;
  questionAsk: number;
  teacherBonus: number;
};

/** 课堂小组(教师定义的分组模板,创建课堂时快照) */
export type GroupDefinition = { id: number; name: string };

/** 课堂会话状态:教师端写入,所有端共享 */
export type ClassroomSession = {
  code: string;
  courseId: string;
  courseTitle: string;
  className: string;
  description: string;
  /** 课程内容快照,创建课堂时从课程库复制 */
  chapters: Record<number, LessonContent>;
  defaultInteraction: CourseInteraction;
  groups: GroupDefinition[];
  pointRules: PointRules;
  teacher: { name: string; role: string; message: string };
  currentChapter: number;
  published: boolean;
  followMode: FollowMode;
  /** 锁定学生只能查看当前章节 */
  studentLocked: boolean;
  /** 倒计时:结束时间戳(ms);暂停时为 null */
  timerEndsAt: number | null;
  /** 暂停时剩余秒数 */
  timerRemaining: number;
  /** 本轮任务时长(秒) */
  timerDuration: number;
  /** 讲义当前页码(教师写,学生可跟随) */
  slideIndex: number;
  status: "active" | "ended";
  createdAt: number;
  endedAt: number | null;
};

/** 课堂事件:追加写入,所有端通过折叠同一份事件流得到一致的派生状态 */
export type ClassroomEvent =
  | { type: "join"; id: string; studentId: string; nickname: string; groupId: number; isLeader: boolean; at: number }
  | { type: "complete"; id: string; studentId: string; groupId: number; chapter: number; at: number }
  | { type: "interaction"; id: string; studentId: string; groupId: number; chapter: number; answer: number; correct: boolean; at: number }
  | { type: "question"; id: string; studentId: string; nickname: string; groupId: number; groupName: string; text: string; at: number }
  | { type: "answer"; id: string; questionId: string; text: string; visibility: "public" | "group"; at: number }
  | { type: "resolve"; id: string; questionId: string; at: number }
  | { type: "points"; id: string; groupId: number; points: number; reason: string; at: number }
  | { type: "confirm"; id: string; groupId: number; at: number }
  | { type: "group-questions"; id: string; groupId: number; items: string[]; at: number }
  | { type: "group-rename"; id: string; groupId: number; name: string; at: number }
  | { type: "support"; id: string; groupId: number; at: number }
  | { type: "leave"; id: string; studentId: string; at: number };

export type StudentInfo = {
  studentId: string;
  nickname: string;
  groupId: number;
  isLeader: boolean;
  joinedAt: number;
};

export type QuestionAnswerView = { text: string; visibility: "public" | "group"; at: number };

export type QuestionItem = {
  id: string;
  studentId: string;
  nickname: string;
  groupId: number;
  groupName: string;
  text: string;
  votes: number;
  at: number;
  answer?: QuestionAnswerView;
};

export type PointEvent = {
  id: string;
  groupId: number;
  points: number;
  reason: string;
  at: number;
};

/** 小组实时视图(由会话 + 事件折叠而来) */
export type GroupView = {
  id: number;
  name: string;
  status: GroupStatus;
  progress: number;
  completed: number;
  /** 所有章节累计完成人次 */
  totalCompletions: number;
  members: number;
  score: number;
  note: string;
  people: StudentInfo[];
  confirmed: boolean;
};

export type ClassroomDerived = {
  students: StudentInfo[];
  groups: GroupView[];
  questions: QuestionItem[];
  pointEvents: PointEvent[];
  /** 教师发起的支援提醒(按时间倒序) */
  supports: { id: string; groupId: number; at: number }[];
  totalScore: number;
  completedCount: number;
};

export type MyStudentSession = {
  code: string;
  studentId: string;
  nickname: string;
  groupId: number;
  isLeader: boolean;
};
