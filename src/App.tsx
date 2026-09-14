// 共场 AI 课堂互动系统 - 入口路由
import { useEffect } from "react";
import TeacherApp from "./teacher/TeacherApp";
import StudentApp from "./student/StudentApp";
import ManageApp from "./manage/ManageApp";

const ROUTE_TITLES: Record<string, string> = {
  "/": "共场 | 教师课堂控制台",
  "/student": "共场 | 学生课堂",
  "/manage": "共场 | 内容管理",
};

export default function App() {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  useEffect(() => {
    if (ROUTE_TITLES[pathname]) document.title = ROUTE_TITLES[pathname];
    if (!ROUTE_TITLES[pathname]) window.history.replaceState(null, "", "/");
  }, [pathname]);

  if (pathname.startsWith("/student")) return <StudentApp />;
  if (pathname.startsWith("/manage")) return <ManageApp />;
  return <TeacherApp />;
}
