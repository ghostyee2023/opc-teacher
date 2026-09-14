// 学生端:课堂码入场 → 跟随教师章节 → 完成任务 / 互动答题 / 提问 / 小组
import { useEffect, useMemo, useRef, useState } from "react";
import { Theme } from "@radix-ui/themes";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Broadcast,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Crown,
  Lightning,
  List,
  Moon,
  Question,
  Sparkle,
  Student,
  Sun,
  Timer,
  Trophy,
  UsersThree,
} from "@phosphor-icons/react";
import type { ClassroomEvent, MyStudentSession } from "../types";
import { createBackend } from "../lib/backend";
import { lessonPrompts } from "../lib/course";
import { formatTime, copyText, newId, relativeTime } from "../lib/util";
import {
  clearMyStudentSession,
  getMyStudentSession,
  setMyStudentSession,
  useSharedTimer,
  useClassroomStore,
} from "../hooks/useClassroom";

type StudentTab = "task" | "interaction" | "group" | "profile";

export default function StudentApp() {
  return <StudentStandalone />;
}

function StudentStandalone() {
  const reduceMotion = useReducedMotion();
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [my, setMy] = useState<MyStudentSession | null>(() => getMyStudentSession());
  const [code, setCode] = useState<string | null>(() => getMyStudentSession()?.code ?? null);
  const store = useClassroomStore(code);
  const { session, derived, events, loading, error, notFound, mode } = store;

  const [currentTab, setCurrentTab] = useState<StudentTab>("task");
  const [viewChapter, setViewChapter] = useState<number | null>(null);
  const [chapterMenuOpen, setChapterMenuOpen] = useState(false);
  const [taskView, setTaskView] = useState<"card" | "tips">("card");
  const [localAnswer, setLocalAnswer] = useState<number | null>(null);
  const [studentQuestionOpen, setStudentQuestionOpen] = useState(false);
  const [studentQuestionDraft, setStudentQuestionDraft] = useState("");
  const [studentQuestionSent, setStudentQuestionSent] = useState(false);
  const [groupEditMode, setGroupEditMode] = useState(false);
  const [groupQuestionDraft, setGroupQuestionDraft] = useState<string[]>(["", "", ""]);
  const [celebration, setCelebration] = useState<"success" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** 已 dismiss 的回复 questionId:新回复(不同 id)会重新弹出 */
  const [dismissedReplyId, setDismissedReplyId] = useState<string | null>(null);
  const [lastSeenChapter, setLastSeenChapter] = useState<number | null>(null);
  const resumeChecked = useRef(false);
  const supportNotifiedRef = useRef<string | null>(null);

  const secondsLeft = useSharedTimer(session);

  const showToast = (message: string) => setToast(message);

  // 恢复会话时校验课堂仍存在;网络错误(notFound=false)不清会话,仅提示重试
  useEffect(() => {
    if (!code || loading) return;
    if (!session && notFound) {
      if (!resumeChecked.current && my) {
        resumeChecked.current = true;
        clearMyStudentSession();
        setMy(null);
        setCode(null);
        showToast("课堂不存在或已结束,请重新输入课堂码");
      }
    }
  }, [code, loading, session, notFound, my]);

  // 教师切换章节时提示(软跟随)
  useEffect(() => {
    if (!session) return;
    if (lastSeenChapter !== null && lastSeenChapter !== session.currentChapter) {
      setViewChapter(session.currentChapter);
      setLocalAnswer(null);
      if (session.followMode === "soft") showToast(`老师已切换到第 ${session.currentChapter} 章`);
    }
    setLastSeenChapter(session.currentChapter);
  }, [session?.currentChapter, session?.followMode, session]); // eslint-disable-line react-hooks/exhaustive-deps

  // 教师支援提醒(小组维度,10 秒内新事件提示)
  useEffect(() => {
    if (!derived) return;
    const latest = derived.supports.find((support) => support.groupId === my?.groupId);
    if (!latest) return;
    if (latest.id === supportNotifiedRef.current) return;
    if (Date.now() - latest.at > 20_000) { supportNotifiedRef.current = latest.id; return; }
    supportNotifiedRef.current = latest.id;
    showToast("老师正向你们组提供支援,请注意查看");
  }, [derived, my?.groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!celebration) return;
    const timer = window.setTimeout(() => setCelebration(null), 2800);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  // 主题同步到 <html>,Radix 弹窗 portal 到 body 时仍能继承 token
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
  }, [appearance]);

  // 加入/恢复课堂:确保 join 事件存在(幂等,fold 按 studentId 去重)
  useEffect(() => {
    if (!my || !session || !derived) return;
    if (derived.students.some((student) => student.studentId === my.studentId)) return;
    void store.appendEvent({ type: "join", studentId: my.studentId, nickname: my.nickname, groupId: my.groupId, isLeader: my.isLeader });
  }, [my, session, derived, store.appendEvent]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!my || !code || (!session && !loading)) {
    return (
      <StudentEntry
        appearance={appearance}
        mode={mode}
        initialCode={new URLSearchParams(window.location.search).get("code")?.toUpperCase() ?? my?.code ?? ""}
        onJoined={(next) => { setMy(next); setMyStudentSession(next); setCode(next.code); setViewChapter(null); }}
        onError={showToast}
      />
    );
  }

  if (loading || !session || !derived) {
    return (
      <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="100%">
        <div className="student-entry-page" data-theme={appearance}>
          <div className="student-entry-card"><div className="student-entry-brand"><Broadcast size={20} /></div><p className="student-entry-loading">{error ?? "正在连接课堂..."}</p></div>
        </div>
      </Theme>
    );
  }

  const chapters = Object.keys(session.chapters).map(Number).sort((a, b) => a - b);
  const lockedToTeacher = session.followMode === "strong" || session.studentLocked;
  const effectiveChapter = lockedToTeacher ? session.currentChapter : (viewChapter ?? session.currentChapter);
  const content = session.chapters[effectiveChapter];
  const prompts = lessonPrompts(content);
  const interaction = content?.interaction ?? session.defaultInteraction;
  const myGroup = derived.groups.find((group) => group.id === my.groupId);
  const scoreRank = [...derived.groups].sort((a, b) => b.score - a.score).findIndex((group) => group.id === my.groupId) + 1;
  const progressRank = [...derived.groups].sort((a, b) => b.progress - a.progress).findIndex((group) => group.id === my.groupId) + 1;
  const rules = session.pointRules;

  const isCompleted = eventsHasComplete(events, my.studentId, effectiveChapter);
  const myInteraction = findInteraction(events, my.studentId, effectiveChapter);
  const chosenAnswer = localAnswer ?? myInteraction?.answer ?? null;
  const myQuestions = events.filter((event): event is Extract<ClassroomEvent, { type: "question" }> => event.type === "question" && event.studentId === my.studentId);
  const latestAnswer = [...myQuestions]
    .map((question) => ({ question, answeredAt: findAnswerAt(events, question.id) }))
    .filter((item) => item.answeredAt !== null)
    .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0))[0];
  const groupQuestionsSaved = findGroupQuestions(events, my.groupId);

  const canSwitchChapter = (chapterId: number) => {
    if (lockedToTeacher) return chapterId === session.currentChapter;
    if (session.followMode === "free") return true;
    return chapterId <= session.currentChapter;
  };

  const submitJoin = (groupId: number) => {
    if (groupId === my.groupId) return;
    if (session.status === "ended") { showToast("课堂已结束"); return; }
    const next = { ...my, groupId };
    setMy(next);
    setMyStudentSession(next);
    void store.appendEvent({ type: "join", studentId: next.studentId, nickname: next.nickname, groupId, isLeader: next.isLeader });
    showToast("小组已切换");
  };

  const exitClassroom = () => {
    void store.appendEvent({ type: "leave", studentId: my.studentId });
    clearMyStudentSession();
    setMy(null);
    setCode(null);
  };

  const submitLeader = (isLeader: boolean) => {
    if (session.status === "ended") { showToast("课堂已结束"); return; }
    const next = { ...my, isLeader };
    setMy(next);
    setMyStudentSession(next);
    void store.appendEvent({ type: "join", studentId: next.studentId, nickname: next.nickname, groupId: next.groupId, isLeader });
  };

  const completeTask = () => {
    if (session.status === "ended") { showToast("课堂已结束"); return; }
    if (!session.published && effectiveChapter === session.currentChapter) { showToast("老师还没有发布本节任务"); return; }
    if (isCompleted) { showToast("已完成,如需重做请联系老师"); return; }
    void store.appendEvent({ type: "complete", studentId: my.studentId, groupId: my.groupId, chapter: effectiveChapter });
    void store.appendEvent({ type: "points", groupId: my.groupId, points: rules.taskComplete, reason: "完成实操任务" });
    setCelebration("success");
    showToast(`任务完成 · 小组 +${rules.taskComplete} 分`);
  };

  const submitAnswer = (answer: number) => {
    if (session.status === "ended") { showToast("课堂已结束"); return; }
    if (!session.published && effectiveChapter === session.currentChapter) { showToast("老师还没有发布本节任务"); return; }
    if (myInteraction) { showToast("本题已提交过"); return; }
    const correct = answer === interaction.correct;
    void store.appendEvent({ type: "interaction", studentId: my.studentId, groupId: my.groupId, chapter: effectiveChapter, answer, correct });
    if (correct) {
      void store.appendEvent({ type: "points", groupId: my.groupId, points: rules.interactionCorrect, reason: "互动题答对" });
      setCelebration("success");
    }
    setLocalAnswer(answer);
    showToast(correct ? `答对了 · 小组 +${rules.interactionCorrect} 分` : "已提交,继续加油");
  };

  const sendQuestion = () => {
    const text = studentQuestionDraft.trim();
    if (!text) return;
    if (session.status === "ended") { showToast("课堂已结束"); return; }
    void store.appendEvent({ type: "question", studentId: my.studentId, nickname: my.nickname, groupId: my.groupId, groupName: myGroup?.name ?? "未知小组", text });
    void store.appendEvent({ type: "points", groupId: my.groupId, points: rules.questionAsk, reason: "提出有效问题" });
    setStudentQuestionDraft("");
    setStudentQuestionOpen(false);
    setStudentQuestionSent(true);
    showToast(`问题已提交 · +${rules.questionAsk} 分`);
  };

  const saveGroupQuestions = () => {
    const items = groupQuestionDraft.map((item) => item.trim());
    if (items.some((item) => !item)) { showToast("请填写 3 个问题"); return; }
    void store.appendEvent({ type: "group-questions", groupId: my.groupId, items });
    setGroupEditMode(false);
    showToast("本组关心的问题已提交给老师");
  };

  const beginGroupEdit = () => {
    setGroupQuestionDraft(groupQuestionsSaved ?? ["", "", ""]);
    setGroupEditMode(true);
  };

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="100%">
      <div className="student-page" data-theme={appearance}>
        <header className="student-page-header">
          <div className="student-brand"><div className="brand-mark"><Broadcast size={19} weight="fill" /></div><div><strong>共场课堂</strong><small>{session.courseTitle}</small></div></div>
          <div className="student-page-header-actions">
            <span className="student-live-chip"><Broadcast size={14} weight="fill" />{session.status === "ended" ? "课堂已结束" : "授课中"}</span>
            {session.published && <span className="student-page-timer"><Timer size={15} />{formatTime(secondsLeft)}</span>}
            <button className="student-theme-button" onClick={() => setAppearance((value) => value === "light" ? "dark" : "light")} aria-label="切换主题">{appearance === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
            <button className="student-menu-button" onClick={() => setChapterMenuOpen((value) => !value)} aria-label="选择章节" aria-expanded={chapterMenuOpen}><List size={21} weight="bold" /></button>
          </div>
          {chapterMenuOpen && (
            <div className="student-chapter-menu">
              <span>选择章节{lockedToTeacher ? " · 已跟随老师" : ""}</span>
              {chapters.map((chapterId) => {
                const lesson = session.chapters[chapterId];
                const state = chapterId < session.currentChapter ? "done" : chapterId === session.currentChapter ? "live" : "locked";
                const enabled = canSwitchChapter(chapterId);
                return (
                  <button
                    key={chapterId}
                    className={`${chapterId === effectiveChapter ? "active" : ""} ${enabled ? "" : "disabled"}`}
                    onClick={() => { if (!enabled) { showToast(lockedToTeacher ? "当前跟随老师讲解,暂不能切换" : "该章节还未开放"); return; } setViewChapter(chapterId); setChapterMenuOpen(false); setTaskView("card"); setLocalAnswer(null); }}
                  >
                    <span>{chapterId}</span>
                    <strong>{lesson?.title ?? "未命名章节"}</strong>
                    <small>{state === "done" ? "已完成" : state === "live" ? "进行中" : "待开放"}</small>
                  </button>
                );
              })}
            </div>
          )}
        </header>
        <main className="student-page-main">
          <AnimatePresence mode="wait">
            <motion.section key={currentTab} className="student-page-section" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}>
              {currentTab === "task" && (
                <>
                  <div className="student-page-title student-task-title">
                    <div><span className="student-section-label"><Lightning size={16} weight="bold" />任务 · 第 {effectiveChapter} 章</span><h1>本节任务</h1></div>
                    <button className={`student-tips-trigger ${taskView === "tips" ? "active" : ""}`} onClick={() => setTaskView(taskView === "tips" ? "card" : "tips")} aria-pressed={taskView === "tips"}><Sparkle size={16} weight="fill" />锦囊</button>
                  </div>
                  {!session.published && effectiveChapter === session.currentChapter ? (
                    <div className="student-page-card task-waiting-state"><Broadcast size={24} /><strong>老师还没有发布本节任务</strong><p>可以先看讲义,任务发布后这里会立刻更新。</p></div>
                  ) : taskView === "card" ? (
                    isCompleted ? (
                      <div className="student-page-card task-complete-message"><Sparkle size={25} weight="fill" /><p>任务完成得很棒,带着这份专注继续前进。</p><button onClick={() => setTaskView("tips")}>查看锦囊</button></div>
                    ) : (
                      <div className="student-page-card task-card-main">
                        <h1>{content?.task}</h1>
                        <p className="task-card-scenario">{content?.description}</p>
                        <motion.button
                          className="task-complete-button"
                          whileTap={reduceMotion ? undefined : { scale: .96 }}
                          animate={isCompleted ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                          onClick={completeTask}
                        >
                          <CheckCircle size={19} weight="fill" />我完成了
                        </motion.button>
                      </div>
                    )
                  ) : (
                    <div className="student-tips-list">
                      <div className="student-tip-step"><span>01</span><div><strong>先说清目标</strong><p>说明你希望 AI 帮你完成什么。</p></div></div>
                      <div className="student-tip-step"><span>02</span><div><strong>补充角色与场景</strong><p>告诉 AI 面向谁、在什么场景使用。</p></div></div>
                      <div className="student-tip-step"><span>03</span><div><strong>约定输出格式</strong><p>指定结构、长度和判断标准。</p></div></div>
                      {prompts.map((prompt, index) => (
                        <div className="student-page-card prompt-card" key={index}>
                          <div className="student-card-heading"><span>提示词 {prompts.length > 1 ? index + 1 : ""}</span><button onClick={() => { void copyText(prompt).then((ok) => showToast(ok ? "提示词已复制" : "复制失败,请手动复制")); }}><Copy size={15} />复制</button></div>
                          <p>{prompt}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
              {currentTab === "interaction" && (
                <>
                  <div className="student-page-title"><span className="student-section-label"><Question size={16} weight="bold" />互动</span><h1>{interaction.question}</h1></div>
                  {!session.published && effectiveChapter === session.currentChapter ? (
                    <div className="student-page-card task-waiting-state"><Broadcast size={24} /><strong>老师还没有发布本节任务</strong><p>任务发布后即可参与本节互动题。</p></div>
                  ) : (
                  <div className="student-page-card answer-page-card">
                    <div className="answer-page-options">
                      {interaction.answers.map((answer, index) => (
                        <button
                          key={answer}
                          className={chosenAnswer === index ? "selected" : ""}
                          disabled={Boolean(myInteraction)}
                          onClick={() => setLocalAnswer(index)}
                        >
                          <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                          <span className="answer-option-text">{answer}</span>
                          {chosenAnswer === index && <Check size={16} weight="bold" />}
                        </button>
                      ))}
                    </div>
                    <button className="answer-submit-button" disabled={chosenAnswer === null || Boolean(myInteraction)} onClick={() => chosenAnswer !== null && submitAnswer(chosenAnswer)}>
                      {myInteraction ? "已提交" : "提交"}
                    </button>
                    {myInteraction && (
                      <div className={`answer-page-feedback ${myInteraction.correct ? "success" : ""}`}>
                        <CheckCircle size={16} weight="fill" />
                        {myInteraction.correct ? `答对了 · 小组 +${rules.interactionCorrect} 分` : "已提交,答案已记录"}
                      </div>
                    )}
                  </div>
                  )}
                </>
              )}
              {currentTab === "group" && (
                <>
                  <div className="student-page-title"><div className="student-group-title-row"><span className="student-group-title-label">小组:</span><h1>{myGroup?.name ?? "我的小组"}</h1></div></div>
                  <div className="student-score-hero"><div><span>当前积分</span><strong>{myGroup?.score ?? 0}</strong></div><Trophy size={40} weight="duotone" /></div>
                  <div className="student-group-metrics" aria-label="小组排名与进度">
                    <div className="student-group-metric"><span>本轮完成情况</span><strong>第 {progressRank || "-"} / {derived.groups.length}</strong></div>
                    <div className="student-group-metric"><span>本轮任务组内进度</span><strong>{myGroup?.completed ?? 0}/{myGroup?.members ?? 0} 人</strong><div className="student-progress-track"><i style={{ width: `${myGroup?.progress ?? 0}%` }} /></div></div>
                    <div className="student-group-metric"><span>积分排名</span><strong>第 {scoreRank || "-"} / {derived.groups.length}</strong></div>
                  </div>
                  <div className="student-page-card student-members-card">
                    <div className="student-card-heading"><span>小组成员 · {myGroup?.members ?? 0} 人</span></div>
                    {myGroup?.members ? myGroup.people.map((person) => (
                      <div className="student-member-row" key={person.studentId}>
                        <span>{person.nickname.slice(-1)}</span>
                        <strong>{person.nickname}{person.studentId === my.studentId ? "(我)" : ""}</strong>
                        <small>{person.isLeader ? <Crown size={13} weight="fill" /> : null}{person.isLeader ? "组长" : "组员"}</small>
                      </div>
                    )) : <p className="student-empty-line">本组还没有其他成员</p>}
                  </div>
                  <div className="student-page-card student-group-questions">
                    <div className="student-card-heading"><span>本组最关心的 3 个问题</span><small>{groupEditMode ? "编辑中" : groupQuestionsSaved?.length ? "已提交" : "待填写"}</small></div>
                    {groupEditMode ? (
                      <>
                        <p className="student-group-edit-hint">组长与组员讨论后,由组长填写小组资料</p>
                        <div className="student-group-question-fields">
                          {groupQuestionDraft.map((question, index) => (
                            <label key={index}><span>{index + 1}</span><input value={question} onChange={(event) => setGroupQuestionDraft((items) => items.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} placeholder={`填写第 ${index + 1} 个问题`} /></label>
                          ))}
                        </div>
                        <div className="student-group-edit-actions">
                          <button className="student-secondary-button" onClick={() => setGroupEditMode(false)}>取消</button>
                          <button className="student-primary-button" onClick={saveGroupQuestions}>保存</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="student-question-output">
                          {(groupQuestionsSaved ?? []).map((question, index) => (
                            <div className="student-question-output-row" key={index}><span>{index + 1}</span><p>{question}</p></div>
                          ))}
                          {!groupQuestionsSaved?.length && <p className="student-empty-line">还没有提交</p>}
                        </div>
                        {my.isLeader
                          ? <button className="student-secondary-button student-edit-group-button" onClick={beginGroupEdit}>编辑小组资料</button>
                          : <p className="student-group-readonly">由组长与组员讨论后填写</p>}
                      </>
                    )}
                  </div>
                </>
              )}
              {currentTab === "profile" && (
                <>
                  <div className="student-page-title"><span className="student-section-label"><Student size={16} weight="fill" />我的</span><h1>{my.nickname}</h1></div>
                  <div className="student-page-card identity-card">
                    <div className="student-identity-summary">
                      <div className="student-identity-row"><span>我的组别</span><strong>{myGroup?.name ?? "-"}</strong></div>
                      <div className="student-identity-row"><span>我的身份</span><strong>{my.isLeader ? "组长" : "组员"}</strong></div>
                      <div className="student-identity-row"><span>课堂码</span><strong>{session.code}</strong></div>
                    </div>
                    <div className="student-field-label">变更组别</div>
                    <div className="student-group-grid">
                      {derived.groups.map((group) => (
                        <button key={group.id} className={my.groupId === group.id ? "selected" : ""} onClick={() => submitJoin(group.id)}>{group.name}<small>{group.members} 人</small></button>
                      ))}
                    </div>
                    <label className="student-leader-check"><input type="checkbox" checked={my.isLeader} onChange={(event) => submitLeader(event.target.checked)} /><span>我是组长</span><Crown size={17} weight="fill" /></label>
                  </div>
                  <div className="student-page-card">
                    <div className="student-card-heading"><span>我的提问</span><small>{myQuestions.length} 条</small></div>
                    {myQuestions.length
                      ? myQuestions.map((question) => {
                        const answered = findAnswerAt(events, question.id) !== null;
                        return <p className={`student-question-line ${answered ? "answered" : ""}`} key={question.id}>{answered ? "✔ " : ""}{question.text}</p>;
                      })
                      : <p className="student-empty-line">暂无提问</p>}
                  </div>
                  <div className="student-page-card">
                    <div className="student-card-heading"><span>我的进度</span><b>{isCompleted ? "已完成" : "进行中"}</b></div>
                    <div className="student-progress-track"><i style={{ width: `${isCompleted ? 100 : myInteraction ? 50 : 20}%` }} /></div>
                    <div className="student-progress-summary"><span>互动题 {myInteraction ? "已提交" : "未提交"}</span><span>实操任务 {isCompleted ? "已完成" : "进行中"}</span></div>
                  </div>
                  <button className="student-exit-button" onClick={exitClassroom}>退出课堂</button>
                </>
              )}
            </motion.section>
          </AnimatePresence>
        </main>
        {latestAnswer && latestAnswer.question.id !== dismissedReplyId && (
          <div className="student-teacher-reply-banner" role="status">
            <CheckCircle size={16} weight="fill" />
            <span><strong>老师已回复 · {relativeTime(latestAnswer.answeredAt ?? 0)}</strong><small>{findAnswerText(events, latestAnswer.question.id)}</small></span>
            <button onClick={() => { setDismissedReplyId(latestAnswer.question.id); setCurrentTab("profile"); }}>查看</button>
            <button className="banner-close" onClick={() => setDismissedReplyId(latestAnswer.question.id)} aria-label="关闭">✕</button>
          </div>
        )}
        {studentQuestionOpen && !studentQuestionSent && (
          <>
            <button className="student-question-dismiss" aria-label="关闭提问输入框" onClick={() => setStudentQuestionOpen(false)} />
            <div className="student-question-composer">
              <input value={studentQuestionDraft} onChange={(event) => setStudentQuestionDraft(event.target.value)} placeholder="输入想问老师的问题" autoFocus />
              <button disabled={!studentQuestionDraft.trim()} onClick={sendQuestion}>发送</button>
            </div>
          </>
        )}
        <div className="student-page-bottom">
          <nav className="student-page-nav" aria-label="学生端导航">
            <button className={currentTab === "task" ? "active" : ""} onClick={() => { setStudentQuestionOpen(false); setCurrentTab("task"); }}><Lightning size={18} /><span>任务</span></button>
            <button className={currentTab === "interaction" ? "active" : ""} onClick={() => { setStudentQuestionOpen(false); setCurrentTab("interaction"); }}><Question size={18} /><span>互动</span></button>
            <button className="student-ask-button" onClick={() => { setStudentQuestionSent(false); setStudentQuestionOpen(true); }}><Question size={22} weight="bold" /><span>提问</span></button>
            <button className={currentTab === "group" ? "active" : ""} onClick={() => { setStudentQuestionOpen(false); setCurrentTab("group"); }}><UsersThree size={18} /><span>小组</span></button>
            <button className={currentTab === "profile" ? "active" : ""} onClick={() => { setStudentQuestionOpen(false); setCurrentTab("profile"); }}><Student size={18} /><span>我的</span></button>
          </nav>
        </div>
        <AnimatePresence>
          {celebration && (
            <div className="celebration-overlay success" aria-live="polite">
              <div className="firework-burst">
                {Array.from({ length: 12 }, (_, index) => (
                  <motion.span key={index} initial={reduceMotion ? false : { scale: 0, opacity: 0 }} animate={reduceMotion ? undefined : { scale: [0, 1, .7], opacity: [0, 1, 0], x: [0, Math.cos(index * Math.PI / 6) * 92], y: [0, Math.sin(index * Math.PI / 6) * 92] }} transition={{ duration: 1.1, delay: index * .025 }}><Sparkle size={18} weight="fill" /></motion.span>
                ))}
              </div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {toast && <motion.div className="student-page-toast" initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}><CheckCircle size={17} weight="fill" />{toast}</motion.div>}
        </AnimatePresence>
      </div>
    </Theme>
  );
}

/* ---------------- 入场页 ---------------- */

function StudentEntry({ appearance, mode, initialCode, onJoined, onError }: {
  appearance: "light" | "dark";
  mode: "local" | "supabase";
  initialCode: string;
  onJoined: (session: MyStudentSession) => void;
  onError: (message: string) => void;
}) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [nickname, setNickname] = useState("");
  const [groups, setGroups] = useState<{ id: number; name: string }[] | null>(null);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [isLeader, setIsLeader] = useState(false);
  const [checking, setChecking] = useState(false);

  const lookupClassroom = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) { onError("请输入至少 4 位课堂码"); return; }
    setChecking(true);
    try {
      const backend = createBackend();
      const session = await backend.getClassroom(trimmed);
      if (!session) { onError("课堂码不存在,请向老师确认(本地模式需与老师同一浏览器)"); setChecking(false); return; }
      if (session.status === "ended") { onError("该课堂已结束"); setChecking(false); return; }
      setGroups(session.groups);
      setGroupId((prev) => prev ?? session.groups[0]?.id ?? null);
    } catch {
      onError("连接课堂失败,请检查网络");
    }
    setChecking(false);
  };

  const join = () => {
    const name = nickname.trim();
    if (!name) { onError("请先填写昵称"); return; }
    if (groupId === null) { onError("请选择小组"); return; }
    onJoined({ code: code.trim().toUpperCase(), studentId: newId(), nickname: name, groupId, isLeader });
  };

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="100%">
      <div className="student-entry-page" data-theme={appearance}>
        <div className="student-entry-card">
          <div className="student-entry-brand"><div className="brand-mark"><Broadcast size={20} weight="fill" /></div><span>共场课堂</span></div>
          <span className="student-entry-kicker">加入课堂</span>
          <h1>准备好一起开始了吗?</h1>
          <p className="student-entry-course">{mode === "local" ? "本地演示模式 · 请与老师端使用同一浏览器" : "实时课堂 · 输入老师提供的课堂码"}</p>
          <label className="student-entry-label" htmlFor="entry-code">课堂码</label>
          <div className="entry-code-row">
            <input id="entry-code" className="student-entry-input student-entry-code" value={code} onChange={(event) => { setCode(event.target.value.toUpperCase()); setGroups(null); }} maxLength={6} placeholder="输入 6 位课堂码" />
            <button className="entry-lookup-button" onClick={lookupClassroom} disabled={checking}>{checking ? "查找中" : "查找课堂"}</button>
          </div>
          <label className="student-entry-label" htmlFor="entry-name">你的昵称</label>
          <input id="entry-name" className="student-entry-input" value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="输入课堂中显示的名称" />
          <span className="student-entry-label">加入小组</span>
          {groups ? (
            <div className="student-entry-groups">
              {groups.map((group) => <button key={group.id} className={groupId === group.id ? "selected" : ""} onClick={() => setGroupId(group.id)}><UsersThree size={16} />{group.name}</button>)}
            </div>
          ) : (
            <p className="entry-hint-line"><Clock size={14} />先输入课堂码并查找,再选择小组</p>
          )}
          <label className="student-entry-leader"><input type="checkbox" checked={isLeader} onChange={(event) => setIsLeader(event.target.checked)} /><span>我是组长</span><Crown size={16} weight="fill" /></label>
          <button className="student-entry-submit" disabled={!groups || !nickname.trim()} onClick={join}>进入课堂 <ArrowRight size={17} /></button>
          <small className="student-entry-hint">加入后可以随时在“我的”里变更小组和身份</small>
        </div>
      </div>
    </Theme>
  );
}

/* ---------------- 事件查询辅助 ---------------- */

function eventsHasComplete(events: ClassroomEvent[], studentId: string, chapter: number) {
  return events.some((event) => event.type === "complete" && event.studentId === studentId && event.chapter === chapter);
}

function findInteraction(events: ClassroomEvent[], studentId: string, chapter: number) {
  const found = events.find((event) => event.type === "interaction" && event.studentId === studentId && event.chapter === chapter);
  return found && found.type === "interaction" ? { answer: found.answer, correct: found.correct } : null;
}

function findAnswerAt(events: ClassroomEvent[], questionId: string) {
  const found = events.find((event) => event.type === "answer" && event.questionId === questionId);
  return found && found.type === "answer" ? found.at : null;
}

function findAnswerText(events: ClassroomEvent[], questionId: string) {
  const found = events.find((event) => event.type === "answer" && event.questionId === questionId);
  return found && found.type === "answer" ? found.text : "";
}

function findGroupQuestions(events: ClassroomEvent[], groupId: number) {
  const found = [...events].filter((event) => event.type === "group-questions" && event.groupId === groupId).pop();
  return found && found.type === "group-questions" ? found.items : null;
}
