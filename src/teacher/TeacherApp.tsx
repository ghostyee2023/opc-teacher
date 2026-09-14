// 教师端:创建课堂 / 发布章节 / 实时大盘 / 提问处理 / 积分与报告
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Dialog, DropdownMenu, Tabs, Theme, Tooltip } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowRight,
  ArrowsClockwise,
  Broadcast,
  CaretDown,
  ChartLineUp,
  Check,
  CheckCircle,
  Clock,
  CloudCheck,
  Copy,
  Crown,
  DotsThree,
  Export,
  Eye,
  Flag,
  HandPalm,
  Lightning,
  List,
  LockKey,
  Moon,
  PaperPlaneTilt,
  Pause,
  Play,
  Plus,
  PresentationChart,
  Question,
  SidebarSimple,
  Sparkle,
  Student,
  Sun,
  Timer,
  Trophy,
  UsersThree,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { ClassroomSession, CourseRecord, GroupView, PointRules, QuestionItem } from "../types";
import { createBackend } from "../lib/backend";
import { getManageDefaults, getStoredCourses, lessonPrompts } from "../lib/course";
import { formatTime, copyText, generateClassroomCode, getSlideHtml, relativeTime } from "../lib/util";
import {
  clearMyClassroomCode,
  getMyClassroomCode,
  setMyClassroomCode,
  useSharedTimer,
  useClassroomStore,
  type ClassroomStore,
} from "../hooks/useClassroom";

type SideTab = "questions" | "preview";
/** 已就绪的课堂 store:父组件确认 session / derived 非空后传入 */
type ActiveStore = ClassroomStore & { session: ClassroomSession; derived: NonNullable<ClassroomStore["derived"]> };

export default function TeacherApp() {
  const [code, setCode] = useState<string | null>(() => getMyClassroomCode());
  const store = useClassroomStore(code);
  const { session, derived, loading, error, mode } = store;

  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    if (!code || loading) return;
    if (!session && !resumeChecked) {
      setResumeChecked(true);
      clearMyClassroomCode();
      setCode(null);
    }
  }, [code, loading, session, resumeChecked]);

  if (!code) return <TeacherLanding mode={mode} onStart={(nextCode) => { setCode(nextCode); setMyClassroomCode(nextCode); }} />;
  if (loading || !session || !derived) return <TeacherLoading mode={mode} error={error} />;

  return (
    <TeacherWorkspace
      store={store as ActiveStore}
      onExit={() => { clearMyClassroomCode(); setCode(null); }}
    />
  );
}

function TeacherLoading({ mode, error }: { mode: string; error: string | null }) {
  return (
    <Theme appearance="light" accentColor="teal" grayColor="sage" radius="large" scaling="95%">
      <div className="app-shell" data-theme="light">
        <div className="teacher-boot-state">
          <Broadcast size={30} weight="fill" />
          <strong>{error ?? "正在连接课堂..."}</strong>
          <small>{mode === "local" ? "本地模式 · 需要教师在同一浏览器" : "实时同步模式"}</small>
        </div>
      </div>
    </Theme>
  );
}

/* ---------------- 课堂创建落地页 ---------------- */

function TeacherLanding({ mode, onStart }: { mode: "local" | "supabase"; onStart: (code: string) => void }) {
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [courses] = useState<CourseRecord[]>(() => getStoredCourses());
  const [courseId, setCourseId] = useState(() => getStoredCourses()[0]?.id ?? "");
  const [code, setCode] = useState(() => generateClassroomCode());
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const course = courses.find((item) => item.id === courseId) ?? courses[0];

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const start = async () => {
    if (!course) return;
    setCreating(true);
    const defaults = getManageDefaults();
    const session: ClassroomSession = {
      code,
      courseId: course.id,
      courseTitle: course.title,
      className: course.className,
      description: course.description,
      chapters: course.chapters,
      defaultInteraction: course.interaction,
      groups: defaults.groups,
      pointRules: defaults.rules,
      teacher: { name: "林老师", role: "主讲教师", message: "把每一次提问,都变成下一次更好的尝试。" },
      currentChapter: Number(Object.keys(course.chapters)[0] ?? 1),
      published: false,
      followMode: "soft",
      studentLocked: false,
      timerEndsAt: null,
      timerRemaining: 0,
      timerDuration: 15 * 60,
      slideIndex: 0,
      status: "active",
      createdAt: Date.now(),
      endedAt: null,
    };
    try {
      await createBackend().createClassroom(session);
      onStart(code);
    } catch (err) {
      setCreating(false);
      window.alert(err instanceof Error ? err.message : "创建课堂失败,请重试");
    }
  };

  const joinUrl = `${window.location.origin}/student?code=${code}`;
  const notifyCopy = (ok: boolean, message: string) => setToast(ok ? message : "复制失败,请手动复制");

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="95%">
      <div className="teacher-landing-page" data-theme={appearance}>
        <div className="teacher-landing-card">
          <div className="student-entry-brand">
            <div className="brand-mark"><Broadcast size={20} weight="fill" /></div>
            <span>共场 · 教师控制台</span>
            <button className="student-theme-button landing-theme" onClick={() => setAppearance((value) => value === "light" ? "dark" : "light")} aria-label="切换主题">
              {appearance === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
          <span className="student-entry-kicker">开始一堂课</span>
          <h1>选择课程,生成课堂码</h1>
          <p className="student-entry-course">{mode === "local" ? "本地演示模式:学生端需与本页同一浏览器打开" : "实时模式:学生扫码即可加入课堂"}</p>

          <span className="student-entry-label">选择课程</span>
          <div className="landing-course-list">
            {courses.map((item) => (
              <button key={item.id} className={item.id === course?.id ? "selected" : ""} onClick={() => setCourseId(item.id)}>
                <PresentationChart size={18} weight="fill" />
                <span><strong>{item.title}</strong><small>{item.className} · {Object.keys(item.chapters).length} 章</small></span>
                {item.id === course?.id && <Check size={16} weight="bold" />}
              </button>
            ))}
          </div>

          <span className="student-entry-label">课堂码</span>
          <div className="landing-code-row">
            <strong className="landing-code">{code}</strong>
            <button onClick={() => setCode(generateClassroomCode())} aria-label="重新生成课堂码"><ArrowsClockwise size={17} /></button>
            <button onClick={() => { void copyText(code).then((ok) => notifyCopy(ok, "课堂码已复制")); }} aria-label="复制课堂码"><Copy size={17} /></button>
          </div>

          <div className="landing-join-block">
            <div className="landing-qr">
              <QRCodeSVG value={joinUrl} size={96} level="M" />
              <small>学生扫码进入</small>
            </div>
            <div className="landing-join-copy">
              <span>学生加入方式</span>
              <p>{joinUrl}</p>
              <button onClick={() => { void copyText(joinUrl).then((ok) => notifyCopy(ok, "加入链接已复制")); }}><Copy size={14} />复制链接</button>
            </div>
          </div>

          <button className="student-entry-submit" disabled={!course || creating} onClick={start}>
            <Play size={17} weight="fill" />{creating ? "正在创建..." : "开始课堂"}
          </button>
          <small className="student-entry-hint">分组与积分规则默认使用管理页配置,课堂开始后仍可调整</small>
        </div>
        {toast && <div className="management-toast"><CheckCircle size={17} weight="fill" />{toast}</div>}
      </div>
    </Theme>
  );
}

/* ---------------- 课堂工作区 ---------------- */

function TeacherWorkspace({ store, onExit }: { store: ActiveStore; onExit: () => void }) {
  const reduceMotion = useReducedMotion();
  const { session, derived, events, mode, error, appendEvent, patchSession } = store;
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [pptUrl, setPptUrl] = useState("");
  const [draftPptUrl, setDraftPptUrl] = useState("");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishDuration, setPublishDuration] = useState(15);
  const [selectedGroup, setSelectedGroup] = useState<GroupView | null>(null);
  const [focusedQuestion, setFocusedQuestion] = useState<QuestionItem | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [answerVisibility, setAnswerVisibility] = useState<"public" | "group">("public");
  const [sideTab, setSideTab] = useState<SideTab>("questions");
  const [showDashboard, setShowDashboard] = useState(false);
  const [dashboardPresentation, setDashboardPresentation] = useState(false);
  const [dashboardScope, setDashboardScope] = useState<"current" | "total">("current");
  const [syncOpen, setSyncOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<"teacher" | "groups" | "rules">("teacher");
  const [groupEditorId, setGroupEditorId] = useState<number | null>(null);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [rulesDraft, setRulesDraft] = useState<PointRules>(session.pointRules);
  const [teacherDraft, setTeacherDraft] = useState(session.teacher);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const deckStageRef = useRef<HTMLDivElement>(null);
  const secondsLeft = useSharedTimer(session);
  /** 讲义页码:会话驱动,学生端可跟随 */
  const slideIndex = Math.max(0, Math.min(2, session.slideIndex));

  const chapterIds = useMemo(() => Object.keys(session.chapters).map(Number).sort((a, b) => a - b), [session.chapters]);
  const content = session.chapters[session.currentChapter];
  const currentInteraction = content?.interaction ?? session.defaultInteraction;
  const prompts = lessonPrompts(content);
  const sortedByScore = useMemo(() => [...derived.groups].sort((a, b) => b.score - a.score), [derived.groups]);
  const podium = useMemo(() => [sortedByScore[0], sortedByScore[1], sortedByScore[2]], [sortedByScore]);
  const onlineCount = derived.students.length;
  const joinedGroups = derived.groups.filter((group) => group.members > 0);
  const avgProgress = joinedGroups.length ? Math.round(joinedGroups.reduce((sum, group) => sum + group.progress, 0) / joinedGroups.length) : 0;
  const questionCountByGroup = useMemo(() => {
    const counts = new Map<number, number>();
    events.forEach((event) => { if (event.type === "question") counts.set(event.groupId, (counts.get(event.groupId) ?? 0) + 1); });
    return counts;
  }, [events]);
  const bestQuestionGroup = useMemo(
    () => [...derived.groups].sort((a, b) => (questionCountByGroup.get(b.id) ?? 0) - (questionCountByGroup.get(a.id) ?? 0))[0]?.name ?? "—",
    [derived.groups, questionCountByGroup],
  );
  const breakthroughGroup = useMemo(
    () => [...derived.groups].sort((a, b) => b.totalCompletions - a.totalCompletions)[0]?.name ?? "—",
    [derived.groups],
  );
  const timerPaused = session.timerEndsAt === null;

  const showToast = (message: string) => setToast(message);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 主题同步到 <html>,Radix 弹窗 portal 到 body 时仍能继承 token
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
  }, [appearance]);

  useEffect(() => { setRulesDraft(session.pointRules); }, [session.pointRules]);
  useEffect(() => { setTeacherDraft(session.teacher); }, [session.teacher]);

  const changeChapter = (id: number) => {
    if (id === session.currentChapter) return;
    void patchSession({ currentChapter: id, slideIndex: 0 });
    showToast(`已切换到第 ${id} 章,学生端将实时跟随`);
  };

  const gotoSlide = (index: number) => {
    const clamped = Math.max(0, Math.min(2, index));
    if (clamped === slideIndex) return;
    void patchSession({ slideIndex: clamped });
  };

  const publishTask = () => {
    const duration = publishDuration * 60;
    void patchSession({
      published: true,
      status: "active",
      timerEndsAt: Date.now() + duration * 1000,
      timerRemaining: duration,
      timerDuration: duration,
    });
    setPublishOpen(false);
    showToast(`任务已发布,${onlineCount} 名学员将收到提醒`);
  };

  const toggleTimer = () => {
    if (timerPaused) {
      // 归零后继续:按本轮时长重启而非原地续零
      const remaining = session.timerRemaining > 0 ? session.timerRemaining : session.timerDuration;
      void patchSession({ timerEndsAt: Date.now() + remaining * 1000, timerRemaining: remaining });
    } else {
      void patchSession({ timerRemaining: secondsLeft, timerEndsAt: null });
    }
  };

  const awardGroupPoints = (groupId: number, points: number, reason: string) => {
    void appendEvent({ type: "points", groupId, points, reason });
    showToast(`已为小组加 ${points} 分,积分榜实时更新`);
  };

  const confirmGroup = (groupId: number) => {
    void appendEvent({ type: "confirm", groupId });
    void appendEvent({ type: "points", groupId, points: session.pointRules.teacherBonus, reason: "教师确认完成" });
    setSelectedGroup(null);
    showToast(`已确认完成,小组积分增加 ${session.pointRules.teacherBonus} 分`);
  };

  const openQuestionFocus = (question: QuestionItem) => {
    setFocusedQuestion(question);
    const answered = events.find((event) => event.type === "answer" && event.questionId === question.id);
    setAnswerDraft(answered && answered.type === "answer" ? answered.text : "");
    setAnswerVisibility(answered && answered.type === "answer" ? answered.visibility : "public");
  };

  const submitQuestionAnswer = (markResolved: boolean) => {
    if (!focusedQuestion) return;
    const text = answerDraft.trim();
    if (!text) { showToast("请先写下回答内容"); return; }
    void appendEvent({ type: "answer", questionId: focusedQuestion.id, text, visibility: answerVisibility });
    if (markResolved) {
      void appendEvent({ type: "resolve", questionId: focusedQuestion.id });
      setFocusedQuestion(null);
    }
    showToast(markResolved ? "回答已发送并标记为已解决" : answerVisibility === "public" ? "回答已公开给全班" : "回答已发送给该小组");
  };

  const resolveQuestion = (questionId: string) => {
    void appendEvent({ type: "resolve", questionId });
    setFocusedQuestion((item) => item?.id === questionId ? null : item);
    showToast("问题已标记为解决");
  };

  const saveGroupName = (groupId: number) => {
    const name = groupNameDraft.trim();
    if (!name) { showToast("请输入小组名称"); return; }
    void appendEvent({ type: "group-rename", groupId, name });
    setGroupEditorId(null);
    setSelectedGroup((group) => group?.id === groupId ? { ...group, name } : group);
    showToast("小组名称已更新");
  };

  const addGroup = () => {
    const id = Math.max(0, ...session.groups.map((group) => group.id)) + 1;
    void patchSession((prev) => ({ groups: [...prev.groups, { id, name: `新小组 ${id}` }] }));
    setGroupEditorId(id);
    setGroupNameDraft(`新小组 ${id}`);
    showToast("已新增小组,请编辑名称");
  };

  const saveRules = () => {
    const normalized = Object.fromEntries(Object.entries(rulesDraft).map(([key, value]) => [key, Math.max(0, Math.min(99, Number(value) || 0))])) as PointRules;
    void patchSession({ pointRules: normalized });
    setRulesDraft(normalized);
    showToast("积分规则已保存,学生端将按新规则计算");
  };

  const endCourse = () => {
    if (session.status === "ended") { showToast("当前课堂已经结束"); return; }
    if (!window.confirm("确定结束当前课堂吗?结束后学生端将停止互动,仍可导出课堂数据。")) return;
    void patchSession({ status: "ended", endedAt: Date.now(), timerEndsAt: null, published: false });
    showToast("课堂已结束,可以导出课堂数据");
  };

  const exportCourseData = () => {
    const escapeCell = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const groupRows = derived.groups.map((group) => `<tr><td>${escapeCell(group.name)}</td><td>${group.members}</td><td>${group.completed}</td><td>${group.progress}%</td><td>${escapeCell(group.note)}</td><td>${group.totalCompletions}</td><td>${group.score}</td></tr>`).join("");
    const questionRows = derived.questions.map((question) => `<tr><td>${escapeCell(question.groupName)}</td><td>${escapeCell(question.nickname)}</td><td>${escapeCell(question.text)}</td><td>${escapeCell(relativeTime(question.at))}</td><td>${question.votes}</td></tr>`).join("");
    const courseStatusLabel = session.status === "active" ? "进行中" : "已结束";
    const workbook = `<!doctype html><html><head><meta charset="utf-8"></head><body><h2>${escapeCell(session.courseTitle)} · 课堂数据</h2><p>班级:${escapeCell(session.className)}　课堂码:${escapeCell(session.code)}　状态:${courseStatusLabel}　参与学员:${onlineCount} 人</p><h3>课程目录</h3><table border="1"><thead><tr><th>章节</th><th>标题</th><th>场景说明</th><th>实操任务</th><th>提示词</th></tr></thead><tbody>${Object.entries(session.chapters).map(([chapter, lesson]) => `<tr><td>${chapter}</td><td>${escapeCell(lesson.title)}</td><td>${escapeCell(lesson.description)}</td><td>${escapeCell(lesson.task)}</td><td>${escapeCell(lessonPrompts(lesson).join(" / "))}</td></tr>`).join("")}</tbody></table><h3>小组进度</h3><table border="1"><thead><tr><th>小组</th><th>人数</th><th>本轮完成</th><th>进度</th><th>状态</th><th>累计完成人次</th><th>积分</th></tr></thead><tbody>${groupRows}</tbody></table><h3>课堂提问</h3><table border="1"><thead><tr><th>小组</th><th>提问人</th><th>问题</th><th>时间</th><th>同问人数</th></tr></thead><tbody>${questionRows || "<tr><td colspan=\"5\">暂无提问</td></tr>"}</tbody></table></body></html>`;
    const blob = new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${session.courseTitle}-课堂数据-${session.code}-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("课堂 Excel 数据已导出");
  };

  const toggleDashboard = () => {
    const next = !showDashboard;
    setShowDashboard(next);
    setDashboardPresentation(false);
    setLeftCollapsed(next);
  };

  const statusMap = {
    done: { label: "教师已确认", icon: CheckCircle },
    review: { label: "等待确认", icon: Clock },
    working: { label: "进行中", icon: Lightning },
    help: { label: "需要支援", icon: HandPalm },
  } as const;

  const joinUrl = `${window.location.origin}/student?code=${session.code}`;
  const selectedView = selectedGroup ? derived.groups.find((group) => group.id === selectedGroup.id) ?? selectedGroup : null;

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="95%">
      <div className={`app-shell ${leftCollapsed ? "left-collapsed" : ""} ${rightCollapsed ? "right-collapsed" : ""} ${dashboardPresentation ? "projection-mode" : ""}`} data-theme={appearance}>
        <header className="topbar">
          <div className="brand-block">
            <div className="brand-mark" aria-hidden="true"><Broadcast size={20} weight="fill" /></div>
            <span className="brand-name">共场</span>
            <span className="top-divider" />
            <div className="course-identity">
              <span>{session.courseTitle}</span>
              <small>{session.className} · 课堂码 {session.code}</small>
            </div>
          </div>
          <div className="session-actions">
            <button className="classroom-code-chip" onClick={() => { void copyText(joinUrl).then((ok) => showToast(ok ? "学生加入链接已复制" : "复制失败,请手动复制")); }} title="点击复制学生加入链接">
              <UsersThree size={15} weight="fill" /><strong>{session.code}</strong><small>{onlineCount} 人在堂</small>
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <button className={`session-entry ${session.status === "ended" ? "ended" : ""}`}>
                  <Broadcast size={16} weight="fill" />
                  <span><strong>{session.status === "ended" ? "课堂已结束" : session.published ? "授课中" : "等待发布"}</strong><small>{mode === "local" ? "本地演示模式" : "实时同步"}</small></span>
                  <CaretDown size={14} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" className="session-menu">
                <DropdownMenu.Item onSelect={() => { window.location.href = "/manage"; }}><List size={15} />打开管理页面</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={exportCourseData}><Export size={15} />导出课堂 Excel</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => setReportOpen(true)}><ChartLineUp size={15} />课堂结束报告</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>课堂状态</DropdownMenu.Label>
                <DropdownMenu.Item onSelect={() => setSyncOpen(true)}><ArrowsClockwise size={15} />课堂连接与同步</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { setConfigTab("teacher"); setConfigOpen(true); }}><DotsThree size={15} />教师信息 / 分组 / 积分规则</DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>学生跟随</DropdownMenu.Label>
                <DropdownMenu.Item onSelect={() => { void patchSession({ followMode: "strong" }); showToast("已切换为强跟随"); }}><LockKey size={15} />强跟随</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { void patchSession({ followMode: "soft" }); showToast("已切换为软跟随"); }}><Broadcast size={15} />软跟随</DropdownMenu.Item>
                <DropdownMenu.Item onSelect={() => { void patchSession({ followMode: "free" }); showToast("已切换为自由浏览"); }}><Eye size={15} />自由浏览</DropdownMenu.Item>
                <DropdownMenu.Separator />
                {session.status === "ended" ? (
                  <DropdownMenu.Item onSelect={onExit}><Play size={15} />返回开始新课堂</DropdownMenu.Item>
                ) : (
                  <DropdownMenu.Item color="red" onSelect={endCourse}><Flag size={15} />结束课堂</DropdownMenu.Item>
                )}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <div className={`header-timer ${secondsLeft < 180 && session.published ? "urgent" : ""}`}>
              <Timer size={16} /><strong>{formatTime(secondsLeft)}</strong>
              <button onClick={toggleTimer} aria-label={timerPaused ? "继续倒计时" : "暂停倒计时"} disabled={!session.published}>
                {timerPaused ? <Play size={12} weight="fill" /> : <Pause size={12} weight="fill" />}
              </button>
            </div>
            <Tooltip content={appearance === "light" ? "切换深色模式" : "切换浅色模式"}>
              <button className="icon-button" onClick={() => setAppearance((value) => value === "light" ? "dark" : "light")} aria-label="切换主题">
                {appearance === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
            </Tooltip>
          </div>
        </header>

        <aside className="course-nav">
          <div className="panel-topline"><span>课程目录</span><button className="icon-button panel-toggle" aria-label="折叠课程栏" onClick={() => setLeftCollapsed((value) => !value)}><SidebarSimple size={17} weight="bold" /></button></div>
          <nav aria-label="课程章节">
            <div className="chapter-list">
              {chapterIds.map((chapterId) => {
                const isActive = chapterId === session.currentChapter;
                const lesson = session.chapters[chapterId];
                return (
                  <button key={chapterId} className={`chapter-item ${isActive ? "active" : ""}`} onClick={() => changeChapter(chapterId)}>
                    <span className="chapter-index">{chapterId < session.currentChapter ? <Check size={13} weight="bold" /> : chapterId}</span>
                    <span className="chapter-copy"><strong>{lesson?.title}</strong><small>{chapterId < session.currentChapter ? "已完成" : isActive ? "进行中" : "待开始"}</small></span>
                    {isActive && <motion.span layoutId="chapter-active" className="chapter-active-bar" />}
                  </button>
                );
              })}
            </div>
          </nav>
          <div className="nav-bottom">
            <button className={`text-button ${showDashboard ? "selected" : ""}`} onClick={toggleDashboard}>
              <ChartLineUp size={17} />课堂大盘<ArrowRight size={15} />
            </button>
            <button className="teacher-profile" onClick={() => { setConfigTab("teacher"); setConfigOpen(true); }}>
              <div className="teacher-avatar">{session.teacher.name.slice(0, 1)}</div>
              <div><strong>{session.teacher.name}</strong><small>{session.teacher.role}</small></div>
              <DotsThree size={18} />
            </button>
          </div>
        </aside>

        <main className="workspace">
          <div className={`workspace-scroll ${showDashboard ? "dashboard-scroll" : "deck-scroll"}`}>
            {focusedQuestion ? (
              <motion.section className="question-focus" initial={reduceMotion ? false : { opacity: 0, scale: .98 }} animate={{ opacity: 1, scale: 1 }}>
                <div className="focus-topline"><button className="back-to-deck" onClick={() => setFocusedQuestion(null)}><ArrowRight size={16} style={{ transform: "rotate(180deg)" }} />返回讲义</button><span>课堂提问 · {focusedQuestion.groupName}</span></div>
                <div className="focus-card">
                  <div className="focus-icon"><Question size={32} weight="bold" /></div>
                  <span className="focus-type">{focusedQuestion.nickname} · {focusedQuestion.votes > 1 ? `${focusedQuestion.votes} 人同问` : "个人提问"}</span>
                  <h1>{focusedQuestion.text}</h1>
                  <p>这是由 {focusedQuestion.groupName} 的 {focusedQuestion.nickname} 提出的课堂问题。回答后可以公开给全班,也可以只对小组可见。</p>
                  <textarea className="answer-box" value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value)} placeholder="写下你的回答,学生会实时收到..." rows={4} />
                  <div className="answer-visibility" role="group" aria-label="回答可见范围"><span>发送给</span><button className={answerVisibility === "public" ? "active" : ""} onClick={() => setAnswerVisibility("public")}><Broadcast size={14} />全班</button><button className={answerVisibility === "group" ? "active" : ""} onClick={() => setAnswerVisibility("group")}><UsersThree size={14} />仅该小组</button></div>
                  <div className="focus-actions"><Button variant="soft" color="gray" onClick={() => setFocusedQuestion(null)}>稍后处理</Button><Button variant="soft" onClick={() => submitQuestionAnswer(false)}><PaperPlaneTilt size={16} />发送回答</Button><Button variant="solid" onClick={() => submitQuestionAnswer(true)}><Check size={16} />发送并解决</Button></div>
                </div>
              </motion.section>
            ) : showDashboard ? (
              <motion.section className="dashboard-view" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="dashboard-heading">
                  <div><span className="lesson-index">实时课堂 · {session.code}</span><h1>课堂大盘</h1><p>把进度变成一场轻量的团队竞赛,让每个完成都被看见。</p></div>
                  <div className="dashboard-heading-actions">
                    <div className="dashboard-scope dashboard-scope-inline"><span>查看赛况</span><button className={dashboardScope === "current" ? "active" : ""} onClick={() => setDashboardScope("current")}>当前任务</button><button className={dashboardScope === "total" ? "active" : ""} onClick={() => setDashboardScope("total")}>全程累计</button></div>
                    <Button variant="soft" onClick={exportCourseData}><Export size={16} />导出快照</Button>
                    {dashboardPresentation
                      ? <Button variant="soft" onClick={() => { setDashboardPresentation(false); setLeftCollapsed(false); setRightCollapsed(false); }}><SidebarSimple size={16} />退出大屏</Button>
                      : <Button onClick={() => { setDashboardPresentation(true); setLeftCollapsed(true); setRightCollapsed(true); void document.documentElement.requestFullscreen?.(); showToast("已进入投屏模式"); }}><PresentationChart size={16} />大屏展示</Button>}
                  </div>
                </div>
                <div className="dashboard-metrics">
                  <div><span>在堂学员</span><strong>{onlineCount}</strong><small>{joinedGroups.length} 个小组已加入</small></div>
                  <div><span>{dashboardScope === "current" ? "本轮平均完成" : "学员参与完成"}</span><strong>{dashboardScope === "current" ? `${avgProgress}%` : `${derived.completedCount}/${onlineCount}`}</strong><small>{dashboardScope === "current" ? `第 ${session.currentChapter} 章` : "任一章节完成人数"}</small></div>
                  <div><span>{dashboardScope === "current" ? "本轮积分" : "累计积分"}</span><strong>{derived.totalScore}</strong><small>{derived.pointEvents.length} 次加分记录</small></div>
                  <div className="metric-warm"><span>需要支援</span><strong>{derived.groups.filter((group) => group.status === "help").length}</strong><small>有提问待处理</small></div>
                </div>
                <div className="competition-banner">
                  <div>
                    <span className="competition-kicker"><Trophy size={14} weight="fill" />积分赛场</span>
                    <motion.span className="stage-live" animate={reduceMotion ? undefined : { opacity: [0.58, 1, 0.58] }} transition={{ duration: 2.4, repeat: Infinity }}>LIVE</motion.span>
                    <h2>{dashboardScope === "current" ? "这一轮,谁先完成?" : "今天的最佳协作组"}</h2>
                    <p>{dashboardScope === "current" ? "完成任务、互相提问、提交高质量答案,都能为小组加分。" : "累计完成度与协作质量共同决定最终排名。"}</p>
                    <div className="stage-timer"><Timer size={17} /><span>本轮剩余</span><strong>{formatTime(secondsLeft)}</strong></div>
                  </div>
                  <div className="podium">
                    <motion.div className="podium-card second" initial={reduceMotion ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .12 }}><span>2</span><strong>{podium[1]?.name ?? "—"}</strong><small>{podium[1]?.score ?? 0} 分</small></motion.div>
                    <motion.div className="podium-card first" initial={reduceMotion ? false : { y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .02, type: "spring", stiffness: 170, damping: 15 }}><span><Trophy size={17} weight="fill" /></span><strong>{podium[0]?.name ?? "—"}</strong><small>{podium[0]?.score ?? 0} 分</small></motion.div>
                    <motion.div className="podium-card third" initial={reduceMotion ? false : { y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: .2 }}><span>3</span><strong>{podium[2]?.name ?? "—"}</strong><small>{podium[2]?.score ?? 0} 分</small></motion.div>
                  </div>
                </div>
                <div className="dashboard-list-heading"><h2>{dashboardScope === "current" ? "本轮小组赛况" : "累计排行榜"}</h2><span>点击小组查看详情</span></div>
                <div className="group-grid dashboard-groups">
                  {sortedByScore.map((group, index) => {
                    const StatusIcon = statusMap[group.status].icon;
                    const displayProgress = dashboardScope === "current" ? group.progress : Math.min(100, Math.round((group.totalCompletions / Math.max(1, group.members * chapterIds.length)) * 100));
                    return (
                      <motion.button key={group.id} className={`group-row status-${group.status}`} onClick={() => setSelectedGroup(group)} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .035, duration: .28 }} layout>
                        <span className="group-rank leaderboard-rank">{index + 1}</span>
                        <span className="group-main"><strong>{group.name}</strong><small>{group.note}</small></span>
                        <span className="member-stack">{group.people.slice(0, 3).map((person, personIndex) => <i key={person.studentId} style={{ zIndex: 3 - personIndex }}>{person.nickname.slice(-1)}</i>)}{group.members > 3 && <em>+{group.members - 3}</em>}</span>
                        <span className="progress-cell"><span className="progress-copy"><b>{group.completed}/{group.members}</b><small>{displayProgress}%</small></span><span className="mini-progress"><i style={{ transform: `scaleX(${displayProgress / 100})` }} /></span></span>
                        <span className="status-cell"><StatusIcon size={16} weight={group.status === "done" ? "fill" : "regular"} />{statusMap[group.status].label}</span>
                        <span className="score-cell"><Trophy size={14} />{group.score}</span>
                        <ArrowRight className="row-arrow" size={16} />
                      </motion.button>
                    );
                  })}
                </div>
              </motion.section>
            ) : (
              <motion.section className="deck-canvas" initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="deck-toolbar">
                  <div className="deck-title">
                    <span className="deck-icon"><PresentationChart size={17} weight="fill" /></span>
                    <div><h2>{content?.title}</h2><p>{pptUrl || `HTML 讲义 · 第 ${session.currentChapter} 章 · ${prompts.length} 个提示词`}</p></div>
                  </div>
                  <div className="deck-actions">
                    <Badge className="deck-sync-badge" color={session.published ? "teal" : "gray"} variant="soft">{session.published ? "学生端已同步" : "尚未发布"}</Badge>
                    <Dialog.Root open={publishOpen} onOpenChange={setPublishOpen}>
                      <Dialog.Trigger><button className="publish-inline"><PaperPlaneTilt size={15} weight="fill" />{session.published ? "重新发布本节任务" : "发布本节任务"}</button></Dialog.Trigger>
                      <Dialog.Content maxWidth="520px" className="publish-dialog">
                        <Dialog.Title>发布第 {session.currentChapter} 章任务</Dialog.Title>
                        <Dialog.Description size="2">学生端会收到当前章节的题目、提示和提示词,并开始统一倒计时。</Dialog.Description>
                        <div className="dialog-task-preview"><span>当前任务题目</span><strong>{content?.task}</strong></div>
                        <div className="prompt-dialog-block"><span>提示词</span><p>{prompts[0]}</p></div>
                        <label className="field-label">任务时长</label>
                        <div className="duration-options">{[10, 15, 20, 30].map((value) => <button key={value} className={value === publishDuration ? "selected" : ""} onClick={() => setPublishDuration(value)}>{value} 分钟</button>)}</div>
                        <div className="dialog-actions"><Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close><Button onClick={publishTask}><PaperPlaneTilt size={16} weight="fill" />立即发布</Button></div>
                      </Dialog.Content>
                    </Dialog.Root>
                    <span className="slide-counter">{pptUrl ? "外部 HTML" : `${slideIndex + 1} / 3`}</span>
                    <Dialog.Root open={embedOpen} onOpenChange={setEmbedOpen}>
                      <Dialog.Trigger><button className="embed-trigger">{pptUrl ? "更换地址" : "嵌入 HTML"}</button></Dialog.Trigger>
                      <Dialog.Content maxWidth="560px" className="publish-dialog">
                        <Dialog.Title>嵌入独立 PPT HTML</Dialog.Title>
                        <Dialog.Description size="2">输入你单独制作的 HTML 地址。页面会原样显示在中间放映区。</Dialog.Description>
                        <label className="field-label embed-label">HTML 地址</label>
                        <input className="embed-input" value={draftPptUrl} onChange={(event) => setDraftPptUrl(event.target.value)} placeholder="https://example.com/ppt/lesson-02.html" autoFocus />
                        <p className="embed-note">支持同域路径、局域网地址或 HTTPS 地址。留空可恢复原型演示内容。</p>
                        <div className="dialog-actions"><Dialog.Close><Button variant="soft" color="gray">取消</Button></Dialog.Close><Button onClick={() => { setPptUrl(draftPptUrl.trim()); setEmbedOpen(false); showToast(draftPptUrl.trim() ? "已加载独立 HTML 讲义" : "已恢复原型讲义"); }}>应用地址</Button></div>
                      </Dialog.Content>
                    </Dialog.Root>
                    <Tooltip content="全屏演示讲义"><button className="deck-icon-button" onClick={() => { void deckStageRef.current?.requestFullscreen?.(); showToast("已进入全屏演示,当前页会同步给学生"); }}><Eye size={16} /></button></Tooltip>
                  </div>
                </div>
                <div className="deck-stage" ref={deckStageRef}>
                  <iframe key={`${pptUrl}-${session.currentChapter}-${slideIndex}`} title="课程 HTML 讲义" src={pptUrl || undefined} srcDoc={pptUrl ? undefined : getSlideHtml({ title: content?.title ?? "", description: content?.description ?? "", task: content?.task ?? "", prompt: prompts[0] ?? "" }, session.currentChapter, slideIndex)} sandbox="allow-scripts allow-same-origin" allow="fullscreen" />
                  <div className="deck-nav">
                    <button aria-label="上一页" disabled={Boolean(pptUrl) || slideIndex === 0} onClick={() => gotoSlide(slideIndex - 1)}>上一页</button>
                    <div className="slide-dots" aria-label="讲义页码">{pptUrl ? <span className="external-note">页码由外部讲义控制</span> : [0, 1, 2].map((item) => <button key={item} aria-label={`第 ${item + 1} 页`} className={item === slideIndex ? "active" : ""} onClick={() => gotoSlide(item)} />)}</div>
                    <button aria-label="下一页" disabled={Boolean(pptUrl) || slideIndex === 2} onClick={() => gotoSlide(slideIndex + 1)}>下一页<ArrowRight size={14} /></button>
                  </div>
                </div>
                <div className="deck-bottom-hint">
                  <div><Sparkle size={16} /><span>{pptUrl ? "当前已嵌入独立 HTML,互动由你的讲义页面自己控制" : "讲义与互动分离,切换章节不会覆盖课堂状态"}</span></div>
                  <span>{session.followMode === "strong" ? "强跟随" : session.followMode === "soft" ? "软跟随" : "自由浏览"}模式 · 当前页自动同步</span>
                  <button className="embed-settings-button" onClick={() => setEmbedOpen(true)}>讲义设置</button>
                </div>
              </motion.section>
            )}
          </div>
        </main>

        <aside className="context-panel">
          {rightCollapsed ? (
            <button className="collapsed-context-tab" onClick={() => setRightCollapsed(false)} aria-label="展开课堂提问" title={`课堂提问,${derived.questions.length} 个待处理`}>
              <span className="collapsed-tab-icon"><Question size={17} weight="bold" />{derived.questions.length > 0 && <i className="collapsed-alert-dot" aria-label={`${derived.questions.length} 个问题待处理`} />}</span>
            </button>
          ) : (
            <Tabs.Root value={sideTab} onValueChange={(value) => setSideTab(value as SideTab)}>
              <div className="context-header">
                <Tabs.List size="1">
                  <Tabs.Trigger value="questions">课堂提问 <span className="tab-count">{derived.questions.length}</span></Tabs.Trigger>
                  <Tabs.Trigger value="preview">学生端预览</Tabs.Trigger>
                </Tabs.List>
                <div className="context-tools">
                  <Tooltip content="刷新状态"><button className="icon-button compact" onClick={() => { void store.refresh(); showToast("右侧状态已刷新"); }}><ArrowsClockwise size={16} /></button></Tooltip>
                  <Tooltip content="折叠问题栏"><button className="icon-button compact" onClick={() => setRightCollapsed((value) => !value)}><SidebarSimple size={16} style={{ transform: "rotate(180deg)" }} /></button></Tooltip>
                </div>
              </div>
              <Tabs.Content value="questions" className="questions-panel">
                <div className="question-summary">
                  <div className="signal-orbit"><Question size={23} weight="bold" /></div>
                  <div><strong>{derived.questions.length ? `${derived.questions.length} 个问题待处理` : "问题已全部处理"}</strong><p>{derived.questions.length ? "相似问题会聚合,优先处理高赞内容" : "学生可以继续从固定入口提问"}</p></div>
                </div>
                <AnimatePresence initial={false}>
                  {derived.questions.map((question) => (
                    <motion.article key={question.id} className="question-card" onClick={() => openQuestionFocus(question)} initial={reduceMotion ? false : { opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 22, height: 0, marginBottom: 0 }}>
                      <div className="question-meta"><span>{question.groupName} · {question.nickname}</span><small>{relativeTime(question.at)}</small></div>
                      <p>{question.text}</p>
                      <div className="question-type"><span>学生提问</span><span><Sparkle size={13} />{question.votes} 人同问</span></div>
                      <div className="question-actions">
                        <button onClick={(event) => { event.stopPropagation(); openQuestionFocus(question); }}><Broadcast size={15} />回答问题</button>
                        <button onClick={(event) => { event.stopPropagation(); resolveQuestion(question.id); }}><Check size={15} />已解决</button>
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>
                {!derived.questions.length && <div className="empty-state"><CheckCircle size={32} weight="duotone" /><strong>暂时没有待处理问题</strong><p>新的提问会实时出现在这里。</p></div>}
              </Tabs.Content>
              <Tabs.Content value="preview" className="student-preview-panel">
                <div className="preview-topline"><span><Eye size={15} />学生端预览</span><small>实时数据</small></div>
                <a className="student-preview-launch" href={`/student?code=${session.code}`} target="_blank" rel="noreferrer">
                  <span className="student-preview-launch-icon"><Student size={24} weight="fill" /></span>
                  <span className="student-preview-launch-copy"><strong>打开学生端</strong><small>在新页面查看学生实际使用的界面(自动带课堂码)</small></span>
                  <ArrowRight size={20} weight="bold" />
                </a>
                <div className="preview-live-summary">
                  <div className="preview-live-row"><Broadcast size={14} weight="fill" /><span>第 {session.currentChapter} 章 · {content?.title}</span><small>{session.published ? "任务已发布" : "等待发布"}</small></div>
                  <div className="preview-live-row"><UsersThree size={14} /><span>{onlineCount} 名学员在堂</span><small>{joinedGroups.length}/{session.groups.length} 组已加入</small></div>
                  <div className="preview-live-row"><Trophy size={14} /><span>当前领先:{sortedByScore[0]?.name ?? "—"}</span><small>{sortedByScore[0]?.score ?? 0} 分</small></div>
                </div>
              </Tabs.Content>
            </Tabs.Root>
          )}
        </aside>

        <AnimatePresence>
          {selectedView && (() => {
            const SelectedStatusIcon = statusMap[selectedView.status].icon;
            const groupEvents = derived.pointEvents.filter((event) => event.groupId === selectedView.id);
            return (
              <>
                <motion.button className="sheet-backdrop" aria-label="关闭小组详情" onClick={() => setSelectedGroup(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
                <motion.aside className="group-sheet" role="dialog" aria-modal="true" aria-label={`${selectedView.name}详情`} initial={reduceMotion ? { opacity: 0 } : { x: "100%" }} animate={reduceMotion ? { opacity: 1 } : { x: 0 }} exit={reduceMotion ? { opacity: 0 } : { x: "100%" }} transition={{ type: "spring", stiffness: 330, damping: 34 }}>
                  <div className="sheet-header"><span>小组实时详情</span><button className="icon-button" onClick={() => setSelectedGroup(null)}><X size={18} /></button></div>
                  <div className="sheet-title"><div className={`group-status-icon status-${selectedView.status}`}><SelectedStatusIcon size={22} /></div><div><h2>{selectedView.name}</h2><p>{statusMap[selectedView.status].label}</p></div></div>
                  <div className="sheet-metrics">
                    <div><strong>{selectedView.progress}%</strong><span>任务进度</span></div>
                    <div><strong>{selectedView.completed}/{selectedView.members}</strong><span>成员完成</span></div>
                    <div><strong>{selectedView.score}</strong><span>当前积分</span></div>
                  </div>
                  <div className="sheet-section"><h3>教师加分</h3><p className="sheet-section-note">按课堂表现即时奖励,小组积分会同步到大屏排行榜。</p><div className="point-actions"><button onClick={() => awardGroupPoints(selectedView.id, 3, "协作参与")}>+3 协作</button><button onClick={() => awardGroupPoints(selectedView.id, 5, "高质量提交")}>+5 高质量</button><button onClick={() => awardGroupPoints(selectedView.id, 10, "突破表现")}>+10 突破</button></div></div>
                  <div className="sheet-section"><h3>积分明细</h3>{groupEvents.length ? <div className="point-history">{groupEvents.slice(0, 6).map((event) => <div key={event.id}><span>{event.reason}</span><strong>+{event.points}</strong><small>{relativeTime(event.at)}</small></div>)}</div> : <p className="sheet-section-note">暂无加分记录,学生完成协作动作后会记录在这里。</p>}</div>
                  <div className="sheet-section"><h3>小组成员 · {selectedView.members} 人</h3>{selectedView.members ? <div className="member-list">{selectedView.people.map((person) => <div key={person.studentId}><span>{person.nickname.slice(-1)}</span><strong>{person.nickname}</strong><small>{person.isLeader ? "组长" : "组员"}</small></div>)}</div> : <p className="sheet-section-note">还没有学生加入这个小组。</p>}</div>
                  <div className="sheet-section"><h3>本组最关心的 3 个问题</h3>
                    {(() => {
                      const submissions = events.filter((event): event is Extract<(typeof events)[number], { type: "group-questions" }> => event.type === "group-questions" && event.groupId === selectedView.id);
                      const latest = submissions[submissions.length - 1];
                      return latest
                        ? latest.items.map((item, index) => <p className="group-question-line" key={index}>{index + 1}. {item}</p>)
                        : <p className="sheet-section-note">小组还没有提交关心的问题。</p>;
                    })()}
                  </div>
                  <div className="sheet-footer">
                    {!selectedView.confirmed && selectedView.members > 0 && <Button size="3" onClick={() => confirmGroup(selectedView.id)}><CheckCircle size={17} weight="fill" />确认完成并加 {session.pointRules.teacherBonus} 分</Button>}
                    <Button size="3" variant="soft" color="gray" onClick={() => { void appendEvent({ type: "support", groupId: selectedView.id }); setSelectedGroup(null); showToast("已向该小组发送支援提醒"); }}><HandPalm size={17} />前往支援</Button>
                  </div>
                </motion.aside>
              </>
            );
          })()}
        </AnimatePresence>

        <Dialog.Root open={syncOpen} onOpenChange={setSyncOpen}>
          <Dialog.Content maxWidth="560px" className="config-dialog sync-dialog">
            <Dialog.Title>课堂连接与同步</Dialog.Title>
            <Dialog.Description size="2">管理学生看到的章节、跟随方式和连接状态。</Dialog.Description>
            <div className="sync-status-grid">
              <div className={`sync-status-card ${mode === "supabase" ? "is-good" : ""}`}><CloudCheck size={20} weight="fill" /><div><strong>{mode === "supabase" ? "实时同步中" : "本地演示模式"}</strong><span>{mode === "supabase" ? "学生端跨设备实时连接" : "学生端需与本页同一浏览器"}</span></div></div>
              <div className="sync-status-card"><Broadcast size={20} weight="fill" /><div><strong>当前章节 · 第 {session.currentChapter} 章</strong><span>{content?.title}</span></div></div>
              <div className="sync-status-card"><UsersThree size={20} weight="fill" /><div><strong>{onlineCount} 名学员在堂</strong><span>{joinedGroups.length}/{session.groups.length} 个小组已加入</span></div></div>
            </div>
            <div className="sync-section"><span className="sync-section-label">学生浏览方式</span><div className="sync-mode-options sync-mode-options-three">
              <button className={session.followMode === "strong" ? "active" : ""} onClick={() => { void patchSession({ followMode: "strong" }); showToast("学生端已切换为强跟随"); }}><LockKey size={16} />强跟随<span>学生自动定位且锁定章节</span></button>
              <button className={session.followMode === "soft" ? "active" : ""} onClick={() => { void patchSession({ followMode: "soft" }); showToast("学生端已切换为软跟随"); }}><Broadcast size={16} />软跟随<span>提示当前章节,可自由查看</span></button>
              <button className={session.followMode === "free" ? "active" : ""} onClick={() => { void patchSession({ followMode: "free" }); showToast("学生端可以自由浏览章节"); }}><Eye size={16} />自由浏览<span>学生自行切换章节</span></button>
            </div></div>
            <label className="sync-lock-row"><input type="checkbox" checked={session.studentLocked} onChange={(event) => { void patchSession({ studentLocked: event.target.checked }); showToast(event.target.checked ? "已锁定学生当前章节" : "已解除章节锁定"); }} /><span><strong>锁定学生当前章节</strong><small>开启后学生只能查看本节内容,跟随教师切换</small></span><LockKey size={17} /></label>
            <div className="sync-join-hint"><span>学生加入:课堂码 {session.code} 或扫码 /student?code={session.code}</span><button onClick={() => { void copyText(joinUrl).then((ok) => showToast(ok ? "加入链接已复制" : "复制失败,请手动复制")); }}><Copy size={14} />复制链接</button></div>
            <div className="dialog-actions"><Button variant="soft" onClick={() => { void store.refresh().then(() => showToast("已同步最新课堂数据"), () => showToast("同步失败,请检查网络")); }}><ArrowsClockwise size={15} />立即同步</Button><Dialog.Close><Button>完成</Button></Dialog.Close></div>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={reportOpen} onOpenChange={setReportOpen}>
          <Dialog.Content maxWidth="680px" className="config-dialog report-dialog">
            <Dialog.Title>课堂结束报告</Dialog.Title>
            <Dialog.Description size="2">数据来自本堂课的真实互动记录,结束后可导出 Excel。</Dialog.Description>
            <div className="report-hero"><div><span>学员参与完成</span><strong>{onlineCount ? Math.round((derived.completedCount / onlineCount) * 100) : 0}%</strong><small>{session.status === "ended" ? "课堂已结束" : "当前进行中"}</small></div><div className="report-ring"><span>{onlineCount}</span><small>在堂学员</small></div></div>
            <div className="report-metrics">
              <div><strong>{onlineCount ? `${Math.round((derived.students.filter((student) => derived.questions.some((question) => question.studentId === student.studentId)).length / onlineCount) * 100)}%` : "0%"}</strong><span>提问参与率</span></div>
              <div><strong>{avgProgress}%</strong><span>本轮任务完成率</span></div>
              <div><strong>{derived.totalScore}</strong><span>累计积分</span></div>
              <div><strong>{derived.groups.length}</strong><span>协作小组</span></div>
            </div>
            <div className="report-section"><div className="report-section-heading"><h3>小组积分排行</h3><span>累计积分</span></div>{sortedByScore.slice(0, 5).map((group, index) => <div className="report-rank-row" key={group.id}><b>{index + 1}</b><span>{group.name}</span><i><em style={{ width: `${Math.min(100, group.score)}%` }} /></i><strong>{group.score}</strong></div>)}</div>
            <div className="report-section"><div className="report-section-heading"><h3>积分荣誉</h3><span>课堂亮点</span></div><div className="honor-grid">
              <div><Trophy size={17} weight="fill" /><strong>最佳协作组</strong><span>{sortedByScore[0]?.name ?? "—"}</span></div>
              <div><Question size={17} weight="fill" /><strong>最佳提问组</strong><span>{bestQuestionGroup}</span></div>
              <div><Sparkle size={17} weight="fill" /><strong>突破之星</strong><span>{breakthroughGroup}</span></div>
            </div></div>
            <div className="dialog-actions"><Button variant="soft" onClick={exportCourseData}><Export size={16} />导出 Excel</Button><Dialog.Close><Button>关闭</Button></Dialog.Close></div>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={configOpen} onOpenChange={setConfigOpen}>
          <Dialog.Content maxWidth="680px" className="config-dialog">
            <Dialog.Title>课堂配置</Dialog.Title>
            <Dialog.Description size="2">调整教师信息、分组与积分规则;课程内容编辑请前往管理页面。</Dialog.Description>
            <Tabs.Root value={configTab} onValueChange={(value) => setConfigTab(value as typeof configTab)}>
              <Tabs.List className="config-tabs">
                <Tabs.Trigger value="teacher">教师信息</Tabs.Trigger>
                <Tabs.Trigger value="groups">分组设置</Tabs.Trigger>
                <Tabs.Trigger value="rules">积分规则</Tabs.Trigger>
              </Tabs.List>
              <Tabs.Content value="teacher" className="config-content">
                <div className="teacher-config-hero"><div className="teacher-avatar large">{teacherDraft.name.slice(0, 1)}</div><div><strong>{teacherDraft.name}</strong><p>{teacherDraft.role} · {session.courseTitle}</p></div></div>
                <div className="config-grid">
                  <label className="config-field"><span>姓名</span><input value={teacherDraft.name} onChange={(event) => setTeacherDraft((draft) => ({ ...draft, name: event.target.value }))} /></label>
                  <label className="config-field"><span>角色</span><input value={teacherDraft.role} onChange={(event) => setTeacherDraft((draft) => ({ ...draft, role: event.target.value }))} /></label>
                </div>
                <label className="config-field"><span>教师寄语</span><textarea value={teacherDraft.message} onChange={(event) => setTeacherDraft((draft) => ({ ...draft, message: event.target.value }))} rows={3} /></label>
                <Button onClick={() => { void patchSession({ teacher: teacherDraft }); setConfigOpen(false); showToast("教师信息已保存"); }}>保存教师信息</Button>
              </Tabs.Content>
              <Tabs.Content value="groups" className="config-content">
                <div className="config-section-heading"><div><strong>分组设置</strong><p>共 {session.groups.length} 组 · 学生入场时从中选择</p></div><Button variant="soft" onClick={addGroup}>新增小组</Button></div>
                <div className="group-config-list">
                  {session.groups.map((group) => groupEditorId === group.id ? (
                    <div key={group.id}><span className="group-config-index">{group.id}</span><input className="group-inline-input" value={groupNameDraft} onChange={(event) => setGroupNameDraft(event.target.value)} autoFocus /><button aria-label="保存小组名称" onClick={() => saveGroupName(group.id)}><Check size={16} /></button></div>
                  ) : (
                    <div key={group.id}>
                      <span className="group-config-index">{group.id}</span>
                      <strong>{derived.groups.find((item) => item.id === group.id)?.name ?? group.name}</strong>
                      <small>{derived.groups.find((item) => item.id === group.id)?.members ?? 0} 人 · {derived.groups.find((item) => item.id === group.id)?.score ?? 0} 分</small>
                      <button aria-label={`编辑${group.name}`} onClick={() => { setGroupEditorId(group.id); setGroupNameDraft(group.name); }}><DotsThree size={17} /></button>
                    </div>
                  ))}
                </div>
                <Button onClick={() => { setConfigOpen(false); showToast("分组设置已保存"); }}>完成</Button>
              </Tabs.Content>
              <Tabs.Content value="rules" className="config-content">
                <div className="config-section-heading"><div><strong>课堂积分规则</strong><p>保存后立即对学生端生效。</p></div><Badge color="teal" variant="soft">当前规则</Badge></div>
                <div className="point-rule-list">
                  <label><span><strong>完成实操任务</strong><small>学生点击“我完成了”后获得</small></span><div><input type="number" min="0" max="99" value={rulesDraft.taskComplete} onChange={(event) => setRulesDraft((rules) => ({ ...rules, taskComplete: Number(event.target.value) }))} /><b>分</b></div></label>
                  <label><span><strong>互动题答对</strong><small>提交正确答案后获得</small></span><div><input type="number" min="0" max="99" value={rulesDraft.interactionCorrect} onChange={(event) => setRulesDraft((rules) => ({ ...rules, interactionCorrect: Number(event.target.value) }))} /><b>分</b></div></label>
                  <label><span><strong>提出有效问题</strong><small>学生每次提问获得</small></span><div><input type="number" min="0" max="99" value={rulesDraft.questionAsk} onChange={(event) => setRulesDraft((rules) => ({ ...rules, questionAsk: Number(event.target.value) }))} /><b>分</b></div></label>
                  <label><span><strong>教师额外奖励</strong><small>确认小组完成时默认增加</small></span><div><input type="number" min="0" max="99" value={rulesDraft.teacherBonus} onChange={(event) => setRulesDraft((rules) => ({ ...rules, teacherBonus: Number(event.target.value) }))} /><b>分</b></div></label>
                </div>
                <div className="point-rule-preview"><Sparkle size={17} weight="fill" /><span>示例:完成任务 +{rulesDraft.taskComplete},答对互动 +{rulesDraft.interactionCorrect},提问 +{rulesDraft.questionAsk}</span></div>
                <div className="dialog-actions"><Button variant="soft" onClick={() => setRulesDraft(session.pointRules)}>恢复当前规则</Button><Button onClick={saveRules}><Check size={16} />保存积分规则</Button></div>
              </Tabs.Content>
            </Tabs.Root>
          </Dialog.Content>
        </Dialog.Root>

        {/* 写入失败横幅:乐观 toast 与真实写入结果的对账出口 */}
        {error && (
          <div className="sync-error-banner" role="alert">
            <WarningCircle size={16} weight="fill" />
            <span>{error}</span>
            <button onClick={() => { void store.refresh(); }}>重试</button>
            <button onClick={() => showToast("将继续使用本地显示,服务端恢复后自动对账")} aria-label="知道了">知道了</button>
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div className="toast" role="status" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }}>
              {mode === "local" ? <WarningCircle size={18} weight="fill" /> : <CheckCircle size={18} weight="fill" />}
              <span>{toast}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Theme>
  );
}
