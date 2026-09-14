// 事件折叠:把课堂事件流 + 会话状态折叠为所有端一致的派生状态
import type {
  ClassroomDerived,
  ClassroomEvent,
  ClassroomSession,
  GroupStatus,
  GroupView,
  PointEvent,
  QuestionItem,
  StudentInfo,
} from "../types";

/** 按时间排序后折叠事件流。折叠是幂等的:同一份事件流在任何端得到相同结果。 */
export function foldClassroom(session: ClassroomSession, events: ClassroomEvent[]): ClassroomDerived {
  const sorted = [...events].sort((a, b) => a.at - b.at);

  const students = new Map<string, StudentInfo>();
  const renames = new Map<number, string>();
  /** `${studentId}:${chapter}` 完成标记 */
  const completions = new Set<string>();
  /** `${studentId}:${chapter}` 互动答题 */
  const interactions = new Map<string, { answer: number; correct: boolean }>();
  const rawQuestions: Extract<ClassroomEvent, { type: "question" }>[] = [];
  const answers = new Map<string, Extract<ClassroomEvent, { type: "answer" }>>();
  const resolved = new Set<string>();
  const pointEvents: PointEvent[] = [];
  const confirmed = new Set<number>();
  const groupQuestions = new Map<number, string[]>();
  const supports: { id: string; groupId: number; at: number }[] = [];

  for (const event of sorted) {
    switch (event.type) {
      case "join":
        students.set(event.studentId, { studentId: event.studentId, nickname: event.nickname, groupId: event.groupId, isLeader: event.isLeader, joinedAt: event.at });
        break;
      case "group-rename":
        renames.set(event.groupId, event.name);
        break;
      case "complete":
        completions.add(`${event.studentId}:${event.chapter}`);
        break;
      case "interaction":
        interactions.set(`${event.studentId}:${event.chapter}`, { answer: event.answer, correct: event.correct });
        break;
      case "question":
        rawQuestions.push(event);
        break;
      case "answer":
        answers.set(event.questionId, event);
        break;
      case "resolve":
        resolved.add(event.questionId);
        break;
      case "points":
        pointEvents.push({ id: event.id, groupId: event.groupId, points: event.points, reason: event.reason, at: event.at });
        break;
      case "confirm":
        confirmed.add(event.groupId);
        break;
      case "group-questions":
        groupQuestions.set(event.groupId, event.items);
        break;
      case "support":
        supports.push({ id: event.id, groupId: event.groupId, at: event.at });
        break;
      case "leave":
        students.delete(event.studentId);
        break;
    }
  }

  const studentList = [...students.values()];
  const scoreByGroup = new Map<number, number>();
  for (const event of pointEvents) {
    scoreByGroup.set(event.groupId, (scoreByGroup.get(event.groupId) ?? 0) + event.points);
  }

  const openQuestions: QuestionItem[] = [];
  const aggregated = new Map<string, QuestionItem>();
  const chapterIds = Object.keys(session.chapters).map(Number);
  for (const question of rawQuestions) {
    if (resolved.has(question.id)) continue;
    const key = question.text.trim();
    const existing = aggregated.get(key);
    if (existing) {
      existing.votes += 1;
    } else {
      const answer = answers.get(question.id);
      const item: QuestionItem = {
        id: question.id,
        studentId: question.studentId,
        nickname: question.nickname,
        groupId: question.groupId,
        groupName: question.groupName,
        text: question.text,
        votes: 1,
        at: question.at,
        answer: answer ? { text: answer.text, visibility: answer.visibility, at: answer.at } : undefined,
      };
      aggregated.set(key, item);
      openQuestions.push(item);
    }
  }
  openQuestions.sort((a, b) => b.at - a.at);

  const groups: GroupView[] = session.groups.map((group) => {
    const members = studentList.filter((student) => student.groupId === group.id);
    const completed = members.filter((student) => completions.has(`${student.studentId}:${session.currentChapter}`)).length;
    const totalCompletions = members.reduce((sum, student) => {
      const count = chapterIds.reduce((acc, chapter) => acc + (completions.has(`${student.studentId}:${chapter}`) ? 1 : 0), 0);
      return sum + count;
    }, 0);
    const hasOpenQuestion = openQuestions.some((question) => question.groupId === group.id);
    const score = scoreByGroup.get(group.id) ?? 0;
    const progress = members.length ? Math.round((completed / members.length) * 100) : 0;
    const status: GroupStatus = confirmed.has(group.id)
      ? "done"
      : members.length > 0 && completed === members.length
        ? "review"
        : hasOpenQuestion
          ? "help"
          : "working";
    const note = status === "done"
      ? "教师已确认"
      : members.length === 0
        ? "等待成员加入"
        : hasOpenQuestion
          ? "有提问待处理"
          : completed > 0
            ? `${completed} 人已完成`
            : "进行中";
    return {
      id: group.id,
      name: renames.get(group.id) ?? group.name,
      status,
      progress,
      completed,
      totalCompletions,
      members: members.length,
      score,
      note,
      people: members.sort((a, b) => Number(b.isLeader) - Number(a.isLeader) || a.joinedAt - b.joinedAt),
      confirmed: confirmed.has(group.id),
    };
  });

  const completedCount = studentList.filter((student) =>
    chapterIds.some((chapter) => completions.has(`${student.studentId}:${chapter}`)),
  ).length;

  return {
    students: studentList,
    groups,
    questions: openQuestions,
    pointEvents,
    supports: supports.sort((a, b) => b.at - a.at),
    totalScore: pointEvents.reduce((sum, event) => sum + event.points, 0),
    completedCount,
  };
}

/** 教师确认是否仍有效(小组仍有成员且未确认) */
export function canConfirm(group: GroupView) {
  return group.members > 0 && !group.confirmed;
}
