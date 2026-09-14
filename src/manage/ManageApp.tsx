// 管理页:课前编辑课程库(章节 / 提示词 / 互动题)、默认分组与积分规则
import { useEffect, useMemo, useState } from "react";
import { Button, Theme } from "@radix-ui/themes";
import {
  ArrowLeft,
  Broadcast,
  Check,
  CheckCircle,
  Plus,
  PresentationChart,
  Sparkle,
  Trash,
  UsersThree,
} from "@phosphor-icons/react";
import type { ChangeEvent } from "react";
import type { CourseInteraction, CourseRecord, LessonContent } from "../types";
import {
  getManageDefaults,
  getStoredCourses,
  lessonPrompts,
  storeCourses,
  storeManageDefaults,
} from "../lib/course";

type ManageTab = "content" | "course" | "groups" | "rules";
type ContentSubtab = "task" | "prompts" | "interaction";

export default function ManageApp() {
  const [appearance, setAppearance] = useState<"light" | "dark">("light");
  const [courses, setCourses] = useState<CourseRecord[]>(() => getStoredCourses());
  const [courseId, setCourseId] = useState<string>(() => getStoredCourses()[0]?.id ?? "");
  const [chapterId, setChapterId] = useState<number>(1);
  const [promptIndex, setPromptIndex] = useState(0);
  const [manageTab, setManageTab] = useState<ManageTab>("content");
  const [contentSubtab, setContentSubtab] = useState<ContentSubtab>("task");
  const [defaults, setDefaults] = useState(() => getManageDefaults());
  const [toast, setToast] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<CourseRecord | null>(null);

  const course = courses.find((item) => item.id === courseId) ?? courses[0];
  const chapterEntries = useMemo(
    () => Object.entries(course?.chapters ?? {}).sort(([a], [b]) => Number(a) - Number(b)),
    [course],
  );
  const lesson = course?.chapters[chapterId] ?? course?.chapters[Number(chapterEntries[0]?.[0] ?? 1)];
  const lessonInteraction = lesson?.interaction ?? course?.interaction;
  const prompts = lessonPrompts(lesson);
  const activePrompt = prompts[Math.min(promptIndex, Math.max(0, prompts.length - 1))] ?? "";

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 主题同步到 <html>,Radix 弹窗 portal 到 body 时仍能继承 token
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
  }, [appearance]);

  // 章节 / 提示词越界时收敛
  useEffect(() => {
    if (course && !course.chapters[chapterId]) {
      const first = Number(Object.keys(course.chapters)[0] ?? 1);
      setChapterId(first);
      setPromptIndex(0);
    }
  }, [course, chapterId]);

  useEffect(() => {
    if (promptIndex > prompts.length - 1) setPromptIndex(Math.max(0, prompts.length - 1));
  }, [prompts.length, promptIndex]);

  const updateCourse = (courseId: string, updater: (course: CourseRecord) => CourseRecord) => {
    setCourses((items) => items.map((item) => item.id === courseId ? updater(item) : item));
  };

  const updateCurrentLesson = (field: keyof LessonContent, value: string) => {
    if (!course) return;
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: { ...item.chapters, [chapterId]: { ...item.chapters[chapterId], [field]: value } },
    }));
  };

  const updatePrompt = (value: string) => {
    if (!course) return;
    const nextPrompts = prompts.map((prompt, index) => index === promptIndex ? value : prompt);
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: {
        ...item.chapters,
        [chapterId]: {
          ...item.chapters[chapterId],
          prompts: nextPrompts,
          // 兼容旧字段:保持 prompt 指向第一个提示词
          prompt: nextPrompts[0],
        },
      },
    }));
  };

  const addPrompt = () => {
    if (!course) return;
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: { ...item.chapters, [chapterId]: { ...item.chapters[chapterId], prompts: [...prompts, ""] } },
    }));
    setPromptIndex(prompts.length);
  };

  const removePrompt = () => {
    if (!course || prompts.length <= 1) { setToast("至少保留一个提示词"); return; }
    const nextPrompts = prompts.filter((_, index) => index !== promptIndex);
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: { ...item.chapters, [chapterId]: { ...item.chapters[chapterId], prompts: nextPrompts, prompt: nextPrompts[0] } },
    }));
    setPromptIndex((index) => Math.max(0, index - 1));
  };

  const addChapter = () => {
    if (!course) return;
    const nextId = Math.max(0, ...Object.keys(course.chapters).map(Number)) + 1;
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: { ...item.chapters, [nextId]: { title: `第 ${nextId} 章`, description: "", task: "", prompts: [""] } },
    }));
    setChapterId(nextId);
    setPromptIndex(0);
    setContentSubtab("task");
  };

  const removeChapter = () => {
    if (!course) return;
    if (Object.keys(course.chapters).length <= 1) { setToast("课程至少需要保留一个章节"); return; }
    const next = { ...course.chapters };
    delete next[chapterId];
    const nextId = Number(Object.keys(next).sort((a, b) => Number(a) - Number(b))[0]);
    updateCourse(course.id, (item) => ({ ...item, chapters: next }));
    setChapterId(nextId);
    setToast("章节已删除");
  };

  const updateLessonInteraction = (patch: Partial<CourseInteraction>) => {
    if (!course || !lessonInteraction) return;
    const next = { ...lessonInteraction, ...patch };
    updateCourse(course.id, (item) => ({
      ...item,
      chapters: { ...item.chapters, [chapterId]: { ...item.chapters[chapterId], interaction: next } },
    }));
  };

  const updateLessonAnswer = (index: number, value: string) => {
    if (!lessonInteraction) return;
    updateLessonInteraction({ answers: lessonInteraction.answers.map((answer, answerIndex) => answerIndex === index ? value : answer) });
  };

  const saveContent = () => {
    storeCourses(courses);
    setToast("课程内容已保存");
  };

  const updateCourseMeta = (field: keyof CourseRecord, value: string) => {
    if (!course) return;
    updateCourse(course.id, (item) => ({ ...item, [field]: value }));
  };

  const createCourse = () => {
    const newCourse: CourseRecord = {
      id: `course-${Date.now()}`,
      title: "新课程",
      className: "未命名班级",
      description: "",
      status: "draft",
      chapters: { 1: { title: "第一章", description: "", task: "", prompts: [""] } },
      interaction: { question: "新的互动题?", answers: ["选项 A", "选项 B"], correct: 0 },
    };
    setCourses((items) => [newCourse, ...items]);
    setCourseId(newCourse.id);
    setChapterId(1);
    setPromptIndex(0);
    setManageTab("content");
    setToast("新课程已创建,记得保存");
  };

  const importCourseInfo = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<CourseRecord>;
      // 结构校验:标题必须有;章节必须是非空对象且每章可读;互动题选项必须是非空数组
      if (!parsed.title || typeof parsed.title !== "string") throw new Error("invalid title");
      if (!parsed.chapters || typeof parsed.chapters !== "object" || Array.isArray(parsed.chapters) || !Object.keys(parsed.chapters).length) throw new Error("invalid chapters");
      for (const lesson of Object.values(parsed.chapters)) {
        if (!lesson || typeof lesson !== "object" || typeof lesson.title !== "string") throw new Error("invalid lesson");
      }
      if (parsed.interaction) {
        const { question, answers, correct } = parsed.interaction;
        if (typeof question !== "string" || !Array.isArray(answers) || !answers.length || answers.some((answer) => typeof answer !== "string") || !Number.isInteger(correct) || correct < 0 || correct >= answers.length) throw new Error("invalid interaction");
      }
      setImportPreview({
        id: `import-${Date.now()}`,
        title: parsed.title,
        className: parsed.className ?? "未命名班级",
        description: parsed.description ?? "",
        status: "draft",
        chapters: parsed.chapters,
        interaction: parsed.interaction ?? { question: "默认互动题?", answers: ["选项 A", "选项 B"], correct: 0 },
      });
    } catch {
      setToast("课程文件格式不正确,请导入符合结构的 JSON 课程包");
    }
  };

  const confirmImport = () => {
    if (!importPreview) return;
    setCourses((items) => [importPreview, ...items]);
    setCourseId(importPreview.id);
    storeCourses([importPreview, ...courses]);
    setImportPreview(null);
    setToast(`已导入「${importPreview.title}」`);
  };

  const addGroup = () => {
    const id = Math.max(0, ...defaults.groups.map((group) => group.id)) + 1;
    setDefaults((item) => ({ ...item, groups: [...item.groups, { id, name: `新小组 ${id}` }] }));
  };

  const updateGroup = (id: number, name: string) => {
    setDefaults((item) => ({ ...item, groups: item.groups.map((group) => group.id === id ? { ...group, name } : group) }));
  };

  const removeGroup = (id: number) => {
    setDefaults((item) => ({ ...item, groups: item.groups.filter((group) => group.id !== id) }));
  };

  const saveDefaults = () => {
    storeManageDefaults(defaults);
    setToast("默认设置已保存,新课堂将使用该配置");
  };

  if (!course) {
    return (
      <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="95%">
        <div className="management-page" data-theme={appearance}>
          <div className="management-empty-state"><PresentationChart size={36} /><strong>还没有课程</strong><button className="management-save" onClick={createCourse}><Plus size={15} />创建第一门课程</button></div>
        </div>
      </Theme>
    );
  }

  return (
    <Theme appearance={appearance} accentColor="teal" grayColor="sage" radius="large" scaling="95%">
      <div className="management-page" data-theme={appearance}>
        <input id="manage-import-input" className="course-import-input" type="file" accept=".json,application/json" onChange={importCourseInfo} aria-label="导入课程包" />
        <header className="management-header">
          <div className="management-brand">
            <button className="management-back" onClick={() => { window.location.href = "/"; }}><ArrowLeft size={16} />返回课堂</button>
            <div className="brand-mark"><Broadcast size={20} weight="fill" /></div>
            <div><strong>共场 · 内容管理</strong><small>课前编辑与保存</small></div>
          </div>
          <div className="management-header-actions">
            <button className="management-header-button theme-toggle" onClick={() => setAppearance((value) => value === "light" ? "dark" : "light")} aria-label="切换主题">{appearance === "light" ? "深色" : "浅色"}</button>
            <label className="management-header-button" htmlFor="manage-import-input">导入课程包</label>
            <button className="management-header-button" onClick={createCourse}><Plus size={15} />新增课程</button>
          </div>
        </header>

        <nav className="management-tabs" aria-label="管理导航">
          <button className={manageTab === "content" ? "active" : ""} onClick={() => setManageTab("content")}>课程内容</button>
          <button className={manageTab === "course" ? "active" : ""} onClick={() => setManageTab("course")}>课程信息</button>
          <button className={manageTab === "groups" ? "active" : ""} onClick={() => setManageTab("groups")}>分组设置</button>
          <button className={manageTab === "rules" ? "active" : ""} onClick={() => setManageTab("rules")}>积分规则</button>
        </nav>

        {manageTab === "content" && (
          <main className="management-main">
            <aside className="management-sidebar">
              <div className="management-sidebar-title"><span>我的课程</span><small>{courses.length} 门</small></div>
              {courses.map((item) => (
                <button key={item.id} className={`management-course-item ${item.id === course.id ? "active" : ""}`} onClick={() => { setCourseId(item.id); setChapterId(Number(Object.keys(item.chapters)[0] ?? 1)); setPromptIndex(0); }}>
                  <span className={`course-status-dot ${item.status}`} />
                  <span><strong>{item.title}</strong><small>{item.className} · {Object.keys(item.chapters).length} 章</small></span>
                  {item.id === course.id && <Check size={15} />}
                </button>
              ))}
              <div className="management-sidebar-foot"><span>内容管理页</span><small>支持每章多个提示词</small></div>
            </aside>
            <section className="management-workspace">
              <div className="management-title-row">
                <div><span className="management-kicker">{course.className}</span><h1>{course.title}</h1><p>{course.description}</p></div>
                <button className="management-save" onClick={saveContent}><Check size={16} />保存全部内容</button>
              </div>
              <div className="management-content-overlay-layout">
                <nav className="management-overlay-chapters">
                  <div className="management-section-heading"><span>课程目录</span><button onClick={addChapter}><Plus size={15} />新增章节</button></div>
                  {chapterEntries.map(([id, item]) => (
                    <button key={id} className={Number(id) === chapterId ? "active" : ""} onClick={() => { setChapterId(Number(id)); setPromptIndex(0); }}>
                      <b>{id.padStart(2, "0")}</b>
                      <span><strong>{item.title || `第 ${Number(id)} 章`}</strong><small>{lessonPrompts(item).length} 个提示词</small></span>
                    </button>
                  ))}
                  <button className="management-chapter-remove" onClick={removeChapter}><Trash size={14} />删除当前章节</button>
                </nav>
                <div className="management-content-panel-inner">
                  <div className="management-content-panel-heading">
                    <div><span>第 {chapterId} 章</span><h2>章节内容</h2></div>
                    <button className="management-save" onClick={saveContent}><Check size={16} />保存</button>
                  </div>
                  <div className="management-content-subtabs" role="tablist">
                    <button className={contentSubtab === "task" ? "active" : ""} onClick={() => setContentSubtab("task")}>实操任务</button>
                    <button className={contentSubtab === "prompts" ? "active" : ""} onClick={() => setContentSubtab("prompts")}>提示词 <small>{prompts.length}</small></button>
                    <button className={contentSubtab === "interaction" ? "active" : ""} onClick={() => setContentSubtab("interaction")}>互动题目</button>
                  </div>
                  {contentSubtab === "task" && (
                    <div className="management-task-panel">
                      <label className="management-field"><span>场景说明</span><textarea value={lesson?.description ?? ""} onChange={(event) => updateCurrentLesson("description", event.target.value)} rows={7} /></label>
                      <label className="management-field"><span>实操任务</span><textarea value={lesson?.task ?? ""} onChange={(event) => updateCurrentLesson("task", event.target.value)} rows={7} /></label>
                    </div>
                  )}
                  {contentSubtab === "prompts" && (
                    <div className="management-prompt-panel">
                      <div className="prompt-manager-heading">
                        <div><span>本章提示词</span><strong>{prompts.length} 个,可按步骤拆分</strong></div>
                        <button onClick={addPrompt}><Plus size={15} />新增提示词</button>
                      </div>
                      <div className="prompt-manager-layout">
                        <div className="prompt-list">
                          {prompts.map((_, index) => (
                            <button key={index} className={index === promptIndex ? "active" : ""} onClick={() => setPromptIndex(index)}>
                              <Sparkle size={15} /><span>提示词 {index + 1}</span>{index === 0 && <small>默认</small>}
                            </button>
                          ))}
                        </div>
                        <div className="prompt-editor">
                          <div className="prompt-editor-top"><span>提示词 {promptIndex + 1}</span><button onClick={removePrompt} aria-label="删除当前提示词"><Trash size={15} /></button></div>
                          <textarea value={activePrompt} onChange={(event) => updatePrompt(event.target.value)} placeholder="输入这个步骤对应的提示词" rows={10} />
                          <small>提示词会随本章任务一起发送给学生,可按步骤拆分成多个版本。</small>
                        </div>
                      </div>
                    </div>
                  )}
                  {contentSubtab === "interaction" && lessonInteraction && (
                    <div className="management-interaction-panel-inline">
                      <label className="management-field"><span>互动题目</span><textarea value={lessonInteraction.question} onChange={(event) => updateLessonInteraction({ question: event.target.value })} rows={4} /></label>
                      <div className="interaction-answer-editor">
                        {lessonInteraction.answers.map((answer, index) => (
                          <label key={index}>
                            <span>选项 {String.fromCharCode(65 + index)}{lessonInteraction.correct === index ? " · 正确" : ""}</span>
                            <input value={answer} onChange={(event) => updateLessonAnswer(index, event.target.value)} />
                            <button type="button" className={lessonInteraction.correct === index ? "selected" : ""} onClick={() => updateLessonInteraction({ correct: index })}>{lessonInteraction.correct === index ? "正确" : "设为正确"}</button>
                          </label>
                        ))}
                      </div>
                      <small>未单独设置互动题的章节,将使用课程默认题。</small>
                    </div>
                  )}
                </div>
              </div>
            </section>
          </main>
        )}

        {manageTab !== "content" && (
          <section className="management-settings-panel">
            {manageTab === "course" && (
              <div className="management-settings-card">
                <div className="management-settings-heading"><div><span>课程信息</span><h2>基础配置</h2><p>课程名称、班级和课堂说明会显示在教师端与学生端。</p></div></div>
                <div className="management-form-grid">
                  <label><span>课程主题</span><input value={course.title} onChange={(event) => updateCourseMeta("title", event.target.value)} /></label>
                  <label><span>班级名称</span><input value={course.className} onChange={(event) => updateCourseMeta("className", event.target.value)} /></label>
                </div>
                <label className="management-field"><span>课堂说明</span><textarea value={course.description} onChange={(event) => updateCourseMeta("description", event.target.value)} rows={4} /></label>
                <button className="management-save" onClick={() => { saveContent(); setToast("课程信息已保存"); }}><Check size={16} />保存课程信息</button>
              </div>
            )}
            {manageTab === "groups" && (
              <div className="management-settings-card">
                <div className="management-settings-heading">
                  <div><span>分组设置</span><h2>课堂小组模板</h2><p>新课堂创建时按此生成分组,学生入场时从中选择。</p></div>
                  <button className="management-save compact" onClick={addGroup}><Plus size={15} />新增小组</button>
                </div>
                <div className="management-group-settings-list">
                  {defaults.groups.map((group) => (
                    <label key={group.id}>
                      <span className="management-group-number">{group.id}</span>
                      <input value={group.name} onChange={(event) => updateGroup(group.id, event.target.value)} />
                      <button className="management-group-remove" onClick={() => removeGroup(group.id)} aria-label={`删除${group.name}`}><Trash size={15} /></button>
                    </label>
                  ))}
                </div>
                <button className="management-save" onClick={saveDefaults}><UsersThree size={16} />保存分组设置</button>
              </div>
            )}
            {manageTab === "rules" && (
              <div className="management-settings-card">
                <div className="management-settings-heading">
                  <div><span>积分规则</span><h2>课堂激励默认值</h2><p>新课堂创建时使用该规则;课堂进行中可在教师端单独调整。</p></div>
                  <Sparkle size={22} weight="fill" />
                </div>
                <div className="point-rule-list">
                  <label><span><strong>完成实操任务</strong><small>学生点击完成</small></span><input type="number" min="0" max="99" value={defaults.rules.taskComplete} onChange={(event) => setDefaults((item) => ({ ...item, rules: { ...item.rules, taskComplete: Number(event.target.value) } }))} /></label>
                  <label><span><strong>互动题答对</strong><small>提交正确答案</small></span><input type="number" min="0" max="99" value={defaults.rules.interactionCorrect} onChange={(event) => setDefaults((item) => ({ ...item, rules: { ...item.rules, interactionCorrect: Number(event.target.value) } }))} /></label>
                  <label><span><strong>提出有效问题</strong><small>每次提问</small></span><input type="number" min="0" max="99" value={defaults.rules.questionAsk} onChange={(event) => setDefaults((item) => ({ ...item, rules: { ...item.rules, questionAsk: Number(event.target.value) } }))} /></label>
                  <label><span><strong>教师额外奖励</strong><small>确认小组完成</small></span><input type="number" min="0" max="99" value={defaults.rules.teacherBonus} onChange={(event) => setDefaults((item) => ({ ...item, rules: { ...item.rules, teacherBonus: Number(event.target.value) } }))} /></label>
                </div>
                <button className="management-save" onClick={saveDefaults}><Check size={16} />保存积分规则</button>
              </div>
            )}
          </section>
        )}

        {importPreview && (
          <div className="sheet-backdrop management-import-backdrop" onClick={() => setImportPreview(null)}>
            <div className="management-import-card" onClick={(event) => event.stopPropagation()}>
              <div className="import-preview-hero">
                <div className="course-preview-mark"><PresentationChart size={22} weight="fill" /></div>
                <div><strong>{importPreview.title}</strong><span>{importPreview.className}</span></div>
              </div>
              <div className="import-preview-grid">
                <div><strong>{Object.keys(importPreview.chapters).length}</strong><span>章节</span></div>
                <div><strong>{importPreview.interaction.answers.length}</strong><span>互动选项</span></div>
              </div>
              <div className="import-preview-list">
                <span>章节预览</span>
                {Object.entries(importPreview.chapters).slice(0, 4).map(([id, item]) => (
                  <div key={id}><b>{id.padStart(2, "0")}</b><span>{item.title}</span><small>{item.task || "未填写实操任务"}</small></div>
                ))}
              </div>
              <div className="dialog-actions">
                <Button variant="soft" color="gray" onClick={() => setImportPreview(null)}>取消</Button>
                <Button onClick={confirmImport}><Check size={16} />确认导入</Button>
              </div>
            </div>
          </div>
        )}

        {toast && <div className="management-toast"><CheckCircle size={17} weight="fill" />{toast}</div>}
      </div>
    </Theme>
  );
}
